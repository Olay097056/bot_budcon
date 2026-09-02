/**
 * bot_budcon — UI dashboard HTTP server.
 *
 * Two endpoints now (ticket 06):
 *   - GET  /             → serves ui/index.html
 *   - GET  /api/status   → { chromeAlive, loggedIn, watchActive,
 *                             sensorReady, lastLog }
 *
 * Login / watch / cmd endpoints land in their own tickets
 * (04, 05, 06 follow-ups). They are stubbed here so the UI can
 * already render a Login button — clicking it 404s until those
 * tickets land.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { BotEngine } from './bot-engine.js';
import { loadCookies } from './cookies.js';
import { gate } from './auth-cookies.js';
import { maybeRelogin, type AutoReloginState } from './auto-relogin.js';
import { startLogin } from './login.js';
import { getWatchManager } from './watch-manager.js';
import { book, HumanStepRequired } from './book.js';
import { discoverEvents } from './discover.js';

// Single shared engine instance for the UI server's lifetime.
const engine = new BotEngine();

const UI_DIR = resolve('ui');

/** Last re-login state (ticket 11). Updated by /api/auth/relogin. */
let lastRelogin: AutoReloginState = {
  lastResult: 'no_need',
  lastAttemptAtMs: 0,
};

/** Login-flow state (ticket 04). Single-flight: only one
 *  startLogin() at a time. New POST /api/login/start while a
 *  flow is in progress returns the in-flight promise. */
let loginInFlight: Promise<boolean> | null = null;

/** Reply with JSON. */
function json(res: ServerResponse, status: number, body: unknown): void {
  const buf = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(buf),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buf);
}

/** Reply with text/plain. */
function text(res: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

/** Read JSON body (for POST /api/watch/start, /api/book/start). */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface StatusResponse {
  chromeAlive: boolean;
  loggedIn: boolean;
  watchActive: boolean;
  /** True once ticket 02's wreq-js transport has been smoke-tested. */
  sensorReady: boolean;
  port: number;
  lastLog: string[];
}

const lastLog: string[] = [];

function log(line: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  const formatted = `[${ts}] ${line}`;
  // eslint-disable-next-line no-console
  console.log(formatted);
  lastLog.push(formatted);
  if (lastLog.length > 50) lastLog.shift();
}

function getStatus(): StatusResponse {
  return {
    chromeAlive: engine.hasContext(),
    loggedIn: gate(loadCookies()).accept,
    watchActive: getWatchManager().isActive(),
    sensorReady: true, // wreq-js verified in ticket 02
    port: config.server.port,
    lastLog: [...lastLog],
  };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${config.server.port}`);

  // Dashboard.
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = readFileSync(join(UI_DIR, 'index.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': html.length,
      });
      res.end(html);
      return;
    } catch {
      text(res, 404, 'ui/index.html not found');
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    json(res, 200, getStatus());
    return;
  }

  // Ticket 11 — manually trigger an auto re-login attempt. The
  // button on the dashboard is labelled "🔁 Re-login" and posts
  // here when the gate pill is red.
  if (req.method === 'POST' && url.pathname === '/api/auth/relogin') {
    log('relogin requested');
    try {
      lastRelogin = await maybeRelogin();
      json(res, 200, lastRelogin);
    } catch (e) {
      log(`relogin error: ${e instanceof Error ? e.message : String(e)}`);
      json(res, 500, { lastResult: 'expired', lastAttemptAtMs: 0, reason: 'no_phase1' });
    }
    return;
  }

  // Ticket 10 — auth-cookie gate verdict for the dashboard pill.
  if (req.method === 'GET' && url.pathname === '/api/auth/status') {
    const cookies = loadCookies();
    const verdict = gate(cookies);
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresInSec =
      Number.isFinite(verdict.summary.expiresAtSec) &&
      verdict.summary.expiresAtSec !== Number.POSITIVE_INFINITY
        ? Math.max(0, verdict.summary.expiresAtSec - nowSec)
        : null;
    // Three-state pill: ok (green), expiring (yellow < 5 min),
    // bad (red). The status pill in ui/index.html maps these.
    let pill: 'ok' | 'expiring' | 'bad';
    if (verdict.accept) {
      pill = expiresInSec !== null && expiresInSec < 300 ? 'expiring' : 'ok';
    } else {
      pill = 'bad';
    }
    json(res, 200, {
      accept: verdict.accept,
      reason: verdict.reason ?? null,
      primary: verdict.primary?.name ?? null,
      expiresInSec,
      pill,
      authCount: verdict.summary.all.length,
      phase1Count: verdict.summary.phase1.length,
      lastRelogin,
    });
    return;
  }

  // Ticket 04 — login flow. Spawn Playwright Firefox in the
  // background, navigate to the root sign-in URL, poll for
  // cookies (PHPSESSID + ttkname). The human completes the
  // captcha in the visible Firefox window.
  if (req.method === 'POST' && url.pathname === '/api/login/start') {
    log('login requested');
    if (loginInFlight) {
      // Single-flight: a previous login is already running.
      log('login already in progress — attaching to existing promise');
      void loginInFlight.then((ok) =>
        json(res, 200, { phase: 'already_in_progress', loggedIn: ok }),
      );
      return;
    }
    loginInFlight = (async () => {
      try {
        return await startLogin();
      } finally {
        loginInFlight = null;
      }
    })();
    void loginInFlight
      .then((ok) => log(`login finished: ok=${ok}`))
      .catch((e: unknown) =>
        log(`login error: ${e instanceof Error ? e.message : String(e)}`),
      );
    json(res, 202, { phase: 'started', loggedIn: false });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/login/status') {
    const verdict = gate(loadCookies());
    json(res, 200, {
      phase: verdict.accept ? 'logged_in' : 'awaiting_login',
      loggedIn: verdict.accept,
      inProgress: loginInFlight !== null,
    });
    return;
  }

  // Ticket 15 — watch loop wire (realtime discovery, no hardcode)
  if (req.method === 'POST' && url.pathname === '/api/watch/start') {
    const body = await readJsonBody(req);
    let zonesUrl = typeof body['url'] === 'string' ? (body['url'] as string).trim() : '';
    const rawTarget = typeof body['target'] === 'string' ? (body['target'] as string).trim() : '';
    const rawQuery = typeof body['query'] === 'string' ? (body['query'] as string).trim() : '';
    const autoBook = body['autoBook'] === true || body['autoBook'] === 'true';
    const quantityRaw2 = body['quantity'];
    const quantity2 = typeof quantityRaw2 === 'number' && Number.isFinite(quantityRaw2) ? Math.floor(quantityRaw2) : 1;
    // Generic resolution: any string is treated as a TTM query — no map.
    // Priority: url > query > target. All come from live discover.
    if (!zonesUrl) {
      const q = rawQuery || rawTarget;
      if (q) {
        if (q.startsWith('http')) zonesUrl = q;
        else zonesUrl = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${encodeURIComponent(q)}`;
      }
    }
    if (!zonesUrl) {
      json(res, 400, { ok: false, error: 'zonesUrl or query required — run Discover first' });
      return;
    }
    if (!zonesUrl.startsWith('http')) {
      zonesUrl = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${encodeURIComponent(zonesUrl)}`;
    }
    const verdict = gate(loadCookies());
    if (!verdict.accept) {
      json(res, 401, { ok: false, error: verdict.reason ?? 'no_auth', gateReason: verdict.reason ?? 'no_auth' });
      return;
    }
    const wm = getWatchManager(log);
    // auto-book callback: when a new zone appears, run the full book flow
    const onNewZone = autoBook ? async (code: string, _href: string) => {
      const cookies = loadCookies();
      const v = gate(cookies);
      if (!v.accept) { log(`auto-book ${code} skipped — gate ${v.reason}`); return; }
      try {
        const ctx = await engine.getContext();
        log(`auto-book ${code} — book start (qty ${quantity2})`);
        await book({ context: ctx, zonesUrl: zonesUrl!, code, quantity: quantity2, cookies });
      } catch (e: unknown) {
        if (e instanceof HumanStepRequired) {
          log(`auto-book ${code} → human step at ${e.step} — complete captcha/3-D Secure in Firefox, then POST /api/book/finalize`);
          return;
        }
        throw e;
      }
    } : undefined;
    const r = wm.start({ url: zonesUrl, autoBook, quantity: quantity2, onNewZone });
    if (!r.ok && r.reason === 'already_active') {
      json(res, 409, { ok: false, error: 'already_active', url: r.url });
      return;
    }
    if (!r.ok) {
      json(res, 400, { ok: false, error: r.reason });
      return;
    }
    json(res, 202, { ok: true, phase: 'started', url: r.url, autoBook, quantity: quantity2 });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/watch/stop') {
    const wm = getWatchManager(log);
    await wm.stop();
    json(res, 200, { ok: true, active: false });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/watch/status') {
    const wm = getWatchManager(log);
    json(res, 200, wm.getStatus());
    return;
  }

  // Ticket 15 — book wire (manual Book Now)
  if (req.method === 'POST' && url.pathname === '/api/book/start') {
    const body = await readJsonBody(req);
    const code = typeof body['code'] === 'string' ? (body['code'] as string).trim().toUpperCase() : '';
    const zonesUrl = typeof body['zonesUrl'] === 'string' ? (body['zonesUrl'] as string).trim()
      : typeof body['url'] === 'string' ? (body['url'] as string).trim() : '';
    const quantityRaw = body['quantity'];
    const quantity = typeof quantityRaw === 'number' && Number.isFinite(quantityRaw) ? Math.floor(quantityRaw) : 1;
    if (!code || !zonesUrl) {
      json(res, 400, { ok: false, step: 'gate', error: 'code and zonesUrl required' });
      return;
    }
    const cookies = loadCookies();
    const verdict = gate(cookies);
    if (!verdict.accept) {
      json(res, 401, { ok: false, step: 'gate', gateReason: verdict.reason ?? 'no_auth', error: `gate ${verdict.reason ?? 'no_auth'}` });
      return;
    }
    try {
      const ctx = await engine.getContext();
      const result = await book({ context: ctx, zonesUrl, code, quantity, cookies });
      json(res, 200, result);
      return;
    } catch (e: unknown) {
      if (e instanceof HumanStepRequired) {
        log(`book ${code} → human step at ${e.step} — Firefox window is ready for captcha/3-D Secure`);
        json(res, 200, { ok: false, step: e.step, humanStep: true, error: e.message });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      log(`book error: ${msg}`);
      json(res, 500, { ok: false, step: 'selectZone', error: msg });
      return;
    }
  }

  // Ticket 15b — finalize after human completes payment (captcha / 3-D Secure)
  // POST /api/book/finalize {screenshotPath?}
  if (req.method === 'POST' && url.pathname === '/api/book/finalize') {
    const body = await readJsonBody(req);
    const screenshotPath = typeof body['screenshotPath'] === 'string' ? body['screenshotPath'].trim() : undefined;
    const cookies = loadCookies();
    const verdict = gate(cookies);
    if (!verdict.accept) {
      json(res, 401, { ok: false, step: 'gate', gateReason: verdict.reason ?? 'no_auth', error: `gate ${verdict.reason ?? 'no_auth'}` });
      return;
    }
    try {
      const ctx = await engine.getContext();
      const page = ctx.pages()[0] ?? await ctx.newPage();
      const { finalConfirm } = await import('./book.js');
      const result = await finalConfirm(page, screenshotPath);
      if (result.ok) log(`finalConfirm ok — confirmationId=${result.confirmationId ?? '(none)'} screenshot=${result.screenshotPath ?? '-'}`);
      else log(`finalConfirm failed at ${result.step}: ${result.error}`);
      json(res, result.ok ? 200 : 500, result);
      return;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`finalize error: ${msg}`);
      json(res, 500, { ok: false, step: 'finalConfirm', error: msg });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/cmd') {
    text(res, 501, 'cmd dispatch not implemented — see wayfinder ticket 05');
    return;
  }

  // Generic event discovery — scrape concert/ + zones.php for every query.
  // GET /api/events/discover?limit=30  → {concertUrl, events:[{query,slug,title,zonesUrl,zones,rounds,k}], warnings}
  // No gate check: discover works unauthenticated (zones may redirect to signin without cookies — still returns the query).
  if (req.method === 'GET' && url.pathname === '/api/events/discover') {
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Math.max(1, Math.min(50, Number(limitRaw) || 30)) : 30;
    try {
      const result = await discoverEvents({ limit });
      // Ticket 18: after a successful live discover, sync the cache into the
      // repo (commit+push) so cloud runners hydrate for free. Fire-and-forget.
      if (result.events.length > 0) {
        void import('./cache-sync.js').catch(() => {});
      }
      json(res, 200, result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`discover error: ${msg}`);
      json(res, 500, { error: msg });
    }
    return;
  }

  // Preview a single zones.php — lightweight zones/rounds/k check for any query/url.
  // POST /api/events/preview {query|url} → {query, zonesUrl, zones, rounds, k, warnings}
  // Also gate-free; useful to probe a custom query before Watch/Book.
  // Falls back to discover-cache when live fetch is WAF-blocked.
  if (req.method === 'POST' && url.pathname === '/api/events/preview') {
    const body = await readJsonBody(req);
    let zonesUrl = typeof body['url'] === 'string' ? (body['url'] as string).trim() : '';
    let query = typeof body['query'] === 'string' ? (body['query'] as string).trim() : '';
    if (!zonesUrl && query) {
      if (query.startsWith('http')) zonesUrl = query;
      else zonesUrl = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${encodeURIComponent(query)}`;
    }
    if (!zonesUrl) {
      json(res, 400, { error: 'query or url required' });
      return;
    }
    if (!zonesUrl.startsWith('http')) zonesUrl = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${encodeURIComponent(zonesUrl)}`;
    try {
      const q = (() => { try { return new URL(zonesUrl!).searchParams.get('query') ?? ''; } catch { return ''; } })();
      const { parseZones: pz } = await import('./zones.js');
      const { _internal: di } = await import('./discover.js');
      // Ticket 17: hardened chain — wreq-js → fetch → browser (audit: preview was cache-only, no browser fallback).
      const { hardenedFetcher: hf } = await import('./ttm-fetch.js');
      const r = await hf({ referer: 'https://www.thaiticketmajor.com/' })(zonesUrl!);
      const bodyText = r.body;
      const status = r.status;
      let zones = r.status >= 200 && r.status < 300 ? pz(bodyText).map((z) => z.code) : [];
      let rounds = r.status >= 200 && r.status < 300 ? (di as unknown as { parseRounds: (s: string) => string[] }).parseRounds(bodyText) : [];
      let k = r.status >= 200 && r.status < 300 ? (di as unknown as { parseK: (s: string) => string | null }).parseK(bodyText) : null;
      const isLoginRedirect = bodyText.length < 400 && /url=\s*\/?user\/signin\.php/i.test(bodyText);
      const isWaf = bodyText.includes('waf-verify') || bodyText.includes('Access Denied') || r.status === 403;
      // Cache fallback when WAF blocks preview — unified backbone (ticket 18)
      if ((isWaf || zones.length === 0) && q) {
        try {
          const { loadDiscoverCache } = await import('./discover-cache.js');
          const cache = loadDiscoverCache();
          const hit = cache.events.find((e) => e.query === q);
          if (hit && hit.zones.length > 0) {
            zones = hit.zones;
            rounds = hit.rounds;
            k = hit.k;
          }
        } catch {}
      }
      const warnings: string[] = [];
      if (isWaf) warnings.push('live fetch WAF-blocked — serving cached zones if available');
      if (isLoginRedirect) warnings.push('zones redirected to signin (cookies may be stale)');
      json(res, 200, { query: q || query, zonesUrl, status, zones, rounds, k, loginRedirect: isLoginRedirect, finalUrl: r.finalUrl ?? zonesUrl, warnings });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      json(res, 500, { error: msg, zonesUrl });
    }
    return;
  }

  text(res, 404, `not found: ${req.method ?? 'GET'} ${url.pathname}`);
}

const server = createServer((req, res) => {
  void handle(req, res).catch((e: unknown) => {
    log(`unhandled: ${e instanceof Error ? e.stack ?? e.message : e}`);
    text(res, 500, 'internal error');
  });
});

server.listen(config.server.port, () => {
  log(`bot_budcon UI → http://localhost:${config.server.port}`);
  // Ticket 20: zero-friction startup — everything the first discover needs,
  // done silently so the user never opens a terminal:
  //   1. stale Firefox lock cleanup (zombie from a crashed prior run)
  //   2. cache seed from the committed repo copy (cold start offline)
  //   3. warm-up discover in the background (UI has data on first paint)
  void (async () => {
    try {
      const { existsSync, unlinkSync } = await import('node:fs');
      for (const name of ['parent.lock', 'lock', '.parentlock']) {
        const p = config.paths.firefoxProfile + '/' + name;
        if (existsSync(p)) { try { unlinkSync(p); log(`startup: removed stale lock ${name}`); } catch {} }
      }
    } catch {}
    try {
      const { seedLocalCacheFromRepo } = await import('./discover-cache.js');
      if (seedLocalCacheFromRepo()) log('startup: seeded discover cache from repo copy');
    } catch {}
    try {
      const { discoverEvents } = await import('./discover.js');
      const r = await discoverEvents({ limit: 12 });
      log(`startup warm-up: ${r.events.length} events${r.warnings.length ? ' (' + r.warnings[0] + ')' : ''}`);
      if (r.events.length > 0) {
        void import('./cache-sync.js').catch(() => {});
      }
    } catch (e: unknown) {
      log(`startup warm-up failed: ${e instanceof Error ? e.message : e}`);
    }
  })();
});

const shutdown = (): void => {
  log('shutting down');
  server.close();
  void engine.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

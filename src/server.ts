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
    loggedIn: false, // wired in ticket 04
    watchActive: false, // wired in ticket 05
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
  if (req.method === 'POST' && url.pathname === '/api/cmd') {
    text(res, 501, 'cmd dispatch not implemented — see wayfinder ticket 05');
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
});

const shutdown = (): void => {
  log('shutting down');
  server.close();
  void engine.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

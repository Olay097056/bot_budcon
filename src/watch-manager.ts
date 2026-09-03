/**
 * bot_budcon — watch manager (ticket 15).
 *
 * Single-flight orchestrator around the `watch()` generator's polling
 * logic. The pure `watch()` in `watch.ts` is hermetic and unit-tested;
 * this manager adds the server-facing concerns: one watch at a time,
 * status snapshot for `GET /api/watch/status`, background execution,
 * and human-readable logging.
 *
 * Why not just use `watch()` directly in server.ts?
 *   - `watch()` is an async generator that must be iterated — the
 *     server needs a fire-and-forget background task with stop().
 *   - Status (pollCount, baseline, lastEvent) must be observable
 *     while the loop is running.
 *   - Single-flight parallels the login flow (`loginInFlight`).
 */

import { parseZones, type ZoneMatch } from './zones.js';
import { hardenedFetcher, isSoftBlocked } from './ttm-fetch.js';

export interface WatchManagerStatus {
  active: boolean;
  url: string | null;
  startedAtMs: number | null;
  pollCount: number;
  baseline: string[] | null;
  lastZones: string[] | null;
  lastEvent: { code: string; href: string; observedAtMs: number } | null;
  lastError: string | null;
  consecFail: number;
  consecOk: number;
  degraded: boolean;
  circuitOpen: boolean;
}

function backoffFor(failCount: number, baseMs: number): number {
  const table = [baseMs, 30_000, 60_000, 120_000, 300_000, 600_000];
  const base = table[Math.min(failCount, table.length - 1)] ?? 600_000;
  // jitter 0.85..1.15 to avoid thundering herd across tabs
  const jitter = base * (0.85 + 0.30 * Math.random());
  return Math.round(jitter);
}

export interface WatchManagerStartOpts {
  url?: string;
  target?: string;
  fetcher?: (url: string) => Promise<{ status: number; body: string }>;
  intervalMs?: number;
  /** Auto-book when a new zone appears (requires onNewZone). */
  autoBook?: boolean;
  quantity?: number;
  /** Called for each newly-detected zone code. Server wires this to BotEngine book. */
  onNewZone?: (code: string, href: string) => void | Promise<void>;
}

export type LogFn = (line: string) => void;

function buildZonesUrl(targetOrQuery: string): string {
  // Accept either a bare query like "504" or a target key like "idol1st".
  // The caller (server) resolves target keys via config; this helper
  // is the fallback for direct query strings.
  const q = targetOrQuery.trim();
  if (q.startsWith('http://') || q.startsWith('https://')) return q;
  return `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${encodeURIComponent(q)}`;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

async function defaultFetcher(url: string): Promise<{ status: number; body: string }> {
  // Ticket 17: hardened chain (wreq-js → node fetch → Playwright browser).
  // The old raw native fetch stalled forever on Akamai 403 with no fallback.
  const r = await hardenedFetcher({ referer: 'https://www.thaiticketmajor.com/' })(url);
  return { status: r.status, body: r.body };
}

export class WatchManager {
  private _active = false;
  private _url: string | null = null;
  private _startedAtMs: number | null = null;
  private _pollCount = 0;
  private _baseline: Set<string> | null = null;
  private _lastZones: string[] | null = null;
  private _lastEvent: WatchManagerStatus['lastEvent'] = null;
  private _lastError: string | null = null;
  private _abort = false;
  private _loopPromise: Promise<void> | null = null;
  private _autoBook = false;
  private _quantity = 1;
  private _onNewZone: ((code: string, href: string) => void | Promise<void>) | null = null;
  private _bookingInFlight = false;
  private _consecFail = 0;
  private _consecOk = 0;
  private _circuitOpen = false;

  constructor(private readonly _log: LogFn = () => {}) {}

  getStatus(): WatchManagerStatus {
    return {
      active: this._active,
      url: this._url,
      startedAtMs: this._startedAtMs,
      pollCount: this._pollCount,
      baseline: this._baseline ? [...this._baseline] : null,
      lastZones: this._lastZones ? [...this._lastZones] : null,
      lastEvent: this._lastEvent ? { ...this._lastEvent } : null,
      lastError: this._lastError,
      consecFail: this._consecFail,
      consecOk: this._consecOk,
      degraded: this._consecFail >= 4,
      circuitOpen: this._circuitOpen,
    };
  }

  get autoBook(): boolean { return this._autoBook; }
  get quantity(): number { return this._quantity; }

  isActive(): boolean {
    return this._active;
  }

  /**
   * Start polling `url`. Returns `{ok:true}` on first start,
   * `{ok:false, reason:'already_active'}` if a watch is already running,
   * `{ok:false, reason:'no_url'}` if url is missing.
   *
   * The loop runs in the background (not awaited). Call `stop()` to abort.
   */
  start(opts: WatchManagerStartOpts & { urlResolved?: string }): { ok: boolean; reason?: string; url?: string } {
    if (this._active) return { ok: false, reason: 'already_active', url: this._url ?? undefined };

    // Resolve url — server resolves target→query→url; fallback to helper.
    let url = opts.urlResolved ?? opts.url ?? null;
    if (!url && opts.target) url = buildZonesUrl(opts.target);
    if (!url) return { ok: false, reason: 'no_url' };

    // Allow explicit http url to pass through as-is.
    if (!url.startsWith('http')) url = buildZonesUrl(url);

    this._active = true;
    this._url = url;
    this._startedAtMs = Date.now();
    this._pollCount = 0;
    this._baseline = null;
    this._lastZones = null;
    this._lastEvent = null;
    this._lastError = null;
    this._abort = false;
    this._autoBook = !!opts.autoBook;
    this._quantity = typeof opts.quantity === 'number' && opts.quantity > 0 ? Math.floor(opts.quantity) : 1;
    this._onNewZone = opts.onNewZone ?? null;
    this._bookingInFlight = false;
    this._consecFail = 0;
    this._consecOk = 0;
    this._circuitOpen = false;

    const fetcher = opts.fetcher ?? defaultFetcher;
    const baseMs = Number(process.env.BOT_BUDCON_WATCH_MS ?? '') || 15_000;
    const burst = process.env.BOT_BUDCON_WATCH_BURST === '1' || process.env.BOT_BUDCON_WATCH_BURST === 'true';
    const intervalMs = opts.intervalMs ?? (burst ? 3000 : baseMs);

    this._log(`watch start → ${url}`);

    this._loopPromise = this.runLoop(url, fetcher, intervalMs).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      this._lastError = msg;
      this._log(`watch fatal: ${msg}`);
    }).finally(() => {
      if (this._abort || !this._active) {
        this._log(`watch stopped (polls=${this._pollCount})`);
      }
      this._active = false;
    });

    // Intentionally not awaited — single-flight background task.
    void this._loopPromise;
    return { ok: true, url };
  }

  async stop(): Promise<{ ok: boolean }> {
    if (!this._active) return { ok: true };
    this._abort = true;
    this._active = false;
    // Give the loop one tick to notice abort; don't wait forever.
    if (this._loopPromise) {
      try {
        await Promise.race([this._loopPromise, sleep(600)]);
      } catch {
        // ignore
      }
    }
    this._log('watch stop requested');
    return { ok: true };
  }

  private async runLoop(
    url: string,
    fetcher: (u: string) => Promise<{ status: number; body: string }>,
    intervalMs: number,
  ): Promise<void> {
    while (!this._abort && this._active) {
      this._pollCount++;
      const pollN = this._pollCount;
      let body = '';
      let status = 0;
      let ok = false;
      let blocked = false;
      try {
        const res = await fetcher(url);
        status = res.status;
        body = res.body;
        blocked = isSoftBlocked({ status, body });
        ok = status >= 200 && status < 300 && !blocked;
        if (!ok) this._lastError = blocked ? `soft-block http ${status}` : `http ${status}`;
        else this._lastError = null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this._lastError = msg;
        this._log(`watch poll #${pollN}: fetch error ${msg}`);
        this._consecFail++;
        this._consecOk = 0;
        const isHard = true;
        const backoff = backoffFor(this._consecFail, intervalMs);
        const tag = isHard ? 'hard' : 'soft';
        this._log(`watch backoff ${backoff}ms (fail#${this._consecFail} ${tag})`);
        if (this._consecFail >= 5) this._log('watch degraded — IP cooling');
        if (this._consecFail >= 8) {
          this._circuitOpen = true;
          this._log('circuit open — IP cooling 30m (8 consecutive failures)');
          this._active = false;
          return;
        }
        await sleep(backoff);
        continue;
      }

      if (!ok) {
        this._consecFail++;
        this._consecOk = 0;
        const isHard = status === 403 || status === 429 || status === 503 || body.includes('Access Denied') || body.includes('Reference #');
        const isSoft = blocked && !isHard;
        // Try jar refresh on soft-block (71B signin bounce) at fail #2 — re-seed _abck before it becomes hard deny
        if (isSoft && this._consecFail === 2) {
          this._log('soft-block ×2 — attempting jar refresh via browser');
          try {
            const { BotEngine } = await import('./bot-engine.js');
            const eng: any = new (BotEngine as any)();
            const ctx = await eng.getContext();
            // Touch a booking page to let Akamai re-issue _abck/bm_sv via the real browser jar
            const page = await ctx.newPage();
            try {
              await page.goto('https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
              await page.waitForTimeout(1500).catch(()=>{});
            } finally { await page.close().catch(()=>{}); }
            this._log('jar refresh done — next poll will use fresh cookies');
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this._log(`jar refresh failed: ${msg}`);
          }
        }
        const backoff = backoffFor(this._consecFail, intervalMs);
        const tag = isHard ? 'hard' : 'soft';
        this._log(`watch poll #${pollN}: ${blocked ? 'soft-block' : `http ${status}`} — backoff ${backoff}ms (fail#${this._consecFail} ${tag})`);
        if (this._consecFail >= 5) this._log('watch degraded — IP cooling');
        if (this._consecFail >= 8) {
          this._circuitOpen = true;
          this._log('circuit open — IP cooling 30m (8 consecutive failures)');
          this._active = false;
          return;
        }
        await sleep(backoff);
        continue;
      }

      // success — track consecutive successes and reset fail counter after 5
      this._consecOk++;
      if (this._consecOk >= 5) this._consecFail = 0;

      const zones = parseZones(body);
      const codes = zones.map((z) => z.code);
      this._lastZones = codes;

      if (this._baseline === null) {
        this._baseline = new Set(codes);
        this._log(`watch poll #${pollN}: baseline ${codes.length ? codes.join(',') : '(empty)'} — watching`);
        await sleep(intervalMs);
        continue;
      }

      let newFound = 0;
      for (const z of zones) {
        if (!this._baseline.has(z.code)) {
          this._baseline.add(z.code);
          newFound++;
          this._lastEvent = { code: z.code, href: z.href, observedAtMs: Date.now() };
          this._log(`watch poll #${pollN}: NEW zone ${z.code} detected — ${z.href}`);
          // Auto-book: fire-and-forget single-flight per new zone
          if (this._autoBook && this._onNewZone && !this._bookingInFlight) {
            this._bookingInFlight = true;
            const code = z.code;
            const href = z.href;
            void (async () => {
              try {
                this._log(`auto-book → ${code} (qty ${this._quantity}) — launching browser`);
                await this._onNewZone!(code, href);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                this._log(`auto-book ${code} failed: ${msg}`);
              } finally {
                this._bookingInFlight = false;
              }
            })();
          }
        }
      }
      if (newFound === 0) {
        // Quiet poll — only log every 6th to avoid spam, but tests use interval 0
        // so we log each baseline confirm at debug level when pollCount small.
        if (pollN <= 3 || pollN % 6 === 0) {
          this._log(`watch poll #${pollN}: ${codes.length ? codes.join(',') : '(empty)'} — no change`);
        }
      }

      await sleep(intervalMs);
    }
  }
}

// Singleton for server.ts — lazily held so tests can instantiate their own.
let _singleton: WatchManager | null = null;
export function getWatchManager(log?: LogFn): WatchManager {
  if (!_singleton) _singleton = new WatchManager(log);
  return _singleton;
}
export function resetWatchManager(): void {
  _singleton = null;
}

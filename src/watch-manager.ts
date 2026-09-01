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

import { loadCookies, buildCookieHeader } from './cookies.js';
import { parseZones, type ZoneMatch } from './zones.js';

export interface WatchManagerStatus {
  active: boolean;
  url: string | null;
  startedAtMs: number | null;
  pollCount: number;
  baseline: string[] | null;
  lastZones: string[] | null;
  lastEvent: { code: string; href: string; observedAtMs: number } | null;
  lastError: string | null;
}

export interface WatchManagerStartOpts {
  url?: string;
  target?: string;
  fetcher?: (url: string) => Promise<{ status: number; body: string }>;
  intervalMs?: number;
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
  const cookies = loadCookies();
  const host = new URL(url).host;
  const ck = buildCookieHeader(cookies, host);
  const res = await fetch(url, {
    headers: {
      ...(ck ? { Cookie: ck } : {}),
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    },
  });
  return { status: res.status, body: await res.text() };
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
    };
  }

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

    const fetcher = opts.fetcher ?? defaultFetcher;
    const intervalMs = opts.intervalMs ?? 5000;

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
      try {
        const res = await fetcher(url);
        status = res.status;
        body = res.body;
        ok = status >= 200 && status < 300;
        if (!ok) this._lastError = `http ${status}`;
        else this._lastError = null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this._lastError = msg;
        this._log(`watch poll #${pollN}: fetch error ${msg}`);
        await sleep(intervalMs);
        continue;
      }

      if (!ok) {
        this._log(`watch poll #${pollN}: http ${status} — retry`);
        await sleep(intervalMs);
        continue;
      }

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

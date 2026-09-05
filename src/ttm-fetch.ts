/**
 * bot_budcon — unified hardened TTM fetcher (ticket 17).
 *
 * ONE path for every thaiticketmajor.com HTTP call (per ticket 16 audit:
 * watch.ts / watch-manager / preview were raw native fetch with no
 * fallback — vulnerable; wreq-js sat unused). Chain, cheapest first:
 *
 *   1. wreq-js   — Chrome 149 JA3/JA4 TLS impersonation + cookies.
 *                  Fixes the "Node TLS ClientHello trips edgesuite"
 *                  finding from ticket 07 without launching a browser.
 *   2. node fetch— plain undici fetch (+ ProxyAgent when BOT_BUDCON_PROXY
 *                  is set). Some endpoints (zones.php with cookies) serve
 *                  this fine even when wreq's fresh session gets the
 *                  71-byte signin meta-refresh.
 *   3. Playwright browser — BotEngine persistent Firefox (real _abck /
 *                  bm_sv jar). Heavy, launched once, reused.
 *
 * A result is "good" when status is 2xx AND the body is neither a WAF
 * challenge nor the signin meta-refresh. The chain stops at the first
 * good result; otherwise it returns the LAST attempt so callers can
 * hydrate from discover-cache.json (ticket 18).
 *
 * All transports are injectable for hermetic tests — no live TTM fetch
 * in vitest.
 */
import { loadCookies, buildCookieHeader } from './cookies.js';
import { config } from './config.js';
import { curlTransport } from './ttm-curl.js';

export interface TtmFetchResult {
  status: number;
  body: string;
  finalUrl?: string;
  /** Which transport produced this result. */
  via: 'curl' | 'wreq' | 'fetch' | 'browser';
}

export interface TtmFetchOpts {
  /** Referer to send (default: TTM homepage — zones.php expects it). */
  referer?: string;
  /** Per-transport timeout in ms (default 15s). */
  timeoutMs?: number;
}

export type TtmTransport = (url: string, opts: TtmFetchOpts) => Promise<TtmFetchResult>;

export interface TtmFetchDeps {
  curl?: TtmTransport;
  wreq?: TtmTransport;
  nodeFetch?: TtmTransport;
  browser?: TtmTransport;
}

const DEFAULT_REFERER = 'https://www.thaiticketmajor.com/';
const SIGNIN_META_RE = /url=\s*\/?user\/signin\.php/i;
const WAF_MARKERS = ['waf-verify', 'Access Denied', 'Reference #'] as const;

/** True when the response is unusable for parsing (WAF page / signin bounce). */
export function isSoftBlocked(r: { status: number; body: string }): boolean {
  if (r.status === 403 || r.status === 429 || r.status === 503) return true;
  if (r.status >= 200 && r.status < 300) {
    if (WAF_MARKERS.some((m) => r.body.includes(m))) return true;
    // 71-byte meta-refresh to signin = session not accepted
    if (r.body.length < 400 && SIGNIN_META_RE.test(r.body)) return true;
    return false;
  }
  return true; // any other non-2xx
}

function good(r: TtmFetchResult): boolean {
  return r.status >= 200 && r.status < 300 && !isSoftBlocked(r);
}

// --- Transport 1: wreq-js (lazy import so vitest never loads the native lib) ---

async function wreqTransport(url: string, opts: TtmFetchOpts): Promise<TtmFetchResult> {
  const { BotEngine } = await import('./bot-engine.js');
  const eng = new BotEngine();
  const host = new URL(url).host;
  const isPublic = isPublicHost(host);
  const cookies = loadCookies();
  const ck = isPublic ? '' : buildCookieHeader(cookies, host);
  const r = await eng.fetchViaWreq(url, {
    timeoutMs: opts.timeoutMs ?? 15_000,
    headers: {
      ...(ck ? { Cookie: ck } : {}),
      ...(isPublic ? {} : (opts.referer ?? DEFAULT_REFERER ? { Referer: opts.referer ?? DEFAULT_REFERER } : {})),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'th,en-US;q=0.9,en;q=0.8',
    },
  });
  return { status: r.status, body: r.body, finalUrl: r.url, via: 'wreq' };
}

// --- Transport 2: node fetch (+ optional proxy dispatcher) ---

function isPublicHost(host: string): boolean {
  return host.startsWith('www.');
}

async function nodeFetchTransport(url: string, opts: TtmFetchOpts): Promise<TtmFetchResult> {
  const host = new URL(url).host;
  const isPublic = isPublicHost(host);
  const cookies = loadCookies();
  const ck = isPublic ? '' : buildCookieHeader(cookies, host);
  const headers: Record<string, string> = {
    ...(ck ? { Cookie: ck } : {}),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'th,en-US;q=0.9,en;q=0.8',
    ...(isPublic ? {} : { Referer: opts.referer ?? DEFAULT_REFERER }),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  };
  let dispatcher: unknown = undefined;
  if (config.proxy) {
    try {
      // @ts-ignore — undici ships with Node 22+, types optional
      const { ProxyAgent } = await import('undici');
      dispatcher = new (ProxyAgent as unknown as new (s: string) => unknown)(config.proxy);
    } catch { /* fall through without proxy */ }
  }
  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    ...(dispatcher ? { dispatcher } as unknown as Record<string, unknown> : {}),
  });
  return { status: res.status, body: await res.text(), finalUrl: res.url, via: 'fetch' };
}

// --- Transport 3: Playwright browser (BotEngine persistent Firefox) ---

let _browserEng: unknown = null;
let _browserCtx: import('playwright').BrowserContext | null = null;

async function getBrowserCtx(): Promise<import('playwright').BrowserContext> {
  if (_browserCtx) return _browserCtx;
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { BotEngine } = await import('./bot-engine.js');
  const eng: any = new (BotEngine as any)();
  // Background fetch fallback: headless + scratch profile — never pops a
  // visible window, never fights the book-flow engine for the bot profile.
  BotEngine.headlessOverride = true;
  BotEngine.profileOverride = join(tmpdir(), 'bot_budcon-fetch-profile');
  _browserEng = eng;
  try {
    _browserCtx = await eng.getContext();
  } finally {
    BotEngine.headlessOverride = null;
    BotEngine.profileOverride = null;
  }
  return _browserCtx as import('playwright').BrowserContext;
}

/** Test hook: clear the cached browser so a later call relaunches. */
export function resetBrowserCache(): void {
  _browserCtx = null;
  _browserEng = null;
}

async function browserTransport(url: string, opts: TtmFetchOpts): Promise<TtmFetchResult> {
  const ctx = await getBrowserCtx();
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(opts.timeoutMs ?? 15_000, 25_000) });
    // Let an Akamai WAF interstitial settle before reading content.
    await page.waitForTimeout(1500).catch(() => {});
    const body = await page.content();
    const status = resp?.status() ?? 200;
    return { status, body, finalUrl: page.url(), via: 'browser' };
  } finally {
    await page.close().catch(() => {});
  }
}

/** Close the shared browser (server shutdown / end of a discover batch). */
export async function closeSharedBrowser(): Promise<void> {
  if (_browserEng) await (_browserEng as { close?: () => Promise<void> }).close?.().catch(() => {});
  resetBrowserCache();
}

// --- The chain ---

export async function ttmFetch(
  url: string,
  opts: TtmFetchOpts = {},
  deps: TtmFetchDeps = {},
): Promise<TtmFetchResult> {
  const chain: TtmTransport[] = [
    deps.curl ?? curlTransport as unknown as TtmTransport,
    deps.wreq ?? wreqTransport,
    deps.nodeFetch ?? nodeFetchTransport,
    deps.browser ?? browserTransport,
  ];
  let last: TtmFetchResult | null = null;
  for (const transport of chain) {
    try {
      const r = await transport(url, opts);
      if (good(r)) return r;
      last = r;
    } catch (e: unknown) {
      // Transport itself failed (native lib missing, browser locked, net down)
      // — record as a synthetic 0 result and keep walking the chain.
      const msg = e instanceof Error ? e.message : String(e);
      last = { status: 0, body: `transport error: ${msg}`, via: 'fetch' };
    }
  }
  return last as TtmFetchResult;
}

/**
 * Drop-in fetcher for discover/watch/watch-manager/preview:
 * `(url) => Promise<{status, body, finalUrl?}>` backed by ttmFetch.
 * Accepts injectable deps for hermetic tests.
 */
export function hardenedFetcher(
  opts: TtmFetchOpts = {},
  deps: TtmFetchDeps = {},
): (url: string) => Promise<{ status: number; body: string; finalUrl?: string }> {
  return async (url: string) => {
    const r = await ttmFetch(url, opts, deps);
    return { status: r.status, body: r.body, finalUrl: r.finalUrl };
  };
}

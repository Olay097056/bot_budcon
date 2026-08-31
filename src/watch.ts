/**
 * bot_budcon — watch loop (ticket 05).
 *
 * Polls a TTM zones page every `intervalMs` and surfaces any newly
 * appearing zone to a caller-supplied callback. The booking action
 * itself lives in `book.ts` (separate concern) — this loop only
 * detects new availability.
 *
 * The default target is the existing `targets.json` entry
 * `query_id=504` (idol1st-kenty-2026). The first observed set of
 * zones is treated as "baseline already-known" — we only fire on
 * a zone that appears *after* the loop started.
 */
import { loadCookies } from './cookies.js';
import { buildCookieHeader } from './cookies.js';
import { parseZones, type ZoneMatch } from './zones.js';
import { config } from './config.js';

export interface WatchOptions {
  url: string;
  intervalMs?: number;
  maxIterations?: number;
  /** Override the transport for tests. */
  fetcher?: (url: string) => Promise<{ status: number; body: string }>;
  /** Override the system clock for tests. */
  nowMs?: () => number;
}

export interface WatchEvent {
  zone: ZoneMatch;
  observedAtMs: number;
  /** All zones known at the time this one fired. */
  allKnownAtFire: ZoneMatch[];
}

export async function* watch(opts: WatchOptions): AsyncGenerator<WatchEvent, void, void> {
  const intervalMs = opts.intervalMs ?? 5_000;
  const maxIterations = opts.maxIterations ?? Number.POSITIVE_INFINITY;
  const nowMs = opts.nowMs ?? (() => Date.now());

  // HTTP transport default: raw fetch with the bot's cookies as a
  // header. We avoid wreq-js here on purpose — for the watch loop
  // the human has already logged in via Playwright Firefox, so the
  // cookies carry the TLS fingerprint we need and the server
  // accepts them as-is.
  const fetcher = opts.fetcher ?? defaultFetcher;

  let baseline: Set<string> | null = null;

  for (let i = 0; i < maxIterations; i++) {
    let body = '';
    let gotValidBody = false;
    try {
      const res = await fetcher(opts.url);
      if (res.status >= 200 && res.status < 300) {
        body = res.body;
        gotValidBody = true;
      }
    } catch {
      // network blip — try again next tick
    }

    if (!gotValidBody) {
      await sleep(intervalMs, nowMs);
      continue;
    }

    const zones = parseZones(body);
    if (baseline === null) {
      baseline = new Set(zones.map((z) => z.code));
      await sleep(intervalMs, nowMs);
      continue;
    }

    for (const z of zones) {
      if (!baseline.has(z.code)) {
        baseline.add(z.code);
        yield {
          zone: z,
          observedAtMs: nowMs(),
          allKnownAtFire: zones.slice(),
        };
      }
    }

    await sleep(intervalMs, nowMs);
  }
}

async function defaultFetcher(url: string): Promise<{ status: number; body: string }> {
  const cookies = loadCookies();
  const host = new URL(url).host;
  const ck = buildCookieHeader(cookies, host);
  const res = await fetch(url, {
    headers: {
      ...(ck ? { Cookie: ck } : {}),
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    },
  });
  return { status: res.status, body: await res.text() };
}

function sleep(ms: number, nowMs: () => number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const start = nowMs();
    const tick = (): void => {
      if (nowMs() - start >= ms) resolve();
      else setTimeout(tick, Math.min(50, ms));
    };
    tick();
  });
}

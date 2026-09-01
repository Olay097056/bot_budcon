/**
 * bot_budcon — generic event discovery (ticket 16 / user request).
 *
 * Goal: stop hard-coding 5 targets in config and let the UI work
 * with *any* TTM event that exposes `booking/3m/zones.php?query=<q>`.
 *
 * Strategy:
 *   1. Fetch https://www.thaiticketmajor.com/concert/ (optionally with
 *      the user's auth cookies — not required for discover, but kept
 *      for consistency).
 *   2. Extract unique `zones.php?query=<q>` values plus nearby concert
 *      slug / alt title (img alt on TTM cards is the most reliable
 *      title — the card image alt holds the decoded event name).
 *   3. For each `query`, fetch `zones.php?query=<q>` with cookies
 *      (auth improves hit rate — TTM sometimes 302s to login without
 *      cookies; with cookies we get the real 52k zone page).
 *      Parse zones (parseZones) and rounds/select#rdId so callers can
 *      preview fixed.php reachability before booking.
 *
 * No dependency on cheerio/jsdom — plain regex keeps the dep budget
 * small and works on both text fixtures (tests) and live HTML.
 */

import { loadCookies, buildCookieHeader } from './cookies.js';
import { parseZones } from './zones.js';

export interface DiscoveredEvent {
  /** TTM query param for `booking/3m/zones.php?query=<query>` */
  query: string;
  /** TTM concert slug, e.g. `idol1st-kenty-asia-tour-2026-in-bangkok.html` */
  slug: string;
  /** Human title from card image alt (decoded entities). */
  title: string;
  /** Direct zones.php url for watch/book wiring */
  zonesUrl: string;
  /** Zones found on zones.php (empty if page had none / was 302). */
  zones: string[];
  /** Round option values found on zones.php (#rdId) — empty if none. */
  rounds: string[];
  /** Hidden input `k` value if present (needed to build fixed.php url). */
  k: string | null;
}

export interface DiscoverResult {
  /** When the discover ran */
  fetchedAtMs: number;
  /** Concert page url that was scraped */
  concertUrl: string;
  /** Unique discovered events (deduped by query) */
  events: DiscoveredEvent[];
  /** Non-fatal warnings, e.g. fetch failures per query */
  warnings: string[];
}

const CONCERT_URL = 'https://www.thaiticketmajor.com/concert/';
const ZONES_BASE = 'https://booking.thaiticketmajor.com/booking/3m/zones.php';

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
function slugToTitle(slug: string): string {
  if (!slug) return '';
  return decodeEntities(slug.replace(/\.html$/, '').replace(/-/g, ' ')).trim();
}

function buildZonesUrl(query: string): string {
  return `${ZONES_BASE}?query=${encodeURIComponent(query)}`;
}

const ZONES_QUERY_RE = /zones\.php\?query=([^"'&>\s]+)/g;
const CONCERT_SLUG_RE = /concert\/([^"']+\.html)/g;
const ALT_RE = /alt="([^"]{5,200})"/g;

function extractConcertListing(html: string): { query: string; slug: string; title: string }[] {
  // Collect all zones.php?query hits with their index
  const hits: { query: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = ZONES_QUERY_RE.exec(html))) {
    hits.push({ query: (m[1] ?? '').trim(), index: m.index });
  }
  const seen = new Set<string>();
  const out: { query: string; slug: string; title: string }[] = [];
  for (const h of hits) {
    if (!h.query || seen.has(h.query)) continue;
    seen.add(h.query);
    const idx = h.index;
    const before = html.slice(Math.max(0, idx - 3500), idx);
    const lastSlug = [...before.matchAll(CONCERT_SLUG_RE)].pop();
    const slug = lastSlug ? lastSlug[1]! : '';
    const lastAlt = [...before.matchAll(ALT_RE)].pop();
    const rawAlt = lastAlt ? decodeEntities((lastAlt[1] ?? '').trim()) : '';
    const isBlank = !rawAlt || rawAlt.toLowerCase() === 'blank' || rawAlt.length < 2;
    const title = isBlank ? (slug ? slugToTitle(slug) : (rawAlt || h.query)) : rawAlt;
    out.push({ query: h.query, slug, title });
  }
  return out;
}

function parseRounds(html: string): string[] {
  // TTM uses <select id="rdId"> with round ids
  const out: string[] = [];
  const selRe = /<option[^>]*value="([^"]+)"[^>]*>/gi;
  // Narrow to the rdId select block if present
  const selBlock = html.match(/<select[^>]*id="rdId"[^>]*>([\s\S]*?)<\/select>/i);
  const scope = selBlock ? selBlock[1]! : html;
  let m: RegExpExecArray | null;
  while ((m = selRe.exec(scope))) {
    const v = (m[1] ?? '').trim();
    if (v && v !== '' && v !== '0') out.push(v);
  }
  // Filter to numeric-ish round ids (TTM round ids are digits); keep strings otherwise
  const numeric = out.filter((v) => /^\d+$/.test(v));
  return numeric.length ? numeric.slice(0, 20) : out.slice(0, 20);
}

function parseK(html: string): string | null {
  const m = html.match(/<input[^>]*name="k"[^>]*value="([^"]+)"[^>]*>/i)
    ?? html.match(/<input[^>]*value="([^"]+)"[^>]*name="k"[^>]*>/i)
    ?? html.match(/\bk\s*=\s*["']([^"']+)["']/i);
  return m ? (m[1] ?? '').trim() || null : null;
}

export async function discoverEvents(opts: {
  fetcher?: (url: string) => Promise<{ status: number; body: string; finalUrl?: string }>;
  limit?: number;
  concertUrl?: string;
} = {}): Promise<DiscoverResult> {
  const concertUrl = opts.concertUrl ?? CONCERT_URL;
  const limit = opts.limit ?? 30;

  const cookies = loadCookies();
  const defaultFetcher = async (url: string) => {
    const host = new URL(url).host;
    const ck = buildCookieHeader(cookies, host);
    const res = await fetch(url, {
      headers: {
        ...(ck ? { Cookie: ck } : {}),
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      },
      redirect: 'follow',
    });
    return { status: res.status, body: await res.text(), finalUrl: res.url as string };
  };
  const fetcher = opts.fetcher ?? defaultFetcher;

  const concertRes = await fetcher(concertUrl);
  const html = concertRes.body;
  const listing = extractConcertListing(html).slice(0, limit);

  const warnings: string[] = [];
  if (concertRes.status < 200 || concertRes.status >= 300) {
    warnings.push(`concert fetch http ${concertRes.status}`);
  }
  if (listing.length === 0) {
    warnings.push('no queries found on concert page');
  }

  const events: DiscoveredEvent[] = [];
  for (const item of listing) {
    const zonesUrl = buildZonesUrl(item.query);
    try {
      const r = await fetcher(zonesUrl);
      if (r.status >= 300) {
        // Keep the event but mark empty zones / warning — UI still
        // shows it so manual query works even if zones need a round.
        warnings.push(`${item.query}: zones http ${r.status}`);
        events.push({ query: item.query, slug: item.slug, title: item.title, zonesUrl, zones: [], rounds: [], k: null });
        continue;
      }
      // Detect TTM meta-refresh redirect to login (happens with cookie-less fetch)
      const isLoginRedirect = r.body.length < 400 && /url=\s*\/?user\/signin\.php/i.test(r.body);
      if (isLoginRedirect) {
        warnings.push(`${item.query}: zones redirected to signin (cookies may be stale)`);
      }
      const zones = parseZones(r.body).map((z) => z.code);
      const rounds = parseRounds(r.body);
      const k = parseK(r.body);
      events.push({ query: item.query, slug: item.slug, title: item.title, zonesUrl, zones, rounds, k });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`${item.query}: ${msg}`);
      events.push({ query: item.query, slug: item.slug, title: item.title, zonesUrl, zones: [], rounds: [], k: null });
    }
  }
  return { fetchedAtMs: Date.now(), concertUrl, events, warnings };
}

// re-export for test introspection (not public API)
export const _internal = { extractConcertListing, parseRounds, parseK, buildZonesUrl };

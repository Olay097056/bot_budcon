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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

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
  /** Hall map image absolute URL from zones.php <img usemap> — null if none / 403 */
  hallImageUrl: string | null;
  hallImageWidth?: number | null;
  hallImageHeight?: number | null;
  /** Hall map areas from <map><area> — empty if none */
  areas: { code: string; href: string; coords: number[]; shape: string }[];
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

function parseHallImage(html: string): string | null {
  const m = parseHallImageMeta(html);
  return m ? m.url : null;
}
function parseHallImageMeta(html: string): { url: string; w: number | null; h: number | null } | null {
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]!);
  const withMap = imgTags.filter((s) => /usemap/i.test(s));
  const tag = withMap[0] ?? null;
  if (!tag) return null;
  const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? null;
  if (!src) return null;
  let url: string;
  try { url = new URL(src, 'https://booking.thaiticketmajor.com').toString(); } catch { url = src; }
  const w = parseInt(tag.match(/\bwidth=["']?(\d+)["']?/i)?.[1] ?? '', 10);
  const h = parseInt(tag.match(/\bheight=["']?(\d+)["']?/i)?.[1] ?? '', 10);
  return { url, w: Number.isFinite(w) ? w : null, h: Number.isFinite(h) ? h : null };
}

function parseAreas(html: string): { code: string; href: string; coords: number[]; shape: string }[] {
  const out: { code: string; href: string; coords: number[]; shape: string }[] = [];
  const seen = new Set<string>();
  const mapBlocks = [...html.matchAll(/<map[^>]*>([\s\S]*?)<\/map>/gi)];
  const search = mapBlocks.length ? mapBlocks.map((b) => b[1]!).join('\n') : html;
  const areaTags = [...search.matchAll(/<area\b[^>]*>/gi)].map((m) => m[0]!);
  for (const tag of areaTags) {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1] ?? '';
    const m = href.match(/#(?:fixed|festival)\.php#([A-Za-z0-9]+)/i);
    const code = m ? m[1]!.toUpperCase() : '';
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const shape = tag.match(/shape=["']([^"']+)["']/i)?.[1] ?? 'poly';
    const coordsStr = tag.match(/coords=["']([^"']+)["']/i)?.[1] ?? '';
    const coords = coordsStr
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    out.push({ code, href, coords, shape });
  }
  return out;
}


export async function discoverEvents(opts: {
  fetcher?: (url: string) => Promise<{ status: number; body: string; finalUrl?: string }>;
  limit?: number;
  concertUrl?: string;
} = {}): Promise<DiscoverResult> {
  const concertUrl = opts.concertUrl ?? CONCERT_URL;
  const limit = opts.limit ?? 30;

  const cookies = loadCookies();
  let fetcher = opts.fetcher ?? (async (url: string) => {
    // Ticket 17: use the unified hardened chain (wreq → fetch → browser).
    // The chain replaces the old inline defaultFetcher + fetchWithBrowserFallback:
    // wreq-js now absorbs most 403s cheaply; the browser transport keeps the
    // valid _abck/bm_sv jar for the heavy cases.
    const { hardenedFetcher } = await import('./ttm-fetch.js');
    return hardenedFetcher({ referer: 'https://www.thaiticketmajor.com/' })(url);
  });

  // --- 403/WAF fallback: if fetch is blocked by Akamai (403), retry via
  // Playwright's real browser context which carries the valid _abck/bm
  // fingerprint. This keeps discovery truly realtime without hardcode.
  // Reuse one browser instance for the whole discover call.
  let _browserEng: any = null;
  let _browserCtx: import('playwright').BrowserContext | null = null;
  async function getBrowserCtx() {
    if (_browserCtx) return _browserCtx;
    const { BotEngine } = await import('./bot-engine.js');
    const eng: any = new (BotEngine as any)();
    _browserEng = eng;
    _browserCtx = await eng.getContext();
    return _browserCtx;
  }
  async function fetchViaBrowser(url: string): Promise<{ status: number; body: string; finalUrl?: string }> {
    const ctx = await getBrowserCtx() as import('playwright').BrowserContext;
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      // Wait a tick for Akamai WAF verify to settle if present
      await page.waitForTimeout(1500).catch(()=>{});
      const body = await page.content();
      const status = resp?.status() ?? 200;
      await page.close().catch(() => {});
      return { status, body, finalUrl: page.url() };
    } catch (e: unknown) {
      await page.close().catch(() => {});
      throw e;
    }
  }
  async function fetchWithBrowserFallback(url: string): Promise<{ status: number; body: string; finalUrl?: string }> {
    const r = await fetcher(url);
    if (r.status !== 403 && r.status !== 429) return r;
    try {
      const br = await fetchViaBrowser(url);
      // If browser also 403, return original
      if (br.status === 403) return r;
      return br;
    } catch {
      return r;
    }
  }

  const concertRes = await fetchWithBrowserFallback(concertUrl);
  const html = concertRes.body;
  const listing = extractConcertListing(html).slice(0, limit);

  const warnings: string[] = [];
  if (concertRes.status < 200 || concertRes.status >= 300) {
    warnings.push(`concert fetch http ${concertRes.status}`);
  }
  if (listing.length === 0) {
    warnings.push('no queries found on concert page');
  }

  const cachePath = join(config.dataDir, 'discover-cache.json');
  // Ticket 18: unified cache backbone (local + repo layers, merge, staleness)
  const { loadDiscoverCache, saveDiscoverCache, mergeWithCache, stalenessLine, seedLocalCacheFromRepo } = await import('./discover-cache.js');
  // Cold start: seed local cache from the committed repo copy once.
  seedLocalCacheFromRepo();

  const events: DiscoveredEvent[] = [];
  for (const item of listing) {
    const zonesUrl = buildZonesUrl(item.query);
    try {
      const r = await fetchWithBrowserFallback(zonesUrl);
      if (r.status >= 300) {
        // Keep the event but mark empty zones / warning — UI still
        // shows it so manual query works even if zones need a round.
        warnings.push(`${item.query}: zones http ${r.status}`);
        events.push({ query: item.query, slug: item.slug, title: item.title, zonesUrl, zones: [], rounds: [], k: null, hallImageUrl: null, areas: [] });
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
       { const meta = parseHallImageMeta(r.body); events.push({ query: item.query, slug: item.slug, title: item.title, zonesUrl, zones, rounds, k, hallImageUrl: meta ? meta.url : null, hallImageWidth: (meta as any)?.w ?? null, hallImageHeight: (meta as any)?.h ?? null, areas: parseAreas(r.body) }); }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`${item.query}: ${msg}`);
      events.push({ query: item.query, slug: item.slug, title: item.title, zonesUrl, zones: [], rounds: [], k: null, hallImageUrl: null, areas: [] });
    }
  }
  // Ticket 18: cache-or-merge — persist every successful live discover,
  // and when live comes up empty/short, merge cached events into the gaps
  // (live wins per query). Staleness is surfaced, never hidden.
  const totalLiveZones = events.reduce((a,e)=>a+e.zones.length,0);
  const liveResult: DiscoverResult = { fetchedAtMs: Date.now(), concertUrl, events, warnings: [...warnings] };
  const shouldSave = events.length > 0 && totalLiveZones > 0;
  if (shouldSave) {
    saveDiscoverCache(liveResult);
  } else if (events.length === 0) {
    const cache = loadDiscoverCache();
    if (cache.events.length > 0) {
      const merged = mergeWithCache([], cache, limit);
      const stale = stalenessLine(cache);
      const hydrated: DiscoverResult = {
        fetchedAtMs: cache.fetchedAtMs ?? Date.now(),
        concertUrl: cache.events[0]?.zonesUrl?.includes('query=') ? concertUrl : concertUrl,
        events: merged.events,
        warnings: [...warnings, ...(stale ? [`${stale} — live fetch blocked, retry later or use custom query`] : [])],
      };
      if (_browserEng) await (_browserEng as any).close().catch(()=>{});
      return hydrated;
    }
  } else {
    // live had events but 0 zones (all 403) — don't overwrite good cache
    // healing below will hydrate from cache instead
  }
  // Live succeeded but may be short (some zones blocked) — top up from cache.
  if (events.length < limit) {
    const cache = loadDiscoverCache();
    if (cache.events.length > 0 && cache.source !== 'none') {
      const merged = mergeWithCache(events, cache, limit);
      if (merged.events.length > events.length) {
        const stale = stalenessLine(cache);
        liveResult.events = merged.events;
        if (stale) liveResult.warnings.push(`${stale} — merged cached-only events`);
      }
    }
  }
  // Even when live filled all slots, any live event that came back with 0
  // zones while cache has zones for the same query should be healed from
  // cache (common during 403 hard-deny — live overwrites with empty).
  {
    const cache = loadDiscoverCache();
    if (cache.events.length > 0 && cache.source !== 'none') {
      const cacheByQuery = new Map(cache.events.map(e=>[e.query, e] as const));
      let healed = 0;
      let hallHealed = 0;
      for (const ev of liveResult.events) {
        if (ev.zones.length===0) {
          const c = cacheByQuery.get(ev.query);
          if (c && c.zones.length>0) {
            ev.zones = [...c.zones];
            ev.rounds = c.rounds.length? [...c.rounds] : ev.rounds;
            ev.k = c.k ?? ev.k;
            // heal hall image/areas alongside zones
            if (!ev.hallImageUrl && (c as any).hallImageUrl) { ev.hallImageUrl = (c as any).hallImageUrl; (ev as any).hallImageWidth = (c as any).hallImageWidth ?? null; (ev as any).hallImageHeight = (c as any).hallImageHeight ?? null; hallHealed++; }
            if ((!ev.areas || ev.areas.length===0) && (c as any).areas?.length) { ev.areas = [...(c as any).areas]; }
            healed++;
          }
        } else {
          // live had zones but hall image may still be empty (403 partial) — heal hall separately
          const c = cacheByQuery.get(ev.query);
          if (c) {
            if (!ev.hallImageUrl && (c as any).hallImageUrl) { ev.hallImageUrl = (c as any).hallImageUrl; (ev as any).hallImageWidth = (c as any).hallImageWidth ?? null; (ev as any).hallImageHeight = (c as any).hallImageHeight ?? null; hallHealed++; }
            if ((!ev.areas || ev.areas.length===0) && (c as any).areas?.length) { ev.areas = [...(c as any).areas]; }
          }
        }
      }
      // If still 0 zones overall (e.g. live list diverged from cache), merge cache-only events with zones
      const totalZones = liveResult.events.reduce((a,e)=>a+e.zones.length,0);
      if (totalZones===0) {
        const merged = mergeWithCache(liveResult.events, cache, limit);
        // keep only cache events that have zones to surface something useful
        const withZones = merged.events.filter(e=>e.zones.length>0);
        if (withZones.length>0) {
          liveResult.events = [...withZones, ...merged.events.filter(e=>e.zones.length===0)].slice(0, limit);
          healed = withZones.length;
        }
      }
      if (healed>0) {
        const stale = stalenessLine(cache);
        if (stale && !liveResult.warnings.some(w=>w.includes('cached discovery'))) {
          liveResult.warnings.push(`${stale} — healed ${healed} zones from cache (live 403)`);
        }
      }
    }
  }
  // cleanup browser fallback if used
  if (_browserEng) await (_browserEng as any).close().catch(()=>{});
  return liveResult;
}

// re-export for test introspection (not public API)
export const _internal = { extractConcertListing, parseRounds, parseK, parseHallImage, parseHallImageMeta, parseAreas, buildZonesUrl };

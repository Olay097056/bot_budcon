/**
 * bot_budcon — discover cache backbone (ticket 18).
 *
 * Free-stability contract (Q3=A free-only, Q4=A zero-friction):
 *
 *   WRITE  — after every successful live discover (fresh data wins).
 *   READ   — only when live fetch is soft-blocked (403/407/429/signin
 *            bounce); never replaces good live data.
 *   LAYERS — ~/.bot-budcon-data/discover-cache.json (local, primary)
 *            + cache/discover-cache.json committed in-repo (cloud
 *            hydrate: GitHub Actions / fresh clone with no local data).
 *   MERGE  — union by `query`; live events override cached on clash;
 *            cached-only events keep their zones/rounds/k. Freshness
 *            = newest fetchedAtMs wins per event (approximated by
 *            taking live for present queries, cached for the rest).
 *   STALE  — no hard TTL (better stale than 0 events) but `ageMs` is
 *            surfaced so the UI can badge it (ticket 19 decides how).
 *   SEED   — repo cache is copied to the local dir on first run
 *            (cold start without prior cache).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import type { DiscoverResult, DiscoveredEvent } from './discover.js';

const REPO_CACHE = resolve('cache/discover-cache.json');

export function localCachePath(): string {
  return join(config.dataDir, 'discover-cache.json');
}

export interface CacheInfo {
  events: DiscoveredEvent[];
  fetchedAtMs: number | null;
  /** Where the cached data came from. */
  source: 'local' | 'repo' | 'none';
}

/** Read the freshest available cache: local first, repo as fallback. */
export function loadDiscoverCache(repoPath: string = REPO_CACHE): CacheInfo {
  for (const [path, source] of [
    [localCachePath(), 'local'],
    [repoPath, 'repo'],
  ] as const) {
    try {
      if (!existsSync(path)) continue;
      const j = JSON.parse(readFileSync(path, 'utf-8')) as DiscoverResult;
      if (j.events && j.events.length > 0) {
        return { events: j.events, fetchedAtMs: j.fetchedAtMs ?? null, source };
      }
    } catch { /* corrupt file — try next layer */ }
  }
  return { events: [], fetchedAtMs: null, source: 'none' };
}

/** Persist a successful live result to the local cache. */
export function saveDiscoverCache(result: DiscoverResult): void {
  try {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(localCachePath(), JSON.stringify(result), 'utf-8');
  } catch { /* best effort */ }
}

/** Seed the local cache from the committed repo copy (cold start). */
export function seedLocalCacheFromRepo(): boolean {
  try {
    if (!existsSync(REPO_CACHE)) return false;
    if (existsSync(localCachePath())) return false; // never overwrite fresher local data
    mkdirSync(config.dataDir, { recursive: true });
    copyFileSync(REPO_CACHE, localCachePath());
    return true;
  } catch { return false; }
}

/**
 * Merge cached events into a (partial) live result. Live wins per query;
 * cached-only queries fill the gaps. Returns the merged event list and
 * the cache metadata used (null when cache contributed nothing).
 */
export function mergeWithCache(
  liveEvents: DiscoveredEvent[],
  cache: CacheInfo,
  limit: number,
): { events: DiscoveredEvent[]; cacheUsed: CacheInfo | null } {
  if (cache.events.length === 0) return { events: liveEvents.slice(0, limit), cacheUsed: null };
  const byQuery = new Map(liveEvents.map((e) => [e.query, e]));
  for (const e of cache.events) {
    if (!byQuery.has(e.query)) byQuery.set(e.query, e);
  }
  return { events: [...byQuery.values()].slice(0, limit), cacheUsed: cache };
}

/** Human staleness line for warnings/UI badge. */
export function stalenessLine(cache: CacheInfo): string | null {
  if (cache.fetchedAtMs === null || cache.events.length === 0) return null;
  const ageM = Math.round((Date.now() - cache.fetchedAtMs) / 60000);
  const age = ageM < 60 ? `${ageM}m` : `${Math.round(ageM / 60)}h`;
  return `cached discovery: ${cache.events.length} events, ${age} old (source: ${cache.source})`;
}

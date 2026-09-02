import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadDiscoverCache, saveDiscoverCache, seedLocalCacheFromRepo,
  mergeWithCache, stalenessLine, localCachePath,
} from '../src/discover-cache.js';
import { config } from '../src/config.js';

// Isolate the data dir per test run.
const tmpData = mkdtempSync(join(tmpdir(), 'budcon-cache-'));
(config as unknown as { dataDir: string }).dataDir = tmpData;

const ev = (query: string, zones: string[] = ['A1']): ({
  query: string; slug: string; title: string; zonesUrl: string; zones: string[]; rounds: string[]; k: string | null;
}) => ({
  query, slug: `${query}.html`, title: `Event ${query}`,
  zonesUrl: `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${query}`,
  zones, rounds: ['81634'], k: 'k123',
});

beforeEach(() => {
  // clean local cache between tests
  try { require('node:fs').unlinkSync(localCachePath()); } catch { /* noop */ }
});

describe('loadDiscoverCache', () => {
  it('returns none when no cache exists anywhere', () => {
    const r = loadDiscoverCache();
    expect(r.source).toBe('none');
    expect(r.events).toEqual([]);
    expect(r.fetchedAtMs).toBeNull();
  });

  it('reads local cache first', () => {
    saveDiscoverCache({ fetchedAtMs: 1000, concertUrl: 'x', events: [ev('504')], warnings: [] });
    const r = loadDiscoverCache();
    expect(r.source).toBe('local');
    expect(r.events[0]!.query).toBe('504');
  });

  it('falls back to repo cache when local is missing', () => {
    // repo cache path is resolve('cache/...') — write it for this test
    mkdirSync('cache', { recursive: true });
    writeFileSync('cache/discover-cache.json', JSON.stringify({ fetchedAtMs: 2000, concertUrl: 'x', events: [ev('622')], warnings: [] }));
    try {
      const r = loadDiscoverCache();
      expect(r.source).toBe('repo');
      expect(r.events[0]!.query).toBe('622');
    } finally {
      try { require('node:fs').unlinkSync('cache/discover-cache.json'); } catch { /* noop */ }
    }
  });

  it('skips corrupt cache files', () => {
    writeFileSync(localCachePath(), '{corrupt json');
    const r = loadDiscoverCache();
    expect(r.source).toBe('none');
  });
});

describe('mergeWithCache', () => {
  it('live wins per query, cached-only fills gaps', () => {
    const cache = { events: [ev('504', ['OLD']), ev('622')], fetchedAtMs: 1, source: 'local' as const };
    const { events } = mergeWithCache([ev('504', ['NEW'])], cache, 30);
    expect(events.find((e) => e.query === '504')!.zones).toEqual(['NEW']);
    expect(events.find((e) => e.query === '622')).toBeTruthy();
    expect(events).toHaveLength(2);
  });

  it('respects limit', () => {
    const cache = { events: [ev('a'), ev('b'), ev('c')], fetchedAtMs: 1, source: 'local' as const };
    const { events } = mergeWithCache([], cache, 2);
    expect(events).toHaveLength(2);
  });

  it('returns cacheUsed null when cache empty', () => {
    const { cacheUsed } = mergeWithCache([ev('504')], { events: [], fetchedAtMs: null, source: 'none' }, 30);
    expect(cacheUsed).toBeNull();
  });
});

describe('stalenessLine', () => {
  it('formats minutes', () => {
    const line = stalenessLine({ events: [ev('1')], fetchedAtMs: Date.now() - 5 * 60_000, source: 'local' });
    expect(line).toContain('5m old');
    expect(line).toContain('1 events');
  });
  it('formats hours', () => {
    const line = stalenessLine({ events: [ev('1')], fetchedAtMs: Date.now() - 3 * 3600_000, source: 'repo' });
    expect(line).toContain('3h old');
    expect(line).toContain('repo');
  });
  it('null when no cache', () => {
    expect(stalenessLine({ events: [], fetchedAtMs: null, source: 'none' })).toBeNull();
  });
});

describe('seedLocalCacheFromRepo', () => {
  it('copies repo cache to local on cold start', () => {
    mkdirSync('cache', { recursive: true });
    writeFileSync('cache/discover-cache.json', JSON.stringify({ fetchedAtMs: 3000, concertUrl: 'x', events: [ev('747')], warnings: [] }));
    try {
      const seeded = seedLocalCacheFromRepo();
      expect(seeded).toBe(true);
      expect(existsSync(localCachePath())).toBe(true);
      const j = JSON.parse(readFileSync(localCachePath(), 'utf-8'));
      expect(j.events[0].query).toBe('747');
    } finally {
      try { require('node:fs').unlinkSync('cache/discover-cache.json'); } catch { /* noop */ }
    }
  });

  it('never overwrites fresher local data', () => {
    saveDiscoverCache({ fetchedAtMs: 999, concertUrl: 'x', events: [ev('local')], warnings: [] });
    mkdirSync('cache', { recursive: true });
    writeFileSync('cache/discover-cache.json', JSON.stringify({ fetchedAtMs: 1, concertUrl: 'x', events: [ev('repo')], warnings: [] }));
    try {
      expect(seedLocalCacheFromRepo()).toBe(false);
      expect(loadDiscoverCache().events[0]!.query).toBe('local');
    } finally {
      try { require('node:fs').unlinkSync('cache/discover-cache.json'); } catch { /* noop */ }
    }
  });
});

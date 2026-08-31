/**
 * Pure unit tests for the cookie store.
 *
 * Each test runs against a fresh tmpdir by setting
 * `BOT_BUDCON_DATA_DIR` before importing the cookies module. The
 * module reads the env var via config.ts at module-init time, so
 * we set the env in a `beforeAll` and re-import per test (vitest
 * caches modules within a file).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir = '';

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bot-budcon-cookies-'));
  process.env['BOT_BUDCON_DATA_DIR'] = tmpDir;
});

// Reset cookies.json between tests so tests don't see each other's
// state. The tmpdir is recreated in beforeAll above.
beforeEach(() => {
  rmSync(join(tmpDir, 'cookies.json'), { force: true });
  // Drop any module cache so the next `await import('../src/cookies.js')`
  // re-runs config.ts against the (now possibly different) env.
  vi.resetModules();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['BOT_BUDCON_DATA_DIR'];
});

async function loadCookies(): Promise<Awaited<typeof import('../src/cookies.js')>['loadCookies']> {
  const mod = await import('../src/cookies.js');
  return mod.loadCookies;
}
async function saveCookies(): Promise<Awaited<typeof import('../src/cookies.js')>['saveCookies']> {
  const mod = await import('../src/cookies.js');
  return mod.saveCookies;
}

describe('normalizeCookie() — pure predicate', () => {
  it('drops entries without a value', async () => {
    const { normalizeCookie } = await import('../src/cookies.js');
    expect(normalizeCookie({ name: 'a', value: '' })).toBeNull();
  });

  it('drops entries without a name', async () => {
    const { normalizeCookie } = await import('../src/cookies.js');
    expect(normalizeCookie({ name: '', value: 'x' })).toBeNull();
  });

  it('keeps session cookies (expires = -1)', async () => {
    const { normalizeCookie } = await import('../src/cookies.js');
    const out = normalizeCookie({
      name: 'PHPSESSID', value: 'abc', domain: 'thaiticketmajor.com',
      path: '/', secure: false, httpOnly: false, expires: -1,
    });
    expect(out).not.toBeNull();
    expect(out!.expires).toBe(-1);
  });

  it('drops cookies that already expired', async () => {
    const { normalizeCookie } = await import('../src/cookies.js');
    const nowSec = 1_700_000_000;
    const out = normalizeCookie(
      { name: 'a', value: 'x', domain: 'thaiticketmajor.com',
        path: '/', secure: false, httpOnly: false, expires: nowSec - 1 },
      nowSec,
    );
    expect(out).toBeNull();
  });

  it('normalizes domain to leading-dot form', async () => {
    const { normalizeCookie } = await import('../src/cookies.js');
    const out = normalizeCookie({
      name: 'a', value: 'x', domain: 'thaiticketmajor.com',
      path: '/', secure: false, httpOnly: false, expires: -1,
    });
    expect(out!.domain).toBe('.thaiticketmajor.com');
  });
});

describe('buildCookieHeader()', () => {
  it('matches cookies whose domain ends with the request host', async () => {
    const { buildCookieHeader } = await import('../src/cookies.js');
    const out = buildCookieHeader(
      [
        { name: 'a', value: '1', domain: '.thaiticketmajor.com', path: '/', secure: false, httpOnly: false, expires: -1 },
        { name: 'b', value: '2', domain: '.example.com', path: '/', secure: false, httpOnly: false, expires: -1 },
      ],
      'www.thaiticketmajor.com',
    );
    expect(out).toBe('a=1');
  });

  it('handles exact-match domains', async () => {
    const { buildCookieHeader } = await import('../src/cookies.js');
    const out = buildCookieHeader(
      [{ name: 'a', value: '1', domain: '.ttm.co', path: '/', secure: false, httpOnly: false, expires: -1 }],
      'ttm.co',
    );
    expect(out).toBe('a=1');
  });
});

describe('saveCookies() / loadCookies() — isolated tmpdir', () => {
  it('round-trips valid cookies and filters out expired', async () => {
    const save = await saveCookies();
    const load = await loadCookies();
    save([
      { name: 'PHPSESSID', value: 'live', domain: '.thaiticketmajor.com',
        path: '/', secure: false, httpOnly: false, expires: -1 },
      { name: 'expired', value: 'dead', domain: '.thaiticketmajor.com',
        path: '/', secure: false, httpOnly: false, expires: 1 },
    ]);
    const got = await load();
    expect(got.find((c) => c.name === 'PHPSESSID')?.value).toBe('live');
    expect(got.find((c) => c.name === 'expired')).toBeUndefined();
  });

  it('returns empty array on missing file', async () => {
    const load = await loadCookies();
    expect(await load()).toEqual([]);
  });

  it('returns empty array on corrupt JSON', async () => {
    writeFileSync(join(tmpDir, 'cookies.json'), 'not json');
    const load = await loadCookies();
    expect(await load()).toEqual([]);
  });

  it('saveCookies trims expired and empty entries', async () => {
    const save = await saveCookies();
    const saved = await save([
      { name: 'PHPSESSID', value: 'live', domain: '.thaiticketmajor.com',
        path: '/', secure: false, httpOnly: false, expires: -1 },
      { name: 'expired', value: 'dead', domain: '.thaiticketmajor.com',
        path: '/', secure: false, httpOnly: false, expires: 1 },
      { name: '', value: 'noop', domain: '.thaiticketmajor.com',
        path: '/', secure: false, httpOnly: false, expires: -1 },
    ]);
    expect(saved.find((c) => c.name === 'PHPSESSID')?.value).toBe('live');
    expect(saved.find((c) => c.name === 'expired')).toBeUndefined();
  });
});

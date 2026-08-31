/**
 * bot_budcon — auth-cookie gate unit tests (ticket 10).
 */
import { describe, it, expect } from 'vitest';
import {
  classify,
  pickPrimaryAuth,
  isExpired,
  summarize,
  gate,
  AUTH_COOKIE_NAMES,
} from '../src/auth-cookies.js';
import type { StoredCookie } from '../src/cookies.js';

function mkCookie(
  name: string,
  opts: Partial<StoredCookie> = {},
): StoredCookie {
  return {
    name,
    value: 'v',
    domain: '.thaiticketmajor.com',
    path: '/',
    secure: false,
    httpOnly: false,
    expires: -1,
    ...opts,
  };
}

describe('classify()', () => {
  it('tags auth / session / phase1 / other', () => {
    const out = classify([
      mkCookie('ttkname'),
      mkCookie('PHPSESSID'),
      mkCookie('ak_bmsc'),
      mkCookie('ga'),
    ]);
    expect(out.map((o) => [o.cookie.name, o.cls])).toEqual([
      ['ttkname', 'AUTH'],
      ['PHPSESSID', 'SESSION'],
      ['ak_bmsc', 'PHASE1'],
      ['ga', 'OTHER'],
    ]);
  });

  it('does not modify the input array', () => {
    const cookies = [mkCookie('ttkname')];
    const before = JSON.stringify(cookies);
    classify(cookies);
    expect(JSON.stringify(cookies)).toBe(before);
  });
});

describe('pickPrimaryAuth()', () => {
  it('prefers ttkname over ttkemail over tixid', () => {
    const cookies = [
      mkCookie('tixid', { value: 'tix' }),
      mkCookie('ttkemail', { value: 'eml' }),
      mkCookie('ttkname', { value: 'nm' }),
    ];
    expect(pickPrimaryAuth(cookies)?.value).toBe('nm');
  });

  it('falls through the priority list', () => {
    expect(pickPrimaryAuth([mkCookie('tixid')])?.value).toBe('v');
    expect(pickPrimaryAuth([mkCookie('ttkemail')])?.value).toBe('v');
  });

  it('returns null when no auth cookie is present', () => {
    expect(pickPrimaryAuth([mkCookie('PHPSESSID'), mkCookie('ga')])).toBeNull();
  });
});

describe('isExpired()', () => {
  it('returns true when expires < nowSec', () => {
    expect(isExpired(mkCookie('a', { expires: 100 }), 200)).toBe(true);
  });

  it('returns false when expires >= nowSec', () => {
    expect(isExpired(mkCookie('a', { expires: 200 }), 100)).toBe(false);
  });

  it('returns false for session cookies (expires -1)', () => {
    expect(isExpired(mkCookie('a', { expires: -1 }))).toBe(false);
  });
});

describe('summarize()', () => {
  it('reports fresh=true with a fresh ttkname', () => {
    const s = summarize(
      [mkCookie('ttkname', { expires: Math.floor(Date.now() / 1000) + 3600 })],
      Math.floor(Date.now() / 1000),
    );
    expect(s.primary?.name).toBe('ttkname');
    expect(s.fresh).toBe(true);
    expect(s.expiredOnly).toBe(false);
    expect(s.all.map((c) => c.name)).toEqual(['ttkname']);
  });

  it('reports expiredOnly=true when only expired auth cookies are present', () => {
    const now = 1_000_000;
    const s = summarize([mkCookie('ttkname', { expires: now - 1 })], now);
    expect(s.fresh).toBe(false);
    expect(s.expiredOnly).toBe(true);
    expect(s.primary?.name).toBe('ttkname');
  });

  it('reports fresh=false when no auth cookie is present', () => {
    const s = summarize([mkCookie('PHPSESSID'), mkCookie('ga')]);
    expect(s.fresh).toBe(false);
    expect(s.expiredOnly).toBe(false);
    expect(s.primary).toBeNull();
  });

  it('expiresAtSec equals the weakest auth expiry', () => {
    const now = 1_000_000;
    const s = summarize(
      [
        mkCookie('ttkname', { expires: now + 7200 }),
        mkCookie('ttkemail', { expires: now + 3600 }),
      ],
      now,
    );
    expect(s.expiresAtSec).toBe(now + 3600);
  });

  it('expiresAtSec is Infinity when no auth cookie carries an expiry', () => {
    const s = summarize([mkCookie('ttkname', { expires: -1 })]);
    expect(s.expiresAtSec).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('gate()', () => {
  const now = 1_000_000;
  const freshAuth = mkCookie('ttkname', { expires: now + 3600 });
  const expiredAuth = mkCookie('ttkname', { expires: now - 1 });
  const phase1 = mkCookie('ak_bmsc');

  it('accepts when auth + phase1 are present and fresh', () => {
    const r = gate([freshAuth, phase1], now);
    expect(r.accept).toBe(true);
    expect(r.primary?.name).toBe('ttkname');
  });

  it('refuses with no_phase1 when phase1 cookie is missing', () => {
    const r = gate([freshAuth], now);
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('no_phase1');
  });

  it('refuses with no_auth when no auth cookie is present', () => {
    const r = gate([phase1], now);
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('no_auth');
  });

  it('refuses with expired when auth cookies exist but are all expired', () => {
    const r = gate([expiredAuth, phase1], now);
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('expired');
    expect(r.primary?.name).toBe('ttkname');
  });

  it('treats session-cookie auth (expires -1) as fresh', () => {
    const r = gate([mkCookie('ttkname', { expires: -1 }), phase1], now);
    expect(r.accept).toBe(true);
  });

  it('exposes the full summary for callers that want to log it', () => {
    const r = gate([freshAuth, phase1, mkCookie('PHPSESSID')], now);
    expect(r.summary.session.map((c) => c.name)).toEqual(['PHPSESSID']);
    expect(r.summary.phase1.map((c) => c.name)).toEqual(['ak_bmsc']);
    expect(r.summary.all.map((c) => c.name)).toEqual(['ttkname']);
  });
});

describe('AUTH_COOKIE_NAMES', () => {
  it('contains exactly ttkname, ttkemail, tixid', () => {
    expect([...AUTH_COOKIE_NAMES].sort()).toEqual(['tixid', 'ttkemail', 'ttkname']);
  });
});
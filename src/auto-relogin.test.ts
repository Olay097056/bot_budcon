/**
 * bot_budcon — auto re-login unit tests (ticket 11).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  maybeRelogin,
  _resetInFlight,
  type AutoReloginOptions,
} from '../src/auto-relogin.js';
import type { StoredCookie } from '../src/cookies.js';

const farFuture = 4_102_444_800; // 2100-01-01 UTC

function freshAuthCookies(): StoredCookie[] {
  return [
    {
      name: 'ttkname',
      value: 'u',
      domain: '.thaiticketmajor.com',
      path: '/',
      secure: false,
      httpOnly: false,
      expires: farFuture,
    },
    {
      name: 'ak_bmsc',
      value: 'a',
      domain: '.thaiticketmajor.com',
      path: '/',
      secure: false,
      httpOnly: false,
      expires: -1,
    },
  ];
}

function expiredAuthCookies(): StoredCookie[] {
  return [
    {
      name: 'ttkname',
      value: 'u',
      domain: '.thaiticketmajor.com',
      path: '/',
      secure: false,
      httpOnly: false,
      expires: 1_577_836_800, // 2020-01-01
    },
    {
      name: 'ak_bmsc',
      value: 'a',
      domain: '.thaiticketmajor.com',
      path: '/',
      secure: false,
      httpOnly: false,
      expires: -1,
    },
  ];
}

function emptyCookies(): StoredCookie[] {
  return [];
}

function mockOpts(overrides: Partial<AutoReloginOptions> = {}): AutoReloginOptions {
  return {
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

describe('maybeRelogin()', () => {
  beforeEach(() => {
    _resetInFlight();
  });

  it('returns no_need when the gate accepts (fresh auth cookies)', async () => {
    const opts = mockOpts({ loader: () => freshAuthCookies() });
    const r = await maybeRelogin(opts);
    expect(r.lastResult).toBe('no_need');
  });

  it('runs login() once when gate rejects with expired', async () => {
    let loginCalls = 0;
    const opts = mockOpts({
      loader: () => expiredAuthCookies(),
      login: async () => {
        loginCalls++;
        return false; // simulate captcha refused
      },
    });
    const r = await maybeRelogin(opts);
    expect(loginCalls).toBe(1);
    expect(r.lastResult).toBe('expired');
    expect(r.reason).toBe('expired');
  });

  it('reports ok when login() succeeds and gate now accepts', async () => {
    let loaderCallCount = 0;
    const opts = mockOpts({
      // First call returns expired; second call (after login)
      // returns fresh — simulates login() actually persisting
      // the new ttkname to cookies.json.
      loader: () => {
        loaderCallCount++;
        return loaderCallCount === 1 ? expiredAuthCookies() : freshAuthCookies();
      },
      login: async () => true,
    });
    const r = await maybeRelogin(opts);
    expect(r.lastResult).toBe('ok');
  });

  it('honours the back-off window (no second attempt within backoffMs)', async () => {
    let loginCalls = 0;
    const t0 = 1_700_000_000_000;
    let nowMs = t0;
    const opts = mockOpts({
      loader: () => expiredAuthCookies(),
      login: async () => {
        loginCalls++;
        return false;
      },
      now: () => nowMs,
    });

    // First attempt fires login.
    const r1 = await maybeRelogin(opts);
    expect(loginCalls).toBe(1);
    expect(r1.lastResult).toBe('expired');

    // 5 seconds later — still inside the 60s back-off. No call.
    nowMs = t0 + 5_000;
    const r2 = await maybeRelogin(opts);
    expect(loginCalls).toBe(1);
    expect(r2.lastResult).toBe('backoff');

    // 70 seconds later — past back-off. Login fires again.
    nowMs = t0 + 70_000;
    const r3 = await maybeRelogin(opts);
    expect(loginCalls).toBe(2);
    expect(r3.lastResult).toBe('expired');
  });

  it('is single-flight: concurrent calls share one login attempt', async () => {
    let loginCalls = 0;
    let resolveLogin: (v: boolean) => void = () => {};
    const loginPromise = new Promise<boolean>((resolve) => {
      resolveLogin = resolve;
    });
    const opts = mockOpts({
      loader: () => expiredAuthCookies(),
      login: () => {
        loginCalls++;
        return loginPromise;
      },
    });

    const p1 = maybeRelogin(opts);
    const p2 = maybeRelogin(opts);
    const p3 = maybeRelogin(opts);

    // Resolve the login; all three callers should see one attempt.
    resolveLogin(false);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(loginCalls).toBe(1);
    // p1 is the one that triggered; p2 and p3 see in_progress.
    expect(r1.lastResult).toBe('expired');
    expect(r2.lastResult).toBe('in_progress');
    expect(r3.lastResult).toBe('in_progress');
  });

  it('reports no_auth reason when the cookie store is empty', async () => {
    let loginCalls = 0;
    const opts = mockOpts({
      loader: () => emptyCookies(),
      login: async () => {
        loginCalls++;
        return false;
      },
    });
    const r = await maybeRelogin(opts);
    expect(r.lastResult).toBe('expired');
    expect(r.reason).toBe('no_phase1');
    expect(loginCalls).toBe(1);
  });

  it('does not call login() at all when the gate accepts', async () => {
    let loginCalls = 0;
    const opts = mockOpts({
      loader: () => freshAuthCookies(),
      login: async () => {
        loginCalls++;
        return true;
      },
    });
    await maybeRelogin(opts);
    expect(loginCalls).toBe(0);
  });
});
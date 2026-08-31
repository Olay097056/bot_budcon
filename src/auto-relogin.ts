/**
 * bot_budcon — auto re-login (ticket 11).
 *
 * When `gate()` reports `expired` (the auth cookie has lapsed
 * while the bot was idle), we need to refresh it without making
 * the user click `🔓 Login` again. This module wraps that loop
 * with two safety properties:
 *
 *   1. **Back-off**: never retry more than once every
 *      `BACKOFF_MS` (default 60 s). The watch loop runs every
 *      5 s, so without back-off a transient captcha failure
 *      would burn the user's captcha attempts.
 *
 *   2. **Single-flight**: only one re-login attempt at a time.
 *      If the pill is asked twice in quick succession, the
 *      second call attaches to the in-flight promise rather
 *      than spawning a second Firefox window.
 *
 * The human still fills the captcha. We don't solve that. We
 * just decide *when* to spawn the visible login window.
 *
 * What this module does NOT do
 * ----------------------------
 *   - CAPTCHA solving.
 *   - Multi-account rotation.
 *   - Disable or replace the existing `LoginFlow` — we just
 *     call `startLogin()` exactly as the UI button does.
 */
import { gate } from './auth-cookies.js';
import { loadCookies, saveCookies } from './cookies.js';
import { startLogin } from './login.js';

export const DEFAULT_BACKOFF_MS = 60_000; // 1 minute
export const DEFAULT_TIMEOUT_MS = 5 * 60_000; // 5 minutes — login.ts default

export interface AutoReloginOptions {
  backoffMs?: number;
  /** Override for tests: inject a fake login runner. */
  login?: () => Promise<boolean>;
  /** Override for tests: inject a fake loader. */
  loader?: () => ReturnType<typeof loadCookies>;
  /** Override for tests: time source. */
  now?: () => number;
}

export interface AutoReloginState {
  /** Most recent attempt's outcome. */
  lastResult: 'ok' | 'expired' | 'in_progress' | 'backoff' | 'no_need';
  /** When the last attempt finished (ms epoch). 0 if never. */
  lastAttemptAtMs: number;
  /** Why the last attempt was triggered. */
  reason?: 'expired' | 'no_auth' | 'no_phase1';
}

/**
 * Decide whether a re-login attempt is currently warranted, and if
 * so, run one. Returns the resulting state.
 *
 * Use this from a poll loop (e.g. once every 5 s). The function is
 * single-flight: a second concurrent call returns the in-flight
 * promise's outcome without spawning another browser window.
 */
export async function maybeRelogin(
  opts: AutoReloginOptions = {},
): Promise<AutoReloginState> {
  const now = opts.now ?? Date.now;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const loader = opts.loader ?? loadCookies;
  const login = opts.login ?? (() => startLogin());

  // 1. Inspect the gate on disk. If the verdict is fine, do nothing.
  const verdict = gate(loader());
  if (verdict.accept) {
    return { lastResult: 'no_need', lastAttemptAtMs: inFlight.lastAttemptAtMs };
  }

  // 2. Refuse to retry inside the back-off window. Surface the
  //    in-flight state so the dashboard pill can show "waiting".
  if (inFlight.promise) {
    return {
      lastResult: 'in_progress',
      lastAttemptAtMs: inFlight.lastAttemptAtMs,
      reason: verdict.reason,
    };
  }
  if (now() - inFlight.lastAttemptAtMs < backoffMs && inFlight.lastAttemptAtMs !== 0) {
    return {
      lastResult: 'backoff',
      lastAttemptAtMs: inFlight.lastAttemptAtMs,
      reason: verdict.reason,
    };
  }

  // 3. Single-flight: record the attempt and run the login flow.
  //    Any concurrent caller attaches to the same promise.
  inFlight.lastAttemptAtMs = now();
  inFlight.promise = (async () => {
    let ok = false;
    try {
      ok = await login();
    } catch {
      ok = false;
    }
    // Always clear the in-flight marker, even on throw.
    inFlight.promise = null;
    // After the attempt, re-inspect: if the gate is still bad
    // AND the verdict is "expired" (not "no_auth" — that means
    // the cookies file is empty, which login.ts may have left
    // empty by design), mark expired. Otherwise the user
    // refused the captcha and we should NOT spam them — stay
    // in back-off until the next gate check.
    const after = gate(loader());
    if (after.accept) return 'ok' as const;
    if (after.reason === 'expired') return 'expired' as const;
    return 'expired' as const; // no_auth / no_phase1 both mean "login didn't land"
  })();

  const result = await inFlight.promise;
  return { lastResult: result, lastAttemptAtMs: inFlight.lastAttemptAtMs, reason: verdict.reason };
}

/** Internal single-flight slot. Cleared automatically. */
const inFlight: { promise: Promise<'ok' | 'expired'> | null; lastAttemptAtMs: number } = {
  promise: null,
  lastAttemptAtMs: 0,
};

/** Test-only: reset the in-flight state. */
export function _resetInFlight(): void {
  inFlight.promise = null;
  inFlight.lastAttemptAtMs = 0;
}
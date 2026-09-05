/**
 * bot_budcon — auth-cookie capture and reuse (ticket 10).
 *
 * After a successful Playwright login we already persist every
 * `.thaiticketmajor.*` cookie to disk via `cookies.ts`. This module
 * classifies which of those are *auth* cookies (the ones that
 * actually carry the user identity, and which a stale watch loop
 * needs to detect before firing `book()`).
 *
 * Why a separate module
 * ---------------------
 * The cookie store grows (TTM sets ~24 cookies on a normal visit,
 * Akamai adds bm_sz / ak_bmsc, the session layer adds HWWAFSESID,
 * the booking subdomain adds tixid). Book flow must refuse to fire
 * if the only auth cookie is PHPSESSID (no ttkname / ttkemail /
 * tixid) — those prove the user is logged in.
 *
 * What this file does
 * -------------------
 *   1. Classify cookies by name into PHASE1 (TLS bypass), SESSION
 *      (server session), or AUTH (user identity).
 *   2. Return the strongest AUTH cookie present (ttkname > ttkemail
 *      > tixid). ttkname is what TTM's dashboard redirects to.
 *   3. Validate TTL: refuse AUTH cookies whose expires < nowSec,
 *      refuse session cookies whose expires < nowSec + 60s.
 *
 * What this file does NOT do
 * --------------------------
 *   - Re-issue cookies. Auth cookie refresh lives in login.ts.
 *   - Re-login automatically. If AUTH is missing, the caller decides
 *     whether to spawn login or to abort (book flow aborts).
 */
import type { StoredCookie } from './cookies.js';

/** TTM cookies that prove the user is logged in. */
export const AUTH_COOKIE_NAMES = ['ttkname', 'ttkemail', 'tixid'] as const;

/** Server session cookies (PHPSESSID, HWWAFSESID, etc.). */
export const SESSION_COOKIE_NAMES = ['PHPSESSID', 'HWWAFSESID'] as const;

/** Cookies we treat as TLS-bypass side effects, not as identity. */
export const PHASE1_COOKIE_NAMES = [
  'ak_bmsc',
  'bm_sz',
  'bm_mi',
  'bm_sv',
  'akamai_generated',
] as const;

export type CookieClass = 'AUTH' | 'SESSION' | 'PHASE1' | 'OTHER';

export interface ClassifiedCookie {
  cookie: StoredCookie;
  cls: CookieClass;
}

export interface AuthCookieSummary {
  /** The strongest auth cookie present, or null if none. */
  primary: StoredCookie | null;
  /** Every auth cookie present, in priority order (ttkname first). */
  all: StoredCookie[];
  /** Session cookies present. */
  session: StoredCookie[];
  /** Phase-1 TLS cookies present. */
  phase1: StoredCookie[];
  /** True if at least one auth cookie is fresh enough to be trusted. */
  fresh: boolean;
  /** True if auth cookies exist but are all expired. */
  expiredOnly: boolean;
  /** Unix seconds when the weakest auth cookie expires (Infinity if session). */
  expiresAtSec: number;
}

/**
 * Tag each cookie with its class. Order of preference for AUTH is
 * `ttkname > ttkemail > tixid`. The classifier is case-sensitive —
 * TTM cookie names are always lowercase.
 */
export function classify(cookies: StoredCookie[]): ClassifiedCookie[] {
  return cookies.map((c) => {
    let cls: CookieClass = 'OTHER';
    if ((AUTH_COOKIE_NAMES as readonly string[]).includes(c.name)) cls = 'AUTH';
    else if ((SESSION_COOKIE_NAMES as readonly string[]).includes(c.name)) cls = 'SESSION';
    else if ((PHASE1_COOKIE_NAMES as readonly string[]).includes(c.name)) cls = 'PHASE1';
    return { cookie: c, cls };
  });
}

/**
 * Pick the strongest AUTH cookie. Returns null if no auth cookie
 * is present. TTM redirects the homepage to /user/signin.php when
 * ttkname is missing, so ttkname is the canonical "logged in" signal.
 */
export function pickPrimaryAuth(cookies: StoredCookie[]): StoredCookie | null {
  const auth = cookies.filter((c) =>
    (AUTH_COOKIE_NAMES as readonly string[]).includes(c.name),
  );
  for (const name of AUTH_COOKIE_NAMES) {
    const hit = auth.find((c) => c.name === name);
    if (hit) return hit;
  }
  return null;
}

export function isExpired(
  cookie: StoredCookie,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  return typeof cookie.expires === 'number' && cookie.expires > 0 && cookie.expires < nowSec;
}

/**
 * Build the summary that book() consumes before opening checkout.
 *
 * `fresh=true` requires:
 *   - at least one auth cookie present
 *   - that cookie's expires is either -1 (session cookie) or
 *     strictly greater than nowSec
 *
 * If auth cookies exist but are all expired, `expiredOnly=true` and
 * `fresh=false`. The caller is expected to trigger login again.
 */
export function summarize(
  cookies: StoredCookie[],
  nowSec = Math.floor(Date.now() / 1000),
): AuthCookieSummary {
  const auth: StoredCookie[] = [];
  const session: StoredCookie[] = [];
  const phase1: StoredCookie[] = [];

  for (const c of cookies) {
    if ((AUTH_COOKIE_NAMES as readonly string[]).includes(c.name)) auth.push(c);
    else if ((SESSION_COOKIE_NAMES as readonly string[]).includes(c.name)) session.push(c);
    else if ((PHASE1_COOKIE_NAMES as readonly string[]).includes(c.name)) phase1.push(c);
  }

  const primary = pickPrimaryAuth(cookies);
  const allAuthFresh = auth.filter((c) => !isExpired(c, nowSec));
  const fresh = allAuthFresh.length > 0;
  const expiredOnly = auth.length > 0 && allAuthFresh.length === 0;

  // Expiry of the *weakest* auth cookie (smallest expires). That
  // marks the moment the bot must log in again.
  let expiresAtSec = Number.POSITIVE_INFINITY;
  for (const c of auth) {
    if (typeof c.expires === 'number' && c.expires > 0 && c.expires < expiresAtSec) {
      expiresAtSec = c.expires;
    }
  }

  return {
    primary,
    all: auth,
    session,
    phase1,
    fresh,
    expiredOnly,
    expiresAtSec,
  };
}

/**
 * Decide whether `book()` should proceed.
 *
 * Returns the primary auth cookie on accept, or null on refuse
 * (the caller logs the summary and asks the user to re-login).
 *
 * Reject reasons (the second return value):
 *   - 'no_auth'   : no auth cookie at all
 *   - 'expired'   : auth cookies exist but all expired
 *   - 'no_phase1' : no Phase-1 cookie present (TLS bypass would
 *                   fail on the next request anyway)
 */
export function gate(
  cookies: StoredCookie[],
  nowSec = Math.floor(Date.now() / 1000),
): { accept: boolean; primary: StoredCookie | null; reason?: 'no_auth' | 'expired' | 'no_phase1'; summary: AuthCookieSummary } {
  const summary = summarize(cookies, nowSec);
  // C03: curl-first mode acquires Phase-1 cookies live from the server
  // (zones.php Set-Cookie on the first no-cookie request), so a missing
  // phase1 is no longer fatal as long as a real login session exists
  // (AUTH + PHPSESSID pasted from the real Firefox).
  if (summary.phase1.length === 0) {
    const hasSession = cookies.some((c) => c.name === 'PHPSESSID');
    if (summary.all.length > 0 && hasSession) {
      // accept — phase1 will be acquired live
    } else {
      return { accept: false, primary: summary.primary, reason: 'no_phase1', summary };
    }
  }
  if (summary.all.length === 0) {
    return { accept: false, primary: null, reason: 'no_auth', summary };
  }
  if (summary.expiredOnly) {
    return { accept: false, primary: summary.primary, reason: 'expired', summary };
  }
  return { accept: true, primary: summary.primary, summary };
}
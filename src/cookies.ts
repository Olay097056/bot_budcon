/**
 * bot_budcon — cookie persistence (Phase-1 shape, ticket 04).
 *
 * We share one cookie file on disk between the wreq-js transport
 * (ticket 02) and the Playwright Firefox login flow (this ticket).
 * Phase-2 sensor_data generation is OUT OF SCOPE per the wayfinder
 * map's Out of scope section — we keep the cookie store small enough
 * that wreq-js can use it directly.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from './config.js';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  /** Unix seconds; -1 means session cookie. */
  expires?: number;
}

/**
 * Trim a cookie to the minimum the rest of the bot cares about.
 * Drops empty entries, normalizes the domain (always `.example.com`
 * style), and discards cookies that have already expired.
 */
export function normalizeCookie(
  c: Partial<StoredCookie> & { name: string; value: string },
  nowSec = Math.floor(Date.now() / 1000),
): StoredCookie | null {
  if (!c.name || !c.value) return null;
  const expires = typeof c.expires === 'number' ? c.expires : -1;
  if (expires > 0 && expires * 1000 <= nowSec * 1000) return null;
  const rawDomain = c.domain ?? '';
  const domain = rawDomain.startsWith('.') ? rawDomain : `.${rawDomain}`;
  return {
    name: c.name,
    value: c.value,
    domain,
    path: c.path ?? '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    expires,
  };
}

export function loadCookies(): StoredCookie[] {
  if (!existsSync(config.paths.cookies)) return [];
  try {
    const raw = readFileSync(config.paths.cookies, 'utf-8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c): c is StoredCookie => !!c && typeof c.name === 'string');
  } catch {
    return [];
  }
}

export function saveCookies(cookies: StoredCookie[]): StoredCookie[] {
  const trimmed = cookies
    .map((c) => normalizeCookie(c))
    .filter((c): c is StoredCookie => c !== null);
  writeFileSync(config.paths.cookies, JSON.stringify(trimmed, null, 2), 'utf-8');
  return trimmed;
}

/**
 * Convert a flat cookie header string ("a=1; b=2") into a Map for
 * quick lookups. Used by wreq-js's `Cookie` header on the way out.
 */
export function buildCookieHeader(
  cookies: StoredCookie[],
  /** The host we are sending the Cookie header to (no scheme). */
  domain: string,
): string {
  // The cookie spec says ".example.com" matches "example.com" and
  // any subdomain of it. So given a request host we have to find
  // every cookie whose domain is equal to or a parent of the host.
  // A cookie scoped to ".thaiticketmajor.com" is sent to
  // "www.thaiticketmajor.com" (host ends with `.thaiticketmajor.com`)
  // and to "thaiticketmajor.com" itself (equality). We never want a
  // cookie scoped to ".evil-thaiticketmajor.com" to leak into a
  // request for "thaiticketmajor.com", which is why the suffix
  // match requires a leading dot.
  const host = domain.replace(/^\./, '').toLowerCase();
  return cookies
    .filter((c) => {
      const dom = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
      const domLower = dom.toLowerCase();
      if (domLower === host) return true;
      return host.endsWith(`.${domLower}`);
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

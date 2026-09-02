/**
 * CHAIN FIX: add curl transport as transport #1 for GET scraping.
 *
 * Empirical matrix (2026-09-01 evening, this IP):
 *   concert/   curl+NO-headers → 200 124KB 22 queries  (3x stable)
 *   concert/   curl+auth-jar   → 403 Access Denied     (cookie/IP mismatch rule!)
 *   concert/   wreq/fetch/browser → 403/407 denied
 *   zones.php  curl+auth-jar   → 200 56KB 15 anchors   (2x stable)
 *   zones.php  curl+fresh-jar  → 71B signin bounce (session not authed)
 *   zones.php  wreq/fetch      → 71B signin bounce
 *   zones.php  browser         → worked earlier, now also denied sometimes
 *
 * Rules learned:
 *   - concert/ is PUBLIC: curl with ZERO headers passes. Any cookie/referer
 *     header on a curl GET triggers the deny rule.
 *   - zones.php is AUTH-scoped: needs the full logged-in cookie jar (curl ok)
 *     — light transports without session bounce to signin.
 * Chain: curl (no-header first, jar for auth hosts) → wreq → fetch → browser.
 */
import { execSync } from 'node:child_process';
import { statSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCookieHeader, loadCookies } from './cookies.js';

export interface CurlResult {
  status: number;
  body: string;
  finalUrl?: string;
  via: 'curl';
}

/** booking/event hosts are auth-scoped: send the full logged-in jar. */
function isAuthScoped(url: string): boolean {
  const host = new URL(url).host;
  return host.startsWith('booking.') || host.startsWith('event.');
}

export function curlTransportSync(url: string, timeoutMs = 20_000, opts?: { cookieHeader?: string; referer?: string }): CurlResult {
  const tmp = join(tmpdir(), `ttm-curl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  let ck = opts?.cookieHeader ?? '';
  if (!ck && isAuthScoped(url)) {
    const cookies = loadCookies();
    ck = buildCookieHeader(cookies, new URL(url).host) ?? '';
  }
  // public hosts (www.*): deliberately NO cookie/referer header — any of
  // those on a curl GET triggers Akamai's deny rule (mismatch fingerprint).
  const code = execSync(
    `curl -s --compressed --max-time ${Math.ceil(timeoutMs / 1000)} -o "${tmp}" -w "%{http_code}"`
    + (ck ? ` -H "Cookie: ${ck}"` : '')
    + ` -A "curl/8.0.1" "${url}"`,
    { encoding: 'utf-8', timeout: timeoutMs + 5_000, maxBuffer: 32 * 1024 * 1024 },
  ).trim();
  const status = Number(code) || 0;
  const bytes = statSync(tmp).size;
  const body = bytes <= 8 * 1024 * 1024 ? readFileSync(tmp, 'utf-8') : '';
  try { unlinkSync(tmp); } catch { /* best effort */ }
  return { status, body, finalUrl: url, via: 'curl' };
}

export async function curlTransport(url: string): Promise<CurlResult> {
  return curlTransportSync(url);
}

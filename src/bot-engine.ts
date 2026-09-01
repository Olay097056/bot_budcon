/**
 * bot_budcon — Bot engine.
 *
 * Two transports:
 *
 *   - **wreq-js** (`Transport.Wreq`) for raw HTTP where we need TLS
 *     fingerprint impersonation. Use it for cookie-store reads
 *     (Phase-1 light), zone-page polls, and any fetch that needs to
 *     land on Akamai / HWWAF without bot-spawn Firefox.
 *
 *   - **Playwright persistent Firefox** for actions that require a
 *     real browser — login form, captcha, payment flow. Use it once
 *     per session to land the PHPSESSID + Akamai BM cookies, then
 *     fall back to wreq-js for everything else.
 *
 * Both share the same `cookies.json` on disk so a hand-driven login
 * in Firefox is reusable from the lighter wreq-js path.
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { loadCookies } from './cookies.js';

export interface FetchOptions {
  /** Override the User-Agent; defaults to wreq-js' Chrome 149 impersonation. */
  userAgent?: string;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Abort after N milliseconds. */
  timeoutMs?: number;
  /** Cookies to attach (defaults to the on-disk cookie store). */
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    expires?: number;
  }>;
}

export interface FetchResult {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Lazily-imported wreq-js shape — typed loosely to avoid pulling
 *  native bindings at module-eval time during unit tests. */
type WreqModule = typeof import('wreq-js');
type WreqFetch = WreqModule['fetch'];

/**
 * Strip `Set-Cookie` from a Headers record (wreq-js exposes a Headers
 * object with iter semantics; we want a plain object downstream).
 */
function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export class BotEngine {
  private _wreqPromise: Promise<WreqModule> | null = null;
  private _wreq: WreqModule | null = null;
  private _context: BrowserContext | null = null;
  private _page: Page | null = null;

  /** Eagerly load wreq-js (lazy so unit tests can mock). */
  private async loadWreq(): Promise<WreqModule> {
    if (this._wreq) return this._wreq;
    if (!this._wreqPromise) {
      this._wreqPromise = import('wreq-js').then((m) => {
        // wreq-js ships ESM with a named `fetch` plus a `default`
        // object that also has `fetch` — prefer the named export.
        this._wreq = (m as unknown as { fetch: WreqFetch }).fetch
          ? (m as unknown as WreqModule)
          : ((m as unknown as { default: WreqModule }).default);
        if (!this._wreq) throw new Error('wreq-js did not expose fetch');
        return this._wreq;
      });
    }
    return this._wreqPromise;
  }

  /** TLS-impersonating fetch (Chrome 149 fingerprint by default). */
  async fetchViaWreq(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const wreq = await this.loadWreq();
    const headers: Record<string, string> = {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...opts.headers,
    };
    if (opts.userAgent) headers['User-Agent'] = opts.userAgent;

    const response = await wreq.fetch(url, {
      headers,
      timeout: opts.timeoutMs ?? 30_000,
    });
    const body = await response.text();
    return {
      status: response.status,
      url: response.url ?? url,
      headers: headersToObject(response.headers),
      body,
    };
  }

  /**
   * Boot Playwright Firefox once. Stale-lock cleanup happens before
   * launch because the prior TTM-bot session kept hitting
   * `parent.lock` errors when Firefox died mid-launch.
   */
  async getContext(): Promise<BrowserContext> {
    if (this._context) {
      // Re-seed on every access so a fresh invisible login (ticket 14)
      // is picked up without needing to restart the server / kill
      // the persistent profile.
      try {
        const store = loadCookies();
        const pwCookies = store
          .filter((c) => c.name && c.value && c.domain)
          .map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
            path: c.path ?? '/',
            secure: Boolean(c.secure),
            httpOnly: Boolean(c.httpOnly),
            expires: typeof c.expires === 'number' && c.expires > 0 ? c.expires : undefined,
            sameSite: 'Lax' as const,
          }));
        if (pwCookies.length) await this._context.addCookies(pwCookies);
      } catch {
        // best effort
      }
      return this._context;
    }

    // Pick Firefox (TTM detection fits Firefox best per ticket 07
    // recon — sensor+TLS parity is cleanest there). Chromium is
    // available as a fallback if Firefox hits issues, but not wired
    // up yet (ticket 06 / 07b watch-list had BotBrowser as the
    // candidate if it does).
    const { firefox } = await import('playwright');

    // Ensure the profile directory exists.
    mkdirSync(config.paths.firefoxProfile, { recursive: true });

    // Clean stale lock files left over from a crashed previous run.
    for (const name of ['parent.lock', 'lock', '.parentlock']) {
      const p = join(config.paths.firefoxProfile, name);
      try {
        if (existsSync(p)) {
          unlinkSync(p);
          // eslint-disable-next-line no-console
          console.log(`[bot-engine] removed stale lock: ${name}`);
        }
      } catch {
        // best effort
      }
    }

    this._context = await firefox.launchPersistentContext(
      config.paths.firefoxProfile,
      {
        headless: false,
        args: [
          '--no-sandbox',
          '--window-position=1100,40',
          '--window-size=780,720',
        ],
      },
    );
    // Seed the persistent profile from cookies.json so a hand-driven
    // invisible login (ticket 14) is reusable from the book flow
    // without requiring a second manual login in this profile.
    // Playwright's addCookies expects explicit domain/path; the
    // cookies.json store already carries those. Ignore failures
    // (e.g. expired -1) so a single bad cookie doesn't kill launch.
    try {
      const store = loadCookies();
      const pwCookies = store
        .filter((c) => c.name && c.value && c.domain)
        .map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
          path: c.path ?? '/',
          secure: Boolean(c.secure),
          httpOnly: Boolean(c.httpOnly),
          expires: typeof c.expires === 'number' && c.expires > 0 ? c.expires : undefined,
          sameSite: 'Lax' as const,
        }));
      if (pwCookies.length) await this._context.addCookies(pwCookies);
    } catch {
      // best effort — book will surface a useful error if still not logged in
    }
    return this._context;
  }

  /** First page of the persistent context, creating one if needed. */
  async getPage(): Promise<Page> {
    const ctx = await this.getContext();
    if (this._page && !this._page.isClosed()) return this._page;
    const pages = ctx.pages();
    this._page = pages.length > 0 ? pages[0]! : await ctx.newPage();
    return this._page;
  }

  /** Tear down both transports. */
  async close(): Promise<void> {
    if (this._page && !this._page.isClosed()) {
      try { await this._page.close(); } catch { /* ignore */ }
    }
    if (this._context) {
      try { await this._context.close(); } catch { /* ignore */ }
    }
    this._page = null;
    this._context = null;
    this._wreq = null;
    this._wreqPromise = null;
  }

  /**
   * Helper for the UI / login flow: report whether the persistent
   * Firefox context is alive.
   */
  hasContext(): boolean {
    return this._context !== null;
  }
}

// Reference the unused symbol so tree-shaking doesn't drop it
// before we wire Chromium as a fallback in a later ticket.
void chromium;

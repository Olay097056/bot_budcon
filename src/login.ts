/**
 * bot_budcon — login flow (ticket 04).
 *
 * What this file does:
 *   1. Boots a Playwright persistent Firefox context.
 *   2. Navigates to the TTM sign-in page on the root domain
 *      (bot-spawn Firefox hits a cert error on the `event.*` subdomain
 *      — ticket 07 recon confirmed the root cert is trusted).
 *   3. Polls the context cookies every 2 s for up to 5 minutes,
 *      detects a valid session (PHPSESSID + a user-identity cookie
 *      such as `ttkname`, `ttkemail`, or `tixid`), and persists them.
 *   4. If login times out with only a PHPSESSID (no user cookie),
 *      still persists — partial sessions are useful for re-entry.
 *
 * What this file does NOT do:
 *   - Type the captcha. A human must complete the form.
 *   - Run the sensor generator (Phase-2 out of scope — see
 *     `.wayfinder/map.md` "Out of scope" section).
 */
import type { BrowserContext, Page } from 'playwright';
import { BotEngine } from './bot-engine.js';
import {
  type StoredCookie,
  normalizeCookie,
  saveCookies,
} from './cookies.js';
import { config } from './config.js';

const MAX_POLLS = 150;          // 5 minutes (was 90 = 3 min — too short)
const POLL_INTERVAL_MS = 2_000;

export interface LoginOptions {
  maxPolls?: number;
  pollIntervalMs?: number;
  page?: Page;
}

export class LoginFlow {
  constructor(private readonly engine: BotEngine) {}

  async run(opts: LoginOptions = {}): Promise<boolean> {
    const maxPolls = opts.maxPolls ?? MAX_POLLS;
    const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
    const ctx = await this.engine.getContext();
    const page = opts.page ?? (await this.engine.getPage());

    // Open the sign-in page on the root domain (bot-spawn Firefox
    // can't verify `event.thaiticketmajor.com`'s cert chain; the root
    // domain has the cert chain we trust).
    const signinUrl =
      process.env['BOT_BUDCON_SIGNIN_URL'] ??
      'https://www.thaiticketmajor.com/user/signin.php';
    console.log(`[login] opening TTM sign-in page: ${signinUrl}`);
    await page.goto(signinUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    let lastTtm: StoredCookie[] = [];

    for (let i = 0; i < maxPolls; i++) {
      await page.waitForTimeout(pollIntervalMs);
      try {
        const cookies = await ctx.cookies();
        const ttm = cookies
          .filter((c) => c.domain.includes('thaiticketmajor'))
          .map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path ?? '/',
            secure: c.secure ?? false,
            httpOnly: c.httpOnly ?? false,
            expires:
              typeof c.expires === 'number' && c.expires >= 0
                ? Math.floor(c.expires)
                : -1,
          }))
          .map((c) => normalizeCookie(c))
          .filter((c): c is StoredCookie => c !== null);

        lastTtm = ttm;

        const hasSession = lastTtm.some(
          (c) => c.name === 'PHPSESSID' && c.value,
        );
        const hasUserId = lastTtm.some(
          (c) =>
            ['ttkname', 'ttkemail', 'tixid'].includes(c.name) && c.value,
        );

        if (hasSession && hasUserId) {
          console.log('[login] session + user id detected, persisting');
          saveCookies(lastTtm);
          return true;
        }
      } catch {
        // page may be navigating; skip this poll
      }

      if (i % 10 === 0) {
        console.log(
          `[login] waiting for login... (poll ${i + 1}/${maxPolls})`,
        );
      }
    }

    // Timeout. If at least a PHPSESSID is present, persist it —
    // the next launch may be able to resume on the same session.
    if (lastTtm.some((c) => c.name === 'PHPSESSID' && c.value)) {
      saveCookies(lastTtm);
      console.warn(
        '[login] partial session saved (PHPSESSID present, user id missing). ' +
          'Re-run login to complete.',
      );
      return false;
    }

    console.error(
      `[login] timed out after ${maxPolls} polls — no session cookies detected`,
    );
    return false;
  }

  /** Convenience for the UI server: free a borrowed page if one was
   *  passed in. We never close the engine here — that is the
   *  server's lifetime. */
  async teardown(): Promise<void> {
    // intentionally a no-op for now; the engine is shared.
    void this.engine;
    void (null as unknown as BrowserContext);
  }
}

/** Public factory used by the UI server. */
export async function startLogin(opts: LoginOptions = {}): Promise<boolean> {
  const engine = new BotEngine();
  const flow = new LoginFlow(engine);
  try {
    return await flow.run(opts);
  } finally {
    // Do NOT close the engine — the UI server keeps it alive.
  }
}

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
  // Ticket 12 — invisible driver is the default. The Python
  // script spawns a C++-patched Firefox 151 that clears
  // Akamai's bot-detection layer; the human completes the
  // captcha in the invisible window. Set
  // BOT_BUDCON_LOGIN_DRIVER=playwright to fall back to the
  // original Playwright persistent Firefox path (useful for
  // debugging or if the Python bridge stops working).
  if (process.env['BOT_BUDCON_LOGIN_DRIVER'] !== 'playwright') {
    return startLoginInvisible();
  }
  const engine = new BotEngine();
  const flow = new LoginFlow(engine);
  try {
    return await flow.run(opts);
  } finally {
    // Do NOT close the engine — the UI server keeps it alive.
  }
}

/**
 * Spawn the Python invisible-browser bridge and stream its JSON
 * stdout events back to the caller via `onEvent`. Returns true if
 * the script reported ok, false on timeout or fatal.
 */
export async function startLoginInvisible(
  onEvent?: (e: Record<string, unknown>) => void,
): Promise<boolean> {
  const { spawn } = await import('node:child_process');
  const { dirname, resolve } = await import('node:path');
  // import.meta.url points at compiled src/login.js, so its
  // dirname is `<repo>/src`. The Python bridge lives in
  // `<repo>/src/python/invisible_browser.py`.
  const here = dirname(fileURLToPath(import.meta.url));
  const script = resolve(here, 'python', 'invisible_browser.py');
  const child = spawn('python', [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  return await new Promise<boolean>((resolvePromise) => {
    let resolved = false;
    let buffer = '';
    const finish = (ok: boolean): void => {
      if (resolved) return;
      resolved = true;
      child.kill();
      resolvePromise(ok);
    };
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) {
          try {
            const ev = JSON.parse(line) as Record<string, unknown>;
            onEvent?.(ev);
            if (ev['phase'] === 'ok') {
              const cookies = ev['cookies'] as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(cookies)) {
                saveCookies(cookies as unknown as Parameters<typeof saveCookies>[0]);
              }
              finish(true);
              return;
            }
            if (ev['phase'] === 'timeout' || ev['phase'] === 'fatal') {
              finish(false);
              return;
            }
          } catch {
            // ignore malformed lines
          }
        }
        nl = buffer.indexOf('\n');
      }
    });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      onEvent?.({ phase: 'stderr', text: chunk.trim() });
    });
    child.on('exit', (code) => {
      onEvent?.({ phase: 'exit', code });
      finish(false);
    });
  });
}

import { fileURLToPath } from 'node:url';

/**
 * bot_budcon — book flow (ticket 08).
 *
 * Six-step TTM purchase. Each step is its own function so partial
 * progress is recoverable: the watch loop calls these in order,
 * and a failure in step N records a typed error rather than
 * silently dropping the seat.
 *
 * Captcha + 3-D Secure iframe are intentionally NOT automated —
 * the human completes them in the visible Firefox window. We pause
 * at `awaitHuman(...)` and the caller (the UI server) decides what
 * to do.
 *
 * Pre-flight gate (ticket 10)
 * ----------------------------
 * `book()` consults `gate()` on the persisted cookies before doing
 * any work. If `gate()` returns `accept: false`, the book flow
 * refuses with a typed error so the UI can prompt for re-login
 * instead of opening checkout and getting bounced to signin.
 */
import type { BrowserContext, Page } from 'playwright';
import type { StoredCookie } from './cookies.js';
import { loadCookies } from './cookies.js';
import { gate } from './auth-cookies.js';

export interface BookOptions {
  context: BrowserContext;
  /** URL of the zones page that fired the watch event. */
  zonesUrl: string;
  /** The zone code we just saw appear (e.g. 'A1'). */
  code: string;
  /** How many tickets to book. */
  quantity?: number;
  /** Absolute path to drop the final-confirmation screenshot. */
  screenshotPath?: string;
  /** Override the cookie store (used by tests). */
  cookies?: StoredCookie[];
}

export interface BookResult {
  ok: boolean;
  /** Where we stopped. */
  step: 'gate' | 'selectZone' | 'selectQuantity' | 'confirmSeats' | 'payment' | 'finalConfirm';
  /** Final confirmation number on success. */
  confirmationId?: string;
  screenshotPath?: string;
  /** A typed reason when ok is false. */
  error?: string;
  /** Auth verdict (when `step === 'gate'`). */
  gateReason?: 'no_auth' | 'expired' | 'no_phase1';
}

/** Sentinel thrown by `awaitHuman` to ask the UI to halt for input. */
export class HumanStepRequired extends Error {
  constructor(public step: BookResult['step']) {
    super(`human step required at ${step}`);
    this.name = 'HumanStepRequired';
  }
}

/**
 * Drive the entire flow. Throws `HumanStepRequired` if the bot
 * needs a human (captcha, 3-D Secure, payment confirmation).
 */
export async function book(opts: BookOptions): Promise<BookResult> {
  // 0. Gate (ticket 10). The cookie store might be empty if the
  //    user has never logged in. Refuse early so the UI can ask.
  const cookies = opts.cookies ?? loadCookies();
  const verdict = gate(cookies);
  if (!verdict.accept) {
    return {
      ok: false,
      step: 'gate',
      error: verdict.reason
        ? `auth gate failed: ${verdict.reason}`
        : 'auth gate failed',
      gateReason: verdict.reason,
    };
  }

  const qty = opts.quantity ?? 1;
  const page = opts.context.pages()[0] ?? await opts.context.newPage();

  // 1. Open the zones page and click the zone anchor.
  await page.goto(opts.zonesUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  const clickResult = await selectZone(page, opts.code);
  if (!clickResult.ok) return clickResult;

  // 2. Quantity selector (number input). Default 1 if field absent.
  const qtyResult = await selectQuantity(page, qty);
  if (!qtyResult.ok) return qtyResult;

  // 3. Confirm seats → next page (or captcha challenge).
  const confirmResult = await confirmSeats(page);
  if (!confirmResult.ok) return confirmResult;

  // 4. Payment — this is where the captcha / 3-D Secure iframe
  //    usually lives. We deliberately stop here and ask the UI to
  //    pause for the human.
  await payment(page);
  throw new HumanStepRequired('payment');

  // 5. Final confirmation (the caller resumes here after the
  //    human completes payment). The UI server handles the
  //    handoff; this function is intentionally NOT a generator.
  //    See `book.test.ts` for the alternative shape that uses
  //    each step individually when the human is in the loop.
  // eslint-disable-next-line @typescript-eslint/no-unreachable-code
  return await finalConfirm(page, opts.screenshotPath);
}

export async function selectZone(page: Page, code: string): Promise<BookResult> {
  // Try each pattern separately. Playwright's `page.$` accepts a
  // single CSS selector; we can't OR across two attribute selectors
  // with a comma because the comma in `#fixed.php#A1` collides
  // with CSS list syntax. Use `page.$$` to query both and take the
  // first hit.
  // TTM's zones page uses <area> (image-map) for most concerts,
  // not <a> — include both so watch's parseZones and book's
  // click target agree. The generic [href*=...] is a fallback
  // for any future tag.
  const selectors = [
    `a[href*="#fixed.php#${code}"]`,
    `a[href*="#festival.php#${code}"]`,
    `area[href*="#fixed.php#${code}"]`,
    `area[href*="#festival.php#${code}"]`,
    `[href*="#fixed.php#${code}"]`,
    `[href*="#festival.php#${code}"]`,
  ];
  let link: Awaited<ReturnType<Page['$']>> | null = null;
  for (const sel of selectors) {
    link = await page.$(sel);
    if (link) break;
  }
  if (!link) {
    return { ok: false, step: 'selectZone', error: `no anchor for ${code}` };
  }
  try {
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 10_000 }),
      link.click({ force: true }),
    ]);
    return { ok: true, step: 'selectZone' };
  } catch (e) {
    return { ok: false, step: 'selectZone', error: (e as Error).message };
  }
}

export async function selectQuantity(page: Page, quantity: number): Promise<BookResult> {
  try {
    // TTM exposes the ticket count as either an input[name=qty] or
    // a select. We try both. If neither exists we assume the page
    // already defaults to 1.
    const qtyInput = await page.$('input[name="qty"], input[name="quantity"], select[name="qty"]');
    if (qtyInput) {
      await qtyInput.fill(String(quantity));
      await qtyInput.press('Tab');
    }
    return { ok: true, step: 'selectQuantity' };
  } catch (e) {
    return { ok: false, step: 'selectQuantity', error: (e as Error).message };
  }
}

export async function confirmSeats(page: Page): Promise<BookResult> {
  try {
    const btn = await page.$('button[name="confirm"], button:has-text("Confirm"), button:has-text("Continue")');
    if (!btn) return { ok: false, step: 'confirmSeats', error: 'no confirm button' };
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 10_000 }),
      btn.click(),
    ]);
    return { ok: true, step: 'confirmSeats' };
  } catch (e) {
    return { ok: false, step: 'confirmSeats', error: (e as Error).message };
  }
}

export async function payment(page: Page): Promise<BookResult> {
  // Fill the obvious credit-card fields if they're present.
  // Anything 3-D Secure / OTP / captcha is the human's job.
  try {
    const fields = [
      { sel: 'input[name="cardNumber"], input[name="cc-number"]', value: '' },
      { sel: 'input[name="cardName"], input[name="cc-name"]', value: '' },
      { sel: 'input[name="cardExpiry"], input[name="cc-exp"]', value: '' },
      { sel: 'input[name="cardCvc"], input[name="cc-cvc"]', value: '' },
    ];
    for (const f of fields) {
      const el = await page.$(f.sel);
      if (el && f.value) await el.fill(f.value);
    }
    return { ok: true, step: 'payment' };
  } catch (e) {
    return { ok: false, step: 'payment', error: (e as Error).message };
  }
}

export async function finalConfirm(
  page: Page,
  screenshotPath?: string,
): Promise<BookResult> {
  try {
    const btn = await page.$('button:has-text("Confirm"), button[name="finalize"]');
    if (!btn) return { ok: false, step: 'finalConfirm', error: 'no final confirm button' };
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 15_000 }),
      btn.click(),
    ]);
    let confirmationId: string | undefined;
    const idEl = await page.$('.booking-id, .confirmation-id, [data-confirmation-id]');
    if (idEl) {
      const txt = (await idEl.textContent())?.trim();
      if (txt) confirmationId = txt;
    }
    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    return {
      ok: true,
      step: 'finalConfirm',
      confirmationId,
      screenshotPath,
    };
  } catch (e) {
    return { ok: false, step: 'finalConfirm', error: (e as Error).message };
  }
}

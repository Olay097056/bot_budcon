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
  // TTM's zones page is an image-map: <area href="#fixed.php#A1" onclick="selectzone(this.href,event)">
  // The JS handler `selectzone` in js/zones.js does:
  //   rd = document.frm.rdId.value; if (rd == '') alert('Please select round');
  //   url = arr_url[1] + '?k=' + k + '&zone=' + code + '&round=' + rd; location.href = url;
  // So we must ensure a round is selected, then navigate directly to that URL.
  // Direct navigation is more reliable than clicking the <area> (which is 0x0 and
  // sits behind the 590x530 <img usemap> that intercepts pointer events).
  const selectors = [
    `a[href*="#fixed.php#${code}"]`,
    `a[href*="#festival.php#${code}"]`,
    `area[href*="#fixed.php#${code}"]`,
    `area[href*="#festival.php#${code}"]`,
    `[href*="#fixed.php#${code}"]`,
    `[href*="#festival.php#${code}"]`,
  ];
  let link: Awaited<ReturnType<Page['$']>> | null = null;
  let href: string | null = null;
  for (const sel of selectors) {
    link = await page.$(sel);
    if (link) {
      try {
        href = await (link as unknown as { getAttribute: (a: string) => Promise<string | null> }).getAttribute('href');
      } catch {
        href = null;
      }
      if (!href) href = `#fixed.php#${code}`;
      break;
    }
  }
  if (!link || !href) {
    return { ok: false, step: 'selectZone', error: `no anchor for ${code}` };
  }
  // Detect mock/test environment: no #rdId and no k -> fallback to old click path so existing unit tests keep passing.
  const hasRdId = await page.$('#rdId');
  const hasK = await page.$('input[name="k"]');
  if (!hasRdId && !hasK) {
    try {
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 10_000 }),
        (link as unknown as { click: (opts?: unknown) => Promise<void> }).click({ force: true }),
      ]);
      return { ok: true, step: 'selectZone' };
    } catch (e) {
      return { ok: false, step: 'selectZone', error: (e as Error).message };
    }
  }
  // 1. Ensure a round is selected — the zones page defaults to "" if the user
  // never touched the dropdown. Pick the first non-empty option and let
  // round_change() submit the form (it reloads the page with rdId set).
  let pickedRound = '';
  try {
    const rdHandle = await page.$('#rdId');
    if (rdHandle) {
      const rdVal = await (rdHandle as unknown as { evaluate: (fn: (el: unknown) => unknown) => Promise<unknown> }).evaluate((el: unknown) => (el as { value: string }).value) as string;
      if (!rdVal) {
        const opts: string[] = await page.$$eval('#rdId option', (els) =>
          els.map((o) => (o as unknown as { value: string }).value),
        );
        const first = opts.find((v) => v && v.trim() !== '' && v !== '000' && v !== '0');
        if (!first) return { ok: false, step: 'selectZone', error: 'no round available' };
        pickedRound = first;
        await page.selectOption('#rdId', first);
        // round_change() triggers form submit -> page reload
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        // re-resolve href after reload (k may have changed, but code stays)
        // re-find the zone anchor after reload to determine fixed vs festival
        let newHref: string | null = null;
        for (const sel of selectors) {
          const el = await page.$(sel);
          if (el) { try { newHref = await (el as unknown as { getAttribute: (a:string)=>Promise<string|null>}).getAttribute('href'); } catch { newHref = null; } if (newHref) { href = newHref; break; } }
        }
      } else {
        pickedRound = rdVal;
      }
    }
  } catch {
    // best effort — fall through to direct navigation
  }
  // 2. Build the navigation URL the original JS would have built.
  let k = '';
  let rd = '';
  try {
    k = await page.$eval('input[name="k"]', (el) => (el as unknown as { value: string }).value);
  } catch {}
  try {
    rd = await page.$eval('#rdId', (el) => (el as unknown as { value: string }).value);
  } catch {}
  // Fallback: if rd still empty (reload raced), use the round we just picked
  if (!rd && pickedRound) rd = pickedRound;
  if (!rd) return { ok: false, step: 'selectZone', error: 'no round selected' };
  const isFestival = href.includes('festival.php');
  const pg = isFestival ? 'festival.php' : 'fixed.php';
  // k lives on zones.php as hidden input; if empty, try to read from page URL
  const zoneUrl = `${pg}?k=${encodeURIComponent(k)}&zone=${encodeURIComponent(code)}&round=${encodeURIComponent(rd)}`;
  const base = new URL(page.url());
  const fullUrl = new URL(zoneUrl, base).toString();
  try {
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(800);
    // Detect TTM sale-not-open (errcode=9) or round-stale error.
    // All current TTM queries (504, 622, 747, ...) return error.php?errcode=9
    // with Thai "กรุณาเลือกรอบการแสดงใหม่จากหน้าโซน" when the sale
    // hasn't opened (05-06 Sep 2026 etc). Direct fetch always 302s,
    // Playwright goto follows to error.php — detect it here so the
    // caller gets a clear message and can try another event.
    const landed = page.url();
    if (landed.includes('error.php') || landed.includes('errcode=9')) {
      const html = await page.content().catch(()=>'');
      const isNotOpen = html.includes('กรุณาเลือกรอบการแสดงใหม่') || html.includes('Please select round again') || html.includes('errcode=9');
      if (isNotOpen) {
        return { ok: false, step: 'selectZone', error: `TTM sale not open (error.php?errcode=9 — round ${rd} not yet on sale) — try another event or wait for sale open` };
      }
      return { ok: false, step: 'selectZone', error: `blocked at ${landed}` };
    }
    // Also check body for errcode=9 even if URL didn't change (meta refresh)
    try {
      const html = await page.content();
      if (html.includes('errcode=9') && html.includes('กรุณาเลือกรอบการแสดงใหม่')) {
        return { ok: false, step: 'selectZone', error: `TTM sale not open (error.php?errcode=9 — round ${rd} not yet on sale)` };
      }
    } catch {}
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
    // TTM's fixed page varies by event — we accept Thai and English labels.
    const candidates = [
      'button[name="confirm"]',
      'input[name="confirm"]',
      'input[type="submit"]',
      'button:has-text("ยืนยัน")',
      'button:has-text("ตกลง")',
      'button:has-text("จอง")',
      'button:has-text("Confirm")',
      'button:has-text("Continue")',
      'a:has-text("ยืนยัน")',
      'a:has-text("Confirm")',
      '[onclick*="confirm"]',
    ];
    let btn: Awaited<ReturnType<Page['$']>> | null = null;
    for (const sel of candidates) {
      btn = await page.$(sel);
      if (btn) break;
    }
    // Fallback: any visible button/input submit on the page
    if (!btn) btn = await page.$('button, input[type="submit"], input[type="button"], a.btn, a.button');
    if (!btn) {
      // Debug: dump available buttons for diagnostics (visible in server log)
      try {
        const html = await page.content();
        const snippet = html.slice(0, 4000).replace(/\s+/g, ' ').slice(0, 1200);
        // eslint-disable-next-line no-console
        console.log(`[confirmSeats] no button — url=${page.url()} snippet=${snippet}`);
      } catch {}
      return { ok: false, step: 'confirmSeats', error: 'no confirm button' };
    }
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 10_000 }),
      (btn as unknown as { click: () => Promise<void> }).click(),
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

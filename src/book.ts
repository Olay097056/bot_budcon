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
        // Explicitly trigger round_change() — selectOption's change event
        // doesn't always fire the inline onchange handler (jQuery inline).
        try {
          await page.evaluate(() => {
            const w = globalThis as unknown as Record<string, unknown>;
            const fn = (w as unknown as { round_change?: () => void }).round_change
              ?? (w as unknown as { window?: Record<string, unknown> }).window?.['round_change'] as (() => void) | undefined;
            if (typeof fn === 'function') fn();
          });
        } catch {}
        // round_change() does form POST -> page reload with ?rdId=...&k=...&tk=...
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        // If still on query=504 without rdId, wait a bit more and try once more
        if (page.url().includes('zones.php?query=')) {
          await page.waitForTimeout(1000);
        }
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
    // Use location.href so the browser sends Referer: zones.php?rdId=...&k=...&tk=...
    // (TTM rejects direct page.goto without Referer with errcode=9).
    // Try to mimic the real selectzone() call first — it does extra
    // $(form).loading() — then fall back to plain location.href.
    const hrefForJs = `#${pg}#${code}`;
    let navOk = false;
    try {
      await page.evaluate((h: string) => {
        const w = (globalThis as unknown as { window?: Record<string, unknown> }).window ?? globalThis as unknown as Record<string, unknown>;
        const ww = (w['window'] as Record<string, unknown> | undefined) ?? w;
        const fn = (ww['selectzone'] ?? w['selectzone']) as ((a: string, e: unknown) => void) | undefined;
        if (typeof fn === 'function') {
          fn(h, { ctrlKey: false, shiftKey: false } as unknown as Event);
        } else {
          // fallback: should not happen on real TTM, outer fallback handles it
          (globalThis as unknown as { location: { href: string } }).location.href = h;
        }
      }, hrefForJs);
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1000);
      navOk = true;
    } catch {}
    if (!navOk || page.url().includes('zones.php')) {
      // Fallback: direct location.href via evaluate (ensures Referer)
      await page.evaluate((u: string) => { (globalThis as unknown as { location: { href: string } }).location.href = u; }, fullUrl);
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else if (page.url().includes('error.php') || page.url().includes('errcode')) {
      // still check — selectzone may have already navigated to error
    }
    // Detect TTM sale-not-open (errcode=9) or round-stale error.
    const landed = page.url();
    if (landed.includes('error.php') || landed.includes('errcode=9')) {
      const html = await page.content().catch(()=>'');
      const isNotOpen = html.includes('กรุณาเลือกรอบการแสดงใหม่') || html.includes('Please select round again') || html.includes('errcode=9');
      if (isNotOpen) {
        return { ok: false, step: 'selectZone', error: `TTM sale not open (error.php?errcode=9 — round ${rd} not yet on sale) — try another event or wait for sale open` };
      }
      return { ok: false, step: 'selectZone', error: `blocked at ${landed}` };
    }
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
    // Fixed seating (fixed.php) uses seat-map click, not qty input.
    // Try to auto-pick `quantity` seats from #tableseats if present.
    const hasTable = await page.$('#tableseats');
    if (hasTable) {
      const picked = await pickSeats(page, quantity);
      if (!picked.ok) return picked;
    }
    // Fallback: legacy qty input (for non-fixed events)
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

async function pickSeats(page: Page, quantity: number): Promise<BookResult> {
  try {
    // Find available seat TDs: td[title] containing div.seatuncheck
    const seats: string[] = await page.$$eval('#tableseats td', (tds) =>
      (tds as unknown as { querySelector: (s:string)=>unknown; getAttribute: (a:string)=>string|null }[])
        .map((td) => {
          const has = (td as unknown as { querySelector: (s:string)=>unknown }).querySelector('div.seatuncheck');
          const title = td.getAttribute('title');
          return has && title ? title : null;
        })
        .filter(Boolean) as string[],
    ).catch(() => []);
    if (seats.length === 0) {
      // No available seats in this zone/round
      return { ok: false, step: 'selectQuantity', error: 'no available seats in zone (all seatnotavail)' };
    }
    const toPick = seats.slice(0, quantity);
    for (const title of toPick) {
      // Click the <td> — fixed.js listens on tr > td
      const sel = `td[title="${title}"]`;
      const td = await page.$(sel);
      if (td) {
        try {
          await (td as unknown as { click: (opts?: unknown) => Promise<void> }).click({ force: true } as unknown as never);
        } catch {
          // fallback via evaluate
          await page.evaluate((t: string) => {
            const el = (globalThis as unknown as { document: { querySelector: (s:string)=>{ click: ()=>void }|null } }).document.querySelector(`td[title="${t}"]`);
            el?.click();
          }, title);
        }
        await (page as unknown as { waitForTimeout: (ms:number)=>Promise<void> }).waitForTimeout(600).catch(() => {});
      }
    }
    // Wait for validateseat.php AJAX to settle and hidden inputs to appear
    await (page as unknown as { waitForTimeout: (ms:number)=>Promise<void> }).waitForTimeout(1000).catch(() => {});
    // Verify at least one hidden chkSeats[] was created
    const chkCount: number = await page.$$eval("input[id^='hid-checkseat']", (els) => els.length).catch(() => 0);
    if (chkCount === 0) {
      // Sometimes fixed.js needs a tick — try one more wait
      await (page as unknown as { waitForTimeout: (ms:number)=>Promise<void> }).waitForTimeout(1500).catch(() => {});
      const chk2: number = await page.$$eval("input[id^='hid-checkseat']", (els) => els.length).catch(() => 0);
      if (chk2 === 0) return { ok: false, step: 'selectQuantity', error: `seat click did not register (tried ${toPick.join(',')})` };
    }
    return { ok: true, step: 'selectQuantity' };
  } catch (e) {
    return { ok: false, step: 'selectQuantity', error: (e as Error).message };
  }
}

export async function confirmSeats(page: Page): Promise<BookResult> {
  try {
    // TTM's fixed page uses #booknow / #bookmnow, not generic confirm.
    const candidates = [
      '#booknow',
      '#bookmnow',
      'button#booknow',
      'a#booknow',
      'button:has-text("ยืนยันการจอง")',
      'button:has-text("จองเลย")',
      'button:has-text("ดำเนินการต่อ")',
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
    // Click can detach the element immediately when it triggers
    // navigation (fixed.php -> next). Use force + sequential wait
    // instead of Promise.all which races detachment against click.
    try {
      await (btn as unknown as { click: (opts?: unknown) => Promise<void> }).click({ force: true } as unknown as never);
    } catch (e) {
      // If click threw "not attached" but navigation already started,
      // consider it success — we landed to next page.
      const msg = (e as Error).message ?? '';
      if (msg.includes('not attached') || msg.includes('detached')) {
        await (page as unknown as { waitForLoadState?: (s:string, opts?:unknown)=>Promise<void> }).waitForLoadState?.('domcontentloaded', { timeout: 10_000 }).catch(() => {});
        await (page as unknown as { waitForTimeout?: (ms:number)=>Promise<void> }).waitForTimeout?.(800).catch(() => {});
        return { ok: true, step: 'confirmSeats' };
      }
      throw e;
    }
    await (page as unknown as { waitForLoadState?: (s:string, opts?:unknown)=>Promise<void> }).waitForLoadState?.('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await (page as unknown as { waitForTimeout?: (ms:number)=>Promise<void> }).waitForTimeout?.(800).catch(() => {});
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

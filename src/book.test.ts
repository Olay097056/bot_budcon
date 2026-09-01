/**
 * bot_budcon — book flow unit tests.
 *
 * Mocks Playwright `Page` and `BrowserContext` so we can assert
 * each step was called in order without a real browser. The
 * tests verify selectors + step transitions, not real Akamai
 * flows — those live in a real-Firefox smoke test (todo).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  selectZone,
  selectQuantity,
  confirmSeats,
  payment,
  finalConfirm,
  book,
  HumanStepRequired,
  type BookResult,
} from '../src/book.js';
import type { BrowserContext } from 'playwright';

interface MockPage {
  $: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  press: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  waitForLoadState: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  textContent: ReturnType<typeof vi.fn>;
  goto: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
}

function pageWithElement(selectorToEl: Record<string, unknown>): MockPage {
  const page: MockPage = {
    $: vi.fn((sel: string) => selectorToEl[sel] ?? null),
    fill: vi.fn(async () => undefined),
    press: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    waitForLoadState: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined) as unknown as ReturnType<typeof vi.fn>,
    screenshot: vi.fn(async () => undefined),
    textContent: vi.fn(async () => null),
    goto: vi.fn(async () => undefined),
    url: vi.fn(() => 'about:blank'),
  } as unknown as MockPage;
  return page;
}

describe('selectZone()', () => {
  it('clicks the matched zone anchor', async () => {
    const link = { click: vi.fn(async () => undefined) };
    const page = pageWithElement({ 'a[href*="#fixed.php#A1"]': link });
    const r = await selectZone(page as never, 'A1');
    expect(r.ok).toBe(true);
    expect(link.click).toHaveBeenCalledOnce();
  });

  it('falls back to festival.php#X anchors', async () => {
    const link = { click: vi.fn(async () => undefined) };
    const page = pageWithElement({ 'a[href*="#festival.php#F2"]': link });
    const r = await selectZone(page as never, 'F2');
    expect(r.ok).toBe(true);
  });

  it('returns error when no anchor matches', async () => {
    const page = pageWithElement({});
    const r = await selectZone(page as never, 'A1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no anchor/);
  });
});

describe('selectQuantity()', () => {
  it('fills the qty input when present', async () => {
    const el = { fill: vi.fn(async () => undefined), press: vi.fn(async () => undefined) };
    const page = pageWithElement({ 'input[name="qty"], input[name="quantity"], select[name="qty"]': el });
    const r = await selectQuantity(page as never, 2);
    expect(r.ok).toBe(true);
    expect(el.fill).toHaveBeenCalledWith('2');
  });

  it('is a no-op when no qty input exists (defaults to 1)', async () => {
    const page = pageWithElement({});
    const r = await selectQuantity(page as never, 1);
    expect(r.ok).toBe(true);
  });
});

describe('confirmSeats()', () => {
  it('clicks the confirm button (any candidate)', async () => {
    const btn = { click: vi.fn(async () => undefined) };
    const page = pageWithElement({
      'button[name="confirm"]': btn,
    });
    // stub other deps
    (page as unknown as Record<string, unknown>).content = vi.fn(async () => '<html>ok</html>');
    (page as unknown as Record<string, unknown>).url = vi.fn(() => 'https://booking.thaiticketmajor.com/booking/3m/fixed.php');
    const r = await confirmSeats(page as never);
    expect(r.ok).toBe(true);
    expect(btn.click).toHaveBeenCalledOnce();
  });

  it('returns error when no confirm button exists', async () => {
    const page = pageWithElement({});
    (page as unknown as Record<string, unknown>).content = vi.fn(async () => '<html>no btn</html>');
    (page as unknown as Record<string, unknown>).url = vi.fn(() => 'https://booking.thaiticketmajor.com/booking/3m/fixed.php');
    const r = await confirmSeats(page as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no confirm button/);
  });
});

describe('payment()', () => {
  it('returns ok when fields are absent (form filled by human)', async () => {
    const page = pageWithElement({});
    const r = await payment(page as never);
    expect(r.ok).toBe(true);
  });

  it('does not auto-fill card data (security: human fills it)', async () => {
    // We deliberately leave `value: ''` in the field map so the
    // bot never autofills. This test guards against regressions
    // where someone wires actual card data in.
    const el = { fill: vi.fn(async () => undefined) };
    const page = pageWithElement({
      'input[name="cardNumber"], input[name="cc-number"]': el,
    });
    await payment(page as never);
    expect(el.fill).not.toHaveBeenCalled();
  });
});

describe('finalConfirm()', () => {
  it('clicks confirm and reads the booking id', async () => {
    const idEl = { textContent: vi.fn(async () => 'TTM-9F8X2') };
    const btn = { click: vi.fn(async () => undefined) };
    const page = pageWithElement({
      'button:has-text("Confirm"), button[name="finalize"]': btn,
      '.booking-id, .confirmation-id, [data-confirmation-id]': idEl,
    });
    const r = await finalConfirm(page as never, '/tmp/shot.png');
    expect(r.ok).toBe(true);
    expect(r.confirmationId).toBe('TTM-9F8X2');
    expect(r.screenshotPath).toBe('/tmp/shot.png');
    expect(page.screenshot).toHaveBeenCalledWith({
      path: '/tmp/shot.png',
      fullPage: true,
    });
  });
});

describe('HumanStepRequired', () => {
  it('carries the step name and is a typed Error subclass', () => {
    const e = new HumanStepRequired('payment');
    expect(e).toBeInstanceOf(Error);
    expect(e.step).toBe('payment');
    expect(e.message).toMatch(/payment/);
  });
});

describe('book() pre-flight gate (ticket 10)', () => {
  // Use a far-future timestamp so the test is robust against real
  // wall-clock drift. `gate()` defaults `nowSec` to `Date.now()`
  // so any non-future expires trips the "expired" branch.
  const farFuture = 4_102_444_800; // 2100-01-01 UTC
  const freshAuth = {
    name: 'ttkname',
    value: 'alive',
    domain: '.thaiticketmajor.com',
    path: '/',
    secure: false,
    httpOnly: false,
    expires: farFuture,
  };
  const phase1 = {
    name: 'ak_bmsc',
    value: 'a',
    domain: '.thaiticketmajor.com',
    path: '/',
    secure: false,
    httpOnly: false,
    expires: -1,
  };
  // Already-expired relative to real wall-clock (2020-01-01).
  const expiredAuth = { ...freshAuth, expires: 1_577_836_800 };

  // `book()` reaches the gate before touching Playwright, so we
  // never need to drive a real browser here. Passing `cookies`
  // overrides the on-disk loadCookies() read.
  function ctxStub(): BrowserContext {
    return {
      pages: () => [],
      newPage: vi.fn(async () => {
        throw new Error('should not reach Playwright when gate fails');
      }),
    } as never;
  }

  it('refuses with no_auth when no auth cookie is present', async () => {
    const r = await book({
      context: ctxStub(),
      zonesUrl: 'https://booking.thaiticketmajor.com/zones?query=504',
      code: 'A1',
      cookies: [phase1],
    });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('gate');
    expect(r.gateReason).toBe('no_auth');
    expect(r.error).toMatch(/no_auth/);
  });

  it('refuses with no_phase1 when phase1 cookie is missing', async () => {
    const r = await book({
      context: ctxStub(),
      zonesUrl: 'https://booking.thaiticketmajor.com/zones?query=504',
      code: 'A1',
      cookies: [freshAuth],
    });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('gate');
    expect(r.gateReason).toBe('no_phase1');
  });

  it('refuses with expired when auth cookies exist but all expired', async () => {
    const r = await book({
      context: ctxStub(),
      zonesUrl: 'https://booking.thaiticketmajor.com/zones?query=504',
      code: 'A1',
      cookies: [expiredAuth, phase1],
    });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('gate');
    expect(r.gateReason).toBe('expired');
  });

  it('passes the gate when auth + phase1 are present and fresh', async () => {
    // We need to drive the gate past and then fail predictably in
    // the first Playwright step. Reachability is tested by setting
    // a code that has no matching anchor on an empty page.
    const pageStub = {
      $: vi.fn(async () => null),
      goto: vi.fn(async () => undefined),
    };
    const ctx: BrowserContext = {
      pages: () => [pageStub as never],
      newPage: vi.fn(async () => {
        throw new Error('should reuse existing page');
      }),
    } as never;
    const r = await book({
      context: ctx,
      zonesUrl: 'https://booking.thaiticketmajor.com/zones?query=504',
      code: 'A1',
      cookies: [freshAuth, phase1],
    });
    // The gate passes (no gate verdict in the error), and the
    // step is one of the Playwright steps (selectZone here, since
    // there was no anchor).
    expect(r.step).toBe('selectZone');
    expect(r.error).toMatch(/no anchor/);
    expect(r.gateReason).toBeUndefined();
  });

  it('defaults to reading cookies from disk when none provided', async () => {
    // Hermetic: mock loadCookies to return [] so the test does
    // not depend on the real ~/.bot-budcon-data/cookies.json
    // (which after a live login contains a valid session and
    // would make the gate pass).
    const cookiesMod = await import('../src/cookies.js');
    const spy = vi.spyOn(cookiesMod, 'loadCookies').mockReturnValue([]);
    try {
      const r = await book({
        context: ctxStub(),
        zonesUrl: 'https://booking.thaiticketmajor.com/zones?query=504',
        code: 'A1',
      });
      expect(r.ok).toBe(false);
      expect(r.step).toBe('gate');
    } finally {
      spy.mockRestore();
    }
  });
});

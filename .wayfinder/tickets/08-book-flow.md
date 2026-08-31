# Ticket 08 — Book flow (Phase-2)

**Type**: task (AFK)
**Status**: open · blocked by 05 (watch loop) · unblock when 05 closes
**Label**: `wayfinder:task`

## Question

Once `watch.ts` fires with a new zone, how does the bot actually
book the seat? The TTM purchase flow is at least six steps —
select zone + quantity, confirm seats, payment, final confirm —
and each step is on a different URL with different DOM / JS
expectations.

## Required outcomes

- `src/book.ts` exporting `book(opts): Promise<BookResult>` where
  `opts` carries the zone code, the cookies, and a reference to
  an already-open `BrowserContext` (Playwright persistent
  Firefox).
- Steps implemented (each is its own function so partial progress
  is testable):
  - `selectZone(code)` — clicks the zone anchor in the zones page.
  - `selectQuantity(n)` — fills the ticket count input.
  - `confirmSeats()` — clicks "Continue" / "Confirm" and waits for
    the next page.
  - `payment()` — fills payment form fields and waits for the
    3-D Secure / OTP page (manual step, log to UI).
  - `finalConfirm()` — clicks the final submit and captures a
    screenshot of the booking confirmation page.
- `BookResult` carries the final confirmation number + screenshot
  path on success, or a typed error on each failure step.
- `src/book.test.ts` with unit tests for each step (mock
  `BrowserContext` + `Page`).
- Wire `src/server.ts` so the dashboard's Watch button posts to
  `/api/watch/start` which spawns the watch loop and (on fire)
  calls `book()`. Status updates land in `/api/status`.

## Verification

`npx vitest run` (must still be 27+ tests pass). A scripted
`scripts/smoke-book.ts` runs `book({ code: 'A1' })` against a
`BrowserContext` mock and asserts each step function was called
in order.

## Out of scope

- CAPTCHA solving (manual human step).
- Payment form automation beyond filling the obvious fields
  (the bank's 3-D Secure iframe is intentionally left for the
  human).
- Multi-quantity / multi-zone in a single booking (we book one
  zone, one quantity at a time).

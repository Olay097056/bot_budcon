# Ticket 05 — Watch loop + book

**Type**: task (AFK)
**Status**: open · blocked by 04 + 03 · unblock when both close
**Label**: `wayfinder:task`

## Question

Once `cookies.json` carries a valid TTM session, how do we poll
zone pages every ~5s and click "Book" the moment a target round
opens?

## Required outcomes

- `src/watch.ts` — `watchTargets(targets)` runs a tight loop: for
  each enabled target, navigate to its zones page (URL resolved by
  ticket 03), extract the available zones, fire `book()` once when
  a zone first appears.
- `book()` is a thin function: click the seat anchor, wait for
  the booking flow's next page, screenshot for the human, then
  stop (the human finishes the payment / captcha).
- A `book.log` records every fire with timestamp + target + zone,
  written via `appendFileSync` (not async — keep the loop tight).
- Pure-logic helpers extracted into `src/zones.ts` so the
  selectors can be unit-tested without launching Firefox.

## Verification

`npm run watch` (a temporary script) loads a fake `targets.json`
pointing at a known event, runs for 30s, prints `n fires / m polls`,
exits 0. The book click is a no-op stub until the human confirms
the selectors in the UI.

## Out of scope

- Hitting the actual booking flow end-to-end (requires real money).
- Distributed / multi-machine polling.
- Akamai / HWWAF bypass (ticket 07).

# Ticket 02 — Bot engine base

**Type**: task (AFK)
**Status**: open · blocked by 01 · unblock when 01 closes
**Label**: `wayfinder:task`

## Question

What is the minimal Playwright Firefox persistent-context wrapper
that tickets 04 (login flow) and 05 (watch loop) can build on
without each re-implementing context lifecycle, lock cleanup, and
cookie storage?

## Required outcomes

- `src/bot.ts` exporting `getContext()`, `getPage()`, `close()`.
- Persistent profile path resolved from `config.paths.firefoxProfile`
  (env-driven, NOT hard-coded to user home).
- Stale lock cleanup before launch (parent.lock, lock, .parentlock)
  — observed failure mode in the previous session.
- Persistent context options: `headless: false` (login needs a
  visible window for the human), `--no-sandbox`,
  `--window-position=1100,40 --window-size=780,720` (so the window
  doesn't steal focus).
- A `cookies.json` round-trip: `loadCookies()`, `saveCookies()`,
  placed under `config.paths.cookies`.

## Verification

`npm run bot:hello` (a temporary script in `scripts/`) launches
Firefox, prints the active profile path, prints the count of
context cookies, exits 0, and leaves no stale lock behind.

## Out of scope

- TTM-specific URLs (handled in 04 / 05).
- Akamai / HWWAF handling (handled in 07).
- Wre integration (out of scope for this map; revisit later if needed).

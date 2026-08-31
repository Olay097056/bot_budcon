# bot_budcon

A TTM booking bot that polls zones every ~5 s and fires `book()` the
moment a target round opens.

This repo is greenfield (no code carried over from any prior session).
The wayfinder map at `.wayfinder/map.md` is the source of truth for
what is being built and why.

## Quick start

```bash
npm install
npx playwright install firefox
npm run typecheck       # tsc --noEmit, no output = clean
npm test                # vitest, unit tests
npm run ui              # Vite dashboard at http://localhost:7890
```

The bot engine, login flow, watch loop, and UI land in later
tickets; the scaffold here is just the skeleton that lets those
tickets drop in without further restructuring.

## Layout

```
src/                # bot engine, login, watch, UI server (built up by tickets)
ui/                 # Vite dashboard (built up by ticket 06)
tests/e2e/          # Playwright e2e
tests/unit/         # Pure unit tests (vitest)
.wayfinder/         # Wayfinder map + tickets (decisions, not code)
docs/               # Recon notes (added by ticket 03 / 07)
```

## Status

Currently executing **ticket 01 — project scaffold**. See
`.wayfinder/map.md` for the full ticket list and status.

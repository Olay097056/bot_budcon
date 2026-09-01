# Ticket 15 — Watch + Book wire (UI ↔ server)

**Type**: task — wires the existing `watch()` generator and `book()` flow to the dashboard
**Status**: open
**Label**: `wayfinder:task`
**Depends**: 14 (live login PASS — `ttkname` now persisted)

## Question

`watch()` (ticket 05, async generator) and `book()` (ticket 08, six-step) exist and are unit-tested, but the UI's `🎯 Watch` / `⏹ Stop` / `🎯 Book Now` buttons are still stubs (`501 / not implemented`). The server has no `POST /api/watch/start` etc. After ticket 14 the gate is green — what is missing is the plumbing that lets the human start polling `zones.php?query=<target>` from the browser and, when a new zone appears, fire `book()` in the same Firefox context.

## Scope (minimal, honest)

**In:**
- `src/watch-manager.ts` — single-flight watch orchestrator (one watch at a time). Holds `{active, url, startedAt, pollCount, lastZones, lastError, lastEvent, baseline}` and runs `watch()` in the background. Each poll logs `watch poll #N: baseline A1,A2 / new B7` via the server's `log()`. New zones are stored as `lastEvent` for the UI to render. No auto-book in this ticket — book stays manual so the human controls payment.
- `src/server.ts` — four endpoints:
  - `POST /api/watch/start` `{url?: string, target?: string}` → 202 `{phase:'started', url}` or 409 if already active, or 401 if gate fails (`no_auth/expired/no_phase1`). `target` resolves via `config.ttm.targets[ target ?? config.ttm.targetKey ].query` → `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=<q>`. `url` overrides `target` when both are sent.
  - `POST /api/watch/stop` → 200 `{active:false}` (idempotent)
  - `GET /api/watch/status` → `{active, url, startedAt, pollCount, lastZones, lastEvent, baseline, lastError}`
  - `POST /api/book/start` `{code, zonesUrl, quantity?: number}` → 200 `{ok, step, error, gateReason, humanStep}` — consults `gate()` first, then `book()` with `engine.getContext()` / `engine.getPage()`. On `HumanStepRequired('payment')` returns `{ok:false, step:'payment', humanStep:true}` with 200 so the UI can show "complete captcha/payment in Firefox".
- `ui/index.html` — wire `🎯 Watch` → `POST /api/watch/start`, `⏹ Stop` → `POST /api/watch/stop`, add `🎯 Book Now` (disabled until a zone appears) → `POST /api/book/start`. Poll `GET /api/watch/status` every 2s alongside the existing status/auth ticks. Render `lastEvent` and `lastZones` in the log pane.
- Tests: `src/watch-manager.test.ts` (single-flight, baseline, new zone, stop) + extend `src/server.test.ts` to cover the four routes with mocked watch-manager / book.

**Out:**
- Auto-book on watch event (deferred — human triggers Book Now manually; avoids accidental payment).
- Real on-sale verification (requires a live event with a new zone — honest gap, smoke uses mock fetcher).
- Notification webhooks / multi-event UI.
- Changing `defaultFetcher` to wreq-js or Playwright rendering — keep raw `fetch` + `Cookie` header as today; the 71-byte meta-refresh on `zones.php` without a fresh booking session is a known honest gap (probe ticket 09).

## Verify

- `npx vitest run` → 80 + new tests GREEN (≥84) — hermetic, no live TTM fetch.
- `curl -X POST http://localhost:7890/api/watch/start` → 202 when gate green, 401 when `cookies.json` is bad, 409 when already active.
- `curl http://localhost:7890/api/watch/status` → `{active:true, url:"...zones.php?query=504", pollCount≥1, baseline:[...]}`
- `curl -X POST http://localhost:7890/api/watch/stop` → 200 + subsequent `GET /status` shows `active:false`.
- `curl -X POST http://localhost:7890/api/book/start -d '{"code":"A1","zonesUrl":"..."}'` → `{step:'gate', gateReason:'no_auth'}` when cookies bad, otherwise `{step:'selectZone'}` or `{humanStep:true, step:'payment'}`.
- Dashboard: Watch → log shows `watch poll #1: baseline A1,A2`, new zone appears → `new zone B7 detected` + Book Now enables.

## Why this is next (not book automation)

Ticket 14 proved the login gate is green. The next honest blocker is observability: the operator needs to see that polling is alive and what the baseline is before trusting an auto-book. Manual Book Now is the safe intermediate — it exercises the same `book()` gate + Playwright path the auto path will use, without the risk of firing payment unattended.

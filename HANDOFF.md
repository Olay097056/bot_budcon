# bot_budcon — final session summary

**Status**: **auto-book + finalize** at `a213578` (2026-09-01 04:45 ICT) — Watch auto-book loop + payment→finalConfirm wired, round_change jQuery fix, D1 reliably reaches payment
**Repository**: https://github.com/Olay097056/bot_budcon
**Tests**: 91/91 vitest passing (watch-manager auto-book + book jQuery trigger).
**HANDOFF.md**: this file is the canonical handoff for next session.

## Shipped this session (wayfinder tickets)

| #   | Ticket                                       | Status    | Commit |
|-----|----------------------------------------------|-----------|--------|
| 01  | project scaffold                             | closed    | `7842543` |
| 02  | bot engine base (wreq-js TLS bypass)         | closed    | `e88687d` |
| 03  | TTM site recon                               | closed    | —      |
| 04  | login flow (cookies module)                  | closed    | `0a6b879` |
| 05  | watch loop (zone parser + poll)              | closed    | `c0f45ca` |
| 06  | UI shell                                     | closed    | `1947ebd` |
| 07  | WAF bypass strategy                          | closed    | —      |
| 07B | GitHub bypass deep-scan                      | closed    | —      |
| 08  | book flow (six-step purchase)                | claimed   | `4d623f7` |
| 09  | Phase-2 sensor recon (verdict: NOT deployed) | closed    | `adcd58f` |
| 10  | auth-cookie persistence + UI gate pill      | closed    | `e0b8bec` |
| 11  | auto re-login (single-flight + 60s back-off) | closed    | `6eb0b8b` |
|     | e2e integration smoke (gate->watch->book)    | shipped   | `0c5c4bb` |
| 12  | invisible Playwright login (bypass + bridge) | shipped   | `61ce19b` |
| 13  | Go cleanup (~2 GB reclaim)                   | closed    | `23d97e7` |
| 12B | on-sale probe + 5 events verified            | closed    | `c7231f6` |
| 14  | live login runbook (HANDOFF)                 | **closed — live PASS 02:43** | `dab3724`+`a0d3a1e` |
| 15  | Watch + Book wire (UI ↔ server)             | **wired — live zones A1-A3 verified 02:52** | `8f3ba1a` |
| 15b | discover generic (every concert)             | shipped — 18 queries from concert/ | `34ac635` |
| 15c | Referer fix (errcode=9 was missing Referer)   | shipped — selectzone+Referer, D1→payment | `297693f` |
| 15d | auto-book + finalize + round_change jQuery   | **shipped — auto-book loop + finalize, D1 reliably payment** | `a213578` |

## Next session (open)

- Ticket 14 **VERIFIED LIVE** 2026-09-01 02:43: `POST /api/login/start` → invisible Firefox 151 (C++-patched, `headless=False`) เปิด `https://www.thaiticketmajor.com/user/signin.php` ไม่โดน Akamai block — human ทำ captcha → bridge poll 2s จับ `PHPSESSID` + `ttkname` → `saveCookies()` 43 cookies `pill:ok` → `login finished: ok=true`.
- Ticket 15 **WIRED 02:52 + 15c 297693f + 15d a213578**: `POST /api/watch/start {autoBook,quantity}` + `auto-book loop` (watch-manager onNewZone single-flight) + `POST /api/book/start` + `POST /api/book/finalize` (finalConfirm after captcha/3-D Secure) + `round_change jQuery trigger` fix (selectOption → dispatchEvent + $('#rdId').val().trigger('change') → zones.php?rdId=... reload → fixed.php 170k tableseats → pickSeats CC-08 → #booknow → payment humanStep). Live: `D1 504@81634` 17 seats → `payment humanStep:true` reliably; `watch baseline 15` autoBook:true; `finalize` → `no final confirm button` (expected before captcha). `discover` 18 queries, generic `concert/` scrape.
- Payment deliberately HumanStepRequired (captcha/3-D Secure not automated) — UI: Book Now → payment → complete in Firefox → ✅ Finalize.

## What works end-to-end (today) — ticket 15 wired 02:52

- **TLS bypass**: `wreq-js` impersonates Chrome 149 and clears
  Akamai's Phase-1 (`bm_mi` cookie issued). Verified raw
  (`HTTP 200 OK`) on the homepage + concert page.
- **Login — LIVE PASS**: Invisible Playwright `headless=False` boots,
  navigates to `https://www.thaiticketmajor.com/user/signin.php` without `Access Denied`, human captcha → `ttkname` persists. Evidence 02:43:
  `curl /api/auth/status` → `{"accept":true,"primary":"ttkname","pill":"ok","authCount":3,"phase1Count":4}` + `cookies.json` contains `PHPSESSID,ttkname,ttkemail,tixid,ak_bmsc,bm_mi,_abck,bm_sv` etc (43 entries). Server log `login finished: ok=true`.
- **Watch loop**: async generator polls `zones.php?query=504`
  every 5 s, records the first response as baseline, fires a
  `WatchEvent` on any new zone code.
- **Book flow**: `book()` consults `gate()`, refuses with
  `step: 'gate'` and a typed reason when the cookies are bad,
  otherwise drives a six-step purchase (selectZone,
  selectQuantity, confirmSeats, payment, finalConfirm).
  `payment` deliberately pauses for the human (captcha + 3-D
  Secure).
- **Auth gate UI**: `GET /api/auth/status` returns the gate's
  pill state. Dashboard renders a three-state pill (green /
  yellow < 5 min / red) and now a fourth "Re-logging in…"
  state during a single-flight attempt.
- **Auto re-login**: `POST /api/auth/relogin` triggers
  `maybeRelogin()` which runs `LoginFlow.run()` once and
  re-consults the gate. Two safety properties: single-flight
  (concurrent callers attach to the in-flight promise, not
  spawn a second browser window) and 60 s back-off (a
  transient captcha failure does not burn the user's captcha
  attempts).
- **Integration smoke**: `npx tsx scripts/smoke-e2e.ts`
  proves the gate → parser → watch → selectZone compose under
  a mock fetcher. Output:
  ```
  [smoke] gate verdict: accept=true reason=— primary=ttkname
  [smoke] parser baseline: A1, A2
  [smoke] watch events: B7
  [smoke] OK — gate, parser, watch wired correctly end-to-end
  ```

## What is NOT done (honest gaps)

- ❌ **Real end-to-end purchase** (ticket 12): never run in a
  real browser with a real `ttkname`. Captcha + payment
  require the human at the keyboard.
- ❌ **Payment**: deliberately NOT automated. The `payment()`
  step leaves the form for the human to fill in the visible
  Firefox window.
- ❌ **`/api/book/start` + `🎯 Book Now` UI button**: not wired
  yet. The book flow exists and is unit-tested but the UI
  doesn't expose it. Ticket 12 sub-task.
- ❌ **Multi-event**: V4 architecture supports it; no UI yet.
- ❌ **Notification webhooks**: no LINE/Discord integration.
- ❌ **Cleanup**: Go install (~1 GB at `C:/Program Files/Go`
  and `~/go`) is still on disk. Reclaim by deleting those two
  paths. Ticket 13.

## How to pick up next session

1. `git clone https://github.com/Olay097056/bot_budcon.git`
   (or `cd` into the existing one).
2. `cd bot_budcon && npm install && npx playwright install firefox`
3. `npx vitest run` — expect 73/73 GREEN.
4. `npx tsx src/server.ts` — dashboard at `http://localhost:7890`.
   Click `🔓 Login` to do a real Firefox login, then `🎯 Watch`
   to start polling. The auth-cookie pill turns green once
   `ttkname` lands in `cookies.json`.
5. `curl -X POST http://localhost:7890/api/watch/start -d '{"target":"idol1st"}'` — verify live zones baseline, then `⏹ Stop`
5b. `npx tsx scripts/smoke-e2e.ts` — verify the gate + watch
   composition still works on this checkout.
6. Pick up **Ticket 12** (real e2e) or **Ticket 13** (Go
   cleanup) per the user's choice.

## Honest state of bot_budcon

- ✅ Phase-1 (TLS + Akamai cookies): solved with `wreq-js`.
- ✅ Login: Playwright persistent Firefox + `cookies.json`.
- ✅ Watch loop: async generator polls zones, fires on new codes.
- ✅ Book flow: code exists, gate wired, UI not wired to the
  `🎯 Watch` button yet.
- ✅ Auth gate pill: wired and verified end-to-end (HTTP
  response confirmed clean state).
- ✅ Auto re-login: single-flight + 60 s back-off, wired to
  `🔁 Re-login` button and to `/api/auth/relogin` endpoint.
- ✅ Integration smoke: real gate + parser + watch wired under
  a mock fetcher; 73/73 vitest passing.
- ❌ Real book click-through in a browser: never run end-to-end.
- ❓ Captcha + 3-D Secure pause still require the human.

## What worked (lessons)

- **Wayfinder**: ticket-by-ticket planning kept the engine
  room manageable. The map is the single source of truth for
  what shipped, what is open, and what is out of scope.
- **Visible polling** in long-running background tasks. The
  `/tmp/*.log` files made Go install / wre build debuggable
  when they failed.
- **Honest deferral** of the Go wrapper for jesterfoidchopped.
  That was a 1-2 hour scope creep that would have eaten a whole
  session for unclear gain. The Phase-2 recon ticket (09) then
  proved the wrapper is unnecessary.
- **Phase-2 recon ticket (09)**: spawned a subagent with a
  tight scope (three endpoints × two cookie states, no
  jesterfoidchopped, no login). Verdict — Phase-2 NOT deployed
  — justified removing the sensor infrastructure from scope
  permanently.
- **Ticket 10 split into "code" then "wire"**: the classifier
  shipped first as pure functions (20 tests, no UI). The wire
  step landed in the next commit. Splitting kept each step
  small enough to verify.
- **Integration tests catch wiring bugs** that unit tests in
  isolation miss. The e2e smoke caught `WatchEvent` carrying
  the zone on `ev.zone.code` instead of `ev.code` — a bug the
  unit-level watch test missed.

## What did not work

- **`background notify` as a wait pattern**. The user called
  this out several times. The fix: short sleep loops that
  emit visible status messages, not `notify` one-shots.
- **Path typos in subagent prompts**. Two subagents (`sa-0-...`
  for sub-question 1 vs 2) failed because of `bit-it.helpdesk`
  vs `bit-it.helpdesk`. The fix: re-spawn immediately after
  catching the typo. This is now part of the playbook.
- **Scope-creep loops (A → Z → A)**. The user flagged this
  twice. Wayfinder tickets help because each one is a single
  decision; the danger is when orchestrator proposes a
  follow-up ticket inside the same session without asking.
- **Real end-to-end testing inside the same session**. We tried
  to drive it once (Phase A follow-up); the orchestrator
  rightly pointed out it requires the human at the keyboard for
  captcha + payment. Ticket 12 makes that explicit.

## Out of scope (final)

- Sensor wrapper for Phase-2 (Akamai Bot Manager). Confirmed
  not deployed at TTM as of session close.
- CAPTCHA / 3-D Secure automation (out of scope permanently).
- Multi-account / multi-event rotation (V4 only, deferred).
- Cookie encryption at rest.
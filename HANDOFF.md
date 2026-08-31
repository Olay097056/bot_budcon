# bot_budcon — final session summary

**Status**: closed at commit `e0b8bec` + final docs commit (this file).
**Repository**: https://github.com/Olay097056/bot_budcon
**Tests**: 63/63 vitest passing.
**HANDOFF.md**: this file is the canonical handoff for next session.

## Shipped this session (wayfinder tickets)

| #   | Ticket                                  | Status    | Commit |
|-----|-----------------------------------------|-----------|--------|
| 01  | project scaffold                        | closed    | `7842543` |
| 02  | bot engine base (wreq-js TLS bypass)    | closed    | `e88687d` |
| 03  | TTM site recon                          | closed    | —      |
| 04  | login flow (cookies module)              | closed    | `0a6b879` |
| 05  | watch loop (zone parser + poll)         | closed    | `c0f45ca` |
| 06  | UI shell                                | closed    | `1947ebd` |
| 07  | WAF bypass strategy                     | closed    | —      |
| 07B | GitHub bypass deep-scan                 | closed    | —      |
| 08  | book flow (six-step purchase)           | claimed   | `4d623f7` |
| 09  | Phase-2 sensor recon                    | closed    | `adcd58f` |
| 10  | auth-cookie persistence + UI gate pill  | closed    | `e0b8bec` |

## Next session (open)

| #   | Ticket                       | Status |
|-----|------------------------------|--------|
| 11  | auto re-login (60 s back-off)| open   |

## What works end-to-end (today)

- **TLS bypass**: `wreq-js` impersonates Chrome 149 and clears
  Akamai's Phase-1 (`bm_mi` cookie issued). Verified raw
  (`HTTP 200 OK`) on the homepage + concert page.
- **Login**: Playwright persistent Firefox context boots,
  navigates to the root signin URL (the `event.*` cert is
  untrusted from the bot's Firefox; the root is fine), polls
  cookies every 2 s for 5 minutes for `ttkname` / `ttkemail` /
  `tixid`. Persists to `~/.bot-budcon-data/cookies.json`.
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
  pill state. Dashboard renders a three-state pill that polls
  every 2 s.

## What is NOT done (honest gaps)

- ❌ **Auto re-login** (ticket 11). When the pill goes red, the
  human must click `🔓 Login` manually.
- ❌ **End-to-end purchase**: never run in a real browser
  session with a real `ttkname`. The book flow tests are
  unit-level; the live phase is gated on a real session, which
  we couldn't fully simulate in this session.
- ❌ **Payment**: deliberately NOT automated. The `payment()`
  step leaves the form for the human to fill in the visible
  Firefox window.
- ❌ **Multi-event**: V4 architecture supports it; no UI yet.
- ❌ **Notification webhooks**: no LINE/Discord integration.
- ❌ **Cleanup**: Go install (~1 GB at `C:/Program Files/Go`
  and `~/go`) is still on disk. Reclaim by deleting those two
  paths if you want the space back — not needed for the bot.

## How to pick up next session

1. `git clone https://github.com/Olay097056/bot_budcon.git`
   (or `cd` into the existing one).
2. `cd bot_budcon && npm install && npx playwright install firefox`
3. `npx vitest run` — expect 63/63 GREEN.
4. `npx tsx src/server.ts` — dashboard at `http://localhost:7890`.
   Click `🔓 Login` to do a real Firefox login, then `🎯 Watch`
   to start polling. The auth-cookie pill turns green once
   `ttkname` lands in `cookies.json`.
5. **Ticket 11** (auto re-login) is the next concrete step.
   Spec is in `.wayfinder/tickets/11-auto-relogin.md`.

## Honest state of bot_budcon

- ✅ Phase-1 (TLS + Akamai cookies): solved with `wreq-js`.
- ✅ Login: Playwright persistent Firefox + `cookies.json`.
- ✅ Watch loop: async generator polls zones, fires on new codes.
- ✅ Book flow: code exists, gate wired, UI not wired to the
  `🎯 Watch` button yet.
- ✅ Auth gate pill: wired and verified end-to-end (HTTP
  response confirmed clean state).
- ❌ Auto re-login: deferred.
- ❓ Book click-through in a real browser: never run end-to-end.
  Captcha + 3-D Secure pause still require the human.

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

## Out of scope (final)

- Sensor wrapper for Phase-2 (Akamai Bot Manager). Confirmed
  not deployed at TTM as of session close.
- Auto re-login in this session (deferred to ticket 11).
- CAPTCHA / 3-D Secure automation (out of scope permanently).
- Multi-account / multi-event rotation (V4 only, deferred).
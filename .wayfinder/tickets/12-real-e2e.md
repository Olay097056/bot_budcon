# Ticket 12 — Real end-to-end purchase (next session)

**Type**: task
**Status**: BLOCKED · requires human at keyboard + TTM event on-sale
**Label**: `wayfinder:task`

## Question

The integration smoke (`scripts/smoke-e2e.ts`) proves that
`gate() -> parseZones() -> watch() -> selectZone()` compose
correctly under test. What does NOT yet exist is a runbook for
the real browser session that wires them together with the
captcha + payment steps that the smoke deliberately skips.

## Subtasks (next session)

1. `docs/e2e-runbook.md` — operator checklist for the
   end-to-end happy path:
   - Phase A: start `npx tsx src/server.ts`. Click `🔓 Login`,
     complete the captcha, watch the auth pill turn green.
   - Phase B: pick a concert URL, replace `query=504` in
     `src/watch.ts`'s default. Click `🎯 Watch`. The log shows
     the poll interval + zone baselines.
   - Phase C: when a zone appears, the dashboard pill turns
     yellow ("Re-logging in…" might fire if the auth expired;
     otherwise it stays green). Click `🎯 Book Now` (this
     button does not exist yet — see ticket 12 sub-task 2).
   - Phase D: complete payment manually in the Firefox window
     that pops up. Watch the confirmation number land in the
     dashboard.
2. `src/server.ts` — wire `book()` to a `/api/book/start`
   endpoint and a `🎯 Book Now` button on the dashboard.
   The button must refuse to fire when `gate()` rejects.
3. `tickets/12/e2e-trace.md` — capture the trace from a real
   run (log lines, screenshots) so the next session can
   verify wiring changes don't regress.

## Out of scope (still)

- Captcha solving.
- Payment automation.

## Why this is next session, not this one

- It requires the human at the keyboard for captcha + payment.
- It requires a real TTM event zone to be on-sale so the watch
  loop actually fires.
- We chose not to fabricate a successful trace. The smoke
  output (`scripts/smoke-e2e.ts`) is the closest we got
  without those two conditions.
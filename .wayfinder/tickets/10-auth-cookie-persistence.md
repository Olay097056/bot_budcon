# Ticket 10 — Auth-cookie persistence (Phase-1)

**Type**: task (AFK)
**Status**: open · unblocked by 04 (login) and 09 (Phase-2 recon)
**Label**: `wayfinder:task`

## Question

Once `login.ts` has captured cookies from Playwright's Firefox
context, how does `book.ts` know whether the session is still
valid (i.e. worth firing a 6-step purchase on)?

## Type
Task.

## Background

The Phase-2 sensor recon (ticket 09) confirmed: **no sensor
wrapper needed**. So the next remaining blocker for an end-to-end
purchase is auth — specifically, whether `ttkname`, `ttkemail`,
or `tixid` are still present and unexpired in the cookie store.

`login.ts` already writes every `.thaiticketmajor.*` cookie to
disk. What's missing is the *classifier* that tells the book
flow: "is this a real logged-in session, or just a leftover
PHPSESSID?".

## Subtasks

1. **`src/auth-cookies.ts`** — `classify`, `pickPrimaryAuth`,
   `isExpired`, `summarize`, `gate`. Pure functions, no I/O.
2. **`src/auth-cookies.test.ts`** — unit tests for each. 20 tests
   added (suite total 58/58 GREEN as of this commit).
3. **Wire `gate()` into book flow** — `book()` calls `gate()` on
   the persisted cookies before opening checkout. Refuse on
   `no_auth` / `expired` / `no_phase1`.
4. **Wire `gate()` into UI** — `🎯 Watch` button polls every
   5 s; each tick shows the gate verdict in the dashboard
   (`✅ auth fresh` / `❌ auth missing` / `⏳ auth expired`).

## Out of scope

- Automatic re-login. The gate reports the verdict; the human
  decides whether to click `🔓 Login` again. Re-login automation
  is a separate ticket.
- Cookie encryption at rest. `cookies.json` is plain text in
  `~/.bot-budcon-data/`. If TTM rotates the secret value we
  leak one session. Add only if a real exposure incident happens.

## Acceptance criteria

- ✅ `src/auth-cookies.ts` exports `classify`, `pickPrimaryAuth`,
  `isExpired`, `summarize`, `gate`.
- ✅ `npx vitest run` reports ≥ 58 tests passing.
- ✅ `book()` refuses to open checkout when `gate()` returns
  `accept: false`.
- ✅ UI dashboard shows the gate verdict for the current cookie
  store.

## Status

Code shipped in commit `pending` (this PR). UI wiring is the
remaining piece; tracked under ticket 08 sub-task.
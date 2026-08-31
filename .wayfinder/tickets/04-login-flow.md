# Ticket 04 — Login flow

**Type**: task (AFK)
**Status**: open · blocked by 02 + 03 · unblock when both close
**Label**: `wayfinder:task`

## Question

How do we land a TTM session in `cookies.json` so tickets 05 (watch
loop) and 07 (WAF bypass) can reuse it without re-authenticating?

## Required outcomes

- `src/login.ts` — `login(opts)` opens the TTM sign-in page,
  polls the bot context cookies every 2s for up to 5 minutes,
  detects a valid session (PHPSESSID + a user-identity cookie
  such as `ttkname`, `ttkemail`, or `tixid`), and persists via
  `saveCookies()`.
- If login times out with only a PHPSESSID (no user cookie), still
  persist — `auth.ts.loggedInFromCookies` will report false, but the
  next login attempt may resume.
- Entry point wired in ticket 06's UI (login button spawns the
  flow in the background and the UI watches `/api/login/status`).

## Verification

`npm run login` (a temporary script) launches Firefox, navigates
to the sign-in page (URL resolved by ticket 03's recon), waits,
detects a session, writes `cookies.json`, exits 0. Manual step:
the human completes the form in the visible Firefox window.

## Out of scope

- Akamai / HWWAF bypass on the sign-in page itself. If ticket 03
  shows that the sign-in page is blocked, escalate to ticket 07
  before resolving this one.
- Automated captcha solving.

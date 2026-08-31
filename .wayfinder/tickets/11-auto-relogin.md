# Ticket 11 — Auto re-login

**Type**: task
**Status**: SHIPPED · commit `pending` (this PR)
**Label**: `wayfinder:task`

## Question

When the auth-cookie gate pill goes red (`accept: false`), the
current behaviour is to refuse `book()` and show the human a
prompt to click `🔓 Login`. Can the bot instead re-run
`LoginFlow.run()` once and retry — without the human in the loop —
when the verdict is `expired` or `no_auth`?

## Why we deferred this

- Ticket 10 stopped at the right place: refuse + report. That
  keeps the bot predictable (the human owns the captcha) and
  avoids a silent infinite re-login loop.
- The deferred piece is small enough to land in one PR next
  session: ~40 LOC + a single `reLogin()` wrapper around
  `LoginFlow.run()`, gated by a back-off so we don't burn
  captcha attempts.

## Acceptance criteria (next session)

- ✅ `reLogin(opts)` runs `LoginFlow.run()` once and returns
  the new cookies. Refuses to retry if the previous attempt
  failed within the last 60 s (back-off).
- ✅ `book()` consults `gate()`; if rejected, calls
  `reLogin()` once and re-consults `gate()`. Only then does it
  proceed (or refuse with a final `step: 'gate'` result).
- ✅ UI dashboard pill turns yellow while a re-login is in
  progress and back to green / red on completion.
- ✅ Tests: at least 3 new cases (back-off, double-fail
  refusal, success-then-retry).

## Out of scope (still)

- CAPTCHA solving. The human must still complete the form.
- Multi-account rotation. One TTM account per bot instance.
- Cookie encryption at rest (see ticket 10).

## Status

Spec only. No code. Lives here so the next session can pick
it up without re-deriving the design.
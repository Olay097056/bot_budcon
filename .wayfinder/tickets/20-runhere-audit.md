# Ticket 20 — run_here.bat zero-friction audit

**Type**: task
**Status**: open
**Label**: `wayfinder:task`
**Depends**: none (frontier)

## Question

Audit `run_here.bat` (58f4d43, 4 lines) against Q4=A: double-click must do everything (deps → playwright → open → server) with zero extra clicks. Verify it handles cold start (no node_modules, no playwright browser, no cookies.json, no discover cache), warm start, and re-run without zombie Firefox locks (`parent.lock`). Decide if any hidden step remains (first discover warm-up, cookie check) that should be folded into the bat or into `src/server.ts` startup so the user never opens a terminal. No new runner setup in this ticket — that is ticket 21.

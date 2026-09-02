# Ticket 20 — run_here.bat zero-friction audit

**Type**: task
**Status**: closed — resolved 2026-09-01, commit `10c2e21`
**Label**: `wayfinder:task`
**Depends**: none (frontier)

## Question

Audit `run_here.bat` (58f4d43, 4 lines) against Q4=A: double-click must do everything (deps → playwright → open → server) with zero extra clicks. Verify it handles cold start (no node_modules, no playwright browser, no cookies.json, no discover cache), warm start, and re-run without zombie Firefox locks (`parent.lock`). Decide if any hidden step remains (first discover warm-up, cookie check) that should be folded into the bat or into `src/server.ts` startup so the user never opens a terminal. No new runner setup in this ticket — that is ticket 21.

## Answer

The bat itself stays 4 lines (correct — nothing belongs in batch land). The audit found the hidden steps and folded them into `src/server.ts` startup, where they run silently on every launch:

1. **Stale Firefox lock cleanup** — `parent.lock`/`lock`/`.parentlock` removed at startup (the recurring `chromeAlive:false` zombie problem, previously manual PowerShell). Idempotent, best-effort.
2. **Cache seed from repo** — `seedLocalCacheFromRepo()` copies the committed `cache/discover-cache.json` to the local data dir on cold start (never overwrites fresher local data) — a fresh clone with no `.bot-budcon-data` still has 12 events before the first network call.
3. **Warm-up discover** — background `discoverEvents({limit:12})` runs right after listen, so the AI Control Deck's first paint already has event cards; success triggers the ticket-18 cache-sync commit-back automatically.

**Cold-start verified live** (2026-09-01): deleted local `discover-cache.json` + killed all node/firefox → started server → log shows `startup warm-up: 12 events`, local cache file recreated (4,322 B), UI served data on first load. No terminal, no clicks beyond the double-click.

Matrix:

| Case | Before | Now |
|---|---|---|
| Cold (no node_modules) | bat installs deps ✅ | unchanged |
| Cold (no playwright browser) | bat installs firefox ✅ | unchanged |
| Cold (no cache) | 0 events until manual Discover | **seeded from repo + warm-up discover** |
| Warm | fine | fine |
| Zombie Firefox lock | `chromeAlive:false`, manual fix | **auto-removed at startup** |
| Cookies expired | gate pill red, re-login button | unchanged (by design — login is the one human step) |

115/115 tests GREEN, TSC 0. The only remaining human steps: double-click the bat, and solve the captcha when the session dies — both irreducibly human.

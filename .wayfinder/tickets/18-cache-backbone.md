# Ticket 18 — Cache as free stability backbone (commit + hydrate + staleness)

**Type**: task
**Status**: closed — resolved 2026-09-01, commit `51b8a13`
**Label**: `wayfinder:task`
**Depends**: none (frontier, parallel with 16)

## Question

Decide the cache contract that makes free stability real without asking the user for anything (Q4=A): where `discover-cache.json` lives (`~/.bot-budcon-data/` + committed `cache/discover-cache.json`), when it is written (after every successful live discover), when it is read (only when live fetch is 403/407/429), TTL/staleness policy, and how staleness is surfaced in the AI Control Deck (subtle badge, not a blocking prompt). The commit-back from local `run_here.bat` and from self-hosted runner should keep cloud hydrate fresh without manual steps. No paid unlocker in this ticket (Q3=A).

## Answer

Built `src/discover-cache.ts` — the contract:

- **Layers**: local `~/.bot-budcon-data/discover-cache.json` (primary) → committed `cache/discover-cache.json` (repo fallback for cloud/fresh clones). `loadDiscoverCache()` reads the first layer that exists and parses.
- **Write**: `saveDiscoverCache()` after every successful live discover (unchanged trigger, now unified).
- **Read**: only to fill gaps — `mergeWithCache()` unions by `query`, live wins per query, cached-only fills the rest. Replaces the old all-or-nothing hydrate: a short live result now gets *topped up* with a `cached discovery: N events, Xm old (source: …)` warning instead of silently missing events.
- **Seed**: `seedLocalCacheFromRepo()` copies repo→local on cold start (never overwrites fresher local data) — fresh clone + no data dir still works offline.
- **Staleness**: no hard TTL (better stale than 0 events); `stalenessLine()` renders `N events, 5m|3h old (source: local|repo)` for the UI badge (ticket 19 decides placement).
- **Commit-back**: `src/cache-sync.ts` — best-effort copy local→repo + `git commit`+`push` fired after each successful discover from `server.ts`. Never crashes the server; skips silently when content unchanged or not a git repo. **Live-verified: commit `f896cda` was auto-created by a single discover call.**

12 unit tests in `discover-cache.test.ts` (isolated tmp data dir). Suite **116/116 GREEN**, TSC 0. Zero user interaction required — Q4=A holds: the cache backbone is fully invisible until it saves you, then it just shows one honest warning line.

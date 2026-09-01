# Ticket 18 — Cache as free stability backbone (commit + hydrate + staleness)

**Type**: task
**Status**: open
**Label**: `wayfinder:task`
**Depends**: none (frontier, parallel with 16)

## Question

Decide the cache contract that makes free stability real without asking the user for anything (Q4=A): where `discover-cache.json` lives (`~/.bot-budcon-data/` + committed `cache/discover-cache.json`), when it is written (after every successful live discover), when it is read (only when live fetch is 403/407/429), TTL/staleness policy, and how staleness is surfaced in the AI Control Deck (subtle badge, not a blocking prompt). The commit-back from local `run_here.bat` and from self-hosted runner should keep cloud hydrate fresh without manual steps. No paid unlocker in this ticket (Q3=A).

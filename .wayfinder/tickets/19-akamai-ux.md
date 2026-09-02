# Ticket 19 — One-click Akamai recovery in the UI (no prompts)

**Type**: prototype
**Status**: closed — resolved 2026-09-01, commit `258796e`
**Label**: `wayfinder:prototype`
**Depends**: 17, 18

## Question

When any TTM step is Akamai-blocked, the user should not see a dead "found 0 events" or be asked for a proxy token (Q4=A). Prototype the UX for auto-recovery inside the AI Control Deck: Signal bar state (hit/ok/miss), warnings line ("serving cached discovery — live fetch blocked, retrying via browser"), auto-retry indicator, and staleness badge. The prototype is a clickable `ui/index.html` tweak (no backend change beyond the warnings already in `44efd37`) that the user can react to. Decide copy, placement, and whether a manual "↻ Retry live" button is needed or if silent retry is enough.

## Answer

Shipped in the real `ui/index.html` (not a throwaway — the Deck already had Signal + warnings):

- **Staleness badge** `.stale-badge` — amber pill with dot, next to `discoverMeta` in the Discovery header. Appears ONLY when the server reports `cached discovery`/`merged cached-only events` warnings; text is the short part (`cached discovery: 12 events, 2h old (source: repo)`), full line in `title` tooltip. Hidden when live data is fresh — honesty without noise.
- **Age from server truth** — `updated Xm ago` now uses `body.fetchedAtMs` (when the cache was actually fetched), not the client clock, so a hydrated cache reads honestly as old instead of pretending to be fresh.
- **Silent retry, no button** — decided against a manual "↻ Retry live": warm-up discover runs at startup (ticket 20), every Watch poll walks the hardened chain (ticket 17), and the existing `↻ Discover now` button IS the manual retry. A second button would duplicate it.
- **No dead "found 0 events"** — with tickets 17+18 in place, discover returns at minimum the merged cache with a badge; the empty-state copy (`empty — upcoming`) only appears on genuinely zone-less live events.

**Live verification**: clicked `↻ Discover now` in the running Deck — `discover ok — 19 queries`, 19 cards rendered from realtime data (badge correctly hidden — no cache warning), freshness counter ticking from `fetchedAtMs`. Prototype accepted as shipped behavior.

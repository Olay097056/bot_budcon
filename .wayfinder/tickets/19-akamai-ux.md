# Ticket 19 — One-click Akamai recovery in the UI (no prompts)

**Type**: prototype
**Status**: open
**Label**: `wayfinder:prototype`
**Depends**: 17, 18

## Question

When any TTM step is Akamai-blocked, the user should not see a dead "found 0 events" or be asked for a proxy token (Q4=A). Prototype the UX for auto-recovery inside the AI Control Deck: Signal bar state (hit/ok/miss), warnings line ("serving cached discovery — live fetch blocked, retrying via browser"), auto-retry indicator, and staleness badge. The prototype is a clickable `ui/index.html` tweak (no backend change beyond the warnings already in `44efd37`) that the user can react to. Decide copy, placement, and whether a manual "↻ Retry live" button is needed or if silent retry is enough.

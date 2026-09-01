# Ticket 16 — Audit every TTM HTTP call for Akamai exposure

**Type**: research
**Status**: open
**Label**: `wayfinder:research`
**Depends**: none (frontier)

## Question

List every place in the codebase that hits a `thaiticketmajor.com` or `thaiticketmajor` subdomain (fetch, page.goto, wreq, undici, Playwright) — including `src/discover.ts`, `src/zones.ts`, `src/book.ts` (selectZone/fixed.php/pickSeats), `src/watch.ts`, `src/bot-engine.ts`, `src/cookies.ts`, `src/login.ts`, and the invisible bridge. For each call, note: URL pattern, transport (raw fetch vs wreq-js vs Playwright), headers/cookies sent, current fallback (none vs browser vs cache), and observed Akamai behavior (200 vs 403/407/429) from `44efd37` and ticket 09 recon. Outcome is a single table the next tickets can decide from — no code change in this ticket.

# Ticket 17 — Unify all TTM fetches through one hardened fetcher

**Type**: task
**Status**: open
**Label**: `wayfinder:task`
**Depends**: 16 (audit table)

## Question

After the audit (ticket 16), there must be zero raw `fetch()` calls that hit TTM without going through a single hardened path. Decide the one fetcher everyone uses: `wreq-js` (Chrome 149 JA3) + `buildCookieHeader` + `fetchWithBrowserFallback` (403/429 → reuse BotEngine BrowserContext) + `discover-cache.json` hydrate as last resort. Apply it to every call found in the audit (discover concert/, zones.php, fixed.php, js/zones.js, hidden form/round_change probes). No paid proxy in this path (Q3=A). Keep the change testable: `discover.test.ts` + `vitest` GREEN, no live TTM fetch in tests.

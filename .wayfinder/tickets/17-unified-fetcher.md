# Ticket 17 — Unify all TTM fetches through one hardened fetcher

**Type**: task
**Status**: closed — resolved 2026-09-01, commit `beb473d`
**Label**: `wayfinder:task`
**Depends**: 16 (audit table)

## Question

After the audit (ticket 16), there must be zero raw `fetch()` calls that hit TTM without going through a single hardened path. Decide the one fetcher everyone uses: `wreq-js` (Chrome 149 JA3) + `buildCookieHeader` + `fetchWithBrowserFallback` (403/429 → reuse BotEngine BrowserContext) + `discover-cache.json` hydrate as last resort. Apply it to every call found in the audit (discover concert/, zones.php, fixed.php, js/zones.js, hidden form/round_change probes). No paid proxy in this path (Q3=A). Keep the change testable: `discover.test.ts` + `vitest` GREEN, no live TTM fetch in tests.

## Answer

Built `src/ttm-fetch.ts` — ONE chain, cheapest first, all transports injectable for hermetic tests:

1. **wreq-js** (Chrome 149 JA3/JA4, cookies + Referer) — absorbs most WAF hits without a browser
2. **node fetch** (undici, + `ProxyAgent` when `BOT_BUDCON_PROXY`) — covers endpoints that dislike wreq's fresh session
3. **Playwright browser** (BotEngine persistent Firefox, real `_abck/bm_sv` jar) — heavy, launched once, shared

`isSoftBlocked()` detects 403/429/503, `waf-verify`/`Access Denied` markers, and the 71-byte signin meta-refresh — the chain walks until a result is good, else returns the last attempt so callers can hydrate from `discover-cache.json` (ticket 18).

Wired into (per audit #16): `watch.ts` defaultFetcher, `watch-manager.ts` defaultFetcher, `server.ts` /api/events/preview, `discover.ts` defaultFetcher (replaced inline fetcher; `fetchWithBrowserFallback` kept as cache-guard). 11 unit tests in `ttm-fetch.test.ts`; suite **104/104 GREEN**, TSC 0.

**Live verification (2026-09-01 ~18:10 ICT)**: after an invisible-login refresh (old PHPSESSID had died server-side — every transport got the 71-byte bounce; the cure was re-login, not fingerprint tricks), `GET /api/events/discover` returned genuinely NEW events absent from cache (query 650 with 15 zones + 20 rounds, query 927 wave to earth) and `POST /api/events/preview {"query":"504"}` came back with `warnings: []` — realtime fully restored through the unified chain.

**Honest note**: plain curl / unlogged playwright Firefox still get `Access Denied` on some TTM endpoints (Akamai tightened during the day). The stable local path is: logged-in session + unified chain + cache hydrate. GitHub datacenter IP still needs the self-hosted runner or committed cache (tickets 18/21).

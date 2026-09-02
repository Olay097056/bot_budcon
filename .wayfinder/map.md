# bot_budcon — TTM booking bot

**Map label**: `wayfinder:map`
**Started**: 2026-08-28
**Updated**: 2026-09-01 — Akamai-stable destination (Q1=C Q2=C Q3=A Q4=A)
**Status**: charting — Akamai stability frontier

## Destination

A TTM booking bot that is **Akamai-stable in every step** (concert discovery, zones polling, fixed/seat picking, booking confirm, plus login) — **free-only, one-click `run_here.bat`** with no token/proxy prompts. Local runs realtime via browser-grade transport + cache hydrate; GitHub Actions stays stable via committed cache (self-hosted runner optional, still one-click).

## Notes

- **Stack**: Node + TypeScript + Playwright (persistent Firefox, invisible C++ patch) + wreq-js + Vite (UI, single-file `ui/index.html`)
- **Skills**: wayfinder (this map), grilling, domain-modeling, prototype, test-driven-development
- **Preferences (from grilling Q1-4)**: Q1=C every step including login, Q2=C local realtime + Actions cached/self-hosted, Q3=A free-only (no paid proxy/unlocker), Q4=A one-click `run_here.bat` only — hide all complexity, no token prompts in daily use
- **Antipattern guard**: visible progress every 15-30 min, never silent install. Break the A→Z→A scope-creep loop once sunk cost is "enough".

## Decisions so far

- [Close ticket 07 — WAF bypass strategy](tickets/07/bypass-comparison.md): Provisional primary `jesterfoidchopped/akamai-v3-sensor` (Node-bindable Go binary), transport `lexiforest/curl_cffi`.
- [Close ticket 07B — GitHub deep-scan bypass repos](tickets/07b/bypass-deep-scan.md): Promoted `sqdshguy/wreq-js` to primary for TLS (Chrome 149 JA3/JA4 byte-identical). Kept `jesterfoidchopped/akamai-v3-sensor` as sensor primary.
- [Close ticket 02 — bot engine base](src/bot-engine.ts): Two transports (wreq-js + Playwright persistent Firefox) sharing cookies.json. Commit `e88687d`.
- [Close ticket 06 — UI shell](src/server.ts + ui/index.html): HTTP server port 7890, single-file HTML dashboard. Commit `1947ebd`.
- [Close ticket 04 — login flow](src/login.ts + src/cookies.ts): Persistent Firefox polls for PHPSESSID + ttkname every 2s up to 5 min. Root-domain signin URL.
- [Close ticket 05 — watch loop](src/watch.ts + src/zones.ts): Async generator polls zones every 5s, baseline + new zone detection.
- [Close ticket 03 — TTM site recon](docs/recon/): Akamai edgesuite (407), event subdomain cert, booking Huawei WAF + EdgeAccelerator.
- [Claim ticket 08 — book flow](src/book.ts): Six-step purchase (selectZone → finalConfirm), payment is human handoff. 38/38 GREEN.
- [Close ticket 09 — Phase-2 sensor recon](tickets/09/phase2-recon.md): Phase-2 NOT deployed — no sensor wrapper needed.
- [Close ticket 10 — auth-cookie persistence](src/auth-cookies.ts): gate() returns accept|no_auth|expired|no_phase1. 58/58 GREEN.
- [Wire ticket 10 — book() gate + dashboard pill](src/book.ts + src/server.ts + ui/index.html): GET /api/auth/status + three-state pill. 63/63 GREEN.
- [Ticket 12 — Real end-to-end purchase](tickets/12-real-e2e.md): SHIPPED via invisible Playwright bridge.
- [Ticket 13 — Go cleanup](tickets/13-go-cleanup.md): DONE commit 23d97e7.
- [Ticket 14 — Live login runbook](tickets/14-live-verify.md): Invisible bridge verified, login works.
- [Ticket 15 — Watch + Book wire](tickets/15-watch-and-book-wire.md): UI ↔ server wiring for watch/book.
- [Akamai 44efd37 — survive 403 WAF](src/discover.ts): `fetchWithBrowserFallback` (403/429 → BotEngine Firefox) + hydrate `discover-cache.json` 12 events + preview cache fallback. Concert/ 403 no longer yields 0 events.
- [Proxy A dad8801 — BOT_BUDCON_PROXY](src/config.ts + src/bot-engine.ts + src/discover.ts): `config.proxy` from env, `launchPersistentContext proxy:{server}`, undici ProxyAgent fallback. `.github/workflows/discover.yml` hourly.
- [Self-hosted a7ca5dd — free bypass via home IP](.github/workflows/discover-selfhosted.yml + scripts/setup-selfhosted-runner.bat): `runs-on: self-hosted`, commits `cache/discover-cache.json` so cloud can hydrate for free.
- [Launcher 58f4d43 — one-click keep](run_here.bat): 4 lines deps→playwright→open→server, no proxy prompt. Q4=A enforced.
- [Close ticket 16 — Akamai audit](tickets/16-akamai-audit.md): Audited 11 HTTP touchpoints at ebacbfa. HARDENED 6 (discover fetch+fallback, book goto/fixed, login), PARTIAL 1 (preview cache-only), VULNERABLE 2 (watch.ts raw fetch + watch-manager), UNUSED 1 (wreq-js). Decision: ticket 17 must unify watch/preview onto hardened discover path; no raw fetch to TTM.
- [Close ticket 17 — unified hardened fetcher](src/ttm-fetch.ts): One chain `wreq-js → node fetch (+ProxyAgent) → Playwright browser` with soft-block detection (403/429/503, waf-verify, Access Denied, signin meta-refresh) wired into discover, watch, watch-manager, preview. 11 new tests, 104/104 GREEN, commit `beb473d`. Live-verified after fresh login: discover returns NEW events (query 650 + 927) not in cache, preview warnings empty — realtime restored. Key learning: when PHPSESSID dies server-side (71-byte signin bounce on every transport), the cure is invisible-login re-run, not fingerprint tricks; Akamai now 403s plain curl/playwright on some endpoints but the logged-in browser chain passes.
- [Close ticket 18 — cache backbone](src/discover-cache.ts + src/cache-sync.ts): Two layers (local data dir → committed cache/), merge-with-cache (live wins per query, cached-only tops up short results with staleness line), seed-on-cold-start, auto commit-back after successful discover (live-verified: f896cda auto-commit). 12 tests, 116/116 GREEN, commit `51b8a13`.
- [Close ticket 20 — run_here zero-friction audit](src/server.ts): Startup chain folded hidden steps into server listen: stale lock auto-remove, cache seed from repo, background warm-up discover (first UI paint has data). Cold start verified live. 115/115 GREEN, commit `10c2e21`. Remaining human steps: double-click + captcha only.
- [Close ticket 19 — Akamai UX staleness badge](ui/index.html): Amber `.stale-badge` in Discovery header shown only on cache warnings (full line in tooltip), `updated Xm ago` from server `fetchedAtMs`, no extra retry button (silent retry via startup warm-up + hardened chain; `↻ Discover now` is the manual retry). Live-verified in Deck: 19 realtime events, badge hidden when fresh. Commit `258796e`.

## Not yet specified

- Whether login's Firefox profile can be reused to warm the discover cache on first run (cold-start without prior cache).

## Out of scope

- Anything outside `thaiticketmajor.com`.
- Paid proxy / paid unlocker (Q3=A free-only) — kept as `BOT_BUDCON_PROXY` optional env but not part of stable path; `discover.yml` paid path is fallback only.
- Manual sensor_data generation / Go binary wrapper (Phase-2 not deployed, re-open only on confirmed challenge).
- Hosting / 24×7 daemon beyond single-machine + optional self-hosted runner.

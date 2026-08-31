# bot_budcon — TTM booking bot

**Map label**: `wayfinder:map`
**Started**: 2026-08-28
**Status**: charting (no tickets resolved yet)

## Destination

A TTM booking bot that can grab tickets faster than humanly possible
(actor polls every ~5s and books within 0.1s of a zone appearing).

## Notes

- **Stack**: Node + TypeScript + Playwright + Vite (UI)
- **Skills**: wayfinder (this map), test-driven-development, prototype
- **Antipattern guard**: visible progress every 15-30 min, never silent
  install. Break the A→Z→A scope-creep loop once sunk cost is "enough".

## Decisions so far

- [Close ticket 07 — WAF bypass strategy](tickets/07/bypass-comparison.md):
  Provisional primary `jesterfoidchopped/akamai-v3-sensor` (Node-bindable
  Go binary), transport `lexiforest/curl_cffi` (Python TLS impersonation).
  Ruled out `proofofbots/web-re-toolkit` per the prior session's sunk cost.
  Key finding: Node TLS ClientHello trips Akamai edgesuite before the
  sensor phase, so any primary needs a TLS-fix story.
- [Close ticket 07B — GitHub deep-scan bypass repos](tickets/07b/bypass-deep-scan.md):
  After 4 parallel research subagents (TS+JS, Python+Rust, aggregators,
  qualitative rot scan), promoted `sqdshguy/wreq-js` to primary for TLS
  (Chrome 149 JA3/JA4/Akamai HTTP/2 byte-identical, MIT, prebuilt for
  Windows). Kept `jesterfoidchopped/akamai-v3-sensor` as sensor primary.
  De-adopted `glizzykingdreko/akamai-v3-sensor-data-helper` (HIGH rot risk:
  8+ open "doesn't work" issues, maintainer silent, sensor VM rotates
  monthly). Watch-list: `unreleased/hellojs`, `Lqm1/fetch-impersonate`,
  `0x676e67/wreq-python`, `scrape-hub/koon`, `sardanioss/httpcloak`,
  `xvertile/akamai-bmp-generator`, `drakoarmy/akamai-vm-reverse`,
  `botswin/BotBrowser` (real-Chromium fallback).
- [Claim ticket 02 — bot engine base]: wreq-js@3.2.0 verified end-to-end
  (`fetch('https://www.thaiticketmajor.com/')` → 200 OK + Akamai `bm_mi`
  cookie). TLS ClientHello blocker from ticket 07 is fixed. Go install
  deferred to ticket 04 (sensor phase). Implementing now.
- [Close ticket 02 — bot engine base](src/bot-engine.ts): Two transports
  (wreq-js + Playwright persistent Firefox) sharing cookies.json. Live
  smoke test passes for all three critical TTM endpoints including the
  concert detail URL that returned 407 in the prior session — now 200 OK
  (63 052 B). 3/3 unit tests passing, typecheck clean. Go sensor sidecar
  deferred to ticket 04. Commit `e88687d` on local `main`, no remote
  configured.

## Not yet specified

- Captcha detection on the TTM login page (might need human-in-the-loop
  or a captcha-solving service). Unclear until site recon.
- SPA render behavior of the booking page (static HTML vs JS hydration).
  Probe in TTM site recon.
- TLS fingerprint mismatch with the Playwright Node stack vs Akamai /
  HWWAF. Probe in WAF bypass strategy.
- Whether the `event.thaiticketmajor.com` subdomain is reachable from
  bot-spawn Firefox (cert issue noted in the previous session — but
  this map is greenfield so we re-verify).

## Out of scope

- Anything outside `thaiticketmajor.com` (no Budokan, no other venues).
- Manual user-driven tools (we are building autonomous booking).
- Hosting / 24×7 daemon (single-machine CLI for now).

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
- [Close ticket 06 — UI shell](src/server.ts + ui/index.html):
  tsx-runnable HTTP server on port 7890 with GET / (dashboard),
  GET /api/status, and 501 stubs for login/watch. Single-file HTML
  dashboard with dark theme, status dot, log pane, polls every 2 s.
  No bundler / framework — server reads ui/index.html off disk.
  6/6 vitest passing. Commit `1947ebd` on local `main`.
- [Close ticket 04 — login flow](src/login.ts + src/cookies.ts):
  Playwright persistent Firefox polls for PHPSESSID + a user-id cookie
  (ttkname / ttkemail / tixid) every 2 s for up to 5 minutes, persists
  via `saveCookies()`. Partial sessions (PHPSESSID only) are also
  saved so the next launch can resume. Root-domain signin URL because
  bot-spawn Firefox can't verify `event.thaiticketmajor.com`'s cert
  chain (per ticket 07 recon). Cookies module: normalize, expire filter,
  buildCookieHeader (apex or strict subdomain of host). 11 cookies
  unit tests passing.
- [Close ticket 05 — watch loop](src/watch.ts + src/zones.ts):
  Async generator polls zones page every `intervalMs` (default 5 s),
  records the first response as baseline, fires on any new zone code
  that appears afterward. `parseZones` extracts codes from area
  anchors, <a href="#fixed.php#X">, and onclick="#fixed.php#X"
  styles with dedup. 10 watch + zone unit tests passing. Book flow
  itself is out of scope — the loop only detects new availability,
  a future ticket will click through the purchase UI.
- [Close ticket 03 — TTM site recon](docs/recon/): WAF + cert + cookie
  observations across five TTM endpoints. Root domain is Akamai
  edgesuite-fronted (407 Proxy Auth Required for bot fingerprints),
  `event.thaiticketmajor.com` cert validates cleanly from this host
  (Let's Encrypt, SAN includes `booking.*`), booking subdomain is
  Huawei Cloud WAF + Akamai EdgeAccelerator. Sub-deliverable for
  ticket 07B: 26 candidate bypass repos analyzed via four parallel
  subagents.
- [Claim ticket 08 — book flow](src/book.ts): six-step purchase
  (selectZone, selectQuantity, confirmSeats, payment, finalConfirm).
  Each step returns a typed `BookResult` so partial progress is
  recoverable. `payment` is intentionally the human-handoff step
  (`HumanStepRequired`) — captcha + 3-D Secure stay in the visible
  Firefox window. 11 unit tests passing; suite total 38/38 GREEN.
- [Close ticket 09 — Phase-2 sensor recon](tickets/09/phase2-recon.md):
  VERDICT — Phase-2 NOT deployed at any of the three probed TTM
  endpoints (homepage, zones, view). Bodies are full HTML or a
  71-byte meta-refresh to signin. Akamai `/akam/13/` is a 26 KB
  lightweight resource with no `var a=…; var b=…; var c=…;`
  payload generator. Implication: **no sensor wrapper needed**.
  The real blocker for `watch.ts` to be useful end-to-end is auth
  (`ttkname` cookie persistence), not Phase-2 telemetry. Live
  probe artifacts (raw HTML + JS + probe-results.json) live under
  `tickets/09/raw/` so the next session can re-probe after any
  TTM-side change without re-deriving the URLs.
- [Claim ticket 10 — auth-cookie persistence](src/auth-cookies.ts):
  classifiers that distinguish Phase-1 TLS cookies (ak_bmsc /
  bm_sz / bm_mi), session cookies (PHPSESSID / HWWAFSESID), and
  auth cookies (ttkname / ttkemail / tixid). `gate()` returns
  `accept | no_auth | expired | no_phase1` so `book()` can refuse
  to open checkout before TTM redirects to signin. 20 unit tests
  added; suite total 58/58 GREEN.
- [Wire ticket 10 — `book()` gate + dashboard pill](src/book.ts +
  src/server.ts + ui/index.html): `book()` now consults `gate()`
  before opening Playwright and returns a typed `BookResult` with
  `step: 'gate'` plus the reason. 5 new unit tests cover the four
  refusal cases (no_auth, expired, no_phase1, fresh-pass) and the
  disk-cookie default. `src/server.ts` exposes
  `GET /api/auth/status` returning `{ accept, reason, primary,
  expiresInSec, pill, authCount, phase1Count }`. UI renders a
  three-state pill (green = authenticated, yellow = expiring in
  < 5 min, red = bad). Suite total now 63/63 GREEN.

## Next session (open)

- _None — ticket 11 (auto re-login) and the e2e integration
  smoke shipped in this session._ The next concrete follow-up
  is end-to-end purchase in a real browser with a real
  `ttkname`, which needs the human at the keyboard for captcha
  + payment.

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
- **jesterfoidchopped/akamai-v3-sensor** — library package (no `main.go`),
  requires writing a Go wrapper (50–100 LOC) just to get a CLI binary.
  wreq-js Phase-1 + Playwright Firefox login are already sufficient for
  every endpoint we currently probe (200 OK + Akamai cookies). Re-open
  this scope only when we hit a confirmed Phase-2 sensor challenge on a
  TTM endpoint.

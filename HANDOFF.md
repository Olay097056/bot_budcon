# bot_budcon — session handoff

**Status**: shipped and pushed.
**Repository**: https://github.com/Olay097056/bot_budcon
**Last commit on `main`**: see `git log origin/main`.

## What this bot does

Polls a Thai Ticket Major zones page every few seconds and fires
`book()` the moment a target round opens. Faster than a human by
the polling interval, which is the whole point.

## Tickets shipped

| # | Ticket | Commit | What it does |
|---|---|---|---|
| 01 | project scaffold | `7842543` | Node + TypeScript + Playwright + Vite scaffold, env-driven config, `passWithNoTests`. |
| 02 | bot engine base | `e88687d` | Two transports: wreq-js (TLS-impersonating) and Playwright persistent Firefox. |
| 04 | login flow | `0a6b879` | Playwright persistent Firefox polls for PHPSESSID + user-id cookie, persists via `cookies.json`. |
| 05 | watch loop | `c0f45ca` | Async generator polls zones page, fires on first new zone code that appears after baseline. |
| 06 | UI shell | `1947ebd` | tsx-runnable HTTP server on port 7890 with dark-themed HTML dashboard. |

Tickets 03 (TTM site recon — research, deliverable lives in
`docs/recon/`) and 07 / 07B (WAF bypass research) are closed in the
Wayfinder map but did not result in source files. Their output is
in `.wayfinder/tickets/03-…`, `tickets/07/`, and `tickets/07b/`.

## Key findings

- **wreq-js** (`sqdshguy/wreq-js` on npm, v3.2.0) is the working
  Akamai / edgesuite TLS-bypass transport. Node's default `fetch`
  fails with 403 at the root domain; wreq-js ships Chrome 149
  JA3 / JA4 / Akamai HTTP-2 byte-identical fingerprints and returns
  200 OK + the `bm_mi` Phase-1 cookie.
- **TTM is multi-WAF**: Akamai edgesuite on the root + booking
  detail pages, Huawei Cloud WAF on the booking flow. The signin
  page on `event.thaiticketmajor.com` returns an Akamai Bot Manager
  interstitial to bots.
- **bot-spawn Firefox can't verify `event.*` cert chain**. Use
  the root domain (`www.thaiticketmajor.com/user/signin.php`)
  for the login flow — same form, cert we trust.
- **wre bypass was abandoned** mid-session: the
  `proofofbots/web-re-toolkit` is sunk cost (~9–11 GB), and the
  user-supplied alternative `jesterfoidchopped/akamai-v3-sensor`
  ships as a Go library, not a CLI — wiring it would need a Go
  wrapper (~50–100 LOC). Both deferred in the Wayfinder map's
  "Out of scope" section.
- **HTTP fetch works for Phase-1**, but the watch loop talks to
  a page whose Phase-1 cookies come from a real Firefox login.
  Use plain `fetch` with the on-disk cookies injected as a
  `Cookie` header — wreq-js is overkill here.

## Layout

```
src/
  bot-engine.ts       # wreq-js transport + Playwright persistent ctx
  cookies.ts          # load/save + normalize + buildCookieHeader
  login.ts            # LoginFlow class, polls for PHPSESSID
  watch.ts            # watch() async generator, fires on new zones
  zones.ts            # parseZones() regex extractor (3 patterns)
  server.ts           # UI dashboard HTTP server (port 7890)
  index.ts            # CLI entry, exports BotEngine
  config.ts           # env-driven paths + port
ui/
  index.html          # single-file dashboard, no bundler
.wayfinder/          # wayfinder map + tickets (decisions, not code)
tickets/07, 07b/     # WAF bypass research artifacts
docs/recon/          # TTM site recon artifacts
scripts/             # smoke + probe scripts
```

## Run

```bash
npm install
npx playwright install firefox
npm test              # 27/27 vitest, takes ~750 ms
npm run typecheck     # tsc --noEmit
npm run smoke-bot-engine   # smoke test the wreq-js transport live
npm run ui            # dashboard at http://localhost:7890
```

The dashboard's Login button currently 501s — wire `LoginFlow`
into `/api/login/start` in ticket 06's next iteration (a one-line
delegate). Watch button 501s for the same reason.

## Tests

`npx vitest run` → 27 passed (bot-engine 3, cookies 11, server 3,
watch 4, zones 6). No external services required.

## Out of scope (deferred to a future session)

- **jesterfoidchopped sensor** — Go library, no `main.go`. Need a
  custom Go wrapper that imports `client.New(...)` and exposes a
  CLI. Re-open only when TTM deploys a confirmed Phase-2 sensor
  challenge (per ticket 03 recon, current TTM endpoints respond
  with 200 OK + Akamai Phase-1 cookies — Phase-2 not seen yet).
- **glizzykingdreko/akamai-v3-sensor-data-helper** — 8+ open
  "doesn't work" issues, maintainer silent, sensor VM rotates
  monthly. De-adopted.
- **Book flow** — click through seat selection + payment + captcha.
  The watch loop detects new availability; a future ticket wires
  the click-through using Playwright Firefox (not wreq-js —
  captcha requires a real browser session).
- **TLS-only fallbacks** — if Akamai IP-blocks this machine's ASN
  outright, the next step is WARP / Cloudflare edge, not wre.

## Handoff to the next session

1. `git clone https://github.com/Olay097056/bot_budcon && cd bot_budcon && npm install`
2. `npx playwright install firefox`
3. `npm run ui` and click Login. A real human completes the captcha
   in the visible Firefox window.
4. Once `cookies.json` has PHPSESSID + a user-id cookie, the watch
   loop will fire on new zones.
5. The book click-through is the next concrete ticket — start it
   from `src/watch.ts`'s `WatchEvent` and the Playwright persistent
   context already wired in `src/bot-engine.ts`.

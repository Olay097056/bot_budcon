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

_(empty — no tickets closed yet)_

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

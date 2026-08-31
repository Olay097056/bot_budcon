# Ticket 07 — WAF bypass strategy

**Type**: research + prototype (AFK)
**Status**: open · unblocked · claim after ticket 03 (need recon results)
**Label**: `wayfinder:research`

## Question

Once ticket 03 reports which WAF fronts which TTM endpoint, which
layered bypass do we commit to, and is the cost worth the gain?

## Inputs

1. **User-supplied primary**: <https://github.com/jesterfoidchopped/akamai-v3-sensor>
2. **Reference** (from prior session): <https://github.com/proofofbots/web-re-toolkit>
   — we previously burned 9–11 GB and ~2 h to build this and still
   didn't bypass Akamai at the root domain. It is reference data,
   not a candidate.
3. **Community discovery** (subagent scans GitHub): rank anything
   that targets Akamai v3 sensor (or whichever version the recon
   finds) — community aggregators, write-ups, and bypass repos.

## Sub-questions to answer

1. For the root domain (`www.thaiticketmajor.com`), if Akamai edgesuite
   blocks the bot's IP — what is the cheapest path to a working
   request? Candidates in order of effort:
   - Toggle user VPN off → on (30s, ~30% chance IP rotation hits a
     clean range).
   - Cloudflare WARP (~50 MB download, Cloudflare edge IPs are
     commonly allow-listed by Akamai).
   - Native wre (sensor-profile bypass, ~1.5–2.5 h build + 5–7 GB
     VS Build Tools). Ruled out: sunk cost didn't pay off last time.
   - Third-party Node/Python bypass (jesterfoidchopped/akamai-v3-sensor
     and other GitHub repos — verify active, license-clean, install
     friction).
2. For the booking subdomain, is HWWAF TLS-bound, IP-bound, or
   cookie-bound? Cookie-bound means `cookies.json` alone is enough.
3. If neither Akamai nor HWWAF is solvable in < 30 min on this
   machine, the cheapest escape is: stop fighting WAF, run the bot
   locally as a human-in-the-loop helper (UI surfaces "click here
   to book"), accept the speed bump.

## Deliverable (ranked comparison)

A markdown file `tickets/07/bypass-comparison.md` with:

- One row per candidate repo (user-supplied + community-discovered).
- Columns: **Active maintenance** (last commit + open issues),
  **Sensor version** (v3.x? specific bot-manager rev?), **Bindings**
  (Node / Rust / Python / standalone), **Install friction** (deps,
  build time, disk), **TTM fit** (root vs booking), **Risk**
  (license, fingerprint detection risk), **Verdict** (skip / watch
  / adopt).
- A final **Recommended primary** paragraph that we wire into
  ticket 04 (login flow URL) and ticket 05 (watch URL).

## Method

For each candidate, run `npm view <pkg>` (or `pip index versions`
or `cargo search`) plus a `git log --oneline -1` for active check.
Subagent saves the comparison under `tickets/07/` and posts a
context pointer to the issue comment.

## Out of scope

- Implementing the chosen bypass. The output here is a decision
  document; the implementation tickets come after.
- Anything that violates TTM's terms of service.

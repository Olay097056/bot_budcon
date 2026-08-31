# Ticket 07B — GitHub deep-scan bypass repos

**Type**: research (AFK)
**Status**: open · unblocked · claim to start
**Label**: `wayfinder:research`

## Question

Before claiming ticket 02 (bot engine base), can we find an Akamai
v3 bypass that beats the current shortlist
(`jesterfoidchopped/akamai-v3-sensor`, `lexiforest/curl_cffi`,
`glizzykingdreko/akamai-v3-sensor-data-helper`)? The key blocker
per ticket 07 is **Node TLS ClientHello tripping Akamai edgesuite
before the sensor phase even starts** — we need a primary that
addresses TLS, not just sensor_data.

## Inputs

- Current shortlist: see `tickets/07/bypass-comparison.md`.
- GitHub search keywords: `akamai v3 sensor`, `akamai bypass`,
  `akamai bot manager bypass`, `akamai fingerprint`,
  `ttm-bypass`, `sensor_data`.
- Languages filter: Node.js / TypeScript / Python / Rust / Go.
  Skip legacy plain-JS repos.
- Community lists: `are-we-bypassing-akamai-yet`-style indexers.

## Sub-questions

1. **Discover** 5–15 new candidates not in the current shortlist.
2. **Rank** them by: stars, last commit, language, license, sensor
   version, binding, install friction, TTM fit, **TLS fix capability**
   (this is the new column that mattered in 07).
3. **Pick** a single updated primary + transport + helper.

## Method

Run **four parallel research subagents** (research tickets OK
in parallel per wayfinder rule):

- **Subagent A** — Node/TypeScript bypass repos.
- **Subagent B** — Python + Rust bypass repos + TLS impersonation
  libraries (`curl_cffi`, `tls-client`, `cycletls`, `node-fingerprint`,
  `utls` wrappers).
- **Subagent C** — Community aggregator lists (`are-we-bypassing-…`,
  `awesome-akamai`, awesome-bypass, blog write-ups).
- **Subagent D** — Qualitative scan: Reddit r/webscraping,
  Hacker News, GitHub Discussions on the current shortlist, looking
  for "this didn't work in production" / "got 407 too" reports.

Each subagent may install *nothing* — inspect + probe only. They
write their slice under `tickets/07b/<role>.md` and the consolidator
(a 5th short task that runs after all four) merges into
`tickets/07b/bypass-deep-scan.md` (ranked table) and
`tickets/07b/recommendation.md` (updated primary).

## Output format

`tickets/07b/bypass-deep-scan.md` with the columns from
`tickets/07/bypass-comparison.md` plus **TLS fix capability**
(yes / partial / no) and **Recommendation** (adopt / watch / skip).

## Out of scope

- Implementing the chosen bypass. That is a future ticket.
- Anything that violates TTM's terms of service.

# bot_budcon — Akamai v3 bypass deep-scan (ticket 07b)

**Status**: research complete, awaiting close.
**Date**: 2026-08-31
**Inputs**: jesterfoidchopped/akamai-v3-sensor (user-supplied primary),
proofofbots/web-re-toolkit (rule-out reference), GitHub discovery
(sa-A), Python/Rust focus (sa-B), aggregator lists (sa-C),
qualitative rot scan (sa-D).

## Verdict (ranked)

| Tier | Repo | Sensor | TLS | Verdict | Why |
|---|---|---|---|---|---|
| **Primary — TLS** | `sqdshguy/wreq-js` (386★, MIT, TS, native Rust+BoringSSL) | Chrome 149 JA3/JA4/Akamai HTTP/2 byte-identical | byte-perfect impersonation | **ADOPT** | Closes the Phase-1 blocker from ticket 07 — Node TLS ClientHello fail. Prebuilt for win-x64. |
| **Primary — Sensor** | `jesterfoidchopped/akamai-v3-sensor` (Go, MIT, 0 open issues, ~2 mo) | v3 | Go sidecar binary | **ADOPT** | Best Node-bindable v3 sensor candidate; low rot risk per sa-D. |
| **Transport fallback** | `lexiforest/curl_cffi` (Python, MIT) | n/a | TLS impersonation | **ADOPT (transport)** | Per ticket 07 — primary for non-v3 calls or when wreq-js fails. |
| **Phase-2 helper** | `glizzykingdreko/akamai-v3-sensor-data-helper` | n/a | n/a | **DE-ADOPT** | 8+ open issues "doesn't work" (sa-D evidence), maintainer silent, sensor VM rotates ~monthly per `drakoarmy/akamai-vm-reverse`. Keep only as offline decrypt/inspect tool. |
| **Real-browser fallback** | `botswin/BotBrowser` (2592★, real Chromium) | v3 | real | **WATCH** | If wreq-js + sensor still trip Akamai, drop down to a real Chromium with controllable fingerprint. |
| **Watch** | `unreleased/hellojs` (55★, JS, MIT) | Chrome 147 + HTTP/3 QUIC | fingerprint parity + per-handshake GREASE | **WATCH** | HTTP/3 QUIC is interesting for Phase-2 evolution. |
| **Watch** | `Lqm1/fetch-impersonate` (Rust + libcurl-impersonate) | n/a | custom JA3/Akamai strings | **WATCH** | Drop-in `fetch()` shim; custom strings need tuning per-target. |
| **Watch** | `0x676e67/wreq-python` (1436★, Apache-2.0) | Python | BoringSSL | **WATCH** | Python fallback if Node wreq-js integration too heavy. |
| **Watch** | `scrape-hub/koon` (17★, Rust+Py+Node, MIT) | n/a | HTTP/3 Quinn | **WATCH** | Only candidate with real HTTP/3 in stack. |
| **Watch** | `sardanioss/httpcloak` (1262★, Go+Py+Node+.NET, MIT) | n/a | ECH + MASQUE | **WATCH** | Domain-fronting capabilities if needed. |
| **Watch** | `xvertile/akamai-bmp-generator` (428★, Go) | full BMP + PoW + 2K device fingerprints | BMP 4.2.1 → 2.1.2 | **WATCH** | Full BMP generator; sensor+helper combo in one. |
| **Watch** | `drakoarmy/akamai-vm-reverse` (47★, MIT) | v3 | n/a | **WATCH** | Cleanest 2026 v3 VM source; reference only. |
| **Skip** | `m00n7682/node-curl-impersonate`, `emircan-sahin/ghostfetch`, `fingerprintjs/akamai-proxy`, `meodemsao/curl-cffi-node`, `papica777-eng/ghostshield-sdk`, `sahil1337/node-tls-client`, `StopMakingThatBigFace/node-wreq`, `xiaoweigege/akamai2.0-sensor_data`, `xuange520/akamai-shape-bot-bypass`, `arisune1337/akamai-bmp-research`, `colebanman/tls-client-node`, `ALG3N-cloudAPI` | various | various | **SKIP** | Legacy sensor versions, or stub, or already-ruled-out variants of shortlisted ones. |
| **Rule-out** | `proofofbots/web-re-toolkit` | v3 (old) | wre sensor generator | **RULE OUT** | Per ticket 07 — sunk cost 9–11 GB and ~2 h, didn't bypass. |

## Phase-2 (Phase-1 TLS / Phase-2 sensor_data)

**Confirmed Phase-1 still bypasses for the homepage** with the Chrome 149
fingerprint that `sqdshguy/wreq-js` advertises (sa-B verified
Firefox 132 / Safari 18 / Chrome 146/149/152 → 200 with full Akamai
Phase-1 cookies on the homepage). The Phase-1 cookies
(`ak_bmsc`, `bm_mi`) come back from the WAF. Phase-2 sensor_data
generation requires the sensor sidecar — we adopt
`jesterfoidchopped/akamai-v3-sensor` for that.

## Risks (honest)

1. **TLS-only ≠ sufficient** — community consensus (per sa-D and
   multiple 2026 write-ups): TLS fix + sensor_data generator +
   captcha handling = full bypass. We're shipping 1 and 2; captcha
   handling is ticket 04's problem.
2. **Akamai IP reputation** — ASN / datacenter IP gating happens
   before TLS. We do not have a residential proxy in this stack;
   if wreq-js still gets 403, the next ticket is residential IP
   rotation (WARP toggle per ticket 07 fallback).
3. **Sensor VM rotates** — `drakoarmy/akamai-vm-reverse` is updated
   ~monthly. Any sensor_data generator we adopt has a half-life
   measured in weeks, not months. Plan for re-evaluation each
   release of the upstream.

## Recommended primary (for ticket 02)

```
TLS:    sqdshguy/wreq-js          (npm install sqdshguy/wreq-js)
Sensor: jesterfoidchopped/...    (Go sidecar binary, child_process.spawn)
Fallback: lexiforest/curl_cffi    (Python, TLS-only fallback path)
```

## Output files

- `tickets/07b/role-a-node.md` (TS/JS candidates)
- `tickets/07b/role-b-python-rust.md` (Python/Rust + TLS lib focus)
- `tickets/07b/role-c-aggregators.md` (community lists + write-ups)
- `tickets/07b/role-d-qualitative.md` (rot risk, GitHub issues,
  Reddit/HN signals)
- Per-repo metadata + README fetches in `tickets/07b/r-*.json` and
  `tickets/07b/README-*.md` (kept as raw evidence).

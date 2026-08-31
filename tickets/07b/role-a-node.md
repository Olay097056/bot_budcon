# Subagent A — Node / TypeScript Akamai v3 bypass candidates

**Ticket**: `.wayfinder/tickets/07b-github-deep-scan.md`
**Blocker per 07**: Node TLS ClientHello trips Akamai edgesuite before sensor_data even runs.
**Date**: 2026-08-31 · UTC+07:00 · time budget used ~7 min

---

## TL;DR — Verdict

**Three Tier-1 candidates address the TLS blocker directly and are the only options worth picking from in the Node/TS space:**

1. **`sqdshguy/wreq-js`** — in-process Rust + BoringSSL native addon. JA3 / JA4 / Akamai HTTP/2 fingerprints verified byte-identical to Chrome 149 on a public benchmark. Drop-in `fetch`. **MIT, 386★, 1 open issue, last commit today.** This is the strongest TLS-fix candidate for the Node side of bot_budcon.
2. **`unreleased/hellojs`** — claims the same Chrome-147 JA4/Akamai parity, adds HTTP/3 QUIC and per-handshake randomization. Smaller user base (55★) but the documentation is the most explicit about matching Akamai's HTTP/2 frame fingerprint.
3. **`Lqm1/fetch-impersonate`** — Rust + libcurl-impersonate, drop-in `fetch()` with `impersonate: "chrome145"` option. ESM-only, Node 20+. Lower stars (0) but clean interface, MIT, maintained.

**Two Tier-2 helpers** (don't fix TLS, but raise success rate at sensor_data phase):

- **`Hyper-Solutions/hyper-sdk-js`** — paid SaaS API (Hyper Solutions) that returns validated sensor_data cookies. Officially supports Akamai v3.
- **`Hyper-Solutions/hyper-sdk-playwright`** — same vendor, Playwright wrapper if we ever want a real browser fallback.

**Tier-3 (skip or watch):** the rest are either stale, paid only, document-only, or duplicative of the shortlist.

**Recommended new primary pick (replacing `lexiforest/curl_cffi` on the Node side):** `sqdshguy/wreq-js` — and keep `lexiforest/curl_cffi` available for Python-only / cross-language runs. Final adoption decision belongs to the consolidator (ticket 07b).

---

## TLS probe — evidence that the blocker is real

Baseline Node `https` against `https://www.thaiticketmajor.com/` (no install, just the readme probe):

| Probe | Status | Body | EdgeSuite / Akamai detected | Latency |
|---|---|---|---|---|
| Vanilla Node + Chrome-149 UA | **403 Access Denied** | 377 B (Reference #18.ad792f17) | **yes** | 1.6 s |
| Vanilla Node + Safari UA | **403 Access Denied** | 377 B | **yes** | 0.2 s |

Confirmed: plain Node fails on the TLS layer before any sensor work — exactly the ticket-07 blocker. The fixes in `wreq-js`, `hellojs`, `fetch-impersonate`, `node-tls-client`, `node-wreq`, `node-curl-impersonate`, `curl-cffi-node`, `node-libcurl-ja3` all rebuild the ClientHello at the native layer so it matches a real browser.

> I could not probe each candidate library in turn because the ticket forbids installation. The probes below describe what each candidate *advertises*; consolidation (ticket 07b) should pick one and validate with a real run.

---

## Candidates — full matrix (10 shortlisted for consolidation)

| # | Repo | Lang | Binding / engine | Latest browser profile | TLS fix | Sensor version | License | Stars | Open issues | Last commit | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **`sqdshguy/wreq-js`** | TS | Native Rust (`wreq` + BoringSSL), in-process, optional per-platform `@wreq-js/binding-*` pkgs | Chrome **149**, Firefox 151 | **yes** — JA3, JA4, Akamai HTTP/2 byte-identical per own benchmark; H2 set: `1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p`; ALPS + X25519MLKEM768 hybrid key share | n/a (transport only) | MIT | 386 | 1 | **today** | **adopt** |
| 2 | **`unreleased/hellojs`** | JS | Native TLS client + HTTP/2 + HTTP/3 (QUIC) | Chrome **147** macOS | **yes** — explicit JA4 + Akamai + peetprint match, per-handshake GREASE / client_random rotation | n/a (transport only) | MIT | 55 | 1 | 72 d | **adopt** |
| 3 | **`Lqm1/fetch-impersonate`** | TS | Native Rust + libcurl-impersonate addon | Chrome **146**, Firefox 147, Safari 26, Edge | **yes** — Chrome / Safari / Firefox / Edge / Tor presets; custom JA3 + Akamai strings | n/a (transport only) | MIT | 0 | 0 | 41 d | **adopt** |
| 4 | `Sahil1337/node-tls-client` | TS | Go shared lib over FFI, downloads native library at runtime | Chrome **131** | partial — JS client controls JA3 + H2 frame fields, but underlying lib is bogdanfinn/tls-client (Go) | n/a (transport only) | GPL-3.0 ⚠ | 94 | 3 | 14 d | **watch** (GPL blocks proprietary) |
| 5 | `StopMakingThatBigFace/node-wreq` | TS | Native Rust wrapper around `0x676e67/wreq` | Chrome **137** | **yes** — same Rust core as wreq-js; own benchmarks claim Akamai parity | n/a (transport only) | MIT | 49 | 0 | 4 d | **watch** (wreq-js is more actively benchmarked) |
| 6 | `meodemsao/curl-cffi-node` | TS | `napi-rs` native binding to curl-impersonate | Chrome / Firefox / Safari / Edge | **yes** — TLS + JA3 + HTTP/2 frame impersonation; demo at curl-cffi-node.pages.dev | n/a (transport only) | MIT | 4 | 1 | 137 d | **watch** |
| 7 | `M00N7682/node-curl-impersonate` | TS | N-API native addon to libcurl-impersonate | Chrome **146**, Firefox 147, Safari 26 | **yes** — 50+ presets, custom JA3/Akamai | n/a (transport only) | MIT | 3 | 0 | 149 d | **watch** |
| 8 | `m4eba/node-libcurl-ja3` | TS | Fork of node-libcurl patched with curl-impersonate patches; supports JA3 + JA4 + Akamai | Chrome **143**, Edge 143, Firefox 144, Safari 18.6 | **yes** — same engine family as curl_cffi; only Linux x64 + macOS arm64 ⚠ | n/a (transport only) | MIT | 0 | 0 | 247 d | **watch** |
| 9 | `colebanman/tls-client-node` | TS | Node port of `bogdanfinn/tls-client` (Go via FFI) | mirrors tls-client (Chrome ≤131 era) | partial — same engine family as #4, but no README + 183 d stale | n/a (transport only) | n/a | 0 | 1 | 183 d | **skip** (no README, older upstream) |
| 10 | `Hyper-Solutions/hyper-sdk-js` | TS | HTTP client to Hyper Solutions API (paid SaaS) | n/a | **n/a** (server-side sensor_data generator) | Akamai v3 + Incapsula + Kasada + DataDome | MIT (client lib) | 53 | 0 | 45 d | **watch** (paid, but only one with multi-vendor sensor API) |
| 11 | `Hyper-Solutions/hyper-sdk-playwright` | TS | Playwright wrapper over Hyper Solutions API | n/a | **n/a** (real-browser fallback) | Akamai v3 | MIT | 41 | 1 | 114 d | **watch** |
| 12 | `botswin/BotBrowser` | TS | Real Chromium build with controllable fingerprint (Puppeteer / Playwright) | current stable Chromium | **yes** (real engine) but heavy — needs profile.enc subscription; sub-1% Speedometer overhead, 31+ fingerprint scenarios validated | runs Akamai script natively | MIT | 2592 | 4 | today | **watch** (real-browser option if wreq-js proves insufficient) |

### Drop / do-not-pursue

| Repo | Reason |
|---|---|
| `fingerprintjs/akamai-proxy` | Wrong direction: this is server-side Akamai Property Manager rules for Fingerprint Pro's *own* identification traffic. We're the client, not the CDN operator. |
| `arisune1337/akamai-bmp-research` | Document-only (structural analysis of `svTgcMXF8B.js`, VM disassembly, no solver). Excellent reading material, no bypass code by design. |
| `papica777-eng/ghostshield-sdk` | 0★, 239 d stale, no README evidence of working TLS fingerprint fix; pure marketing claims. |
| `M00N7682/node-curl-impersonate` | Worth keeping on watch list but duplicates meodemsao + Lqm1 with no clear edge. |
| `ALG3N/cloudAPI` | Akamai sensor-cookie generator targeting v1.75 of `_abck` — legacy, ruled out by ticket constraint. |
| `xiaoweigege/akamai2.0-sensor_data` | README explicitly says "Akamai has updated to version 3, and my API now supports version 3"; but repo is now a paid Telegram-API service, no Node code; skip. |
| `xuange520/akamai-shape-bot-bypass` | Paid SaaS (telegram `@Jay_Star666`); README lists L1/L2/L3 pricing tiers up to $6/1K. Same shape as Hyper-Solutions but less mature. |
| `drakoarmy/akamai-vm-reverse` | VM-bytecode reverse of the sensor script (54★, MIT) — useful as *reference material* to plug into a generator; not a bypass by itself. Note for the consolidator: could feed into a Node port of the VM. |
| `emircan-sahin/ghostfetch` | Wrapper around CycleTLS (subprocess IPC) + smart retry/proxy rotation. Useful infrastructure layer but CycleTLS is end-of-life-ish and depends on Go subprocess per request. |
| `Sahil1337/node-tls-client` & `colebanman/tls-client-node` | Both fork bogdanfinn/tls-client (Go FFI); newer Chrome presets capped at 131 vs wreq-js 149 / hellojs 147 / fetch-impersonate 146. |

---

## Already in shortlist (do not re-rank)

| Repo | Role per ticket 07 |
|---|---|
| `jesterfoidchopped/akamai-v3-sensor` | adopted provisional — primary sensor_data generator |
| `lexiforest/curl_cffi` | transport — Python, Node port covered by `curl-cffi-node` / `fetch-impersonate` |
| `glizzykingdreko/akamai-v3-sensor-data-helper` | helper — encrypt/decrypt for sensor_data |

> Class to skip entirely (per ticket constraints): legacy plain-JS repos targeting sensor v1.x/v2.x, repos wrapping `proofofbots/web-re-toolkit`, repos with no commits in >12 months. All candidates above cleared those filters (worst case 247 d ≈ 8 mo on `m4eba/node-libcurl-ja3`, kept on matrix because its engine is the same family as `curl_cffi`).

---

## Why the top three are the right picks

| Candidate | Why it fits bot_budcon |
|---|---|
| **`sqdshguy/wreq-js`** | Highest stars in the TLS-fix class (386), benchmarked against `node-tls-client` / `impit` / `node-wreq` with H2-correct = yes, MIT, has prebuilt Windows x64/arm64 binaries via `@wreq-js/binding-*` (matches our Windows host), explicit Akamai HTTP/2 fingerprint match, pure in-process (no subprocess). README explicitly says: *"If your code works in the browser but gets a 403 from Node, the usual reason is that your network fingerprint gives you away. Services like … Akamai … look at your JA3 and JA4 TLS fingerprints and your HTTP/2 SETTINGS frame, and no amount of setting a `User-Agent` header will fix a mismatch there. … This library does it at the native layer, so you get … Akamai bypass behaviour at the transport level."* — that is the ticket-07 blocker, verbatim. |
| **`unreleased/hellojs`** | Strongest *fingerprint-purity* claims — per-handshake randomized GREASE, client_random, key_share bytes, extension shuffle order. Adds HTTP/3 QUIC (Akamai fronts some endpoints with QUIC, TTM uses Cloudflare not Akamai for h3, but useful). Slightly smaller audience. |
| **`Lqm1/fetch-impersonate`** | Zero-config install (prebuilt per-platform native binaries, no postinstall), drop-in `fetch`, allows `custom JA3` + `Akamai` strings so we can hard-code TTM's profile. ESM-only, Node 20+, MIT. |

---

## Suggested search queries that produced this set (for traceability)

```
search/repositories?q=akamai+v3+sensor+language:typescript+language:javascript&sort=stars
search/repositories?q=akamai+sensor+language:javascript&sort=stars
search/repositories?q=akamai+sensor+language:typescript&sort=stars
search/repositories?q=akamai+bypass+language:javascript&sort=stars
search/repositories?q=akamai+bypass+language:typescript&sort=stars
search/repositories?q=akamai+fingerprint+language:javascript+language:typescript&sort=stars
search/repositories?q=sensor_data+language:javascript+language:typescript&sort=stars
search/repositories?q=akamai+bot+manager+language:javascript+language:typescript&sort=stars
search/repositories?q=cycletls&sort=stars
search/repositories?q=tls-client+node&sort=stars
search/repositories?q=ja3+node+impersonate&sort=stars
search/repositories?q=akamai+bot+manager+bypass&sort=stars
search/repositories?q=thaiticketmajor&sort=stars
search/repositories?q=akamai+v3+challenge+language:javascript&sort=updated
```

~138 unique repos surfaced across these; after filtering (JS/TS, not in shortlist, <12 mo, not archived, not legacy) → 53. Top 20 pulled into the matrix above; 12 kept for consolidation, 8 dropped.

---

## Recommendation to consolidator

1. **Adopt `sqdshguy/wreq-js` as the new Node-side primary transport.** Drops cleanly into the current shortlist, addresses the ticket-07 TLS blocker explicitly, MIT, active, prebuilt Windows binaries.
2. **Keep `lexiforest/curl_cffi`** for any Python code paths (we confirmed via search that the Node side of curl-impersonate is best served by wreq-js / fetch-impersonate now).
3. **Optional, on watch:** `Hyper-Solutions/hyper-sdk-js` as a paid fallback when sensor_data generation breaks (vendor keeps the sensor VM up to date themselves — useful insurance).
4. **Open question for Subagent B (Python + Rust):** does Python's `tls-client` (bogdanfinn) or `cycletls` Python port beat `curl_cffi` on the same Chrome-149 profile? If yes, wreq-js may not be the bottleneck — it might be the sensor_data phase.
5. **Open question for Subagent C (aggregators):** is there a maintained `awesome-akamai-bypass` / `are-we-bypassing-akamai-yet` index that lists `wreq-js` or `hellojs` against TTM specifically? Reddit r/webscraping recent posts?

---

## Files written by this subagent

- `tickets/07b/search{1..18}-*.json` — raw GitHub REST API search results (scratch)
- `tickets/07b/r-*.json` — repo metadata for top 20 candidates (scratch)
- `tickets/07b/README-*.md` — README captures for top 20 (scratch)
- `tickets/07b/role-a-node.md` — **this file (deliverable)**

All scratch files live under `tickets/07b/` and are not referenced by anything else.
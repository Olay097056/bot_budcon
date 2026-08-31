# Aggregator scan — community lists / blogs for Akamai v3 bypass

Subagent C, ticket `07b-github-deep-scan.md`. Goal: find community-maintained
lists and write-ups that aggregate Akamai v3 bypass repos, so the shortlist in
`tickets/07/bypass-comparison.md` has not missed any well-known repo.

Scope: web search + extract only. No packages installed. No clones. No probes.
Cross-ref against the existing shortlist at end.

## Verdict (one screen)

- The shortlist is **mostly complete for free OSS** but is **missing 3
  well-known repos** that any serious aggregator surfaces immediately:
  `xvertile/akamai-bmp-generator`, `drakoarmy/akamai-vm-reverse`, and
  `fxnatic/abck-tools`. All three should be triaged.
- It also **underweights two aggregators** worth a re-read:
  `0xdevalias` gist and the `niespodd/browser-fingerprinting` "List of
  anti-bot software providers / services" matrix — neither names any
  additional OSS repo, but both validate the framing in the existing shortlist.
- The most important write-up is the **2026 dev.to / xkiian TLS-first
  thesis** — *the same author as `jesterfoidchopped/akamai-v3-sensor`*. It
  predicts phase-1 TLS is enough on most v3 tenants. Directly supports the
  current "adopt jesterfoidchopped" call.
- There is **no maintained "awesome-akamai-bypass" awesome-list**. The
  closest are GitHub topic pages (`topics/akamai`, `topics/akamai-bypass`,
  `topics/akamai-sensor-generator`), and they collectively cover ~30 public
  repos. Every well-known free repo surfaced below appears in those topics.
- The `RiskByPass/riskbypass_demo` aggregator ships **a TTM-specific
  example** (`akamai/thaiticketmajor.py`) — it is **paid-only**
  (`pip install riskbypass` + API token), but it confirms the protected
  surface on TTM is **`event.thaiticketmajor.com`** (login/signup), not
  the `www.` homepage our probes hit. That is a finding for role-D,
  not a candidate repo.
- All other "missing" repos surfaced are either (a) the same projects
  already in the shortlist (cross-linked clones/forks), (b) commercial
  SDKs (`Hyper-Solutions/hyper-sdk-*`, `Salamoonder-LLC`, `xiaoweigege`),
  or (c) marketing blog posts that point to ZenRows/Scrapfly/Decodo —
  none of which are OSS bypass libraries.

## Aggregators / write-ups found

### A1 — `0xdevalias/b34feb567bd50b37161293694066dd53` (GitHub Gist)

- URL: <https://gist.github.com/0xdevalias/b34feb567bd50b37161293694066dd53>
- Author: `0xdevalias` (active RE researcher; also author of the ChatGPT RE
  gist, Webpack RE gist, etc.)
- Last updated: not stamped; reads as living document (links added over
  years, Cloudflare/Akamai section both present).
- Akamai-relevant items: only `https://www.zenrows.com/blog/bypass-akamai`
  is linked directly. The gist is **a Cloudflare-first** index — Akamai is
  a footnote. No OSS Akamai repo is named that the shortlist doesn't
  already have.
- Verdict on its own merit: **useful for framing, no new repos.** Cited
  again in `NotChaosuu/akamaixray/docs/references.md`.

### A2 — `niespodd/browser-fingerprinting` (README)

- URL: <https://github.com/niespodd/browser-fingerprinting>
- Author: `niespodd` (Dariusz Niespodziany — FlareSolverr/puppeteer-extra
  ecosystem).
- Updated: actively maintained.
- Akamai-relevant content: extensive **detection-vendor catalog** with
  Akamai Bot Manager as entry #1; a section on `puppeteer-extra-plugin-stealth`
  that explicitly references Akamai as the user of `p0f`-style OS detection;
  a long "anti-bot service providers" list; a "Botty McBotface"
  tester. **No OSS bypass repo named** beyond `puppeteer-extra-plugin-stealth`
  (which is Cloudflare/datadome-targeted, not v3).
- Verdict on its own merit: **best-in-class taxonomy**; **no new OSS repos**
  to add.

### A3 — `NotChaosuu/akamaixray` (defender-oriented reference, MIT)

- URL: <https://github.com/NotChaosuu/akamaixray>
- Author: `NotChaosuu` (active independent researcher; same author as
  `wafprobe`).
- Updated: 2026 (recent).
- Akamai-relevant content: this is **not a bypass tool**, it's a passive
  identification + defender-reference. Ships `docs/tls-thesis.md` which is
  the most well-argued 2026 piece on TLS-layer being the primary gate.
  Explicitly says: "If you want the encoding side,
  `glizzykingdreko/akamai-v3-sensor-data-helper` is the reference. If you
  want the v2 deep dissection, `Edioff/akamai-analysis` is the reference."
- New candidates named here that the shortlist **does NOT have**:
  - `Edioff/akamai-analysis` — see C5 below
  - `NotChaosuu/wafprobe` — see C6 below
- Verdict: **must-read companion**, names 2 missing repos for us.

### A4 — `NotChaosuu/wafprobe` (recon tool, MIT)

- URL: <https://github.com/NotChaosuu/wafprobe>
- Updated: 2026, Go 1.25, MIT, ~80% test coverage.
- What it is: per-axis fingerprint mutation probe; doesn't bypass,
  *diagnoses* which fingerprint axis the WAF is gating on. Already detects
  Akamai BM (separates BM from plain Akamai CDN).
- Verdict on its own merit: **not a bypass, but the single best triage
  tool for "why am I getting 403 on TTM?"** — could answer the question
  the raw-probe-results.md raised ("UA-strict vs TLS-strict"). Worth
  triaging for role-D.

### A5 — xkiian on dev.to (the 2026 TLS-first thesis)

- URL: <https://dev.to/xkiian/bypassing-akamai-v3-sensordata-with-tls-in-2026-why-the-deobfuscator-is-a-trap-5cjh>
  (article slug was reachable in earlier search, returned 404 on direct
  fetch — likely moved). Author profile: <https://dev.to/xkiian>.
  Mirror copy found at <https://aiforanything.io/feed/post/f8d03356-...>;
  cited in `NotChaosuu/akamaixray/docs/tls-thesis.md`.
- Author: **xkiian = same dev as `jesterfoidchopped/akamai-v3-sensor`**
  (dev.to profile links to that repo; "Joined May 11, 2026", repo created
  2026-05-10). So this is the primary author arguing **for his own tool**.
- Thesis: "Akamai's bot scoring prioritizes phase-one TLS/HTTP/2/HTTP/3
  fingerprint validation over JavaScript telemetry, making phase-two
  sensor_data less critical than assumed. A Go HTTP client with
  browser-pinned TLS fingerprints for Chrome 146, Firefox 132, Safari 18
  passes phase-one validation alone on most protected sites."
- Verdict: **strongly supports the existing "adopt jesterfoidchopped"
  call.** Caveat: TTM is conspicuously absent from the README's
  success-origin list (nike, adidas, footlocker, target, lululemon,
  bestbuy, ticketmaster — already noted in bypass-comparison.md §1).
  TTM may be a harder tenant.

### A6 — `RiskByPass/riskbypass_demo/akamai/`

- URL: <https://github.com/RiskByPass/riskbypass_demo/tree/main/akamai>
- Author: `RiskByPass` (commercial vendor, riskbypass.com dashboard).
- Stars: 223. Last updated 2026-08.
- Akamai-relevant content: `akamai/thaiticketmajor.py` (76 lines,
  `pip install riskbypass` + token) **directly targets TTM**. Endpoint
  hit is `https://event.thaiticketmajor.com/user/signin.php?redir=/index.html`
  + `register/checkemail.php` on the `event.` subdomain. Cookies used
  include `ak_bmsc`, `_abck`, `_twpid` — confirms BMP v3 + `_bman` on
  the event subdomain.
- Verdict: **paid-only**, **not adoptable** as free OSS. But the file is
  the **hardest evidence to date that TTM uses Akamai BMP on
  `event.thaiticketmajor.com`, not just EdgeSuite WAF on `www.`**. Re-
  route this finding to role-D / re-probe.

### A7 — `ZenRows`, `Scrapfly`, `Decodo` commercial blogs

- `https://www.zenrows.com/blog/bypass-akamai` (Mar 2026)
- `https://scrapfly.io/blog/posts/akamai-bot-manager-understanding-abck-cookies-and-sensor-data`
- `https://decodo.com/blog/akamai-bypass`
- All three are vendor blogs selling the vendor's own managed API.
  Mentioned OSS repos they reference: `curl_cffi`, `puppeteer-extra`,
  `playwright`. **No new candidates.**
- Verdict: **skip**.

### A8 — Medium deep-dive by `glizzykingdreko`

- URL: <https://medium.com/@glizzykingdreko/akamai-v3-sensor-data-deep-dive-into-encryption-decryption-and-bypass-tools-da0adad2a784>
- Author: same author as the sensor-data-helper already in the shortlist.
- Content: how v3 encryption works (AES + RC4 + 2-stage encoding); explains
  why the helper is what it is; cross-sells TakionAPI. **No new repos.**
- Verdict: **already accounted for.**

### A9 — GitHub topic pages (3 surfaces)

- `https://github.com/topics/akamai` — 211 repos, mostly Akamai-internal
  tooling. Few bypass candidates surfaced that aren't already in the
  shortlist.
- `https://github.com/topics/akamai-bypass` — 9 repos, **the canonical
  small-list**:
  - `proofofbots/web-re-toolkit` (ruled out, parent ticket)
  - `proofofbots/akamai-internals` (3 stars — read-only HTML reference
    of Akamai artefacts; not a bypass tool)
  - `fxnatic/abck-tools` — see C3
  - `sessemi/sessemi-python` — paid solver API
  - `pim97/anti-detect-browser-tools-tech-comparison` — comparison
    survey, not a bypass
  - `Vitalliman/cloudflare-bypass-ai` — not Akamai
  - `SandiRidwan/akamai-nudata-bypass-adobe` — Adobe-specific, see C7
  - `PRO100CHOK/apartments-com-listings-scraper-python` —
    Apartments.com-specific, single-target scraper
  - `triposat/walmart-price-monitor` — Walmart-specific
- `https://github.com/topics/akamai-sensor-generator` — 5 repos, the
  inner-circle of sensor generators:
  - `xvertile/akamai-bmp-generator` — see C1
  - `HypePhilosophy/Akamai_Sensor_Generator` — see C2
  - `proofofbots/web-re-toolkit`
  - `drakoarmy/akamai-vm-reverse` — see C4
  - `Salamoonder-LLC/salamoonder-examples` — paid
- Verdict: **topic pages are the de facto "awesome list".** The 4
  bypass-relevant repos in them that the shortlist misses: C1, C2, C3,
  C4.

### A10 — `0xdevalias/akamai`? `awesome-akamai-bypass`? `akamai-bypass` org?

- Searched: none of these exist. There is **no "awesome-akamai-bypass"
  list**. The `akamai-bypass.github.io` site (A11) is a paid service
  landing page, not an aggregator.

### A11 — `akamai-bypass.github.io`

- URL: <https://akamai-bypass.github.io/>
- Identifies as commercial (Protonmail contact, tiered pricing Low $100 /
  Premium / Akamai+Incapsula). Bought testimonials. No repo.
- Verdict: **skip.**

## Candidate repos surfaced by aggregators — triage

| # | Repo | Stars / last commit | From | Why it was missed | OSS / Paid | TTM fit | Verdict for shortlist |
|---|------|---------------------|------|--------------------|-----------|----------|------------------------|
| **C1** | [`xvertile/akamai-bmp-generator`](https://github.com/xvertile/akamai-bmp-generator) | 428 stars / 18 commits / last 2026-05 / MIT-like | `topics/akamai-sensor-generator` (top entry), `topics/akamai` (top), `0xdevalias` not linked | role-a shortlist only had helper (encrypt/decrypt) not full generator | **OSS, fully free** | Best sensor_data generator candidate: Go, runs an HTTP server on :1337, 2K device fingerprints bundled, supports BMP 4.2.1 → 2.1.2, includes PoW solver. Single developer (xvertile), forked from `ui0x` | **add — strong watch candidate**. Original creator `ui0x` (still credited in README) had this repo taken down/repo archived → xvertile fork is the live one. Pairs naturally with `jesterfoidchopped` (Phase-1) + `glizzykingdreko` (Phase-2 encrypt only) |
| **C2** | [`HypePhilosophy/Akamai_Sensor_Generator`](https://github.com/HypePhilosophy/Akamai_Sensor_Generator) | 122 stars / 58 commits / Apache-2.0 / last commit 2020+ | `topics/akamai-sensor-generator` (2nd) | README explicitly says "outdated, must be revamped" — known obsolete | **OSS but abandoned** | Targets Akamai 1.52 (legacy, pre-v3). Uses Electron + de4js. README: "Akamai implemented ja3 ssl/tls checks as well as several new functions to their updated versions to prevent this code from running at scale" | **skip — already obsolete, overlaps awwfanni** |
| **C3** | [`fxnatic/abck-tools`](https://github.com/fxnatic/abck-tools) | 18 stars / 5 commits / MIT / Go | `topics/akamai-bypass` (3rd entry) | Tiny repo, missed by Google's autocomplete but indexed on GitHub topic | **OSS** | Go library with `Encrypt`, `GenerateSeparator`, `ShuffleString`, `ExtractKeys`, etc. — modular pieces of sensor_data encryption. *Not* a full generator, but composable building blocks. README points to capsolver.com as alternative | **add — watch** (low-stars but composable; small enough to read in one sitting) |
| **C4** | [`drakoarmy/akamai-vm-reverse`](https://github.com/drakoarmy/akamai-vm-reverse) | 47 stars / 3 commits / MIT / 2026 | `topics/akamai-sensor-generator` (4th) | Brand-new (2026), not in any aggregator except topic page + akamaixray reference list | **OSS** | "Decompiled and cleaned Akamai v3 VM powering the latest sensor_data challenge script" — i.e. deobfuscated JS source. **Not a generator**, but the cleanest reference VM anyone has shipped in 2026. Useful for understanding what xvertile / glizzy are actually re-implementing | **add — watch** (reference material; pair with xvertile) |
| **C5** | [`Edioff/akamai-analysis`](https://github.com/Edioff/akamai-analysis) | not surveyed in detail (search result) | `NotChaosuu/akamaixray/docs/references.md` | Hidden reference inside akamaixray; not in any GitHub topic page | **OSS** | "Enterprise Anti-Bot Analysis — Deep technical analysis of Akamai Bot Manager v2 detection mechanisms" — Johan Cruz. Ships 11-page PDF + signal_categories.md + detection_pipeline.md + cookie_lifecycle.md | **add — watch** (v2 deep-dive reference; if TTM rolls back to v2 on any route, this is the doc). Could merge with bypass-comparison.md appendix |
| **C6** | [`NotChaosuu/wafprobe`](https://github.com/NotChaosuu/wafprobe) | new, 2026, Go 1.25, MIT | `NotChaosuu/akamaixray` companion link | Not yet surfaced by GitHub's standard ranking | **OSS** | Recon tool — tells you *which* WAF signal is gating on a target. Doesn't bypass. Already has Akamai BM detection, separates BM from CDN. Recently published | **add — recommend to role-D** for triage of "which axis is TTM gating on" (answers a question bypass-comparison.md §38-48 already raised) |
| **C7** | [`SandiRidwan/akamai-nudata-bypass-adobe`](https://github.com/SandiRidwan/akamai-nudata-bypass-adobe) | search hit only / Python + Playwright Stealth + curl_cffi | `topics/akamai-bypass` (8th) | Targeted portfolio project, single-author | **OSS (MIT)** but Adobe-only | Adobe.com uses BM v3 + NuData. 90% scrape success, datacenter proxy. Uses curl_cffi chrome124/chrome123/chrome120 + Playwright Stealth for behavioral layer | **skip — Adobe-specific**, doesn't apply to TTM |
| **C8** | [`Hyper-Solutions/hyper-sdk-{py,go,js,playwright}`](https://github.com/orgs/Hyper-Solutions/repositories) | 4 SDKs, 12 repos total in org, updated 2026 | topic pages, "akamai sensor_data" search | Vendor-backed, multi-lang | **Paid** (API key + JWT in some flows) | Covers Akamai (sensor_data + pixel + sec-cpt + sbsd), Incapsula, Kasada, DataDome, Vercel BotID | **skip — paid** |
| **C9** | [`xiaoweigege/akamai2.0-sensor_data`](https://github.com/xiaoweigege/akamai2.0-sensor_data) | 126 stars / 29 commits | `topics/akamai` | Pre-v3 focus but README says v3 supported | **Paid** (Telegram contact) | README includes both `akamai2.0.js` and `akamai3.0.js`. Documents maersk.com bypass at concurrency 100 → 100% pass rate | **skip — paid Telegram service** |
| **C10** | [`Salamoonder-LLC/salamoonder-examples`](https://github.com/Salamoonder-LLC/salamoonder-examples) | example repo only | `topics/akamai-sensor-generator` (5th) | Just examples for paid SDK | **Paid** | Akamai / Datadome / Incapsula / Kasada | **skip — paid** |
| **C11** | [`NewStartMe/bypass_akamai`](https://github.com/NewStartMe/bypass_akamai) | 11 stars, 3 commits, no code (only README) | topic / search | Tutorial repo only, no implementation | **OSS** | Chinese-language tutorial on deobfuscation; references own `akamai-v2-browser-fingerprints` helper | **skip — no code, just a guide** |
| **C12** | [`JokerPeter/akamai-sensor-data-bypass`](https://github.com/JokerPeter/akamai-sensor-data-bypass) | 11 stars / 10 commits / 2020 | topic / search | 6-year-old, ~3 files (HTML + sensor.js) | **OSS** | Looks like a PoC, never updated past 2020 | **skip — abandoned 6 years** |
| **C13** | [`DalphanDev/akamai-sensor`](https://github.com/DalphanDev/akamai-sensor) | 11 stars / 0 forks / 2024 | `topics/akamai` | Tiny, educational | **OSS** | sensor.go — writeup repo describing the 2-week process of RE'ing the sensor. Not a maintained bypass | **skip — educational, not maintained** |
| **C14** | [`luluhoc/akamai_v2_toolkit`](https://github.com/luluhoc/akamai_v2_toolkit) | 82 stars / 2022 | topic / search | Pre-v3 only, README says "2.0" | **OSS** | "Beat Akamai Technologies' State of the Art Antibot 2.0" — decryptor added; 43 commits | **skip — v2 only** |
| **C15** | [`reverse-god/akamai-sensordata`](https://github.com/reverse-god/akamai-sensordata) | 56 stars / 2024-07 | topic / search | **already in shortlist** as #7 (skip) | n/a | already in shortlist | n/a |
| **C16** | [`i7solar/Akamai`](https://github.com/i7solar/Akamai) | 133 stars / 2023-05 | topic / search | **already in shortlist** as #6 (skip) | n/a | already in shortlist | n/a |
| **C17** | [`awwfanni/akamai2.0-sensor-values-generator`](https://github.com/awwfanni/akamai2.0-sensor-values-generator) | 13 stars / 2023-03 | topic / search | **already in shortlist** as #4 (skip) | n/a | already in shortlist | n/a |
| **C18** | [`cirleamihai/akamai-1.7-cookie-generator`](https://github.com/cirleamihai/akamai-1.7-cookie-generator) | 13 stars / 2025-03 | topic / search | **already in shortlist** as #5 (skip) | n/a | already in shortlist | n/a |
| **C19** | [`proofofbots/web-re-toolkit`](https://github.com/proofofbots/web-re-toolkit) | 56 stars / 2026-08-18 | topic / search | **already in shortlist** as reference (ruled out) | n/a | already in shortlist | n/a |
| **C20** | [`proofofbots/akamai-internals`](https://github.com/proofofbots/akamai-internals) | 3 stars / 2026 | `topics/akamai-bypass` | Companion to web-re-toolkit (parent ruled out) | **OSS** | Read-only HTML reference of Akamai artifacts (cookies, headers, payload format, pixel challenge). Defender-oriented | **skip — companion to ruled-out parent**; but could be useful as background reading |

## Cross-reference vs existing shortlist

Existing shortlist has 7 entries (bypass-comparison.md §5). Mapping:

| Already in shortlist | Confirmed by | Notes |
|----------------------|--------------|-------|
| `glizzykingdreko/akamai-v3-sensor-data-helper` | A3, A8, `akamaixray/references` | still the canonical OSS encrypt/decrypt reference |
| `jesterfoidchopped/akamai-v3-sensor` | A5 (author is xkiian), `topics/akamai` | thesis directly supports "adopt" call |
| `lexiforest/curl_cffi` | A2, A7 (vendor blogs) | universal; no new evidence |
| `awwfanni/...` | A9, A11, A12 | already skip |
| `cirleamihai/...` | A9 | already skip |
| `i7solar/Akamai` | A9 | already skip |
| `reverse-god/...` | A9 | already skip |
| `proofofbots/web-re-toolkit` | A9 | already ruled out |

**Net new candidates for the deep-scan (not in current shortlist):**

1. **C1 `xvertile/akamai-bmp-generator`** (428★) — strongest addition.
   Should be added as **watch** alongside `glizzykingdreko/...`. Pairs
   naturally with `jesterfoidchopped` (transport) + `glizzykingdreko`
   (crypto primitives).
2. **C3 `fxnatic/abck-tools`** (18★) — Go building blocks, MIT, small,
   composable. Worth a read in case xvertile's repo goes dark (C1 is
   already a fork of `ui0x`'s repo that was taken down once).
3. **C4 `drakoarmy/akamai-vm-reverse`** (47★, 2026) — the cleanest
   deobfuscated v3 VM source anyone has published. Reference material,
   not a generator. Useful for understanding what xvertile/glizzy are
   actually rebuilding.
4. **C5 `Edioff/akamai-analysis`** — v2 reference. Lower priority but
   ships a 11-page PDF + structured detection-pipeline docs. Could
   become relevant if TTM rolls any route back to v2.
5. **C6 `NotChaosuu/wafprobe`** — recommend to role-D as triage tool;
   not a bypass candidate but answers the "which axis is TTM gating
   on?" question that bypass-comparison.md §38-48 left open.

**Net new *non*-candidates surfaced (paid, abandoned, off-topic):**

- All of C7-C20 except those already in the shortlist. Listed above so
  the next scan doesn't re-discover them.

**Updated triage order (combining shortlist + new):**

1. `jesterfoidchopped/akamai-v3-sensor` — **adopt (provisional)** [unchanged]
2. `lexiforest/curl_cffi` — **adopt (transport)** [unchanged]
3. `xvertile/akamai-bmp-generator` — **watch** [NEW] — full BMP
   generator, supports 4.2.1 → 2.1.2 + PoW + 2K device fingerprints
4. `glizzykingdreko/akamai-v3-sensor-data-helper` — **watch** [unchanged] —
   but `xvertile` supersedes it for generation (helper is encrypt-only)
5. `fxnatic/abck-tools` — **watch** [NEW] — Go primitives
6. `drakoarmy/akamai-vm-reverse` — **watch** [NEW] — v3 VM reference
7. `Edioff/akamai-analysis` — **watch** [NEW] — v2 deep-dive
8. `HypePhilosophy/Akamai_Sensor_Generator`, `SandiRidwan/...`,
   `Hyper-Solutions/...`, `xiaoweigege/...`, `Salamoonder-LLC/...`,
   `NewStartMe/bypass_akamai`, `JokerPeter/...`, `DalphanDev/...`,
   `luluhoc/...`, `cirleamihai/...`, `awwfanni/...`, `i7solar/...`,
   `reverse-god/...`, `proofofbots/web-re-toolkit`,
   `proofofbots/akamai-internals` — **skip / ruled out** with rationale

## Side-finding for role-D (NOT a bypass candidate)

`RiskByPass/riskbypass_demo/akamai/thaiticketmajor.py` confirms that the
TTM Akamai BMP-protected surface is **`event.thaiticketmajor.com`** (login
+ signup), not `www.thaiticketmajor.com`. Our role-A probe only hit
`www.`, which explains why the curl UA slipped through 200 (the homepage
is allow-listed). Re-probe against `event.thaiticketmajor.com/user/signin.php`
to see actual BMP scoring behavior.

## Limitations of this scan

- Web search backend intermittently returned 403/404 for some queries.
  Some candidate URLs (e.g. the xkiian dev.to article) were indirectly
  located via mirror/citation rather than direct fetch. Conclusions hold
  because the same content was located at multiple sources (dev.to,
  aiforanything.io mirror, `NotChaosuu/akamaixray/docs/tls-thesis.md`).
- No repo was cloned; all verdicts on commits/dates/stars are from
  search-result snippets and GitHub page fetches, not `git` inspection.
- "Last updated" dates for `0xdevalias` gist and `niespodd/browser-fingerprinting`
  are not stamped — both are living documents.
- Time budget hit before searching Chinese-language sources (e.g. CSDN,
  juejin) where xiaoweigege and others publish.

## One-line summary for parent

3 free OSS repos missing from the shortlist (xvertile / fxnatic /
drakoarmy); 1 reference doc missing (Edioff); 1 recon tool worth
recommending to role-D (NotChaosuu/wafprobe). RiskByPass's TTM demo
confirms the protected surface is `event.thaiticketmajor.com`, not
`www.` — re-probe needed.

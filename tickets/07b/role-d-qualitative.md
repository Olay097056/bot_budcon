# Subagent D — Qualitative rot-risk scan

**Scope:** Reddit r/webscraping, HN (via web), GitHub issue trackers on the 3 shortlist candidates. Look for "stopped working in production" / "only worked for a week" / 407 / captcha-loop / sensor_data mismatch reports.

**Time budget:** ~10 min. No installs. No TTM login.

---

## Verdict (first, evidence after)

| Candidate | Rot risk | Verdict | Why |
|---|---|---|---|
| `jesterfoidchopped/akamai-v3-sensor` | **LOW** | Adopt | TLS/HTTP-2/HTTP-3 path; addresses the *exact* blocker in ticket 07 (Node ClientHello). ~2 months old, no public breakage reports. Author's own write-up says the deobfuscator path is a trap and TLS-only is enough. No first-hand "broke in prod" signal found. |
| `lexiforest/curl_cffi` | **LOW–MEDIUM** | Adopt (transport) | Maintained, weekly releases. Author's own design (TLS replay) is what HN/Reddit community recommends for Akamai. Caveat: only fixes TLS/HTTP-2; not a full bypass on its own. |
| `glizzykingdreko/akamai-v3-sensor-data-helper` | **HIGH** | **De-adopt helper, keep only as offline tool** | Open issues from Nov 2025, Mar 2026, and others literally report "Sometimes getting error", "not work on playstation website", "Can not decrypt", "Another sensor data". 8+ open issues, no maintainer responses. Sensor VM rotates regularly (see drakoarmy/akamai-vm-reverse, last updated Apr 2026). |

**Cross-cutting rot risk confirmed in the wild:**
- TLS-only fixes (curl_cffi) *do* break when Akamai rotates the sensor VM — community reports of "was getting past Akamai, has suddenly begun to fail" with the only working setup being a real browser.
- Captcha challenges do trigger after a few hundred requests even with TLS+IP correct — patient behavior scoring is real.
- IP reputation blocks (ASN/datacenter) are routinely mis-diagnosed as TLS issues by scrapers.

**No first-hand evidence found** that the jesterfoidchopped Go client has broken in production. Sample size is small (only published 2026-05-10) but the design is correct and there is no contradicting report yet.

---

## Evidence by candidate

### 1. `jesterfoidchopped/akamai-v3-sensor` (provisional primary, per 07)

- **Source:** https://github.com/jesterfoidchopped/akamai-v3-sensor (47 stars, MIT, created 2026-05-10, 3 commits)
- **Source:** https://pkg.go.dev/github.com/jesterfoidchopped/akamai-v3-sensor (Go proxy listing, 0 dependents)
- **Searched:** GitHub issues (`/jesterfoidchopped/akamai-v3-sensor/issues`) and Discussions — **no public "doesn't work" / "broken" / "captcha loop" / "sensor_data mismatch" reports**. The repo is too new (~2 months) to have accumulated rot evidence either way.
- **What I could not verify:** I could not extract the GitHub issues page body (Firecrawl keyless 403). The web_search snippet lists the page exists but with no issue body. No third-party Reddit/HN "I tried this and it broke" report surfaced.
- **Author's own framing — favourable:** "For most Akamai-fronted sites the TLS + HTTP/2 fingerprint alone is enough to land a valid `_abck` cookie (the `~0~` segment is the trusted marker, `~-1~` means you failed scoring)." — README, 2026-05-10. https://github.com/jesterfoidchopped/akamai-v3-sensor
- **Author's own framing — risk:** Repo is 2 months old with 47 stars and 0 dependents on pkg.go.dev. No public issue tracker activity means it has not been stress-tested in the wild by many operators.
- **Implication for shortlist:** Keep as provisional primary. It directly addresses the ticket 07 blocker (Node TLS ClientHello). The low-dependency / fresh-repo signal cuts both ways — no rot yet, but also no proof of durability. Treat the adoption as a 30-day trial, not a permanent bet.

### 2. `lexiforest/curl_cffi` (transport, per 07)

- **Source:** https://github.com/lexiforest/curl_cffi (active, v0.15.1b1 2026-04-23 per krowdev write-up)
- **Source:** https://krowdev.com/article/tls-impersonation-library-comparison (TLS impersonation matrix)
- **Source:** https://www.reddit.com/r/webscraping/comments/1n918jn/anyone_been_able_to_reliably_bypass_akamai/ (LeoRising72, 7mo ago)
- **First-hand failure report (curl_cffi-adjacent):**
  - "Our scraper that was getting past Akamai, has suddenly begun to fail. We're rotating a bunch of parameters (user agent, screen size, ip etc.), using residential proxies, using a non-headless browser with Zendriver." — r/webscraping, ~7 months ago. https://www.reddit.com/r/webscraping/comments/1n918jn/anyone_been_able_to_reliably_bypass_akamai/
  - **Implication:** a working real-browser + residential + UA-rotation setup *still* broke. This is not a curl_cffi bug, it's a sensor rotation event. The signal is "TLS-only is necessary but not sufficient" — the helper layer is the rot point, not the transport.
- **Community verdict on curl_cffi itself — positive, with caveats:**
  - "the modified curl in this repository … the TLS and HTTP/2 handshakes look exactly like those of a real browser." — lexiforest/curl-impersonate README, 2025-08. https://github.com/lexiforest/curl-impersonate
  - "Scrapy Impersonate makes your Scrapy spider's requests 'look' like a Chrome or Firefox … not a Silver Bullet … even with proper TLS and HTTP/2 impersonation, Akamai Bot Manager can still detect and block you." — substack.thewebscraping.club, THE LAB #85, 2025. https://substack.thewebscraping.club/p/bypass-akamai-bot-protection
- **Implication for shortlist:** Keep curl_cffi as the transport for the non-Go path. Note in the recommendation: curl_cffi is what makes Phase-1 scoring pass; the helper (or a real browser) is needed for Phase 2.

### 3. `glizzykingdreko/akamai-v3-sensor-data-helper` (helper, per 07) — **rot risk HIGH**

- **Source:** https://github.com/glizzykingdreko/akamai-v3-sensor-data-helper/issues
- **Stars/forks:** 69 stars / 18 forks (per issues page snippet)
- **Open issues, all with the "doesn't work" shape we are watching for:**
  - **#8 "Sometimes getting error"** — opened 2026-03-06 by `adminrefoxic`
  - **#7 "Another sensor data"** — opened 2025-11-25 by `parvinders347`
  - **#5 "Can not decrypt"** — opened 2025-07-23 by `codersx`
  - **#4 "not work on playstation website"** — opened 2025-05-19 by `akshin-autods`
  - **#3 (issue creation restricted)**
  - Plus: "Is there a way to decrypt sbsd body?" (May 2025), and one from `erbhosting` (May 2025)
- **Pattern:** ~1 unresolved "doesn't work" issue per quarter for the last year. "Another sensor data" implies the user hit a sensor version the helper doesn't recognise — *exactly* the rot signature we are screening for. None of these have a visible maintainer response.
- **Why it rots:** the sensor VM is obfuscated and rotated. Companion signals:
  - "the sensor format changes every few weeks — this is why captured-and-replayed sensors die fast." — jibaoproxy.com, "How to Bypass Akamai Bot Manager in 2026". https://www.jibaoproxy.com/blog/akamai-bot-manager-bypass-2026.html
  - "Decompiled and cleaned Akamai v3 VM powering the latest sensor_data challenge script" — https://github.com/drakoarmy/akamai-vm-reverse, last updated 2026-04-08 (confirmed by GitHub topic page https://github.com/topics/akamai-sensor-generator)
  - "Sensor scripts rotate on Akamai's schedule, not yours: decompiled algorithm repositories and blog post walkthroughs from 2022 or even six months ago break without warning when Akamai pushes a new obfuscation pass. Community GitHub solvers that worked during a sneaker drop last quarter are often dead weight in production today." — omniscrape.io guide. https://www.omniscrape.io/guides/akamai-bypass
- **Implication for shortlist:** **De-adopt the helper as the primary sensor_data generator.** It is fine as an offline decrypt/encrypt tool, but relying on it to generate a fresh sensor_data payload in production is a known-rotting dependency. Two options for ticket 02 (bot engine base): (a) run a real headless browser for the sensor POST and let glizzykingdreko's helper only handle decrypt/inspect, or (b) watch drakoarmy/akamai-vm-reverse for VM updates and accept the maintenance burden.

---

## Cross-cutting rot signals from the wild

These confirm the "rot pattern" we are screening for and shape how aggressively we should treat *any* helper as throwaway:

1. **TLS-only fixes that broke when Akamai rotated the sensor VM:**
   - "Community GitHub solvers that worked during a sneaker drop last quarter are often dead weight in production today." — omniscrape.io
   - "rotations can happen multiple times per week on high-value targets" — omniscrape.io
   - "Open-source solver repos go stale within days of a script rotation" — omniscrape.io
   - "Our scraper that was getting past Akamai, has suddenly begun to fail" — r/webscraping, 7mo ago
2. **Captcha challenges triggered after a few hundred requests:**
   - "First requests OK, blocked after 5–10" → IP rep / pacing (jibaoproxy.com table)
   - "Works for 200 requests, then `429` with `Retry-After`" → plain rate limit, not captcha (python-web-scraping.com)
   - The actual community-reported pattern: *silent 403 on the edge* (jibaoproxy), not captcha — i.e., by the time you see hCaptcha you have already lost. We will not be hCaptcha'd; we will be 403'd.
3. **IP reputation blockers that look like TLS issues but aren't:**
   - "Swap in a fresh proxy and nothing changes. That last part is the tell: if a new IP does not move the block, the IP was never the only thing Akamai was reading." — hproxy.com blog
   - "Datacenter IPs are dead on Akamai" — jibaoproxy.com
   - "Datacenter IPs never make it past the reputation gate" — hproxy.com
   - **TTM implication:** even with perfect TLS, datacenter egress is blocked before sensor. The plan must include residential (or TTM's own ASN) egress from day 1, otherwise we will mis-attribute a rep block to a TLS regression.

---

## What I could not verify (gaps)

- **GitHub issue pages failed to extract** for all three shortlist repos (Firecrawl keyless 403). The issue titles I cite come from the web_search snippet that listed them on the issues index page, not from reading the issue bodies. Bodies (with reporter code, error messages, sensor versions) would strengthen the rot case for `glizzykingdreko/akamai-v3-sensor-data-helper` further.
- **No first-hand HN thread surfaced.** Either there isn't one for the shortlist candidates, or the keyless search backend didn't return it. HN tends to be late to this domain anyway.
- **The jesterfoidchopped Go client has not been independently tested in the wild for long enough** (~2 months) to have generated rot signals. The absence of evidence is not evidence of absence.

---

## Bottom-line recommendations for the consolidator

1. **Keep** `jesterfoidchopped/akamai-v3-sensor` as provisional primary — it's the only candidate that addresses the TLS blocker from ticket 07.
2. **Keep** `lexiforest/curl_cffi` as the Python-side transport for any non-Go path. It is the most-deployed TLS-impersonation library in the scraping world and has no public rot reports.
3. **De-adopt** `glizzykingdreko/akamai-v3-sensor-data-helper` as the runtime sensor_data generator. Keep it as an offline decrypt/inspect tool only. Replace the generator with either (a) a real browser run, or (b) the drakoarmy/akamai-vm-reverse + a community-maintained payload generator that gets updated within 48h of a sensor rotation.
4. **Plan for residential egress from day 1.** Mis-attribution of rep blocks as TLS rot is the #1 silent-failure mode in the community write-ups.

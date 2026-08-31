# Ticket 09 — Phase-2 sensor recon verdict

**Date**: 2026-08-31
**Method**: raw `node:https` (Node v24.11.1), UA
`Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0`,
Accept-Encoding: identity (so body size is uncompressed).
**Raw bodies**: `tickets/09/raw/*.html` (6 files) + the two follow-up CDN
scripts (`akam-script.js`, `qlx-script.js`) pulled to inspect what each
`<script src>` actually executes.

---

## Sub-question 1 — Phase-2 WITHOUT cookies

| Endpoint | Status | Body len | Set-Cookie names |
|---|---|---|---|
| `www.thaiticketmajor.com/.../idol1st-kenty-asia-tour-2026-in-bangkok.html` | 200 | 63 029 | `HWWAFSESID`, `HWWAFSESTIME`, `PHPSESSID`, `ak_bmsc`, `bm_mi` |
| `booking.thaiticketmajor.com/.../zones.php?query=504` | 200 | **71** | `HWWAFSESID`, `HWWAFSESTIME`, `PHPSESSID` |
| `booking.thaiticketmajor.com/.../view.php?query=504` | **404** | 40 211 / 41 398 | `HWWAFSESID`, `HWWAFSESTIME`, `PHPSESSID` |

**Marker grep (case-insensitive, across the whole body):**

| Endpoint | `sensor_data` | `_abck` | `bm_sz` | `bm_mi` | `akamai` | `edgesuite` |
|---|---|---|---|---|---|---|
| homepage | 0 | 0 | 0 | 0 | 0 | 0 |
| zones | 0 | 0 | 0 | 0 | 0 | 0 |
| view | 0 | 0 | 0 | 0 | 0 | 0 |

`akam` (substring of `/akam/13/...`) hits 2× on the homepage only — that's
the Akamai WAF's own resource path, not the Bot Manager payload.

**Verdict:** **Phase-2 NOT deployed at any of the three endpoints.** Bodies
return full HTML or a 71-byte meta-refresh to `/user/signin.php`, with no
inline payload-generator stubs and no sensor-data blobs. The cookies
`ak_bmsc` and `bm_mi` are *server-set* on the homepage (Phase-1 bot
detection cookie, ~700 B, signed by Akamai) — those exist without ever
computing a `sensor_data`. They are not evidence of Phase-2 deployment.

**What IS deployed (for completeness):**
- `<script src="/akam/13/2308bce7" defer>` — Akamai *light sensor*
  (ambient-light-sensor probe), 26 686 B. Pulled to
  `raw/akam-script.js`. Confirmed obfuscated but contains no
  `sensor_data`, no telemetry hooks (`postMessage`/`XMLHttpRequest`/
  `fetch`/`navigator.webdriver`), no `var a=…; var b=…` payload stubs.
  This is the lightweight Akamai resource, not the heavy Phase-2 sensor.
- `<script src="/qlX7a_stS/.../dnRBUq" async defer>` — 104 238 B
  obfuscated blob. Pulled to `raw/qlx-script.js`. Grep confirms zero
  sensor / akamai / navigator / postMessage / XHR / fetch hits. Likely
  anti-fingerprint / ad-tech, not Akamai BM.

---

## Sub-question 2 — Phase-2 WITH cookies

**Cookie file state:** `C:/Users/bit-it.helpdesk/.bot-budcon-data/cookies.json`
exists (1 entry) but is a placeholder: `{"name":"PHPSESSID","value":"live",…}`.
**0 real cookies** (value length ≤ 4 or value == "live"). Per the ticket
instructions I still attached the header as `PHPSESSID=live` and re-fetched,
because (a) the parent agent may have meant "use whatever's there", and
(b) we want to observe whether TTM's response changes shape when ANY
cookie is attached. Recorded below as a partial data point, not a
faithful re-test.

| Endpoint | Status | Body len | Set-Cookie names |
|---|---|---|---|
| homepage | 200 | 63 029 (identical to no-cookie) | `HWWAFSESID`, `HWWAFSESTIME`, `ak_bmsc`, `bm_mi` (no PHPSESSID — kept server's) |
| zones | 200 | **71** (identical meta-refresh) | `HWWAFSESID`, `HWWAFSESTIME` only |
| view | **404** | 41 398 (≈1 KB larger than no-cookie) | `HWWAFSESID`, `HWWAFSESTIME` only |

**Marker grep (with-cookies):** identical to no-cookies — zero `sensor_data`,
zero `_abck`, zero `bm_sz`, zero `bm_mi` *in the body*. The `bm_mi` that
appears in `Set-Cookie` headers is a fresh ~700 B cookie the server
issues, not a computed `sensor_data` blob.

**`var a=…; var b=…; var c=…;` scan:** only hit is the GA inline tag
(`var f=...; var l=dataLayer;` ~80 chars) on homepage and view 404
page. No chunks anywhere approach the 30 KB threshold for a real
sensor_data blob. Largest single inline `var` value across all six
bodies: 80 chars.

**Verdict:** **Phase-2 NOT deployed at any of the three endpoints, with or without cookies.** A placeholder PHPSESSID="live" cookie yields the same body shape as no-cookie. To fully validate the post-login path the real `ttkname` session cookie would need to be present, but the response *sizes* don't change in a way consistent with Phase-2 challenge injection (they only grow by ~1 KB on the 404 page, which is consistent with a slightly different render path, not a sensor script).

---

## Sub-question 3 — Phase-2 challenge after login

**Status: SKIPPED per ticket instructions** (do not re-attempt interactive
login; parent agent has already observed that booking endpoints 302/110-
byte redirect to `/user/signin.php` after a real Firefox `PHPSESSID` is
set). The 71-byte meta-refresh on `/booking/3m/zones.php?query=504`
observed in sub-question 1 is consistent with that prior session
finding: even when TTM issues a server-side `PHPSESSID`, the booking
subdomain gates content on a separate `ttkname` auth cookie that the
Firefox session didn't get — so the probe redirects to signin before
ever reaching any post-login challenge surface.

**Verdict:** **Phase-2 NOT deployed (not testable yet, but no contradicting signal).** The redirect-to-signin happens at Phase-1 (HTTP-layer session check), so we never reach the page where a Phase-2 challenge would fire. To prove this conclusively we'd need a valid `ttkname` cookie; that requires a working interactive login, which is explicitly out of scope.

---

## Overall verdict

**No Phase-2 Akamai sensor challenge is deployed on any TTM endpoint we
can reach today.** The booking endpoints serve either a meta-refresh to
signin or a 404 page. The homepage serves Akamai's lightweight `/akam/13/`
resource (~26 KB, no telemetry) plus an unrelated 104 KB obfuscated
ad-tech blob. None of the bodies contain `sensor_data`, `_abck`,
payload-generator stubs, or telemetry hooks characteristic of Phase-2
Bot Manager.

**Implication for `bot_budcon`:** a sensor wrapper (jesterfoidchopped or
equivalent) is **NOT needed**. The watch loop's Phase-1 approach
(wreq-js + `ak_bmsc`/`bm_mi` cookies from a real Firefox login) is
sufficient. The remaining blocker is obtaining a valid `ttkname` session
cookie — which is an auth problem, not a sensor problem.

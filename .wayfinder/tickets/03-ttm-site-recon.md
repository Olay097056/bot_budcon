# Ticket 03 — TTM site recon

**Type**: research (AFK)
**Status**: open · unblocked · claim to start
**Label**: `wayfinder:research`

## Question

What does the live TTM stack actually look like right now? Specifically
which WAF fronts each subdomain, what HTML/JS does the booking page
return, and which selectors identify the round/zone/book controls?

## Sub-questions to answer

1. `GET https://www.thaiticketmajor.com/` — which WAF answers (Akamai
   edge via `errors.edgesuite.net`, HWWAF, none)?
2. `GET https://www.thaiticketmajor.com/concert/<slug>.html` — same.
3. `GET https://event.thaiticketmajor.com/user/signin.php` — same.
   In the previous session this subdomain returned a cert error to
   bot-spawn Firefox; re-verify.
4. `GET https://booking.thaiticketmajor.com/booking/3m/zones.php?query=<id>`
   — same. Capture the HTML (server-rendered vs SPA), and dump the
   selectors for `#fixed.php#<code>` and `#festival.php#<code>`
   anchors if present.
5. Capture `Set-Cookie` headers from each response and record which
   WAF cookie names appear (akamai / huawei / generic).

## Method

Use `node:https` + raw HTTP for the non-Firefox probes (avoid bot
detection by User-Agent alone). Save the responses under
`docs/recon/` so later tickets can reference them.

## Output format

A markdown file `docs/recon/ttm-stack.md` with one section per
sub-question, raw bytes summary (status, headers, body length),
and a verdict for each.

## Out of scope

- Anything requiring user interaction (login, captcha). Login is
  covered in ticket 04.
- Wre / Akamai sensor bypass. That is ticket 07.

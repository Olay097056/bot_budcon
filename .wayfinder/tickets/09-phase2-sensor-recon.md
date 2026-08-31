# Ticket 09 — Phase-2 sensor recon

**Type**: research (AFK)
**Status**: open · unblocked
**Label**: `wayfinder:research`

## Question

Does TTM actually deploy Akamai Bot Manager Phase-2 sensor
challenges on any of its real-world endpoints right now? We
already know Phase-1 (TLS + Akamai bot cookies) lands fine via
wreq-js, and `bot_budcon`'s watch loop works against the booking
subdomain using just the cookies from a Firefox login. The
remaining unknown is whether TTM additionally requires a
`sensor_data` payload computed by a real browser session — which
would force us to implement the sensor generator (the deferred
jesterfoidchopped Go wrapper) or fall back to manual intervention.

## Sub-questions to answer

1. With **no cookies at all**, fetch each of these endpoints via
   raw `node:https` and inspect the response body for the
   classic Phase-2 markers:
   - `https://www.thaiticketmajor.com/concert/<a-real-slug>.html`
   - `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504`
   - `https://booking.thaiticketmajor.com/booking/3m/view.php?query=504`
   Markers to grep for: `sensor_data`, `_abck`, `bm_sz`, `bm_mi`,
   inline `function() { … var a = …; return … }` payload-generator
   stubs, `akamai`/`edgesuite` script-src URLs.

2. With a **Firefox-login PHPSESSID + ttkname** (the path the
   watch loop currently uses), does the same set of endpoints
   ever return a 200 + a body that contains a `var a=…; var b=…;
   var c=…;` chunk where the value is bigger than a typical
   static cookie (i.e. a real sensor_data blob, ~30+ KB)?

3. **Phase-2 challenge after login** — once logged in, follow
   the purchase flow up to the payment page. Does the browser
   then receive a `bm_sz` cookie set or a `/<hash>/` script
   injection that runs a Wasm payload before letting you proceed?

## Method

A subagent (wayfinder research = parallel-OK) runs the probe,
saves raw responses under `tickets/09/raw/`, and writes a
markdown verdict at `tickets/09/phase2-recon.md`. We do **not**
install jesterfoidchopped yet — the research decides whether
that sunk cost is worth it.

## Output format

`tickets/09/phase2-recon.md` with three sections (one per
sub-question), each containing:
- the raw status code + body length,
- the marker grep result (hit / miss),
- a verdict sentence: `Phase-2 NOT deployed at <endpoint>` or
  `Phase-2 DEPLOYED — sensor wrapper needed`.

## Out of scope

- Actually writing a sensor wrapper (the answer to that question
  lands in a future ticket; this one only answers "do we need
  one?").
- Anything that violates TTM's terms of service.

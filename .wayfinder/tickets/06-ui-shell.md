# Ticket 06 — UI shell

**Type**: task (AFK)
**Status**: open · blocked by 01 · unblock when 01 closes
**Label**: `wayfinder:task`

## Question

What minimal Vite + plain-HTML dashboard lets the human start login,
start watch, and read state without touching a terminal?

## Required outcomes

- `src/server.ts` — `GET /`, `GET /api/status`, `POST /api/login/start`,
  `GET /api/login/status`, `POST /api/cmd` (body: `{ cmd: "watch"|"stop",
  args: string[] }`). No `/api/zones` yet — that is ticket 05.
- `ui/index.html` + a tiny bit of CSS + a single `<script>` that
  polls `/api/status` every 2s and renders a status dot, a Login
  button, and a Watch button.
- Vite config that bundles `ui/` and `src/server.ts` separately (we
  run the server via `tsx` directly — Vite is just for the dashboard
  bundle).

## Verification

`npm run ui` (which runs `tsx src/server.ts`) starts an HTTP server
on port 7890. `curl http://localhost:7890/api/status` returns JSON
with `chromeAlive`, `loggedIn`, `watchActive`. The dashboard loads
at `/`.

## Out of scope

- Wiring login flow end-to-end (the button posts to `/api/login/start`
  but the actual login task lives in 04).
- Wiring watch end-to-end (ticket 05).
- Auth / TLS on the dashboard (single-machine use only).

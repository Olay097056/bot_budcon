# Ticket 14 — Live login runbook (next session)

**Type**: task
**Status**: open · needs the human at the keyboard
**Label**: `wayfinder:task`

## Question

The Python invisible-browser bridge + Node subprocess wrapper
+ `/api/login/start` route are all wired and tested (commits
`6e54c9a`, `7c40029`, `61ce19b`). What is NOT yet verified is
the live happy path: the human opens the dashboard, clicks
the Login button, the C++-patched Firefox lands on the TTM
signin page without being blocked by Akamai, the human
completes the captcha + form submit, and the bridge picks
up `PHPSESSID` + `ttkname` from the cookie store.

## Pre-condition (next-session setup)

- The user has manually logged into TTM at least once before
  via their own Firefox (they know the captcha layout).
- Firefox 151 from invisible_playwright is downloaded. If
  zombie processes are running, kill them with
  `powershell "Get-Process firefox | %{ $_.Kill() }"`
  before starting the server (else the cache stays locked).
- No leftover `.tmp-firefox-*` directory in
  `%LOCALAPPDATA%\invisible-playwright\invisible-playwright\Cache\`.
  Delete it if present (240 MB re-download otherwise).

## Step-by-step runbook

1. Start the UI server:
   ```bash
   BOT_BUDCON_LOGIN_DRIVER=invisible npx tsx src/server.ts
   ```
   The `invisible` value is the default in this branch; the
   env var only matters to opt BACK into the original
   Playwright persistent Firefox path.

2. Open `http://localhost:7890` in any browser.

4. Click **🔓 Login (invisible)**. The dashboard action note
   says "starting login…", then "re-login in progress…" if
   you click it again while the bridge is running.

4. A C++-patched Firefox 151 launches headless. It opens
   `https://www.thaiticketmajor.com/user/signin.php`. The
   server log should show:
   ```
   [login] opening TTM sign-in page: https://www.thaiticketmajor.com/user/signin.php
   ```
   No `Access Denied` / `Reference #18.ad…` / edgesuite
   redirect.

5. **The human completes the captcha + submits the form** in
   the visible Firefox window. The bridge polls the cookie
   store every 2 s for up to 5 minutes. As cookies land,
   the Python script emits `{phase: 'new_cookies', names:
   [...]}`. Node's bridge prints:
   ```
   [smoke] invisible_playwright PASS (signin form rendered,
   no Akamai block)
   ```

6. When both `PHPSESSID` (session) and `ttkname` or
   `ttkemail` (auth) appear, the Python script emits
   `{phase: 'ok', cookies: [...]}`. The Node bridge parses
   the cookies and calls `saveCookies()` which writes them
   to `~/.bot-budcon-data/cookies.json`.

7. The dashboard's **Auth cookie gate** pill should turn
   🟢 green within a few seconds (the next `/api/auth/status`
   poll picks it up). If it stays red, hit the `🔁 Re-login`
   button to re-run the bridge.

## Verify (next session)

- `curl http://localhost:7890/api/auth/status` returns
  `"accept": true, "primary": "ttkname", "pill": "ok"`.
- `cat ~/.bot-budcon-data/cookies.json | jq '.[].name'`
  contains both `PHPSESSID` and `ttkname`.
- `npx tsx src/watch.ts` polls the chosen event's
  `zones.php?query=<x>` page every 5 s and prints the
  baseline / new-zone events as they land.

## Troubleshoot (in priority order)

1. **Pill stays red after 5 minutes** — the bridge timed
   out without seeing `ttkname`. The user either closed
   the Firefox window or the captcha was rejected. Hit
   `🔁 Re-login` to try again (single-flight enforced, so
   the in-flight `startLoginInvisible` is reused if
   still running).
2. **Server log shows "could not move the verified
   download into place"** — Firefox download was
   interrupted mid-run. Per the invisible_playwright error
   message, the verified download is left at the
   `.tmp-firefox-*` path. Move it manually:
   ```bash
   mv "$LOCALAPPDATA/invisible-playwright/invisible-playwright/Cache/.tmp-firefox-25-*" \
   "$LOCALAPPDATA/invisible-playwright/invisible-playwright/Cache/firefox-25_151.0_*"
   ```
3. **Zombie firefox.exe processes** — five `firefox.exe`
   entries in `tasklist` that reappear after each kill
   mean another invisible Firefox instance is being
   spawned by something. `powershell "Get-Process firefox |
   %{ $_.Kill() }"` is the only cure that worked in
   testing; `Stop-Process -Force` and `taskkill /F` are
   not sufficient.

## Why this is the last ticket before Phase 2 / #3

Phase 2 of the orchestrator's plan (real book click-through)
depends on a logged-in session. Without `ttkname` the gate
refuses every `book()` call. Once the live login runbook
above works end-to-end, #2 / #3 can run.
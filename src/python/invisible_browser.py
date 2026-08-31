"""
bot_budcon — invisible Playwright bridge (ticket 12 wiring).

Spawns the C++-patched Firefox 151 (invisible_playwright) with a
fresh fingerprint, navigates to the TTM sign-in URL on the root
domain, polls the browser cookie store for `ttkname` /
`ttkemail` / `tixid` (auth cookies) plus `PHPSESSID` (session)
for up to 5 minutes, then prints a JSON document on stdout:

    {"ok": true, "cookies": [{"name": "...", "value": "...", ...}]}
    {"ok": false, "reason": "timeout", "cookies": [...]}

The Node-side `src/login.ts` reads stdout and writes the cookies
to `~/.bot-budcon-data/cookies.json` so the rest of bot_budcon
(wreq-js, watch loop, book flow) can use them.

Why Python and not Node
-----------------------
`invisible_playwright` ships as a Python package (the patched
Firefox binary is hosted on PyPI). Calling it from Node requires
a subprocess bridge; we keep that boundary thin and inspectable.

Captcha + payment remain the human's job. This script only
opens the browser and persists whatever cookies it sees.
"""
import json
import sys
import time
from typing import Any

from invisible_playwright import InvisiblePlaywright

SIGNIN_URL = "https://www.thaiticketmajor.com/user/signin.php"
AUTH_NAMES = {"ttkname", "ttkemail", "tixid"}
SESSION_NAMES = {"PHPSESSID"}
POLL_INTERVAL_S = 2.0
TIMEOUT_S = 5 * 60  # 5 minutes — match LoginFlow default
MIN_REQUIRED = {"PHPSESSID"} | AUTH_NAMES  # need both kinds


def emit(payload: dict[str, Any]) -> None:
    """Print a single JSON line on stdout. Node reads one line per turn."""
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def cookie_to_dict(c: Any) -> dict[str, Any]:
    """Convert a Playwright Cookie into the StoredCookie shape used
    by bot_budcon's cookies module (Unix SECONDS for expiry)."""
    expires = getattr(c, "expires", None)
    if expires is None or expires < 0:
        expires = -1
    elif expires > 1e12:  # Firefox sometimes reports milliseconds
        expires = int(expires / 1000)
    return {
        "name": c["name"] if isinstance(c, dict) else c.name,
        "value": c["value"] if isinstance(c, dict) else c.value,
        "domain": c["domain"] if isinstance(c, dict) else c.domain,
        "path": (c["path"] if isinstance(c, dict) else c.path) or "/",
        "secure": bool(c["secure"] if isinstance(c, dict) else c.secure),
        "httpOnly": bool(c["httpOnly"] if isinstance(c, dict) else c.httpOnly),
        "expires": int(expires),
    }


def main() -> int:
    emit({"phase": "starting", "url": SIGNIN_URL})
    deadline = time.monotonic() + TIMEOUT_S
    try:
        with InvisiblePlaywright(headless=True) as browser:
            ctx = browser.new_context()
            page = ctx.new_page()
            emit({"phase": "navigating"})
            try:
                page.goto(SIGNIN_URL, timeout=30_000)
            except Exception as e:  # noqa: BLE001
                emit({"phase": "navigate_failed", "error": str(e)})
            # Poll cookies — the human completes the captcha in
            # this browser window while we wait.
            last_emit = 0.0
            seen_names: set[str] = set()
            while time.monotonic() < deadline:
                time.sleep(POLL_INTERVAL_S)
                try:
                    raw_cookies = ctx.cookies()
                except Exception as e:  # noqa: BLE001
                    emit({"phase": "cookies_error", "error": str(e)})
                    continue
                cookies = [cookie_to_dict(c) for c in raw_cookies]
                names = {c["name"] for c in cookies}
                # Heartbeat every 10 s so the Node side can see
                # we are alive even when no new cookies have
                # landed yet.
                now = time.monotonic()
                if now - last_emit > 10:
                    emit(
                        {
                            "phase": "polling",
                            "have_session": bool(names & SESSION_NAMES),
                            "have_auth": bool(names & AUTH_NAMES),
                            "elapsed_s": int(TIMEOUT_S - (deadline - now)),
                        }
                    )
                    last_emit = now
                # Detect progress for the Node-side log.
                new = names - seen_names
                if new:
                    emit({"phase": "new_cookies", "names": sorted(new)})
                    seen_names = names
                if MIN_REQUIRED.issubset(names):
                    emit({"phase": "ok", "cookies": cookies})
                    return 0
            emit({"phase": "timeout", "cookies": [cookie_to_dict(c) for c in raw_cookies] if 'raw_cookies' in locals() else []})
            return 1
    except Exception as e:  # noqa: BLE001
        emit({"phase": "fatal", "error": str(e)})
        return 2


if __name__ == "__main__":
    sys.exit(main())
"""
bot_budcon — TTM event probe (ticket 12 follow-up).

For each known on-sale event (idol1st, lany, joji, babymonster,
dreaming), launch the invisible Firefox, log in to TTM, navigate
to the concert page, and report:
  - HTTP status
  - whether the page contains a `class="btn-buynow"` button
  - whether the page contains a "sold out" indicator
  - body length

The probe is read-only — no purchase attempt. It just confirms
which targets the bot can reach after the invisible login flow
runs. Use the result to pick which `BOT_BUDCON_TARGET` value
the watch loop should monitor.
"""
import json
import sys
import time

from invisible_playwright import InvisiblePlaywright

# Targets mirror src/config.ts. Keep this in sync with the TS
# config; if you add a new event there, also add it here. This
# file is intentionally a flat dict — the Python bridge reads
# it once at probe time, never during a hot path.
SIGNIN_URL = "https://www.thaiticketmajor.com/user/signin.php"
TARGETS = {
    "idol1st": "idol1st-kenty-asia-tour-2026-in-bangkok",
    "lany": "lany-soft-world-tour-bangkok",
    "joji": "joji-solaris-tour-2026",
    "babymonster": "2026-27-babymonster-world-tour-choom-in-bangkok",
    "dreaming": "dreaming-tomohisa-yamashita-tour-2026-live-in-bangkok",
}


def main() -> int:
    with InvisiblePlaywright(headless=True) as browser:
        ctx = browser.new_context()
        page = ctx.new_page()
        try:
            page.goto(SIGNIN_URL, timeout=30_000)
        except Exception as e:
            print(json.dumps({"phase": "navigate_failed", "error": str(e)}))
            return 1
        # Give the human or any persisted cookie session time to
        # land. In an unattended run we cannot complete the
        # captcha; the script is a dry-run. If you want a real
        # login before this probe, run the UI server first.
        time.sleep(3)
        results = []
        for key, event_slug in TARGETS.items():
            url = f"https://www.thaiticketmajor.com/concert/{event_slug}.html"
            try:
                resp = page.goto(url, timeout=30_000)
                status = resp.status if resp else -1
                body = page.content()
                results.append(
                    {
                        "key": key,
                        "url": url,
                        "status": status,
                        "body_len": len(body),
                        "has_buy_now": "btn-buynow" in body,
                        "has_sold_out": "sold-out" in body or "sold out" in body.lower(),
                    }
                )
            except Exception as e:
                results.append({"key": key, "url": url, "error": str(e)})
        print(json.dumps({"phase": "probe_complete", "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
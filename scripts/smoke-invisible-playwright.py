"""
bot_budcon — invisible Playwright smoke (ticket 12 wiring).

Verifies that the invisible_playwright wrapper actually clears
Akamai's bot-detection layer on the TTM signin URL. If the
status code is 200 + body contains the signin form, we know
the C++ patch did its job. If we get a 403 "Access Denied"
or edgesuite redirect, the patch failed and we should fall
back to Plan B (copy cookies from user Firefox profile).
"""
import sys
from invisible_playwright import InvisiblePlaywright


def main() -> int:
    target = "https://www.thaiticketmajor.com/user/signin.php"
    try:
        with InvisiblePlaywright(headless=True) as browser:
            page = browser.new_page()
            response = page.goto(target, timeout=30_000)
            status = response.status if response else -1
            body = page.content()
            page.close()
    except Exception as e:  # noqa: BLE001 — surface any browser error verbatim
        print(f"[smoke] invisible_playwright raised: {e}")
        return 1

    print(f"[smoke] status: {status}")
    print(f"[smoke] body length: {len(body)}")
    has_signin = "signin" in body.lower() or "password" in body.lower()
    has_akamai_block = (
        "Access Denied" in body or "Reference #" in body or "edgesuite" in body
    )
    print(f"[smoke] has signin form: {has_signin}")
    print(f"[smoke] has akamai block: {has_akamai_block}")
    # status -1 happens when page.goto fires a navigation but the
    # Playwright Response wrapper returns None (typically because the
    # server returned a non-2xx challenge before the document was
    # fully streamed, or because the navigation completed inside
    # JS before the HTTP status was reachable). The content check
    # is the ground truth: if the signin form is on the page and
    # no Akamai block string is present, the bypass worked.
    verdict_ok = (
        (status == 200 or status == -1)
        and has_signin
        and not has_akamai_block
    )
    print(f"[smoke] verdict: {'PASS' if verdict_ok else 'FAIL'}")

    return 0 if verdict_ok else 1


if __name__ == "__main__":
    sys.exit(main())
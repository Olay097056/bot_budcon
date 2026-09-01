# Ticket 21 — Self-hosted runner one-click without token friction

**Type**: research
**Status**: open
**Label**: `wayfinder:research`
**Depends**: 20

## Question

Q2=C wants GitHub Actions to be realtime-capable for free, but Q4=A forbids asking the user for a token every time. Research how `scripts/setup-selfhosted-runner.bat` (a7ca5dd) can become truly one-click: can `gh CLI` (`gh api` / `gh auth`) fetch the registration token automatically, can the runner be registered as a service without admin prompts, and what is the minimal one-time step the docs must show. If `gh` is not installed, what is the fallback (single paste of token, then never again). Outcome is a yes/no on "can we hide the token" plus the exact command the next ticket will implement.

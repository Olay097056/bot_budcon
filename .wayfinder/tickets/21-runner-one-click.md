# Ticket 21 — Self-hosted runner one-click without token friction

**Type**: research
**Status**: closed — resolved 2026-09-01
**Label**: `wayfinder:research`
**Depends**: 20

## Question

Q2=C wants GitHub Actions to be realtime-capable for free, but Q4=A forbids asking the user for a token every time. Research how `scripts/setup-selfhosted-runner.bat` (a7ca5dd) can become truly one-click: can `gh CLI` (`gh api` / `gh auth`) fetch the registration token automatically, can the runner be registered as a service without admin prompts, and what is the minimal one-time step the docs must show. If `gh` is not installed, what is the fallback (single paste of token, then never again). Outcome is a yes/no on "can we hide the token" plus the exact command the next ticket will implement.

## Answer

**YES — the token can be fully hidden.** Verified live on this machine:

```
gh api -X POST repos/Olay097056/bot_budcon/actions/runners/registration-token
→ {"token":"CF3H…","expires_at":"2026-09-02T09:28:44.544+07:00"}
```

Key findings:
- The endpoint is a **POST**, not GET (`gh api` without `-X POST` 404s — that was the trap).
- The existing `gh` OAuth session (`gho_…` with `repo` scope) **can mint registration tokens** for repos the user administers — no `admin:org` needed (that's org-level only; repo-level works with plain `repo`).
- Token expires in **1 hour** and is single-use-ish — perfect for "mint at setup time, use immediately, never store".
- Service install (`--runAsService`) still needs **one admin PowerShell** — that stays a documented optional step, not part of the default flow.

**Shipped** (both scripts rewritten):
- `scripts/setup-selfhosted-runner.bat` — requires only `gh` installed + `gh auth login` once; fetches token itself, downloads runner binary (skips re-download when `config.cmd` exists), configures `--unattended --replace`, starts `run.cmd`.
- `scripts/setup-selfhosted-runner.ps1` — same flow with better errors.

**The one-time prerequisite** (unavoidable, not ours to automate): install `gh` + `gh auth login`. After that, the runner setup is double-click → answer two optional prompts (name/labels) → `Listening for Jobs`. Token never appears on screen, never pasted, never stored.

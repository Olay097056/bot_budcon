# Ticket 13 — Go cleanup

**Type**: task
**Status**: SHIPPED · commit `pending`
**Label**: `wayfinder:chore`

## Question

`wre` (the Rust TLS-bypass toolkit) turned out to be the wrong
fit for TTM (Phase-1 is enough; Phase-2 is not deployed; see
ticket 09). We installed Go 1.26.7 + 1 GB of build artefacts
on the way to that conclusion. Reclaim the disk.

## Subtasks

1. `Stop-Process` any `cargo` / `wre` / `wred` background jobs.
2. `Remove-Item -Recurse "C:\:\Program Files\Go"` (the Go
   toolchain).
3. `Remove-Item -Recurse "$HOME\go"` (`GOPATH`, ~1 GB of
   module caches).
4. Optional: `Remove-Item -Recurse` the wre source tree at
   `Desktop\claude\proofofbots-web-re-toolkit` — only after
   the user confirms the bot_budcon public repo no longer
   references it.
5. Verify disk with `Get-PSDrive C | Select-Object Used,Free`.

## Why we kept it around

The wre workspace was a 1.5-2.5 hour build, and we wanted to
revisit the Phase-2 question with fresh eyes before deleting it.
That question is now answered (ticket 09). The artefacts are
dead weight.
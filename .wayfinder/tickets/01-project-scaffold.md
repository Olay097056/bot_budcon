# Ticket 01 — Project scaffold

**Type**: task (AFK)
**Status**: open · unblocked · claim to start
**Label**: `wayfinder:task`

## Question

What is the minimal Node + TypeScript + Playwright + Vite project
shape that lets us drop in ticket 02 (bot engine) and ticket 06 (UI
shell) without further restructuring?

## Required outcomes

- `package.json` with scripts (`dev`, `test`, `build`, `start`),
  `tsx`, `typescript`, `@playwright/test`, `vite`, `vitest`.
- `tsconfig.json` (strict, ESM, `moduleResolution: bundler`).
- `playwright.config.ts` with Firefox-only (TTM target verified by
  hand in the previous session; no Chromium needed).
- `vitest.config.ts` (we will run pure unit tests separately from
  Playwright e2e).
- `src/config.ts` — env-driven `config.paths.*` (cookies, profile,
  log) following the pattern that worked in the previous session.
- `README.md` — one paragraph: what this bot does, how to run it.
- `.gitignore` — ignore `cookies.json`, `.ttm-data/`, `node_modules/`,
  `test-results/`, `playwright-report/`.
- Empty `src/` with `index.ts` that throws "not implemented yet".

## Verification

`npm install` succeeds, `npx tsc --noEmit` passes, `npx vitest run`
prints "No test files found" but exits 0.

## Out of scope

- Bot engine, login flow, watch loop, UI components, wre integration,
  Akamai/HWWAF probes. These live in later tickets and must NOT be
  in this scaffold.

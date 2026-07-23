# Vercel Preview Failures From MLB X State Branch

Date: 2026-07-23

Branch: `fix/vercel-automation-preview-builds`

## Finding

Recent failed Vercel Preview deployments from `automation/mlb-x-state` were not normal application builds. The failed commit `ad877b79f0df59b18233e23a5f6ed0bd07c82b0f` is on an orphan state branch whose tree contains only MLB X state files:

- `mlb-x/2026-07-22/diagnostics/hr-confirmed.json`
- `mlb-x/2026-07-22/diagnostics/hr-morning.json`
- `mlb-x/2026-07-22/diagnostics/k-confirmed.json`
- `mlb-x/2026-07-22/diagnostics/k-morning.json`
- `mlb-x/2026-07-23/diagnostics/hr-confirmed.json`
- `mlb-x/2026-07-23/diagnostics/hr-morning.json`
- `mlb-x/2026-07-23/diagnostics/k-confirmed.json`
- `mlb-x/2026-07-23/diagnostics/k-morning.json`

It does not contain:

- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `src/`
- `public/`
- `vercel.json`

`origin/main` does contain the complete Vite application tree, including `package.json`, `package-lock.json`, `vite.config.ts`, `src/main.tsx`, and repository-controlled `vercel.json`.

## Root Cause

`automation/mlb-x-state` is intentionally a state-only orphan branch used by the MLB X publication receipt/diagnostic store. Vercel still attempted a Preview deployment for those commits.

Because the failed state branch commit did not contain `package.json`, Vercel had no project package metadata to install from. Because the failed commit also did not contain `vercel.json`, the repository-controlled ignored-build step from `main` could not run. Vercel then executed the configured build command `vite build`; with no dependency install and no local `node_modules/.bin/vite`, the shell failed with:

`sh: line 1: vite: command not found`

`[skip ci]` in the state commit message prevents GitHub Actions workflows that honor it, but it does not automatically suppress Vercel deployments.

## Why Main Was Unaffected

Successful `main` deployments clone the full application tree. `main` has:

- `package.json`
- `package-lock.json`
- `vite` declared in `devDependencies`
- `vite.config.ts`
- `src/`
- `public/`
- `vercel.json`

That gives Vercel a normal npm project to install and build.

## Fix

Future MLB X state commits now include a tiny state-branch-only `vercel.json` at the root of `automation/mlb-x-state`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "node -e \"process.exit((process.env.VERCEL_GIT_COMMIT_REF||'')==='automation/mlb-x-state'?0:1)\""
}
```

This config is written only by `scripts/lib/mlb-x-state-store.mjs` into the dedicated state worktree. It is committed alongside future receipt or diagnostic state files. It does not change the application `vercel.json` on normal branches.

The ignored-build rule is deliberately narrow:

- Skip: `automation/mlb-x-state`
- Do not skip: `main`
- Do not skip: normal feature branches

## Remaining Operational Note

Existing already-failed state commits cannot be retroactively fixed. The next real MLB X state transition after this change lands on `main` will add the state-branch `vercel.json`, and subsequent Vercel Preview attempts for that branch should be skipped before install/build.

If Vercel has a dashboard-level Ignored Build Step configured, it should not conflict with this repository fix. If Vercel has a dashboard-level Build Command of `vite build`, normal app branches can still build because their dependency install provides `node_modules/.bin/vite`; however, the project setting should preferably use `npm run build` for clarity.

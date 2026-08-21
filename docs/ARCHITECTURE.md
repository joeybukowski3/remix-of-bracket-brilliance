# Architecture

## System overview

JoeKnowsBall is a Vite-built React single-page application with a collection of serverless API handlers and repository-run data pipelines.

The browser application starts at `src/main.tsx`, which mounts `src/App.tsx`. `App.tsx` owns top-level providers and React Router routes. Route views live primarily in `src/pages/`; shared layouts and sport-specific UI live in `src/components/`. Hooks orchestrate loading and derived state, while `src/lib/` holds reusable domain logic, schemas, adapters, and model-support code.

This overview describes boundaries. Subject to the authority hierarchy in `docs/DECISIONS.md`, current relevant model documentation owns formulas, weights, thresholds, calibration, and interpretation.

## Runtime layers

### Browser application

- `src/pages/` contains route-level views.
- `src/components/` contains shared UI, layouts, and sport-specific presentation.
- `src/features/` contains feature-owned modules where a feature has been isolated from general components.
- `src/hooks/` handles client-side loading and orchestration.
- `src/lib/` contains shared logic grouped partly by sport (`mlb`, `nfl`, `pga`, `cfb`, `fantasy`, `wc`) and cross-cutting concerns such as SEO.
- `src/data/` contains checked-in TypeScript data used directly by the application.
- `src/integrations/supabase/` contains the browser Supabase client and generated database types.

The `@/` alias resolves to `src/`. Vite serves local development on port `8080` and writes production build output to `dist/`.

### Server-side handlers

`api/` contains TypeScript serverless endpoints for bracket data and synchronization, odds, selected MLB and NFL services, cron dispatch, and supporting authentication/data access. Shared server-only helpers live under `api/_lib/`.

Handlers may depend on environment-provided credentials or service configuration. Environment contracts and external calls are production-sensitive.

### Data and pipelines

The repository contains both data inputs and generated outputs:

- `scripts/` contains sport-specific fetchers, normalizers, generators, validators, graders, audits, social publishing, and SEO tooling.
- `data/` contains raw or cached source material, research inputs, backtest material, and generated analytical files.
- `data/generated/` is an explicit generated-output area.
- `public/data/` contains browser-consumed artifacts produced by multiple sports pipelines.
- `src/data/` also contains maintained application data modules; do not assume it is generated.
- `dist/` is build output.

Generated ownership is not uniform. For example, existing NFL documentation identifies `public/data/nfl/teams.json` as hand-curated even though it is inside a generally generated area.

Many scripts can fetch external data, update tracked artifacts, grade results, publish social content, send email, or synchronize state.

## Automation

`.github/workflows/` contains scheduled and manually dispatched pipelines for MLB, PGA, NFL, odds tracking, tests, publishing, and data synchronization. Some workflows write generated artifacts or communicate with external services.

The workflows are part of the production system even when their outputs are committed back to the repository rather than served directly.

## Deployment ambiguity

Repository evidence does not establish one unambiguous deployment authority:

- `vercel.json` configures `dist` output, redirects, rewrites, cache headers, and branch/build-ignore behavior. Existing documentation also discusses Vercel preview builds.
- `.github/workflows/deploy.yml` is active on pushes to `main`, builds `dist`, and deploys it through GitHub Pages.

This proves that both deployment mechanisms are configured in the repository. It does not prove that both currently serve production traffic or identify which one is authoritative for `www.joeknowsball.com`.

Operating and conflict-resolution rules for these boundaries are defined in `AGENTS.md` and `docs/DECISIONS.md`.

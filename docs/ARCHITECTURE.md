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

The repository contains both data inputs and generated outputs.

### Layers

- `scripts/` contains sport-specific fetchers, normalizers, generators, validators, graders, audits, social publishing, and SEO tooling. Shared script helpers live under `scripts/lib/`.
- `data/` contains raw or cached source material, research inputs, backtest material, and generated analytical files.
- `data/generated/` is an explicit generated-output area (currently CFB only).
- `public/data/` contains browser-consumed artifacts produced by multiple sports pipelines.
- `src/data/` also contains maintained application data modules; do not assume it is generated.
- `dist/` is build output.

### Source and cache areas (not browser-served)

- `data/nfl/nflverse/` holds byte-verified compact caches derived from nflverse and nflfastR releases: `stats-team-week`, `stats-player-week`, `play-by-play`-derived `epa-team-game` and `play-volume-team-game`, `injuries`, `snap-counts`, `weekly-rosters`, `players`, `depth-charts`, `performance-team-game`. Each directory carries a `manifest.json` with source URL, retrieval date, byte size, sha256, and row/column provenance. Raw play-by-play is streamed and discarded, never committed.
- `data/nfl/props/` holds the NFL yardage-prop research datasets (historical outcomes, pregame features, per-market baseline-competition outputs, player-game universe, matchup-score research).
- `data/nfl/{research,benchmark}/` hold NFL research datasets and offline benchmark inputs used only by tests.
- `data/fantasy/` holds fantasy inputs and research outputs: the workbook-sourced draft list, FantasyPros ADP, PAR consensus, points-allowed, Rest-of-Season research (`data/fantasy/ros-research/`), and the Sleeper draft-board source and draft-preview corrections (`data/fantasy/draft-preview/`, `data/fantasy/source/`).
- `data/cfb/research/` is the (gitignored) CFB Model V2 research corpus; `data/cfb/cfbd/raw/` is the CFBD raw cache; `data/cfb/v2-support/` holds V2 support inputs.
- MLB has no top-level `data/` subtree; its caches live under `public/data/mlb/` alongside the browser artifacts, plus a gitignored `artifacts/` directory for diagnostics.

### Browser-served generated artifacts (`public/data/`)

- `public/data/nfl/` — season-keyed directories (`2020`–`2026`) with schedules/results, team stats, and multiple power-rating and projection artifacts; plus season-agnostic matchup artifacts (`matchup-epa`, `matchup-injuries`, `matchup-market`, `matchup-metrics`, `matchup-production-allowed`, `matchup-projections`, `matchup-success-rates`, `matchup-trench-metrics`, `nfl-yardage-market`) and hand-curated `teams.json`.
- `public/data/fantasy/` — `weekly/<season>/`, `projections/<season>/`, and `weekly-research/<season>/` static artifacts consumed by the fantasy pages.
- `public/data/cfb/v2/shadow-projections.json` — a read-only CFB Model V2 shadow artifact that no application view currently renders.
- `public/data/mlb/` — HR/K/moneyline props, prediction-history archives, model-performance summaries, odds, numerology, percentiles, and reference ranges.
- `public/data/pga/`, `public/data/betting-splits/`, `public/data/polymarket/` — PGA pipeline output, public betting-splits history, and Polymarket odds snapshots.

Generated ownership is not uniform. For example, existing NFL documentation identifies `public/data/nfl/teams.json` as hand-curated even though it is inside a generally generated area, and `src/data/cfb/season2026/*` are maintained TypeScript modules that import build-time CFB artifacts.

Many scripts can fetch external data, update tracked artifacts, grade results, publish social content, send email, or synchronize state. `docs/DATA_SOURCES.md` is the source registry for what external providers each pipeline uses.

### Code-resident durable documentation

Some durable architecture currently lives next to the code rather than in `docs/`:

- `src/lib/fantasy/weekly/README.md` — weekly fantasy input authority, scoring freeze, leakage policy, and backtest boundaries.
- `src/lib/nfl/props/README.md` — the NFL yardage-prop system's phase-by-phase architecture and leakage contract.

These remain authoritative for their subsystems until superseded by `docs/models/` or `docs/features/` files in a later pass.

## Automation

`.github/workflows/` contains scheduled and manually dispatched pipelines for MLB, PGA, NFL, CFB, odds tracking, tests, publishing, and data synchronization. Some workflows write generated artifacts or communicate with external services.

The workflows are part of the production system even when their outputs are committed back to the repository rather than served directly.

`deploy.yml` accepts a `workflow_call` entry point with an explicit `ref` input in addition to its `push` trigger on `main`. `cfb-v2-shadow-refresh.yml` uses this: after it commits a refreshed `public/data/cfb/v2/shadow-projections.json`, it calls `deploy.yml` for that exact commit. This adds a workflow-to-workflow deployment path but does not resolve which deployment mechanism is authoritative for production (see below and `OPEN-001` in `docs/DECISIONS.md`).

## Deployment ambiguity

Repository evidence does not establish one unambiguous deployment authority:

- `vercel.json` configures `dist` output, redirects, rewrites, cache headers, and branch/build-ignore behavior. Existing documentation also discusses Vercel preview builds.
- `.github/workflows/deploy.yml` is active on pushes to `main`, builds `dist`, and deploys it through GitHub Pages.

This proves that both deployment mechanisms are configured in the repository. It does not prove that both currently serve production traffic or identify which one is authoritative for `www.joeknowsball.com`.

Operating and conflict-resolution rules for these boundaries are defined in `AGENTS.md` and `docs/DECISIONS.md`.

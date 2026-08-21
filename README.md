# JoeKnowsBall

JoeKnowsBall is a free sports-research web application for model-informed rankings, matchups, props, picks, fantasy analysis, and data-driven decision support. The repository contains the public React application, serverless API handlers, sports-data pipelines, model support code, and automated tests.

## Product areas

- MLB game, home-run, strikeout, batter-versus-pitcher, power-ranking, and experimental research tools
- PGA tournament models, rankings, picks, best bets, history, and custom/DFS workflows
- NFL schedules, matchup analysis, power ratings, team guides, analytics, futures, and weekly command-center views
- Fantasy football rankings and points-allowed research
- NCAA basketball schedules, matchups, bracket, and betting-edge views
- College-football rankings, schedules, teams, matchups, and conference views
- World Cup, public-odds, and additional research experiences

## Stack

- React 18, TypeScript, Vite, and React Router
- Tailwind CSS with Shadcn/ui and Radix component patterns
- TanStack React Query for client-side data orchestration
- Supabase integration and serverless handlers under `api/`
- Vitest and Playwright for automated testing

## Local setup

Requirements: Node.js and npm. The repository currently declares npm 10 in `package.json`.

```sh
npm ci
npm run dev
```

The Vite development server is configured on port `8080`. Some connected features and data-generation scripts require service-specific environment variables; do not assume `.env.example` configures every integration.

Useful commands:

```sh
npm test
npm run lint
npm run build
```

See [docs/TESTING.md](docs/TESTING.md) before browser automation or pipeline-specific validation.

## Repository layout

- `src/pages/` — route-level application views
- `src/components/` — shared and sport-specific React components
- `src/hooks/` — data-loading and orchestration hooks
- `src/lib/` — shared utilities, sports-domain logic, and model support
- `src/features/` — feature-owned application modules
- `api/` — serverless API handlers and supporting server code
- `scripts/` — ingestion, generation, validation, grading, and publishing tools
- `data/` — source caches, research inputs, and generated analytical artifacts
- `public/data/` — browser-consumed data artifacts
- `tests/` and colocated `*.test.*` files — Playwright, Vitest, and script tests
- `docs/` — durable context plus historical feature, model, audit, and migration records

## Generated-data warning

Most files under `public/data/`, `data/generated/`, and `dist/` are produced by repository tooling. Consult the owning pipeline documentation before changing them.

## Repository guidance

- [AGENTS.md](AGENTS.md) — authority, safety, and task-routing rules
- [docs/PROJECT.md](docs/PROJECT.md) — durable project context
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system and data-flow overview
- [docs/TESTING.md](docs/TESTING.md) — validation guidance
- [docs/DECISIONS.md](docs/DECISIONS.md) — durable decision registry

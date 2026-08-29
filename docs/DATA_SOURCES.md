# Data sources

A registry of the external and internal data sources the committed repository
uses. It records **where data comes from and how it is refreshed**, not model
methodology. Formulas, weights, and calibration belong in future `docs/models/`
files and the existing research documents.

Conventions used below:

- **Access** — public/unauthenticated, keyed free tier, paid, or internal/manual.
- **Producer** — the script(s) that fetch or build from the source.
- **Cache / artifact** — where the data lands in the repo.
- **Consumers** — what reads the generated artifact.
- **Refresh** — workflow or manual command.
- **Fallback** — high-level behavior when the source is unavailable.

Repository-wide notes:

- The **free-first mandate is NFL-pipeline-specific** (`docs/nfl-data-inventory.md`):
  no paid vendors, no paid The Odds API usage, no player-props products for the
  NFL matchup/model pipeline. It is **not** a repository-wide rule — MLB, PGA,
  and some NFL prop-market ingestion use paid or keyed APIs. See the unresolved
  note under "NFL player-prop market".
- Generated artifacts are changed through their producers (`KS-005`).
- Most fetch scripts validate the response, then write via a temp file + atomic
  rename, so a failed fetch leaves the previous known-good artifact untouched.
- Secrets are read from the process environment / CI secrets only and are never
  written to committed files.

---

## NFL — nflverse / nflfastR

| Field | Value |
|---|---|
| Provider | nflverse (`github.com/nflverse`), including nflfastR-derived play-by-play |
| Purpose | Schedules, results, historical market lines, team & player weekly stats, EPA/play-volume, injuries, rosters, snap counts, player identity crosswalk, depth charts |
| Access | Public, unauthenticated (GitHub release assets + `raw.githubusercontent.com`) |
| Producers | `scripts/lib/nfl-schedules-results-core.mjs` (`nfl:schedules`); `scripts/refresh-nfl-*-source-cache.mjs` (`nfl:team-ratings`, `nfl:epa-cache`, `nfl:play-volume-cache`, `nfl:injury-cache`, `nfl:weekly-roster-cache`, `nfl:depth-chart-cache`); `scripts/refresh-fantasy-player-week-source-cache.mjs` (`fantasy:player-week-cache`); shared helper `scripts/lib/nfl-source-cache.mjs` |
| Cache | `data/nfl/nflverse/{stats-team-week,stats-player-week,epa-team-game,play-volume-team-game,injuries,weekly-rosters,players,snap-counts,depth-charts,performance-team-game}/` — each with a `manifest.json` recording source URL, retrieval date, byte size, sha256, and row/column provenance. Raw play-by-play is streamed and discarded (never committed; `rawPlayByPlayCommitted: false`). |
| Consumers | `public/data/nfl/<season>/{games,results,team-stats,power-ratings,...}.json`; `public/data/nfl/matchup-{epa,injuries,market,metrics,production-allowed,success-rates}.json`; the fantasy weekly/projection artifacts; the NFL yardage-prop research datasets under `data/nfl/props/` |
| Refresh | Workflows `nfl-schedules-results.yml`, `nfl-team-ratings.yml`, `nfl-matchup-market.yml`, `nfl-performance-analytics.yml`; plus manual `npm run nfl:*` commands |
| Fallback | A 404 for a season not yet published is treated as "not yet published", distinct from a failure; the existing cache is never removed or rewritten. Preseason / zero-completed-game states are expected, not errors. |
| Fragility / caveats | Windows `core.autocrlf=true` can corrupt committed CSV caches vs. `manifest.json`; `.gitattributes` (`-text`) guards this and re-normalized caches must not be committed. Two EPA definitions coexist deliberately (nflfastR play-by-play vs. legacy `stats_team_week`). |
| Pointers | `docs/nfl-data-inventory.md`, `docs/nfl-matchup-analyzer-redesign-spec.md` §20–§27, `docs/nfl-play-by-play-audit.md`, `src/lib/nfl/props/README.md` |

## NFL — RBSDM (success rate)

| Field | Value |
|---|---|
| Provider | RBSDM (Ben Baldwin, `rbsdm.com`), built on nflfastR |
| Purpose | Team offensive/defensive pass & rush success rate for the matchup analyzer |
| Access | Public; `POST https://rbsdm.com/api/team-tiers` only (GET returns 405). Undocumented, unversioned, currently served by a Vite dev server. |
| Producer | `scripts/generate-nfl-rbsdm-success-rates.mjs` (`nfl:success-rates`) |
| Artifact | `public/data/nfl/matchup-success-rates.json` |
| Consumers | NFL Matchup Analyzer success-rate rows |
| Refresh | Manual `npm run nfl:success-rates` (`--dry-run`, `--offline=<dir>`) |
| Fallback | Independent failure domain; a missing/malformed artifact leaves only the six success-rate rows at N/A. Periods are never blended (no denominator published). |
| Fragility | Undocumented third-party API; schema/payload could change without notice. Schema-validated on generation, soft-fails at runtime. |
| Pointers | `docs/nfl-matchup-analyzer-redesign-spec.md` §21 |

## NFL — ESPN Analytics / NFL Next Gen Stats (trench win rates)

| Field | Value |
|---|---|
| Provider | ESPN Analytics (`now.core.api.espn.com`), tracking data from NFL Next Gen Stats |
| Purpose | PBWR / RBWR / PRWR / RSWR team win rates and ESPN's official ranks |
| Access | Public, unauthenticated (`?enable=inlines` required). Other ESPN hosts (`www.espn.com`, `secure.espn.com`, `cdn.espn.com`) return an AWS WAF challenge and are never requested. |
| Producer | `scripts/generate-nfl-espn-trench-metrics.mjs` (`nfl:trench-metrics`) |
| Artifact | `public/data/nfl/matchup-trench-metrics.json` |
| Consumers | NFL Matchup Analyzer Trenches section |
| Refresh | Manual `npm run nfl:trench-metrics` (`--article=<season>:<id>`, `--offline=<dir>`) |
| Fallback | Independent failure domain; a missing artifact leaves the Trenches section at N/A. Season-to-date only — never wired to the Season / Last 5 controls. |
| Fragility | Article ID changes every season (discovered via ESPN search API, with known historical IDs as last-resort fixtures); module located by a headline string ESPN could rename; `enable=inlines` is undocumented. |
| Pointers | `docs/nfl-matchup-analyzer-redesign-spec.md` §22 |

## NFL — game-level market (spread / total / moneyline)

| Field | Value |
|---|---|
| Provider | nflverse `nfldata/games.csv` market columns (`raw.githubusercontent.com/nflverse/nfldata`) |
| Purpose | Historical settled market lines + the current game's line for the Matchup Analyzer market profile and the "Model vs Market" comparison |
| Access | Public, unauthenticated. **The Odds API is not used here** (free-first mandate). One line per game, no book named, no per-row timestamp. |
| Producer | `scripts/generate-nfl-matchup-market.mjs` (`nfl:matchup-market`), reusing the schedules pipeline's source URL and parser |
| Artifact | `public/data/nfl/matchup-market.json` |
| Consumers | Matchup Analyzer market profile + current-market blocks; `src/lib/nfl/projectionData.ts` joins the current line to a projection **only in the consumer layer** (`KS-009`), never as a model input |
| Refresh | Workflow `nfl-matchup-market.yml` |
| Fallback | A scheduled game with no line yet is normal; all market fields null. Descriptive only — no projected/fair spread, edge, or pick in the artifact. |
| Pointers | `docs/nfl-matchup-analyzer-redesign-spec.md` §24 |

## NFL — player-prop market (yardage props)

| Field | Value |
|---|---|
| Provider | The Odds API (`api.the-odds-api.com/v4`) and Parlay API (`parlay-api.com/v1`) |
| Purpose | Passing / rushing / receiving yard player-prop lines for the Yardage Props Review surface |
| Access | **Keyed / paid.** `ODDS_API_KEY` and `PARLAYAPI` from the environment. |
| Producer | `scripts/fetch-nfl-yardage-market.mjs` (`nfl:yardage-market`) |
| Artifact | `public/data/nfl/nfl-yardage-market.json` |
| Consumers | `src/lib/nfl/props/review/**`, the `/nfl/yardage-props-review` page; joined to current-week yardage projections |
| Refresh | Workflow `nfl-yardage-market.yml` |
| Fallback | Missing lines leave review rows without a market column. |
| Unresolved | This uses a **paid** source and player-prop data for an NFL surface, which is in tension with the free-first / no-player-props mandate in `docs/nfl-data-inventory.md`. Recorded here as an observed inconsistency; not resolved in this pass. |
| Pointers | `docs/nfl-yardage-props-audit.md` §2, `src/lib/nfl/props/README.md` |

## NFL — internal / redistribution-constrained reference

| Field | Value |
|---|---|
| Provider | Warren Sharp and VSiN 2026 preview material, transcribed into the repo |
| Purpose | Internal / model-input context on team and schedule outlooks (guide pages) |
| Access | Internal/manual. Paid-source-derived; the pipeline does **not** expand public reposting of these tables. |
| Location | `src/lib/nfl/{warrenSharpTeams2026,warrenSharpSchedule2026,warrenSharpAdvanced2026,vsinGuide2026}.ts` (checked-in TypeScript, not generated) |
| Consumers | NFL guide / team-guide pages |
| Refresh | Manual edit only |
| Pointers | `docs/nfl-data-inventory.md` (mandate), `docs/nfl-vsin-dataset-validation.md` |

---

## Fantasy — weekly projection / research inputs

| Field | Value |
|---|---|
| Provider | nflverse `player_stats` weekly (`stats_player_week`), nflverse `weekly_rosters` + `injuries`, nflverse `games.csv` market columns |
| Purpose | Leakage-safe player universe, weekly fantasy outcomes for backtesting, current-week ranking/projection inputs, implied team totals |
| Access | Public, unauthenticated (shared with the NFL nflverse caches above) |
| Producers | `fantasy:player-week-cache`, `fantasy:player-week-history`, `fantasy:weekly-backtest`, `fantasy:projection-dataset`, `fantasy:weekly-rankings`, `fantasy:projections:generate` / `:validate`, `fantasy:weekly-research` / `:validate`, `fantasy:ros:last8` |
| Cache / data | `data/nfl/nflverse/stats-player-week/`, `data/fantasy/{ros-research,2025-par-actual.json,points-allowed-2025.csv}` |
| Artifacts | `public/data/fantasy/weekly/<season>/`, `public/data/fantasy/projections/<season>/`, `public/data/fantasy/weekly-research/<season>/` |
| Consumers | `src/pages/FantasyWeeklyRankings.tsx`, `FantasyDraftPreview.tsx`, `FantasyFootball.tsx`, the ROS research board, and the NFL DFS Contest Analyzer (which consumes the weekly projection artifact, never a DraftKings projection) |
| Refresh | Workflow `generate-fantasy-weekly-projections.yml`; otherwise manual |
| Fallback | Consumers read the static artifact for the selected season/week and never compute ranks, substitute another week, or fall back to Rest-of-Season ranks; if no valid artifact exists they show an unavailable state. |
| Caveats | Scoring is frozen as `jkb-full-ppr-v1.0.0`; historical pregame market snapshots are unavailable and are not reconstructed; `depth_chart_position` is a positional label, not a depth order. Production methodology copy must not read the rejected `projections-v2` research. |
| Pointers | `src/lib/fantasy/weekly/README.md`, `docs/fantasy-weekly-production-operations.md` |

## Fantasy — FantasyPros ADP

| Field | Value |
|---|---|
| Provider | FantasyPros consensus ADP |
| Purpose | Consensus ADP context for Rest-of-Season rankings and the PAR / consensus comparison |
| Access | Internal/manual — a downloaded CSV export committed to the repo; no script fetches it. |
| Source file | `data/fantasy/2026-fantasypros-adp.csv` |
| Producer | `scripts/generate-fantasy-adp-2026.ts` (`fantasy:adp`) reads the local CSV only; parser `src/lib/fantasy/fantasyProsAdpParser.ts` |
| Artifact | `data/fantasy/2026-fantasypros-adp.json`, `data/fantasy/2026-par-consensus.json` |
| Consumers | ROS research board, PAR presentation |
| Refresh | Manual: replace the CSV, re-run `fantasy:adp` |
| Caveat | ADP / consensus must stay distinct from JKB PAR and from the season-long draft rankings (`KS-007`). |

## Fantasy — Sleeper draft-board source

| Field | Value |
|---|---|
| Provider | Sleeper draft-board export (via a PixBook capture) |
| Purpose | The fixed source rows behind the Draft Preview board |
| Access | Internal/manual — committed CSV; no script fetches it |
| Source file | `data/fantasy/source/PixBook-Sleeper-DraftBoard-2026.csv` |
| Producer | `scripts/generate-fantasy-draft-preview.ts` (`fantasy:draft-preview`); parser `src/lib/fantasy/draftPreview/sleeperCsv.ts` |
| Artifacts | `data/fantasy/draft-preview/{2026-sleeper-draft-board,2026-identity-corrections,2026-presentation-suppression}.json` |
| Consumers | `src/pages/FantasyDraftPreview.tsx` via `src/lib/fantasy/draftPreview/**` |
| Refresh | Manual |
| Caveats | Source rows carry stale teams/positions and duplicates; identity is reconciled by deterministic exact-normalized-name matching against the 2026 nflverse roster snapshot. Corrections are **display-only**; source rows are retained for provenance. Suppressed duplicate ranks stay in the row set. |
| Pointers | `docs/fantasy-draft-preview-identity-audit-2026.md` |

## Fantasy — season-long draft rankings workbook

| Field | Value |
|---|---|
| Provider | JKB internal workbook |
| Purpose | The published 2026 season-long fantasy draft list and its per-position metric ranks |
| Access | Internal/manual — verbatim extraction into TypeScript |
| Location | `src/data/fantasyRankings2026.ts` → `FANTASY_RANKINGS` (`src/lib/fantasy/rankings.ts`) |
| Consumers | Fantasy Football rankings page, Draft Preview joins (never recomputed) |
| Refresh | Manual edit |
| Caveat | This is a draft board, distinct from weekly projections, weekly rankings, PAR, ADP, and the shadow model rank. |

---

## MLB — MLB Stats API

| Field | Value |
|---|---|
| Provider | MLB Stats API (`statsapi.mlb.com`) |
| Purpose | Schedules, probable pitchers, lineups, live game state, results/grading |
| Access | Public, unauthenticated |
| Producers | The MLB generators and graders (`scripts/generate-mlb-*.mjs`, `scripts/grade-mlb-*.mjs`) and shared helpers under `scripts/lib/mlb-*.mjs` |
| Artifacts | `public/data/mlb/*.json` (HR / K / moneyline props, prediction-history archives, model-performance summaries, numerology, power rankings) |
| Consumers | MLB pages under `src/pages/Mlb*` |
| Refresh | Workflows `generate-mlb-hr-props.yml`, `generate-mlb-numerology.yml`, `generate-mlb-power-rankings.yml`, `grade-mlb-hr-results.yml`, `grade-mlb-ml-results.yml`, `mlb-numerology-grade.yml`, `mlb-data-watchdog.yml`, and the MLB X posting workflows |
| Fallback | `mlb-data-watchdog.yml` and `scripts/lib/mlb-data-freshness.mjs` guard against stale daily data; a stale artifact keeps its original `inputAsOf` rather than being relabelled. |
| Pointers | `docs/mlb-analytics-foundation-phase-1.md`, memory `mlb-pipeline-reliability-phase1` |

## MLB — Baseball Savant (Statcast)

| Field | Value |
|---|---|
| Provider | Baseball Savant (`baseballsavant.mlb.com`) Statcast search CSV endpoint |
| Purpose | Batter/pitcher Statcast metrics, opponent context, league reference context, hand splits, park factors, wRC+ inputs |
| Access | Public; slow and rate-limit-prone under concurrent load |
| Producers | `scripts/lib/mlb-savant-fetch.mjs` (shared retry/backoff), consumed by hand-split, opponent-context, reference-context, and percentile builders |
| Caches / artifacts | `public/data/mlb/{batter-hand-splits-cache,pitcher-percentiles,team-wrc-plus,...}.json` |
| Refresh | Part of the daily MLB generation workflows |
| Fallback | Single shared retry/backoff policy (429 / 5xx); missing metrics are handled as null, never fabricated. |

## MLB — FanGraphs

| Field | Value |
|---|---|
| Provider | FanGraphs (`www.fangraphs.com`) |
| Purpose | Supplementary rate stats (e.g. wRC+ inputs) |
| Access | Public |
| Producer | `scripts/lib/mlb-wrc-plus.mjs` and related |
| Caveat | Undocumented scraping surface; treat as fragile. |

## MLB — odds providers

| Field | Value |
|---|---|
| Providers | The Odds API (`api.the-odds-api.com/v4`), with fallbacks SportsGameOdds (`api.sportsgameodds.com/v2`), odds-api.io (`api.odds-api.io/v3`), Parlay API (`parlay-api.com`) |
| Purpose | Moneyline prices and HR / K prop lines, closing-line tracking / CLV |
| Access | **Keyed / paid.** `ODDS_API_KEY`, `PARLAYAPI`, and provider-specific keys from the environment. |
| Producers | `scripts/fetch-mlb-odds.mjs`, `scripts/lib/mlb-moneyline-providers.mjs`, `scripts/lib/mlb-prop-line-selection.mjs`, `scripts/inject-*-odds.mjs`, `scripts/validate-mlb-prop-odds.mjs` |
| Artifact | `public/data/mlb/mlb-odds.json` (+ gitignored diagnostics under `artifacts/`) |
| Consumers | MLB HR / K props and the Moneyline "edge" view |
| Book preference | An explicit ordered book list (`draftkings`, `fanduel`, `betmgm`, …); implied probability is vig-inclusive and labelled as such, never a fair probability. |
| Fallback | Multi-provider fallback chain; a provider failure degrades to the next provider, then to no line. |
| Framing | Per `KS-008`, the Moneyline view presents descriptive comparison and archived predictions/CLV, not calibrated probabilities or +EV claims (uncalibrated probability/value-edge claims were removed from the UI). |

## MLB — Action Network (public betting splits)

| Field | Value |
|---|---|
| Provider | Action Network (`api.actionnetwork.com/web/v1`) |
| Purpose | Public betting percentages / splits |
| Access | Public web API (Referer/Origin headers set) |
| Producer | `scripts/fetch-public-betting.mjs`; `scripts/resolve-betting-results.mjs` |
| Artifact | `public/data/betting-splits/{today,history}.json` |
| Consumers | Public Betting page |
| Fragility | Undocumented web API; header-sensitive. |

## MLB — Polymarket

| Field | Value |
|---|---|
| Provider | Polymarket Gamma API (`gamma-api.polymarket.com`), plus MLB Stats API schedule hydrate for pairing |
| Purpose | Prediction-market odds snapshots for MLB games |
| Access | Public |
| Producers | `scripts/fetch-polymarket-snapshots.mjs`, `scripts/grade-polymarket-results.mjs` |
| Artifacts | `public/data/polymarket/{history.json,snapshots-<date>.json}` |
| Consumers | Odds-tracker / Polymarket views |
| Refresh | Workflow `track-polymarket-odds.yml` |

---

## AI narrative generation — xAI Grok

| Field | Value |
|---|---|
| Provider | xAI (`api.x.ai`) |
| Purpose | Narrative / commentary generation for MLB HR props, MLB numerology, and PGA best bets |
| Access | **Keyed / paid.** API key from the environment. |
| Producers | `scripts/generate-mlb-hr-props.mjs`, `scripts/generate-mlb-numerology.mjs`, `scripts/generate-pga-best-bets.mjs`, `scripts/run-pga-best-bets-safe.mjs` |
| Fallback | Treated as non-fatal / optional — a failure degrades to output without the generated narrative. |
| Caveat | Generated prose is presentation copy, not a model output; it must not introduce edge / probability claims (`KS-008`). |

---

## CFB — CollegeFootballData (CFBD) API v2

| Field | Value |
|---|---|
| Provider | CollegeFootballData.com API v2 |
| Purpose | Games, box-score team stats, plays, `/rankings` (AP and others), `/lines` (in-season market odds), `/talent`, `/player/returning`, `/teams` (classification / FBS transitions) |
| Access | **Keyed free tier.** `CFBD_API_KEY` bearer token from the environment; never written to disk. Bulk requests only (never per-team). React never calls CFBD. |
| Producers | `cfb:fetch-data`, `cfb:fetch-transition-teams`, `cfb:fetch-rankings` (one `GET /rankings`), `cfb:fetch-market-odds` (one `GET /lines`), and the CFB V2 shadow refresh's own fetch step |
| Cache | `data/cfb/cfbd/raw/` (gitignored raw responses + SHA-256 manifest); `data/cfb/v2-support/`; the research corpus `data/cfb/research/` is also gitignored |
| Artifacts | `data/generated/cfb/{2026-preseason-ratings-v1.1,2026-schedule-v1,2026-rankings,2025-season-stats-v1,2026-season-stats-v1}.json` (+ CSV / candidate / audit variants); `public/data/cfb/v2/shadow-projections.json` |
| Consumers | `src/data/cfb/season2026/*.ts` (build-time imports) → `src/pages/cfb/*.tsx`; the AP ranking is an **independent comparison field**, never a model input. The V2 shadow artifact is **not rendered by any view**. |
| Refresh | Workflows `cfb-market-odds-refresh.yml`, `cfb-official-rankings-refresh.yml`, `cfb-v2-shadow-refresh.yml`; otherwise manual `npm run cfb:*` |
| Fallback | `assertCompleteCfbRatings` fails closed (throws, no partial artifact). Future/incomplete weeks simply return empty rows. FCS or unknown opponents are skipped, never zero-rated. |
| Pointers | `docs/cfb-phase-2b-data-pipeline.md`, `docs/cfb-model-v2-production-integration-plan.md` |

## CFB — preseason market-anchor baseline (VSiN guide)

| Field | Value |
|---|---|
| Provider | Steve Makinen's 2026 power-rating table, 2026 VSiN College Football Betting Guide (print PDF) |
| Purpose | The market-informed preseason baseline blended into the production `cfb-preseason-v1.1-market-anchor` ratings |
| Access | **Internal/manual, redistribution-constrained.** Transcribed once, preseason. Raw source values, commentary, picks, prose, and branding are never exposed at runtime. |
| Location | `src/data/cfb/season2026/preseasonMarketBaseline.ts` (`CFB_PRESEASON_MARKET_BASELINE_2026`); blend in `src/lib/cfb/marketAnchor.ts` |
| Consumers | `data/generated/cfb/2026-preseason-ratings-v1.1.json` → CFB rankings / matchup pages |
| Caveat | The production CFB power rating is therefore a **market-informed composite**, not an independent model (`KS-009`). Model V2 (`src/data/cfb/v2/`) is the independent rating and is shadow-only; its architecture guard forbids importing market-anchor code. |
| Pointers | `docs/cfb-preseason-market-anchor-v1.1.md`, `docs/cfb-model-v2-production-integration-plan.md` §6–§7 |

---

## PGA

| Field | Value |
|---|---|
| Providers | PGA Tour (`www.pgatour.com`, `orchestrator.pgatour.com`), DataGolf (`feeds.datagolf.com`), Google Sheets API (`sheets.googleapis.com`), plus European Tour / LIV / `therundown.io` for supplementary context |
| Purpose | Tournament fields, schedules, leaderboards, model inputs, course/best-bets working data |
| Access | PGA Tour and secondary tour sites: public web/API. Google Sheets: OAuth service credentials (`oauth2.googleapis.com`). DataGolf: not verified in this pass (assume keyed). |
| Producers | `scripts/sync-pga-sheet.mjs` (`pga:sync-sheet`), `scripts/fetch-pga-player-history.mjs`, `scripts/refresh-pga-player-history.mjs`, `scripts/check-pga-field-sync.mjs`, `scripts/generate-pga-best-bets.mjs`, and the other `pga:*` npm scripts; helpers `scripts/lib/pga-*.mjs` |
| Artifacts | `public/data/pga/*` |
| Consumers | PGA pages under `src/pages/Pga*` and `PGA*` |
| Refresh | Workflows `sync-pga-schedule.yml`, `sync-pga-data.yml`, `refresh-pga-player-history.yml`, `backfill-pga-history.yml`, `generate-best-bets-manual.yml` |
| Fragility | A Google Sheet is a live dependency in this path; a field/schedule sync guard exists, and there is a known silent hour-gate failure mode. |
| Pointers | `docs/pga-player-history-refresh.md`, `docs/pga-course-weights-apps-script.gs`, memory `pga-workflow-gotchas` |

---

## Site self-reference

`www.joeknowsball.com` is referenced by SEO / sitemap tooling and by Playwright
specs. Automated browser work must use the repository's analytics-blocking
fixture and must never emit Google Analytics or Google Tag Manager traffic
(`KS-006`, `docs/TESTING.md`).

---

## Deployment note

`OPEN-001` (which configured deployment mechanism is authoritative for
production) is unresolved. `vercel.json` and `.github/workflows/deploy.yml`
(GitHub Pages) are both configured; `deploy.yml` also exposes a `workflow_call`
entry point that `cfb-v2-shadow-refresh.yml` invokes after committing its
artifact. See `docs/ARCHITECTURE.md`.

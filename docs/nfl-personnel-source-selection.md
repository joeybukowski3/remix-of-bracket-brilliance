# NFL Personnel Source Selection

Status: Phase 5C source audit and ingestion-planning pass for the 2026 NFL
personnel evidence project.

This document selects candidate sources for future real-data ingestion into
`public/data/nfl/<season>/personnel-evidence.json`. It does not populate a
production personnel artifact, score team improvement or decline, modify NFL
v0.3 ratings, add React, change routes, or add scheduled workflows.

## Pre-Edit Git State

- Branch: `feat/nfl-2026-season-readiness`
- Starting HEAD: `7c8c1868339d62ce26bb79fb0fe3e35a77fcbce1`
- `origin/main`: `c419c238cfaef75c47d52ec26114a50ab6f155c1`
- Branch/main merge-base: `c419c238cfaef75c47d52ec26114a50ab6f155c1`
- Rebase status: not needed; branch was ahead of `origin/main` and not behind.

## Existing Provider And Integration Inventory

Repository-owned NFL provider access is currently free-first and limited:

| Area | Path | Provider or pattern | Credential pattern | Existing use | Personnel fit |
| --- | --- | --- | --- | --- | --- |
| Canonical teams | `public/data/nfl/teams.json` | Repo-curated mapping aligned to nflverse codes | None | Canonical 32-team identity | Required input |
| Schedules/results | `scripts/generate-nfl-schedules-results.mjs`, `scripts/lib/nfl-schedules-results-core.mjs` | nflverse `nfldata` `games.csv` | None | Generates `games.json` and `results.json` | Pattern only |
| Team stats/ratings | `scripts/generate-nfl-team-stats-power-ratings.mjs`, `scripts/lib/nfl-advanced-stats.mjs` | nflverse `stats_team` weekly releases | None | Generates team stats and power ratings | Pattern only; not player retention |
| Cached team-week source | `data/nfl/nflverse/stats-team-week/` | nflverse `stats_team_week_<season>.csv` | None | Committed immutable cache with manifest | Cache-manifest pattern |
| NFL workflows | `.github/workflows/nfl-schedules-results.yml`, `.github/workflows/nfl-team-ratings.yml` | GitHub Actions around nflverse scripts | `GITHUB_TOKEN` only | Scheduled main-branch data refresh | Workflow pattern only; do not modify yet |
| Runtime team schedule | `api/nfl/team-schedule.ts` | ESPN site API | None | Per-team schedule fallback with cache | Schedule only; not canonical personnel |
| Prediction market odds | `api/nfl/super-bowl-odds.ts` | Polymarket Gamma API | None | Futures market page | No personnel value |
| Manual offseason snapshot | `src/data/nflOffseason2026.ts` | Repo manual public-reporting snapshot | None | Selective head coach and notable moves through `2026-06-23` | Transitional comparison input only |
| Warren Sharp guide extracts | `src/data/nflWarrenSharpTeams2026.ts`, `src/data/nflWarrenSharpAdvanced2026.ts` | Paid guide/manual extraction | None in repo | Personnel context, projected QB table, coaching context | Supplemental only; avoid broad public redistribution |
| VSiN guide extract | `src/data/nflVsinGuide2026.json` | Paid guide/manual extraction | None in repo | Team-stat context | Not a personnel source |
| Personnel schema/generator | `scripts/generate-nfl-personnel-evidence.mjs`, `scripts/lib/nfl-personnel/*` | Fixture/local input only | None | Phase 5B schema, validation, reconciliation, completeness | Target ingestion boundary |

No repository-owned NFL integration currently uses `SPORTSDATAIO`,
`SPORTRADAR`, `API_SPORTS`, `MYSPORTSFEEDS`, `NFL`, `PFR`, or `NEXTGEN`
credentials. Existing environment-variable names found in repo/workflows are
for Supabase, odds, PGA, MLB/email, X/Grok, cron, and GitHub dispatch patterns:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ODDS_API_KEY`, `ODDS_API_KEY_BACKUP`,
`SPORTSGAMEODDS_API_KEY`, `ODDS_API_IO_KEY`, `PGA_API_KEY`,
`PGA_TOUR_GQL_API_KEY`, `GROK_API_KEY`, `XAI_API_KEY`,
`BUTTONDOWN_API_KEY`, `BUTTONDOWN_CONTEXT`, `BUTTONDOWN_EMAIL_STATUS`,
`BUTTONDOWN_ALLOW_TEST_SEND`, `NUMEROLOGY_EMAIL_RECEIVER_TOKEN`,
`CRON_SECRET`, `GH_DISPATCH_TOKEN`, `GH_REPO_OWNER`, `GH_REPO_NAME`, and
`GH_WORKFLOW_ID`.

Do not expose secret values. Future paid NFL adapters should use new names such
as `SPORTSDATAIO_NFL_API_KEY` or `SPORTRADAR_NFL_API_KEY`, never reuse odds
keys.

## Candidate Source Evaluation

Scores use 1-5, where 5 is best for this project's needs.

| Source | Authority | Complete-ness | Freshness | Stable IDs | History | Repro-ducible | Machine-readable | Actions-ready | Auth burden | Rate-limit burden | Licensing risk | Cost | Maintenance risk | Best use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| SportsDataIO NFL API | 4 | 5 | 5 | 5 | 4 | 4 | 5 | 4 | 3 | 3 | 3 | 2 | 3 | Paid primary candidate for transactions, rosters, depth charts/QB, injuries, starts, snaps, player stats |
| Sportradar NFL API | 5 | 5 | 5 | 5 | 4 | 4 | 5 | 4 | 2 | 3 | 3 | 1 | 3 | Enterprise alternative for complete official-style feeds |
| nflverse / nflreadr release files | 3 | 3 | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 5 | 3 | Free primary for player stats, rosters, snap counts, draft picks, trades, depth-chart snapshots when available |
| Official NFL/team pages | 5 | 2 | 4 | 2 | 2 | 2 | 2 | 2 | 5 | 3 | 2 | 5 | 4 | Manual verification for coaching announcements, official designations, source URLs |
| ESPN site API | 3 | 2 | 4 | 3 | 2 | 3 | 4 | 4 | 5 | 3 | 2 | 5 | 4 | Existing schedule fallback; possible audit-only roster/depth cross-check if terms are accepted |
| API-Sports NFL | 3 | 2 | 4 | 3 | 2 | 3 | 4 | 4 | 3 | 3 | 3 | 3 | 3 | Supplemental current injuries/teams only; insufficient history for injury returns |
| MySportsFeeds | 3 | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 3 | 3 | 3 | 4 | 3 | Budget paid fallback for schedules/stats/injuries if richer feeds prove sufficient |
| Sports Reference / PFR direct | 3 | 3 | 3 | 3 | 5 | 2 | 2 | 1 | 5 | 1 | 1 | 5 | 5 | Avoid direct scraping; use nflverse-derived PFR feeds only if licensing and attribution are acceptable |
| The Odds API | 1 | 1 | 5 | 1 | 3 | 4 | 5 | 5 | 3 | 3 | 3 | 3 | 2 | Not a personnel source |
| Warren Sharp / VSiN / repo manual | 2 | 2 | 2 | 1 | 2 | 4 | 3 | 5 | 5 | 5 | 2 | 3 | 3 | Supplemental/manual context only |

Licensing caveat: these scores are technical feasibility scores, not legal
approval. Paid-provider license terms must be reviewed before storing raw
responses or publishing normalized derived data.

## Category Fit

### Transactions

Preferred structured source: SportsDataIO or Sportradar.

- SportsDataIO documents tracking offseason roster moves, free-agent signings,
  draft, retirements, and player IDs, and exposes transaction endpoints by date.
- Sportradar documents daily transactions with player GUIDs, `sr_id`,
  `status_before`, `status_after`, transaction type, and modified timestamps.
- nflverse currently supports `load_trades()` and `load_draft_picks()`, which is
  useful for trades and draft additions but not complete sign/release/waiver/
  retirement coverage.
- Official team/NFL pages are authoritative but too unstructured for complete
  all-32 replay without manual review.

Recommendation: use SportsDataIO as primary if a key/license is approved;
otherwise use nflverse trades/draft plus official/team manual verification and
mark complete transaction coverage blocked.

### Coaching Continuity

Preferred source: official team staff pages and team announcements, cached as
source metadata plus extracted facts.

- Paid statistical APIs may expose staff in limited forms, but coordinator
  effective dates, prior role, and scheme transition provenance are best
  supported by team announcements.
- Warren Sharp/VSiN remain supplemental context only.

Recommendation: keep coaching source ingestion semi-manual first: official URL,
announcement date, role, prior role, and source quote summary. Do not infer
scheme change unless a source explicitly says it.

### Quarterback Continuity

Preferred source hierarchy:

1. SportsDataIO/Sportradar depth chart and roster feeds for factual depth order.
2. Official team depth charts or announcements.
3. nflverse depth-chart snapshots for reproducible public audit when current.
4. Warren Sharp projected-QB table as supplemental context.
5. Repo manual evidence during transition.

Depth-chart order is factual evidence; `returning_starter`, `new_starter`, and
`open_competition` are status classifications that must be backed by a source
date. Editorial "best bet to start" language is not enough by itself.

### Rosters, Starts, And Snaps

Preferred free source: nflverse for rosters, weekly rosters, player stats, and
snap counts.

- nflreadr exposes rosters, weekly rosters, player stats, participation, depth
  charts, draft picks, snap counts, and PFR advanced stats.
- Player stats include stable `player_id`, team, week, attempts, carries,
  targets, receptions, receiving/rushing yards, sacks, tackles, interceptions,
  and related box-score fields.
- Snap-count dictionaries include offensive, defensive, and special-teams snaps
  plus PFR player IDs.
- SportsDataIO is stronger if paid access is approved because it documents
  player game stats with `Started`, offensive/defensive/special-teams snaps,
  inactive fields, and verified stat-correction timing.

Recommendation: start with nflverse for returning-production math because it is
free, reproducible, and already matches repository conventions. Upgrade to
SportsDataIO only if complete starts/snap/position-group coverage cannot be
resolved from nflverse.

### Returning Production

Primary calculation inputs:

- Player stats: nflverse `stats_player` for pass attempts, carries, rushing
  yards, targets, receptions, receiving yards, sacks, tackles, interceptions.
- Snaps: nflverse snap counts for offensive/defensive/special-teams snaps.
- Starts: SportsDataIO `Started` is the cleanest structured candidate; nflverse
  may need depth chart/game roster derivation and should be treated as partial
  until verified.
- Offensive-line and defensive-back retained shares require position grouping
  from roster/depth-chart/snap sources.
- Pressures are not covered by standard nflverse player stats; use nflverse PFR
  advanced stats only after licensing/storage review, or mark advisory.

Do not zero-fill unavailable data. A retained share is valid only when both
numerator and denominator coverage are complete.

### Injury-Return Evidence

Primary paid source candidate: SportsDataIO or Sportradar.

- SportsDataIO documents injury endpoints, active/injury-status distinctions,
  inactives timing, and serious-offseason-injury caveats.
- Sportradar documents weekly injuries and game roster status fields.
- nflverse injury data is not usable as the primary 2025+ source because its
  own data schedule says the injury source died after 2024 and there is no 2025
  data ETA.
- API-Sports exposes current injuries updated hourly, but says no preserved
  history; that is insufficient for games-missed and injury-return replay.

Recommendation: block mandatory injury-return gate until a paid source/license
or official injury-report archive plan is approved. Treat injury coverage as
advisory until then.

## nflverse Feasibility

The repository already uses nflverse in two ways:

- `nfldata` `games.csv` from
  `https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`
- `nflverse-data` `stats_team_week_<season>.csv` release files from
  `https://github.com/nflverse/nflverse-data/releases/download/stats_team/`

Future Phase 5C adapters can follow the same pattern: direct CSV/parquet/RDS
release URLs, explicit local input path support, manifest sidecars, and
deterministic validation.

Useful nflverse file families to verify in 5C:

| Family | Proposed use | Required fields |
| --- | --- | --- |
| `players` | Canonical player identity crosswalk | player ID, display name, position, team aliases, provider IDs |
| `rosters` / `weekly_rosters` | Current and historical team membership | season, week/date, team, player ID, player name, position, roster status |
| `stats_player` | Returning production skill/defensive stats | player ID, season, week, team, position, attempts, carries, targets, receptions, yards, sacks, tackles, interceptions |
| `snap_counts` | Snap-retention denominators | season, week, team, player/PFR ID, position, offense/defense/ST snaps and percentages |
| `depth_charts` | QB continuity support and role context | team, date/timestamp, depth order, position, player ID/name |
| `trades` | Linked trade movements | date, player, from team, to team, picks/assets if available |
| `draft_picks` | Draft additions | season, round, pick, team, player ID/name, position, college |
| `pfr_advstats` | Pressures/advanced defensive context | player/PFR ID, team, season, pressure/sack/pass-rush fields |

Do not download full datasets in this pass. The first implementation should
make a tiny read-only sample request or require checked-in mini fixtures before
any all-32 ingestion.

## Recommended Source Stack

### Preferred Production Stack If Paid Access Is Approved

Primary: SportsDataIO NFL API.

- Covers: transactions, rosters, player IDs, depth charts/QB order, injuries,
  inactives, starts, snaps, player game/season stats, draft/rookie profiles.
- Authentication: new `SPORTSDATAIO_NFL_API_KEY`.
- Expected cost: paid; exact tier must be approved before implementation.
- Storage model: raw paid responses stay out of git; normalized derived
  personnel evidence may be committed only after license review.
- Raw responses in git: no.
- Normalized derived data in git: yes only if terms permit.
- Update cadence: offseason daily for transactions/depth charts; weekly during
  season; stat corrections after weekly official review.
- Fallback: Sportradar if enterprise access is already available or better
  licensed.

Supplemental: nflverse release files.

- Covers: reproducible player stats, rosters, weekly rosters, snap counts,
  depth charts, trades, draft picks, public cross-checks.
- Authentication: none.
- Cost: free.
- Storage model: small raw public CSV caches may be committed only with
  manifests when licensing permits; otherwise cache outside git and commit
  normalized derived artifacts.
- Update cadence: per nflverse schedule; daily/weekly by family.
- Fallback: checked-in source cache snapshots plus manifest.

Manual verification fallback: official team/NFL pages plus repo manual evidence.

- Covers: coaching continuity, coordinator role/effective dates, scheme changes,
  and source-backed QB competition language.
- Authentication: none.
- Storage model: commit source metadata and extracted facts, not full article
  bodies or large page captures.

### Free-First Stack If Paid Access Is Not Approved

Primary: nflverse release files for rosters, player stats, snap counts, trades,
draft picks, and depth charts.

Supplemental: official team/NFL pages for coaching and source-backed QB
competition/effective dates.

Manual fallback: Warren Sharp/VSiN/repo manual evidence for context only.

Known blocker: complete sign/release/waiver/retirement transactions and
injury-return history are not reliably covered by the free stack.

## Licensing And Redistribution Cautions

- nflverse package code is open source, but nflverse itself says data accessed
  by the package belongs to respective owners and is governed by their terms.
- The `nflverse-data` repository advertises a Creative Commons Attribution 4.0
  license, but some component feeds derive from PFR, NGS, FTN, ESPN, and other
  sources; retain attribution and review component-specific constraints before
  committing raw files.
- Sports Reference/PFR terms restrict automated access that harms performance
  and using site content to create competing databases. Do not scrape PFR
  directly for this project.
- NFL.com terms prohibit systematic retrieval to create a database without
  consent. Use official pages for manual provenance links and summaries, not
  bulk scraping.
- SportsDataIO, Sportradar, MySportsFeeds, and API-Sports require key/license
  review before raw response storage or public redistribution.
- Paid guide extracts from Warren Sharp and VSiN should remain supplemental and
  summarized; do not republish guide tables as public generated data.

## Raw Cache Policy

Recommended future layout:

```text
data/nfl/personnel/raw/<provider>/<season>/<retrieved-date>/<feed-name>.<ext>
data/nfl/personnel/raw/<provider>/<season>/<retrieved-date>/manifest.json
data/nfl/personnel/normalized/<season>/<run-id>/
data/nfl/personnel/audit/<season>/<run-id>/
```

Rules:

- Paid-provider raw files do not belong in git. Add explicit `.gitignore` rules
  before the first paid-source adapter.
- Public small-source caches may be committed only after source/license review,
  with a manifest matching the existing `data/nfl/nflverse/stats-team-week`
  pattern.
- Every raw cache directory gets a manifest with provider, feed, requested URL,
  retrievedAt, sourceUpdatedAt when known, provider version when available,
  request parameters, row/object count, byte size, SHA-256, environment, and
  redaction status.
- Never store API keys, signed URLs, auth headers, cookies, or account metadata.
- Retain raw paid caches locally for replay through the scoring cutoff, then
  archive or delete according to license terms.
- Normalized audit artifacts may be written under `data/nfl/personnel/audit/`
  or a temp path during Phase 5C. Do not write production
  `public/data/nfl/<season>/personnel-evidence.json` until all gates pass.
- Deterministic regeneration must read only declared raw/cache inputs plus
  `public/data/nfl/teams.json`.

## Phase 5C Implementation Slices

### 5C-1: Transactions, Coaching, And QB Continuity

- Source: SportsDataIO if approved; otherwise nflverse trades/draft plus manual
  official coaching/QB source metadata.
- Input: small provider sample or checked-in synthetic mini source fixture,
  canonical teams, existing manual offseason evidence.
- Output: non-production audit artifact for 2-4 teams.
- Tests: source adapter schema, source refs, transaction reconciliation,
  generated/manual comparison, conflict visibility.
- Validation: Phase 5B personnel validator and completeness evaluator.
- Acceptance: stable IDs preserved; no production overwrite; conflicts surfaced.
- Risk: free stack cannot prove full sign/release/waiver/retirement coverage.
- Audit artifact allowed: yes, under `data/nfl/personnel/audit/` or temp path.

### 5C-2: Rosters And Canonical Player Identity

- Source: nflverse `players`, `rosters`, `weekly_rosters`; SportsDataIO player
  IDs if approved.
- Input: sample team roster files and provider player IDs.
- Output: local player identity crosswalk sample.
- Tests: duplicate names, suffixes, provider IDs, team aliases, missing-source
  players.
- Validation: canonical team IDs and same-name collision warnings.
- Acceptance: no fuzzy primary matching; provider IDs win.
- Risk: cross-provider ID mapping is incomplete without a paid provider or
  ffverse crosswalk.
- Audit artifact allowed: yes.

### 5C-3: Starts, Snaps, And Returning Production

- Source: nflverse `stats_player`, `snap_counts`, `pfr_advstats`; SportsDataIO
  `Started` and snap fields if approved.
- Input: prior-season player stats/snaps plus target roster/movement sample.
- Output: retained-production metrics with nulls for unavailable denominators.
- Tests: no zero-fill, numerator/denominator math, position-group retention,
  incoming production not counted as retained.
- Validation: returning-production warnings and completeness gates.
- Acceptance: offensive and defensive retained production valid for sample teams.
- Risk: starts and pressure data may remain partial without paid source review.
- Audit artifact allowed: yes.

### 5C-4: Injury-Return Evidence

- Source: SportsDataIO/Sportradar preferred; official injury-report archive as
  manual fallback.
- Input: player injury/inactive/IR records through prior season.
- Output: injury-return evidence with source date and verification status.
- Tests: no medical readiness inference, games-missed counting, PUP/NFI/IR
  categories, current return status.
- Validation: advisory injury coverage warnings.
- Acceptance: expected return status only when sourced.
- Risk: nflverse injury data not viable for 2025+.
- Audit artifact allowed: yes.

### 5C-5: All-32 Generation And Completeness Review

- Source: approved stack only.
- Input: all source caches through a stated cutoff.
- Output: full non-production candidate artifact first; production public artifact
  only after review.
- Tests: all canonical teams, no unresolved critical conflicts, freshness,
  deterministic output.
- Validation: mandatory gates.
- Acceptance: `readyForScoring` can become true only after gates pass.
- Risk: licensing/storage approval and source freshness.
- Audit artifact allowed: yes; production artifact still gated.

## Exact Recommended First Ingestion Slice

Phase 5C-2A implements the first read-only nflverse roster/production audit
slice. It is not a production artifact and does not resolve the broader paid
source decision.

Sample teams:

| Team | Why selected from repository-backed evidence |
| --- | --- |
| Atlanta Falcons (`nfl-atl`) | Manual snapshot has a new head coach, Kevin Stefanski, and a major QB acquisition, Tua Tagovailoa. Exercises new coach plus veteran QB addition. |
| Chicago Bears (`nfl-chi`) | Manual snapshot has a returning head coach, Ben Johnson; Warren Sharp projected-QB table has Caleb Williams. Exercises returning coach and established QB continuity. |
| New York Jets (`nfl-nyj`) | Manual/Warren Sharp evidence has returning head coach Aaron Glenn, Geno Smith trade addition, Minkah Fitzpatrick trade addition, and coordinator turnover context. Exercises trade reconciliation and QB acquisition with returning HC. |
| Seattle Seahawks (`nfl-sea`) | Manual/Warren Sharp evidence has returning head coach Mike Macdonald, Sam Darnold as projected QB, and multiple departures including Kenneth Walker III. Exercises returning coach, new QB context, and meaningful departures. |

No repository-backed source currently identifies an open QB competition, so this
slice does not force that case. Add an open-competition sample only when an
approved source explicitly supports it.

Implemented audit path:

- Adapter: `scripts/lib/nfl-personnel/providers/nflverse/audit.mjs`
- CLI: `scripts/generate-nfl-personnel-nflverse-audit.mjs`
- Cache validator: `scripts/validate-nfl-personnel-nflverse-cache.mjs`
- Fixture command: `npm run nfl:personnel:nflverse:audit`
- Cache validation command: `npm run nfl:personnel:nflverse:validate-cache`
- Default fixture output:
  `artifacts/nfl/personnel-audit/nflverse-four-team-audit.json`
- Production guard: the CLI refuses to write
  `public/data/nfl/<season>/personnel-evidence.json`.

Exact nflverse release families used after Phase 5C-2B:

| Family | Default release URL pattern | Fields used | Lineage caveat |
| --- | --- | --- | --- |
| Season rosters | `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_<season>.csv` | `season`, `team`, `full_name`, `position`, `depth_chart_position`, `status`, `gsis_id`, `espn_id`, `sportradar_id`, `pfr_id`, plus other exposed provider IDs when present | Public nflverse roster release; roster presence is not transaction proof. |
| Prior-season rosters | `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_<priorSeason>.csv` | Same roster identity fields as target-season rosters | Used only for identity crosswalk and PFR-to-GSIS joins; not transaction proof. |
| Season player stats | `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_<priorSeason>.csv` | `season`, `season_type`, `recent_team`/`team`, `player_id`, `player_display_name`, `position`, `attempts`, `carries`, `rushing_yards`, `targets`, `receptions`, `receiving_yards` | Current nflreadr `load_player_stats(summary_level = "reg")` release family; regular season only by default. |
| Snap counts | `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_<season>.csv` | `season`, `game_id`, `game_type`, `team`, `player`, `pfr_player_id`, `position`, `offense_snaps`, `offense_pct`, `defense_snaps`, `defense_pct`, `st_snaps`, `st_pct` | nflreadr documents snap counts as PFR-provided; review redistribution terms before production use. |

Missing-2025 diagnosis: the Phase 5C-2A implementation initially selected the
older aggregate
`https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_season.csv`
from the `player_stats` release. That release was last updated on
2025-05-07 and did not include requested 2025 rows. The current nflreadr loader
resolves regular-season player stats through the `stats_player` release, with
season-specific files such as `stats_player_reg_2025.csv`; the GitHub release
asset for 2025 was updated on 2026-07-10. The audit now records this diagnosis
in `playerStatSourceDiagnosis` and fails or marks metrics unavailable when the
requested prior season is absent instead of substituting another season.

The adapter supports explicit local paths and explicit URLs. When a cache
directory is supplied it writes files and `manifest.json` under:

```text
data/nfl/personnel/raw/nflverse/<season>/<retrieval-date>/
```

The raw cache path is ignored by git. Synthetic test fixtures under
`scripts/fixtures/nfl-personnel/nflverse/` are committed because they are small,
fake, and exist only to validate parser and audit behavior.

Calculation definitions for this slice:

- Target roster evidence is the target-season season roster file as of the
  declared `sourceCutoff`/`generatedAt`.
- Prior production is prior-season regular season only; postseason rows are
  excluded.
- A prior player is retained only when matched to the same target team roster by
  provider ID or, when no provider ID exists, deterministic
  team/name/position fallback.
- Provider ID priority is GSIS ID first, then approved provider IDs exposed by
  nflverse, then deterministic team/name/position fallback.
- The identity crosswalk includes target rosters, prior rosters, prior player
  stats, and prior snap counts. It preserves GSIS, ESPN, Sportradar, PFR, and
  other exposed IDs; source name variants; normalized names; source presence;
  prior/target teams; match method; warnings; and conflicts.
- Identity validation reports provider-ID conflicts, multiple GSIS IDs in a
  person group, same normalized names with distinct provider IDs, name-only
  collisions, roster/stats/snap source gaps, legitimate team changes, position
  changes, suffix/punctuation variants, and unresolved PFR-only snap identities.
- Incoming player production for another prior team is not counted as retained.
- Unmatched production remains in the denominator and is reported separately.
- Offensive production metrics now include matched player count, unmatched
  player count, and unmatched production amount.
- `recent_team` is treated as the nflverse prior-production team assignment.
  Multi-team or traded-player limitations remain visible through the crosswalk;
  the audit does not infer transaction method or double-count incoming
  production as retained.
- Unavailable starts, offensive-line snaps, sacks, pressures, and defensive-back
  snap metrics remain `null`; they are not inferred or zero-filled.

Unsupported categories in Phase 5C-2A:

- Complete transactions, including signings, releases, waivers, retirements, and
  re-signings.
- Coaching continuity and scheme changes.
- Official QB starter/open-competition status.
- Injury returns and medical readiness.
- Starts, pressures, and clean offensive-line/secondary retained shares.

This does not make the dataset ready for scoring because it covers only four
teams, omits mandatory transaction/coaching/QB/injury categories, carries
PFR-derived snap-count licensing cautions, and can still surface critical
identity conflicts.

Phase 5C-2C adds explicit identity diagnostics before any all-32 expansion:

- Review output:
  `artifacts/nfl/personnel-audit/nflverse-four-team-identity-review.json`
- Local command:
  `npm run nfl:personnel:nflverse:identity-review`
- Strict mode:
  `node scripts/generate-nfl-personnel-nflverse-audit.mjs ... --fail-on-critical-conflict`
- Audit override:
  `--audit-override` allows audit-only output even when unresolved conflicts
  remain.

Conflict taxonomy:

- Missing or weak IDs: `missing_gsis_id`, `pfr_only_snap_identity`,
  `insufficient_evidence`.
- Provider contradictions: `provider_id_conflict`,
  `conflicting_name_for_provider_id`, `same_name_distinct_people`,
  `conflicting_team_same_date`.
- Benign variants or review warnings: `name_variant`, `suffix_variant`,
  `punctuation_variant`, `position_change`, `legitimate_team_change`,
  `roster_missing_stats`, `stats_missing_roster`, `snaps_missing_roster`,
  `other`.

Resolution policy:

- Automatic only when stable evidence supports it: punctuation-only variants,
  suffix formatting variants, dated team changes, position changes with a
  stable GSIS ID, and unique PFR-to-GSIS roster crosswalks.
- Warning-level inclusion: unique deterministic team/name/position fallback
  with no competing candidate, and source coverage gaps that do not change
  identity.
- Mandatory exclusion: one provider ID mapped to incompatible people, multiple
  plausible same-name candidates, same-date team contradictions, unresolved
  PFR-only snap identities, and insufficient deterministic context.
- No fuzzy matching is allowed to override provider-ID conflicts.

Production-impact accounting records every unresolved identity's affected snap
or offensive-production quantity, lower/upper retained-share bounds, and whether
`coverageComplete` should become false until review. This is accounting only,
not team quality evaluation.

Proposed all-32 identity expansion gates:

- Zero critical provider-ID conflicts.
- At least 98% offensive production attribution.
- At least 98% offensive snap attribution.
- At least 98% defensive snap attribution.
- All excluded production explicitly quantified.
- Deterministic replay from declared inputs.

Phase 5C-2D adds a human-review override loop for conflicts that strict
automation must leave unresolved:

- Review file:
  `data/nfl/personnel/reviewed-identity-overrides.json`
- Schema version:
  `nflverse-reviewed-identity-overrides-v0.1`
- Validation command:
  `npm run nfl:personnel:nflverse:validate-overrides`
- Audit-with-review command:
  `npm run nfl:personnel:nflverse:audit-with-overrides`

Reviewed overrides are repository-owned audit configuration, not production
evidence. Each record carries `overrideId`, provider and provider-person ID,
season scope, canonical person ID, GSIS ID when available, canonical name,
source name variants, team scope, position context, resolution type, evidence
references, review metadata, status, and expiration/permanence metadata.

Statuses:

- `pending`: proposed mapping for human review. It is never applied to normal
  audit output.
- `approved`: applied only after evidence references, `reviewedBy`, and
  `reviewedAt` pass validation.
- `rejected`: retained for audit history and never applied.
- `superseded`: retained for audit history and never applied.

Override priority remains below stable automated identity evidence:

1. Stable GSIS identity.
2. Unambiguous provider crosswalk.
3. Approved reviewed override.
4. Deterministic team/name/position fallback with warning.
5. Unresolved/excluded.

Safety rules reject duplicate active overrides for the same provider ID and
scope, one provider ID mapped to multiple canonical people, inconsistent GSIS
assignment for one canonical identity, missing evidence, missing approved-review
metadata, invalid or expired season scope, unknown source references when source
rows are available, placeholder dates or URLs, and approvals based only on fuzzy
name similarity. Overrides cannot silently replace contradictory stable GSIS
evidence.

The CLI records whether each override was considered, applied, or rejected at
application time. `--simulate-pending-overrides` produces a clearly labeled
simulation showing which pending mappings would clear conflicts and their metric
impact; simulation never changes normal audit identity counts or generated
metrics.

Phase 5C-2E approved the two current repository review records:

- `nflverse-pfr-2025-alfode00-atl-review`
- `nflverse-pfr-2025-smitch04-nyj-review`

Both use `reviewedBy: joeybukowski3`, `reviewedAt: 2026-07-19`,
`status: approved`, `sourceSeason: 2025`, `expiresAfterSeason: 2025`, and
`permanent: false`. The approvals are season-scoped to 2025 nflverse/PFR
identity evidence and do not loosen automatic matching for later seasons.

The approved-only live four-team audit applied both records with no
higher-priority GSIS rejection. Critical provider conflicts decreased from 2 to
0. `AlfoDe00` resolved the Atlanta 2025 PFR snap-name variant to GSIS
`00-0037034`; the reviewed rows include 582 defensive snaps and no offensive
production. `SmitCh04` resolved the New York Jets Week 18 PFR snap-name variant
to GSIS `00-0038602`; the reviewed row carries 2 special-teams snaps and no
offensive or defensive production.

The critical-conflict gate now clears for the four-team sample, but the 98%
attribution gates still fail for every sample team:

| Team | Offensive production | Offensive snaps | Defensive snaps |
| --- | ---: | ---: | ---: |
| ATL | 0.743906 | 0.510949 | 0.622467 |
| CHI | 0.830094 | 0.759571 | 0.460476 |
| NYJ | 0.717919 | 0.455113 | 0.653834 |
| SEA | 0.803361 | 0.496497 | 0.789452 |

Do not expand to all 32 teams until attribution failures are understood and
reduced without lowering the thresholds.

Phase 5C-2F corrected the audit semantics. The values reported in Phase 5C-2E
as attribution percentages were retained-production shares:

```text
retained share = retained resolved production / complete prior-team production
```

Retained share is roster-continuity evidence. It is not an identity-quality
gate. A team can retain 51% of prior offensive snaps while the source rows are
fully identified, and a team can retain a high share while still carrying
unresolved source rows. The v0.2 audit adds explicit identity accounting:

- `retainedShare`: retained numerator divided by prior-team denominator.
- `resolvedAttributionCoverage`: source quantity linked to resolved canonical
  identities divided by total source denominator.
- `accountedForCoverage`: resolved quantity plus warning-level fallback plus
  explicitly quantified unresolved quantity divided by total source denominator.
- `unresolvedShare`: unresolved quantity divided by total source denominator.
- `sourceCoverageComplete`: whether the underlying source denominator exists for
  the intended metric and season.
- `identityCoverageComplete`: whether no unresolved quantity remains for that
  metric.

The all-32 identity gates now use resolved attribution and accounted-for
coverage, not retained share. Mandatory per-team gates remain zero critical
provider conflicts, 98% resolved offensive-production attribution, 98% resolved
offensive-snap attribution, 98% resolved defensive-snap attribution, 100%
accounted-for coverage, explicit source-completeness status, and deterministic
replay.

Corrected four-team live audit results:

| Team | Retained offensive production | Retained offensive snaps | Retained defensive snaps | Resolved offensive production | Resolved offensive snaps | Resolved defensive snaps | Accounted-for core metrics |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ATL | 0.743906 | 0.510949 | 0.622467 | 1.000000 | 0.532515 | 0.989952 | 1.000000 |
| CHI | 0.830094 | 0.759571 | 0.460476 | 1.000000 | 0.541988 | 0.984326 | 1.000000 |
| NYJ | 0.717919 | 0.455113 | 0.653834 | 1.000000 | 0.539422 | 0.921794 | 1.000000 |
| SEA | 0.803361 | 0.496497 | 0.789452 | 1.000000 | 0.529819 | 0.986471 | 1.000000 |

Corrected unresolved quantities:

| Team | Offensive production unresolved | Offensive snaps unresolved | Defensive snaps unresolved | Special-teams snaps unresolved |
| --- | ---: | ---: | ---: | ---: |
| ATL | 0 | 5636 | 122 | 788 |
| CHI | 0 | 5814 | 185 | 842 |
| NYJ | 0 | 5310 | 971 | 577 |
| SEA | 0 | 5503 | 167 | 974 |

`AlfoDe00` contributes 582 restored Atlanta defensive snaps and 73
special-teams snaps to resolved attribution. `SmitCh04` contributes 2 restored
Jets special-teams snaps. Neither reviewed override adds offensive production.
After the semantic correction, gate failures are ATL/CHI/SEA offensive-snap
resolved attribution, plus NYJ offensive-snap and defensive-snap resolved
attribution.

Phase 5C-2G diagnosed the systematic ~53% offensive-snap attribution pattern.
The root cause was not retained-status coupling. Identity attribution was already
calculated separately from retained numerator, but snap rows carried only PFR IDs
while many prior roster offensive linemen carried GSIS IDs with blank `pfr_id`.
The crosswalk only used fallback identity keys when no provider ID existed, so
PFR-only snap rows with an unmatched PFR ID could not bridge to a unique prior
roster row by exact name, team, and compatible offensive-line position group.

The safe correction is prior-roster-first:

1. Resolve prior-season snap rows against prior-season roster identity evidence.
2. Use provider IDs first.
3. When the PFR ID has no prior-roster match, allow exact normalized
   name/team/source-aware position-group fallback to a unique prior roster row.
4. Assign canonical identity.
5. Separately check the target-season roster for retained status.

Departed players now remain resolved identity attribution and still contribute
zero to retained numerator. Incoming players' prior production is not counted as
retained for the new team.

Updated live snap attribution:

| Team | Offensive snap attribution before | Offensive snap attribution after | Defensive snap attribution before | Defensive snap attribution after |
| --- | ---: | ---: | ---: | ---: |
| ATL | 0.532515 | 0.987475 | 0.989952 | 1.000000 |
| CHI | 0.541988 | 1.000000 | 0.984326 | 0.984326 |
| NYJ | 0.539422 | 0.999306 | 0.921794 | 0.922117 |
| SEA | 0.529819 | 0.973342 | 0.986471 | 0.986471 |

Updated retained snap shares:

| Team | Offensive snaps retained | Defensive snaps retained | Special-teams snaps retained |
| --- | ---: | ---: | ---: |
| ATL | 0.691772 | 0.622467 | 0.510578 |
| CHI | 0.759571 | 0.460476 | 0.560096 |
| NYJ | 0.727643 | 0.653834 | 0.722997 |
| SEA | 0.925923 | 0.789452 | 0.914791 |

Remaining unresolved snap quantities:

| Team | Offensive snaps | Defensive snaps | Special-teams snaps |
| --- | ---: | ---: | ---: |
| ATL | 151 | 0 | 76 |
| CHI | 0 | 185 | 207 |
| NYJ | 8 | 967 | 101 |
| SEA | 312 | 167 | 117 |

The remaining high-impact unresolved queue is no longer dominated by generic
offensive-line gaps. Top records are Sauce Gardner (`GardSa00`, NYJ defensive
snaps 410), Quinnen Williams (`WillQu00`, NYJ defensive snaps 365), Olusegun
Oluwatimi (`OluwOl00`, SEA offensive snaps 312), Carl Jones (`JoneCa05`, CHI
special-teams snaps 148), Michael Carter II (`CartMi02`, NYJ defensive snaps
145), and Ray-Ray McCloud (`McClRa00`, ATL offensive snaps 139). These records
have no prior-roster PFR match or safe fallback candidate in the approved roster
input and need source-backed review before any override.

PFR-to-GSIS direct prior-roster coverage remains incomplete:

| Team | Prior roster players | With PFR ID | PFR coverage |
| --- | ---: | ---: | ---: |
| ATL | 100 | 69 | 0.690000 |
| CHI | 92 | 66 | 0.717391 |
| NYJ | 103 | 79 | 0.766990 |
| SEA | 88 | 60 | 0.681818 |

Across the sample, 224 snap PFR IDs have a unique prior-roster PFR match. Another
66 snap PFR IDs have no direct prior-roster PFR match, covering 22,263 offensive
snaps, 1,541 defensive snaps, and 3,488 special-teams snaps before fallback or
review resolution.

nflverse ID-mapping feasibility: the documented `players` release is the best
approved supplemental candidate for remaining PFR-to-GSIS gaps. The documented
dictionary includes `gsis_id` as the primary key plus `pfr_id`, `espn_id`,
`sportradar_id`, `position`, `position_group`, and `latest_team`. Phase 5C-2G
documents this candidate only; it does not ingest the `players` release.

Current expansion gates: critical conflicts remain zero. ATL, CHI, and NYJ now
pass the offensive-snap attribution gate. SEA still fails offensive-snap
attribution at 0.973342, and NYJ still fails defensive-snap attribution at
0.922117. All-32 identity expansion is still not safe.

## Unresolved Decisions Requiring Approval

- Whether to approve and fund SportsDataIO as the primary structured personnel
  source.
- Whether Sportradar access already exists or should be considered too costly.
- Whether normalized derived data from paid providers may be committed publicly.
- Whether nflverse PFR-derived snap/advanced-stat components are acceptable for
  committed derived artifacts with attribution.
- Whether official team/NFL pages may be used through manual source-entry only
  or through a constrained fetcher.
- Exact freshness windows for offseason transactions, depth charts, coaching,
  and injury-return evidence.
- Whether Phase 5C audit artifacts should live in `data/nfl/personnel/audit/`
  or only under temp paths until source licensing is settled.

## External References Checked

- nflreadr package index:
  `https://nflreadr.nflverse.com/reference/index.html`
- nflverse data schedule:
  `https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html`
- nflreadr player stats:
  `https://nflreadr.nflverse.com/reference/load_player_stats.html`
- nflreadr snap-count dictionary:
  `https://nflreadr.nflverse.com/articles/dictionary_snap_counts.html`
- nflverse release listing:
  `https://nflreadr.nflverse.com/reference/nflverse_releases.html`
- SportsDataIO NFL workflow guide:
  `https://sportsdata.io/developers/workflow-guide/nfl`
- SportsDataIO NFL data dictionary:
  `https://sportsdata.io/developers/data-dictionary/nfl`
- Sportradar NFL daily transactions:
  `https://developer.sportradar.com/football/reference/nfl-daily-transactions`
- Sportradar NFL game roster:
  `https://developer.sportradar.com/football/reference/nfl-game-roster`
- Sportradar NFL weekly injuries:
  `https://developer.sportradar.com/football/v5/reference/nfl-weekly-injuries`
- API-Sports NFL docs:
  `https://api-sports.io/documentation/nfl/v1`
- MySportsFeeds data feeds/pricing:
  `https://www.mysportsfeeds.com/data-feeds`,
  `https://www.mysportsfeeds.com/feed-pricing/`
- The Odds API docs:
  `https://theoddsapi.com/docs/`
- Sports Reference terms/data-use pages:
  `https://www.sports-reference.com/termsofuse.html`,
  `https://www.sports-reference.com/data_use.html`
- NFL.com terms:
  `https://www.nfl.com/legal/terms/`

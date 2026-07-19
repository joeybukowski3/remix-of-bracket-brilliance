# NFL Personnel Evidence Architecture

Status: Phase 5A architecture pass for 2026 NFL season readiness.

This document defines the data completion workflow required before an official
improvement/decline model can be scored. It does not define a score, change the
NFL v0.3 ratings, add UI, or populate missing player data.

Phase 5B adds infrastructure only:

- Schema and validation helpers live in `scripts/lib/nfl-personnel/schema.mjs`.
- Identity helpers live in `scripts/lib/nfl-personnel/identity.mjs`.
- Transaction reconciliation lives in `scripts/lib/nfl-personnel/transactions.mjs`.
- Completeness gates live in `scripts/lib/nfl-personnel/completeness.mjs`.
- The fixture/local generator is `scripts/generate-nfl-personnel-evidence.mjs`.
- The synthetic fixture is `scripts/fixtures/nfl-personnel/personnel-evidence.fixture.json`.
- The compatibility adapter is additive in `src/lib/nfl/offseasonEvidence.ts`.

No real all-32-team player data is populated yet, and no production
`public/data/nfl/<season>/personnel-evidence.json` is checked in.

Phase 5C-2A/2B adds a read-only nflverse audit path for ATL, CHI, NYJ, and SEA:

- Provider adapter:
  `scripts/lib/nfl-personnel/providers/nflverse/audit.mjs`
- Audit CLI: `scripts/generate-nfl-personnel-nflverse-audit.mjs`
- Cache validator: `scripts/validate-nfl-personnel-nflverse-cache.mjs`
- Synthetic fixtures: `scripts/fixtures/nfl-personnel/nflverse/`
- Non-production output location:
  `artifacts/nfl/personnel-audit/nflverse-four-team-audit.json`

This audit proves roster identity matching, provider-ID crosswalk behavior, and
returning-production math using the approved nflverse roster, player-stats, and
snap-count families. It still
does not populate all 32 teams, does not create
`public/data/nfl/<season>/personnel-evidence.json`, and does not score team
improvement or decline.

## Existing Source Inventory

| Path | Provider | Seasons | Teams | Update process | Freshness | Structure | Reliability | Licensing or redistribution concern | Canonical artifact fit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `public/data/nfl/teams.json` | Repo canonical mapping, aligned to nflverse and site data | Season-agnostic | 32 | Hand-curated, test-guarded | `_meta.generatedAt` 2026-07-07 | Structured JSON | High for team identity | Low evident concern, but still repo-owned mapping | Yes, canonical team identity input |
| `public/data/nfl/<season>/games.json` | nflverse `nfldata` games CSV | 2022-2026 | 32 where scheduled | `npm run nfl:schedules`, workflow `nfl-schedules-results.yml` | 2026 files generated 2026-07-07 | Structured generated JSON | High for schedule/results identity, not personnel | Source notes say betting columns are not ingested | No for personnel, useful for team/week validation |
| `public/data/nfl/<season>/results.json` | nflverse `nfldata` games CSV | 2022-2026 | Completed-game teams | Same as games | 2026 empty until finals | Structured generated JSON | High for completed results, not personnel | Same as games | No for personnel, useful for prior-season production context only at team level |
| `public/data/nfl/<season>/team-stats.json` | Repo aggregation from results plus nflverse `stats_team` | 2022-2026 | 32 | `npm run nfl:team-ratings`, workflow `nfl-team-ratings.yml` | 2026 generated 2026-07-07, no games yet | Structured generated JSON | High for team-level EPA/plays, not player retention | nflverse source URL recorded; license terms not encoded in repo | No for personnel, can support sanity/context only |
| `public/data/nfl/<season>/power-ratings.json` | Repo experimental model | 2022-2026 | Rated teams when games exist | Same as team-stats | 2026 generated 2026-07-07, empty ratings | Structured generated JSON | Not an evidence source for personnel | Internal model output | No, explicitly out of scope |
| `public/data/nfl/<season>/full-season-team-metrics.json` | Repo NFL v0.3 generated metrics | 2022-2026 | 32 where source season exists | `scripts/generate-nfl-v03-artifacts.mjs` | 2026 generated 2026-07-14 | Structured generated JSON | Useful for team performance, not player retention | Internal generated artifact | No, do not modify for personnel Phase 5A |
| `public/data/nfl/<season>/final-eight-team-metrics.json` | Repo NFL v0.3 generated metrics | 2022-2026 | 32 where source season exists | Same as v0.3 artifacts | 2026 generated 2026-07-14 | Structured generated JSON | Useful for trajectory context, not personnel | Internal generated artifact | No, do not modify for personnel Phase 5A |
| `public/data/nfl/<season>/context-flags.json` | Repo NFL v0.3 context flags | 2022-2026 | 32 possible | Same as v0.3 artifacts | 2026 generated 2026-07-14 | Structured generated JSON | Manual/context screen only, not personnel completion | Internal generated artifact | No |
| `public/data/nfl/<season>/manual-adjustments.json` | Repo owner-maintained adjustments | 2023-2026 present | Any team with entries | Same as v0.3 artifacts plus owner entries | 2026 generated 2026-07-14 | Structured generated JSON | Not personnel source; adjustment entries are intentionally not invented | Internal generated artifact | No |
| `public/data/nfl/<season>/preseason-power-ratings.json` | Repo NFL v0.3 preseason ratings | 2023-2026 | 32 | `scripts/generate-nfl-v03-artifacts.mjs` | 2026 generated 2026-07-14 | Structured generated JSON | Rating output only | Internal model output | No |
| `data/nfl/nflverse/stats-team-week/*.csv` | nflverse `stats_team` weekly release | 2022-2025 | 32 | Committed immutable cache, validated offline | Retrieved 2026-07-14 per manifest | Structured CSV | High for team-week totals, no player IDs | Source URLs stored; license terms not encoded | No for personnel, useful adapter pattern |
| `data/nfl/nflverse/stats-team-week/manifest.json` | Repo provenance manifest for cached nflverse CSVs | 2022-2025 | 32 observed teams | Generated/maintained with cache | Retrieved 2026-07-14 | Structured JSON | High for provenance and byte integrity | Same as cached CSVs | Yes as pattern for source cache manifests |
| `src/data/nflOffseason2026.ts` | Repo manual offseason snapshot | 2026 target | 32 coach records, selective player moves | Manual updates | Verified through 2026-06-23 | Structured TypeScript | Medium: useful but incomplete by design | Repo interpretation of public reporting; source URLs absent | Transitional input only, not final canonical artifact |
| `src/data/nflWarrenSharpTeams2026.ts` | Warren Sharp 2026 Football Preview | 2026 guide, with 2025 context | 32 | Hand-extracted into TypeScript | Source date not encoded | Structured TypeScript | Medium-high for extracted guide facts, incomplete transaction coverage | Paid/guide content; avoid broad public redistribution | Supplemental input only |
| `src/data/nflWarrenSharpAdvanced2026.ts` | Warren Sharp 2026 Football Preview, some FTN AGL attribution | 2025 context for 2026 | 32 team rows, QB metrics subset | Hand-extracted into TypeScript | Source date not encoded | Structured TypeScript | Medium for projected QB and health-by-unit context; not player injury readiness | Paid/guide and FTN-attributed context | Supplemental input only |
| `src/data/nflVsinGuide2026.json` | VSiN 2026 NFL Betting Guide | 2025 stats, 2026 guide | 32 | Extracted JSON | Source date not encoded | Structured JSON | Good for team stat context, not personnel evidence | Paid/guide content; avoid public table republication | No for personnel |
| `src/data/nflWarrenSharpSchedule2026.json` | Warren Sharp schedule extract | 2026 | 32 | Extracted JSON | Source date not encoded | Structured JSON | Schedule/rest context only | Paid/guide content | No for personnel |
| `src/lib/nfl/offseasonEvidence.ts` | Repo adapter/contract | 2026 target | 32 | Pure TypeScript assembly from checked-in sources | Assembled at 2026-07-17 | Structured TypeScript contract | Good contract, intentionally incomplete coverage | Depends on upstream source concerns | Stable public evidence contract to adapt to generated artifacts |
| `docs/nfl-offseason-evidence.md` | Repo documentation | 2026 target | 32 | Manual docs | Updated with Phase 4 | Documentation | High for current contract limitations | None | Keep, link to architecture |
| `docs/nfl-data-inventory.md` | Repo documentation | 2022-2026 | 32 | Manual docs | Current PR foundation | Documentation | High for existing pipeline conventions | Notes free-first mandate | Keep as base inventory |
| `scripts/generate-nfl-schedules-results.mjs` and `scripts/lib/nfl-schedules-results-core.mjs` | nflverse games CSV | 2022-2026 | 32 | Fetch or local input, writes generated JSON | Runtime fetch when run | Structured generator | High for schedule/results, not personnel | Avoids betting columns | Pattern only |
| `scripts/generate-nfl-team-stats-power-ratings.mjs` and `scripts/lib/nfl-team-ratings-core.mjs` | nflverse `stats_team`, repo results | 2022-2026 | 32 | Fetch or local stats dir, writes generated JSON | Runtime fetch when run | Structured generator | High for team-level stats, no player retention | No betting fields read | Pattern only |
| `scripts/lib/nfl-advanced-stats.mjs` | nflverse `stats_team` parser | 2022-2026 capable | 32 | Library consumed by ratings generator/tests | Runtime source freshness | Structured parser | High for team-week totals, no player-level stats | Source URL encoded | Pattern for adapters and validation |
| `scripts/validate-nfl-weekly-source-cache.mjs` | Repo cache validator | 2022-2025 | 32 | Offline validation | Manifest retrieved 2026-07-14 | Structured validator | High validation pattern | Same as cache | Pattern for personnel source cache validation |
| `.github/workflows/nfl-schedules-results.yml` | GitHub Actions | 2022-2026 | 32 | Daily Sep-Feb, commits to main | Runs only when scheduled/dispatch | Workflow | Reliable for schedule/result freshness | None beyond source terms | Pattern for future personnel workflow, do not modify in Phase 5A |
| `.github/workflows/nfl-team-ratings.yml` | GitHub Actions | 2022-2026 | 32 | Tuesdays Sep-Feb, commits to main | Runs only when scheduled/dispatch | Workflow | Reliable for ratings refresh, not personnel | None beyond source terms | Pattern only |
| `api/nfl/team-schedule.ts` | ESPN site API | 2026 | One requested team, validated against site abbrs | Runtime API with 30-minute cache | Live at request time | Structured API response | Good schedule fallback, not personnel | ESPN API terms not encoded | No |
| `api/nfl/super-bowl-odds.ts` | Polymarket Gamma API | Current market | Recognized teams in active market | Runtime API with 5-minute cache | Live at request time | Structured API response | Market data only | Market/public API terms not encoded | No |
| `package.json` | Repo scripts | 2022-2026 NFL scripts present | 32 through scripts | Manual command invocation | Current | Structured scripts list | Reliable command registry | None | Add future personnel commands here in Phase 5B |
| `src/lib/nfl/*test*` | Repo tests | Mostly 2022-2026 | 32 in many tests | Vitest | Current | Structured tests | High for invariants | None | Extend with generated personnel artifact tests |

No repository-owned source currently contains complete player-level snaps,
starts, rosters, depth charts, official transaction logs, injured reserve,
games missed, or returning-production joins.

## Required Evidence Categories

### Quarterback Continuity

Required fields:

- `teamId`, `abbr`, `targetSeason`
- `status`: `returning_starter`, `new_starter`, `open_competition`, `rookie_candidate`, `veteran_acquisition`, `unknown`
- `playerId` when resolved, otherwise `playerName`
- `priorTeamId` and `newTeamId` when applicable
- `basis`: sourced projected starter, official depth chart, transaction, coach quote, or competition note
- `effectiveDate`
- `sourceRefs`
- `verificationStatus`: `verified`, `partially_verified`, `unverified`, `conflicted`

Optional enrichments:

- prior-season pass attempts, starts, EPA source pointer, contract/draft capital,
  competition participants, depth-chart rank history.

### Returning Production

Required fields by team and side/unit:

- `teamId`, `targetSeason`, `sourceSeason`
- `sourceCutoff`
- retained totals and denominators for available categories
- `completeness`: available, unavailable, partial, or blocked
- `sourceRefs`
- `validationWarnings`

Minimum category targets:

- offensive snaps retained
- defensive snaps retained
- starts retained
- QB pass attempts retained
- rushing production retained
- receiving production retained
- offensive-line snaps retained
- pass-rush production retained
- secondary snaps retained

Optional enrichments:

- special-teams snaps retained, position-group denominators, player-level retained
  shares, playoff inclusion flags, games active, games started by position, pressure
  rates, coverage snaps, alignment buckets.

Do not assume all categories are immediately obtainable. A category can be
mandatory for scoring only after an approved source can produce it for all 32
teams.

### Injury Returns

Required fields:

- `teamId`, `playerId` when resolved, `playerName`, `position`
- `gamesMissed`
- `availabilityCategory`: injured reserve, PUP/NFI, missed regular-season games,
  late-season absence, postseason absence, unknown
- `expectedReturnStatus`: expected available, limited/uncertain, not expected, unknown
- `priorRole`: starter, rotation, depth, specialist, unknown
- `sourceDate`
- `sourceRefs`
- `verificationStatus`

Optional enrichments:

- injury label, transaction designation, return-to-practice date, activation date,
  prior-season snap share, prior-season starts.

Do not infer medical readiness. Use only sourced availability language and keep
team optimism, beat reports, and official designations distinct.

### Transactions

Required fields:

- `transactionId`
- `playerId` when resolved, `playerName`, `position`
- `type`: addition, departure, trade, release, retirement, draft_addition,
  waiver_claim, practice_squad, unsigned_free_agent, extension_only, unknown
- `previousTeamId`, `newTeamId`
- `transactionDate`
- `sourceRefs`
- `verificationStatus`

Optional enrichments:

- expected role only when sourced, contract terms, draft round/pick, trade assets,
  roster designation, active/practice-squad status, voided/reversed status.

### Coaching Continuity

Required fields:

- `teamId`, `targetSeason`
- `role`: head coach, offensive coordinator, defensive coordinator
- `coachName`
- `status`: returning, new, changed_role, interim, unknown
- `priorRole`
- `effectiveDate`
- `sourceRefs`
- `verificationStatus`

Optional enrichments:

- play-caller status, scheme family, position coach promotions, prior team,
  coordinator title variants, source quote.

Scheme transition may be recorded only when sourced.

## Proposed Generated Artifacts

Use one consolidated artifact first:

- `public/data/nfl/2026/personnel-evidence.json`

The artifact should include:

- `schemaVersion`: `nfl-personnel-evidence-v0.1`
- `targetSeason`
- `generatedAt`
- `sourceCutoff`
- `sources`: source id, provider, URL/path, retrieved date, source date, license note
- `completeness`: all-team and per-category summaries
- `teams`: one record per canonical team
- item-level provenance on every QB, transaction, production, injury, and coaching row
- `validationWarnings`
- `conflicts`

Recommended top-level shape:

```json
{
  "schemaVersion": "nfl-personnel-evidence-v0.1",
  "targetSeason": 2026,
  "generatedAt": "ISO",
  "sourceCutoff": "YYYY-MM-DD",
  "sources": [],
  "completeness": {},
  "teams": [],
  "validationWarnings": [],
  "conflicts": []
}
```

A consolidated file is preferable for Phase 5B because completeness gates need
cross-category validation: a QB move affects transactions, QB continuity, and
returning production; a coordinator change affects coaching continuity and scheme
provenance. Splitting early into
`returning-production.json`, `coaching-continuity.json`, and transaction files
would reduce file size and ownership friction later, but it would make conflict
visibility and scoring gates easier to bypass. Split only when the consolidated
artifact becomes too large, has clearly separate refresh cadences, or needs
different licensing exposure.

If split later, keep one generated index:

- `public/data/nfl/2026/personnel-evidence.json` as the manifest and gate record
- category shards under `public/data/nfl/2026/personnel/`

Implemented schema version:

- `nfl-personnel-evidence-v0.1`

Local fixture commands:

```bash
npm run nfl:personnel:validate
npm run nfl:personnel:generate:fixture
npm run nfl:personnel:nflverse:audit
npm run nfl:personnel:nflverse:validate-cache
```

Direct generator usage:

```bash
node scripts/generate-nfl-personnel-evidence.mjs \
  --season=2026 \
  --prior-season=2025 \
  --input=scripts/fixtures/nfl-personnel/personnel-evidence.fixture.json \
  --output=C:\tmp\personnel-evidence.json
```

`--validate-only` validates and prints a summary without writing. `--dry-run`
builds and validates the deterministic artifact without writing. The generator
does not fetch external providers; every run must use explicit fixture/input
paths.

The nflverse audit CLI requires explicit seasons and a fixed `--generated-at`
timestamp for deterministic output. It accepts `--fixture-dir`, explicit local
CSV paths, or explicit nflverse URLs. When `--cache-dir` is supplied, downloaded
public nflverse files are cached with a manifest and SHA-256 checksums. Raw
cache files under `data/nfl/personnel/raw/` are ignored by git.

The approved Phase 5C-2B nflverse inputs are:

- `roster_<targetSeason>.csv` from the `rosters` release for roster presence,
  identity fields, roster status, depth-chart position, and years of experience.
- `roster_<priorSeason>.csv` from the `rosters` release for prior-season
  identity crosswalk support and PFR-to-GSIS joins.
- `stats_player_reg_<priorSeason>.csv` from the `stats_player` release for
  prior regular-season pass attempts, carries, rushing yards, targets,
  receptions, and receiving yards. Phase 5C-2A selected the older
  `player_stats/player_stats_season.csv` aggregate, which was stale and did not
  include 2025 rows. The current nflreadr regular-season loader resolves to
  `stats_player/stats_player_reg_<season>.csv`.
- `snap_counts_<priorSeason>.csv` from the `snap_counts` release for offensive,
  defensive, and special-teams snaps. nflreadr documents this family as
  PFR-provided, so production storage/public redistribution needs source-term
  review.

The audit-only output now includes `playerStatSourceDiagnosis`,
`identityCrosswalk`, `identityCoverageByTeam`,
`identityAttributionAccounting`, `unmatchedProductionSummary`,
`retentionUnmatchedProductionSummary`, and retained offensive-production metrics
with matched-player and unmatched production counts. `recent_team` is used as
the nflverse prior-production team assignment; multi-team/traded-player
ambiguity is surfaced through the crosswalk rather than silently corrected.

Phase 5C-2C extends the audit with identity-review infrastructure:

- `identityReview.reasonTaxonomy` classifies unresolved identities as missing
  GSIS, PFR-only snap identity, provider-ID conflict, same-name distinct people,
  name/suffix/punctuation variant, position change, legitimate team change,
  roster/stats/snap source gap, same-date team conflict, conflicting provider
  name, insufficient evidence, or other.
- `identityReview.resolutionPolicy` documents automatic resolution, warning
  inclusion, mandatory exclusion, and no-fuzzy-matching rules.
- `identityReview.criticalConflicts` preserves every source row using the
  conflicting provider ID, including names, teams, positions, seasons, games,
  and roster provider IDs.
- `identityReview.productionImpactByTeam` quantifies affected offensive snaps,
  defensive snaps, QB attempts, rushing production, and receiving production,
  with lower/upper retained-share bounds.
- `identityReview.identityQualityByTeam` reports GSIS-resolved,
  provider-crosswalk resolved, deterministic fallback resolved,
  warning-included, excluded, critical-conflict, retained-share, resolved
  attribution, accounted-for coverage, and unresolved-share counts.
- `identityReview.all32ExpansionGateEvaluation` remains false when critical
  conflicts or sub-98% attribution thresholds are present.

The CLI can emit a separate audit-only review artifact:

```bash
node scripts/generate-nfl-personnel-nflverse-audit.mjs \
  --season=2026 \
  --prior-season=2025 \
  --generated-at=2026-07-17T12:00:00.000Z \
  --source-cutoff=2026-07-17 \
  --fixture-dir=scripts/fixtures/nfl-personnel/nflverse \
  --output=artifacts/nfl/personnel-audit/nflverse-four-team-audit.json \
  --identity-review-output=artifacts/nfl/personnel-audit/nflverse-four-team-identity-review.json \
  --audit-override
```

`--fail-on-critical-conflict` exits nonzero when provider-ID conflicts remain
unless `--audit-override` is supplied. The CLI refuses `public/data/nfl/` output
paths for audit artifacts.

Phase 5C-2D adds reviewed identity overrides without weakening automatic
matching:

- Review file:
  `data/nfl/personnel/reviewed-identity-overrides.json`
- Schema version:
  `nflverse-reviewed-identity-overrides-v0.1`
- Validation command:
  `npm run nfl:personnel:nflverse:validate-overrides`
- Audit-with-overrides command:
  `npm run nfl:personnel:nflverse:audit-with-overrides`

Each override must include provider, provider-person ID, season scope,
canonical person ID, GSIS ID when available, canonical name, source name
variants, team scope, position context, resolution type, evidence references,
review metadata, status, and expiration/permanence metadata. `approved`
overrides require evidence references, `reviewedBy`, and `reviewedAt`.
Repository-authored proposed mappings stay `pending` until the user approves a
reviewer label and date.

Resolution priority is fixed:

1. Stable GSIS identity.
2. Unambiguous provider crosswalk.
3. Approved reviewed override.
4. Deterministic fallback with warning.
5. Unresolved/excluded.

Validation rejects duplicate active overrides, one provider ID mapped to
multiple canonical people, inconsistent GSIS mappings, missing evidence,
missing approved-review metadata, invalid or expired season scope, unknown
source references when row IDs are available, placeholder dates/URLs, and
approval based only on fuzzy name similarity. Overrides are considered only when
their evidence matches the loaded source rows and no higher-priority stable ID
contradicts the mapping.

The audit output records considered/applied/rejected override decisions and
their evidence refs. Pending override simulation is explicitly labeled
`simulationOnly`; it can show before/after conflict counts and affected metrics,
but it does not modify normal audit results.

Phase 5C-2E approved `nflverse-pfr-2025-alfode00-atl-review` and
`nflverse-pfr-2025-smitch04-nyj-review` with `reviewedBy: joeybukowski3`,
`reviewedAt: 2026-07-19`, `status: approved`, `sourceSeason: 2025`,
`expiresAfterSeason: 2025`, and `permanent: false`. The mappings are
season-scoped to 2025 source evidence.

The live approved-only audit applied both overrides, rejected neither due to
higher-priority GSIS evidence, and reduced critical provider conflicts from 2
to 0. `AlfoDe00` accounts for 582 Atlanta defensive snaps and no offensive
production. `SmitCh04` accounts for 2 New York Jets special-teams snaps and no
offensive or defensive production. Pending simulation is no longer needed for
these records.

Phase 5C-2F corrected the audit semantics. The Phase 5C-2E values previously
described as attribution percentages were retained-production shares:

```text
retainedShare = retained resolved production / complete prior-team production
resolvedAttributionCoverage = resolved source quantity / total source quantity
accountedForCoverage = (resolved + warning fallback + quantified unresolved) / total source quantity
unresolvedShare = unresolved source quantity / total source quantity
```

Retained share is roster-continuity evidence and is not an identity-quality
gate. `sourceCoverageComplete` describes whether the underlying nflverse source
denominator exists for the intended metric and season. `identityCoverageComplete`
describes whether no unresolved identity quantity remains for that metric.

The critical-conflict gate clears for the four-team sample. Offensive-production
resolved attribution is 100% for ATL, CHI, NYJ, and SEA, and accounted-for
coverage is 100% for the core offensive-production and snap metrics. The sample
still fails identity expansion because ATL, CHI, NYJ, and SEA remain below 98%
resolved offensive-snap attribution, and NYJ remains below 98% resolved
defensive-snap attribution.

The audit emits unsupported metrics as unavailable, not zero: starts,
offensive-line snaps, sacks, pressures, and defensive-back snaps. It also keeps
QB continuity and coaching continuity as unknown because the approved nflverse
files do not prove official starter status or staff continuity.

## Source Hierarchy

General rules:

- Higher-priority sources override only when facts genuinely conflict.
- Lower-priority sources may supplement missing fields.
- Conflicting evidence remains visible in `conflicts`.
- No unsupported source dates.
- No invented source URLs.
- No silent manual overrides.

Priority by category:

| Category | Priority order |
| --- | --- |
| QB continuity | 1. official team/league depth chart or transaction, 2. approved structured roster/depth provider, 3. approved public roster/schedule source, 4. Warren Sharp/VSiN context, 5. repo manual evidence |
| Returning production | 1. approved structured statistical provider with player/team IDs and snaps/starts, 2. official league/player participation source if available, 3. approved public stats source, 4. Warren Sharp/FTN context only for aggregate health, 5. repo manual evidence only for unavailable markers |
| Injury returns | 1. official team/league transaction and injury designation, 2. approved structured injury/participation provider, 3. approved public transaction source, 4. Warren Sharp/FTN aggregate health context, 5. repo manual evidence |
| Transactions | 1. official league transaction log and team announcements, 2. approved structured transaction provider, 3. approved public roster source, 4. Warren Sharp/VSiN context, 5. repo manual evidence |
| Coaching continuity | 1. official team staff pages/announcements, 2. approved structured staff provider, 3. approved public reporting source, 4. Warren Sharp/VSiN context, 5. repo manual evidence |

## Generator And Validation Architecture

Recommended scripts:

- `scripts/generate-nfl-personnel-evidence.mjs`
- `scripts/lib/nfl-personnel/schema.mjs`
- `scripts/lib/nfl-personnel/sources/*.mjs`
- `scripts/lib/nfl-personnel/identity.mjs`
- `scripts/lib/nfl-personnel/transactions.mjs`
- `scripts/lib/nfl-personnel/returning-production.mjs`
- `scripts/lib/nfl-personnel/validation.mjs`

Recommended package commands:

- `nfl:personnel-evidence`: generate canonical artifact
- `nfl:personnel-evidence:validate`: validate committed source caches and artifact
- `nfl:personnel-evidence:dry-run`: generate to a temp/output directory without writing production files

Recommended workflow:

- Manual `workflow_dispatch` for Phase 5B.
- Scheduled offseason refresh only after sources are approved and source terms are documented.
- Never push generated personnel evidence without validation passing.

Adapters:

- Each source adapter returns normalized facts plus raw provenance.
- Adapters cannot assign final conflict resolution.
- Adapters must use canonical team IDs from `teams.json`.
- Player identity is resolved through stable IDs when provided by source; otherwise
  through normalized name plus position, team, date, and source-specific key.

Identity handling:

- Keep `playerId`, `sourcePlayerId`, `playerName`, `normalizedName`, suffix, position,
  birth date or college only if sourced.
- Do not merge duplicate names without a stable ID or strong disambiguators.
- Normalize suffixes for matching, but preserve display names.
- Track team code aliases, including `LA` to `lar` and `WAS` to `wsh`.
- Fail on unknown team abbreviations unless an explicit alias map handles them.

Deduplication:

- Deduplicate exact same source fact by source id and source row key.
- Merge corroborating facts only when player identity, transaction type, teams,
  and date are compatible.
- Preserve all supporting sources.
- Mark incompatible rows as conflicts instead of dropping one.

Transaction reconciliation:

- A traded player should appear as a departure for the old team and an addition
  for the new team, linked by one `movementId`.
- Multi-team movement creates an ordered movement chain by transaction date.
- Retired players remain departures with `newTeamId: null` and terminal status.
- Practice-squad/depth signings are transactions but do not receive expected role
  unless sourced.
- Unsigned free agents are departures only when a source confirms the previous
  team separation or free-agent status.
- Rookie records have no NFL production retained unless a source gives prior NFL
  production.
- Releases and later re-signings must both remain visible and net to current
  roster status only after date ordering.
- Players missing from one source but present in another remain partial, not
  deleted.

Returning-production methodology:

1. Build prior-season player production by canonical prior team.
2. Build target-season roster/transaction status through `sourceCutoff`.
3. Mark retained production when the player remains with the same team or has
   no sourced departure.
4. Remove production when a sourced departure, retirement, or unsigned status is
   confirmed.
5. Add incoming production separately as acquired production, not retained
   production.
6. Calculate team retained shares only from categories with complete denominator
   coverage.
7. Emit unavailable/partial category warnings instead of filling zeroes.

Identity attribution methodology:

1. Build total source denominators from regular-season source rows before
   target-roster retention decisions.
2. Classify every source quantity as resolved, restored by an approved override,
   warning-level fallback, or unresolved/excluded.
3. Compute `resolvedAttributionCoverage` from resolved canonical identities only.
4. Compute `accountedForCoverage` from resolved, warning-level fallback, and
   explicitly quantified unresolved quantities.
5. Keep `retainedShare`, `unresolvedShare`, `sourceCoverageComplete`, and
   `identityCoverageComplete` as separate fields.
6. Do not let low retained share fail an identity expansion gate.

Injury-return handling:

- Treat injury returns as evidence, not projections.
- `expectedReturnStatus` must come from source language or official designation.
- Games missed should come from a structured game/active/injury source where
  possible.
- Player role should come from prior starts/snaps or an explicit source.
- Conflicting availability reports remain visible.

Completeness scoring:

- Count category completeness by all 32 teams, item provenance coverage,
  unresolved conflicts, and source freshness.
- Completeness is not team quality.
- A category with no approved source should be `unavailable`, not `complete`.

Freshness and determinism:

- Every run records `generatedAt` and `sourceCutoff`.
- Every source records source date and retrieval date separately.
- Output sorting must be deterministic by team, category, date, player identity,
  and source id.
- Validation fails on malformed dates, unknown teams, duplicate source row keys,
  missing required provenance, or unresolved mandatory conflicts.

Failure behavior:

- Hard fail when canonical team identity is unknown.
- Hard fail when required source metadata is missing.
- Hard fail when all-team mandatory categories regress from complete to partial.
- Warn, but do not fail, on advisory category gaps before scoring is enabled.
- Fixture/local generation exits nonzero on schema or reconciliation validation
  failure.
- Output is written only after validation succeeds.

## Migration Path

Keep `src/lib/nfl/offseasonEvidence.ts` stable during the transition.

Phase 5B should add an adapter that reads
`public/data/nfl/2026/personnel-evidence.json` and maps generated facts into the
existing public evidence record shape. The current Warren Sharp and manual
adapters can remain as fallbacks until the generated artifact reaches the scoring
gates.

Phase 5B implemented the adapter as
`mergeGeneratedPersonnelEvidenceDataset(baseDataset, generatedDataset)` in
`src/lib/nfl/offseasonEvidence.ts`. It supplements the stable evidence contract:
generated transaction and injury records become personnel evidence, generated
coaching records become coaching evidence, generated QB continuity can supersede
manual-derived QB continuity only through the explicit generated status, and
missing generated fields do not erase existing manual/Warren Sharp evidence.
Generated conflicts remain visible as warnings. The adapter still produces no
team-quality score.

Compatibility rules:

- Preserve existing exported types unless a concrete consumer need requires an
  additive type.
- Preserve existing tests and add artifact-adapter parity tests.
- Keep current confidence semantics: evidence confidence only, never team quality.
- Reduce hand-entered interpretation by moving source normalization into scripts.
- Do not rewrite the current contract until generated artifacts cover all
  mandatory gates.

## Completeness Gates Before Scoring

Mandatory gates:

- All 32 canonical teams represented.
- QB continuity known or explicitly `open_competition` for all 32 teams.
- Head coach, offensive coordinator, and defensive coordinator coverage complete
  for all 32 teams.
- Transaction coverage complete through a stated `sourceCutoff`.
- Returning offensive and defensive production available for all 32 teams from
  approved structured sources.
- Item-level provenance present for every personnel, production, injury, QB, and
  coaching fact.
- No unresolved major conflicts affecting QB continuity, head coach, coordinator,
  current team, retirement, or retained-production denominators.
- Source dates and retrieval dates within the approved freshness window.
- Validation passes deterministically from clean checkout.

Advisory gates:

- Injury-return evidence present for all teams or explicitly unavailable by team.
- Offensive-line snaps retained available separately from total offensive snaps.
- Pass-rush and secondary retained production available separately from total
  defensive snaps.
- Expected role sourced for major additions/departures.
- Scheme transition provenance for every new coordinator.
- Duplicate-name disambiguation rate reported.

Do not allow official improvement/decline scoring until all mandatory gates pass.

## Unresolved Source Decisions

- Select the approved player-level source for snaps, starts, pass attempts,
  carries, targets, receptions, receiving yards, rushing yards, sacks, pressures,
  tackles, interceptions, and offensive-line/secondary/pass-rush grouping.
- Select the approved transaction source and decide whether league/team official
  pages are cached, linked, or manually referenced.
- Select the approved injury/games-missed source and decide how to represent
  uncertain medical language.
- Decide whether paid-guide-derived Warren Sharp/VSiN facts remain internal-only
  inputs or can appear in generated public JSON as summarized evidence.
- Define the freshness window for offseason sources before scoring.
- Decide whether source caches belong under `data/nfl/` with manifests before
  generated artifacts are written to `public/data/nfl/2026/`.

## Recommended Phase 5B Slice

Build schema and validation first, without fetching all teams:

1. Add `scripts/lib/nfl-personnel/schema.mjs` with pure validators for the
   consolidated artifact shape.
2. Add a fixture-only generator path that writes to a temp directory.
3. Add identity utilities for canonical team lookup and player-name preservation.
4. Add transaction reconciliation tests covering trades, multi-team movement,
   retirements, practice-squad signings, unsigned free agents, rookies, duplicate
   names, suffixes, team aliases, and missing-source players.
5. Add an adapter test proving `offseasonEvidence.ts` can consume a minimal
   generated artifact while preserving the current contract.

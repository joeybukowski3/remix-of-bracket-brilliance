# MLB Strikeout Projection Audit

Date: 2026-07-23
Branch: NewKProp
Production base audited: origin/main at f55bd07fc486c46b08c25698a9edfcc980011008

## Scope

This audit covers the current MLB strikeout props page, table rows, expanded rows, projection fields, supporting Node scripts, generated JSON artifacts, odds enrichment, workflow orchestration, and X/social export path. It intentionally does not replace the production projection.

PR #143 was verified as merged before this branch was created. GitHub reports PR #143 closed and merged on 2026-07-22 at merge commit db995f44a0271e90f8bb992dff70d125c7ddfbcc. That merge commit is present in current origin/main history.

## Current Runtime Path

The public strikeout props route is `/mlb/strikeout-props`, which renders `src/pages/MlbStrikeoutPropsWithDebug.tsx`. That wrapper renders `src/pages/MlbStrikeoutProps.tsx` and conditionally shows a workload debug panel.

`src/hooks/useMlbPropsData.ts` is the page data loader. It fetches:

- `/data/mlb/hr-props-raw.json`
- `/data/mlb/hr-props-best-bets.json`

The raw payload is normalized by `normalizeHrDashboardPayload` from `src/pages/MlbHrProps.tsx`. Strikeout table rows are built client-side by:

- `buildPitcherStrikeoutRows(batters, games, pitchers)`
- `buildPitcherStrikeoutMatchupRows(pitchers, batters, games)`

Expanded-row details are fetched separately by `src/hooks/useMlbStrikeoutPropDetails.ts` from:

- `/data/mlb/strikeout-prop-details.json`

## Current Production Projection

The current canonical raw pitcher fields are produced by `scripts/generate-mlb-hr-props.mjs`, then wrapped by `scripts/generate-mlb-hr-props-with-k-shadow.mjs`.

Current committed MLB data has:

- `kProjectionMode: "shadow"`
- `kProjectionModelVersion: "workload-team-k-v3"`
- row-level `projectionSource: "legacy"` for ordinary shadow-comparison rows
- row-level `projectionFallbackReason: "MODE_SHADOW_COMPARISON"`

That means the live `Proj K` field remains the legacy projection for normal starters even though candidate workload/team projection fields are attached for comparison.

### Exact Current `Proj K` Formula

Legacy formula:

```text
projectedKs = round_1_decimal((projectedIP * projectedK9) / 9)
```

Source:

- `scripts/generate-mlb-hr-props.mjs`
- `calculateProjectedKs(projectedIP, projectedK9)`

Client-side best-bet code also has a fallback copy of this calculation in `src/lib/mlb/kPropBestBets.ts` through `resolveProjectedKs(row)`, but the table itself reads `row.projectedKs` from normalized pitcher data.

### Exact Current `Projected IP` Formula

Source:

- `scripts/lib/mlb-projected-innings.mjs`

Role classification:

- `seasonGS === 0` -> reliever
- otherwise starter

Role bounds:

- starter: min 3.0, max 8.0, default 5.5
- reliever: min 0.5, max 3.0, default 1.5

Formula priority:

1. If `pitcher.recentStarts` has at least 3 valid positive inning values among the latest 5 starts, use their average innings, clamped to role bounds and rounded to 1 decimal.
2. Else if `seasonIP` and `seasonGS` are valid, use `seasonIP / seasonGS`, clamped to role bounds and rounded to 1 decimal.
3. Else use the role default.

Current committed `hr-props-raw.json` pitcher rows do not expose `recentStarts`, so the final public artifact does not prove whether recent starts were present at projection time. The extracted function supports them.

### Current `Projected K9` Formula

Source:

- `scripts/generate-mlb-hr-props.mjs`
- `calculateProjectedK9(pitcher)`

Formula priority:

1. If `seasonStrikeOuts` and `seasonIP` are valid:

```text
projectedK9 = clamp((seasonStrikeOuts / seasonIP) * 9, 1, 15)
```

rounded to 1 decimal.

2. Else fallback from pitcher K% and whiff%:

```text
baseK9 = ((kRate ?? 20) / 100) * 27
skillMult = (whiffRate ?? 25) / 25
projectedK9 = clamp(baseK9 * skillMult, 3, 15)
```

rounded to 1 decimal.

Missing K% and whiff% are explicitly treated as unavailable before this fallback; if both are missing, the function returns null.

## Required Field Audit

1. Exact current `Proj K` formula: `(projectedIP * projectedK9) / 9`, rounded to 1 decimal, from `calculateProjectedKs`.
2. Exact current `Projected IP` formula: recent-start average IP if at least 3 valid latest starts, else season IP per GS, else role default, with role bounds.
3. Source of `Pitcher K%`: raw pitcher `kRate`, built in `scripts/generate-mlb-hr-props.mjs` from Statcast `k_percent` when available, otherwise derived from `seasonStats.strikeOuts / seasonStats.battersFaced`.
4. Source of `Pitcher Whiff%`: raw pitcher `whiffRate`, built from Statcast `whiff_percent`.
5. Source of `Pitcher K Score`: client-only `pitcherKSkillScore` in `buildPitcherStrikeoutRows`, weighted from pitcher K VS, K%, and whiff%.
6. Source of `Opp K%`: client-only flat average of current slate opponent hitter `kRate` values in `buildPitcherStrikeoutRows`.
7. Source of `Opp Whiff%`: client-only flat average of current slate opponent hitter `whiffRate` values in `buildPitcherStrikeoutRows`.
8. Source of `Opp K Score`: client-only `opponentTeamStrikeoutScore`, weighted from opponent lineup K%, lineup whiff%, and inverse xBA.
9. Source of K/9: `projectedK9` from `calculateProjectedK9`, primarily season strikeouts per season IP.
10. Source of average innings: `projectedIP` from `calculateProjectedInnings`, primarily recent starts if available during generation, otherwise season IP per start.
11. Source and schema of pitcher's last five starts: `scripts/generate-mlb-strikeout-prop-details.mjs` writes `pitcherLastFiveStarts` in `/data/mlb/strikeout-prop-details.json`. Rows contain `date`, `opponent`, `inningsPitched`, and `strikeouts`.
12. Source and schema of opponent's last five games against starting pitchers: same details generator writes `opponentLastFiveGames`. Rows contain `date`, `opponent`, `opposingStartingPitcher`, `opposingStarterInningsPitched`, `opposingStarterStrikeouts`, and `teamTotalStrikeouts`.
13. Pitcher home/away K% exists: no canonical field found.
14. Pitcher home/away whiff% exists: no canonical field found.
15. Team home/away K% exists: no canonical strikeout-specific field found.
16. Team home/away whiff% exists: no canonical field found.
17. Team K% versus LHP/RHP exists: model code supports `kRateVsLhp` and `kRateVsRhp`, but `scripts/generate-mlb-k-workload-shadow.mjs` currently sets them to null.
18. Projected lineup hitter-level K% exists: yes, hitter rows expose `kRate`; batting order and lineup status also exist.
19. Batters faced and pitch counts exist for recent starts: yes in workload shadow inputs derived by `scripts/mlb-k/fetch-workload-data.mjs`; no in expanded-row details artifact.
20. Recent team plate appearances exist: yes in workload shadow `opponentContext.recent14PlateAppearances`; not copied into the table row.
21. Canonical server-side K-props artifact exists: no dedicated K props artifact exists. K fields are attached to the HR raw dashboard artifact, and the table row calculations are still assembled client-side.
22. Why X workflow scrapes the client-rendered page: social K planning scripts state that K table rows are client-assembled and lack a dedicated server-side JSON artifact carrying the exact social-ready K rows. PR #143 added immutable export artifacts after selection, but initial K selection still scrapes the live page to match rendered table state.

## Currently Available Data

- Pitcher season K%, via raw `pitcher.kRate`.
- Pitcher season whiff%, via raw `pitcher.whiffRate`.
- Pitcher K/9, via raw `pitcher.projectedK9`.
- Pitcher projected IP, via raw `pitcher.projectedIP`.
- Pitcher projected Ks, via raw `pitcher.projectedKs`.
- Pitcher handedness, via raw `pitcher.hand`.
- Pitcher K VS, via raw `pitcher.kVs`.
- Current K market line, over price, under price, book, and odds slate date.
- Candidate workload fields: expected BF, expected IP, workload-only projected Ks, team-adjusted K rate, team-adjusted projected Ks, confidence grade/score, and workload flags.
- Opponent current-lineup hitter K%, whiff%, xBA, handedness, batting order, and lineup status.
- Opponent season and recent K environment in `public/data/mlb/k-workload-shadow.json`.
- Pitcher last five starts with IP and strikeouts in `public/data/mlb/strikeout-prop-details.json`.
- Opponent last five games with opposing starter IP/K and team total strikeouts in the same expanded-row artifact.

## Derivable Data

- Projected lineup K% from hitter-level `kRate`, optionally weighted later by batting order or projected PA if such weights are added.
- Projected lineup handedness mix from hitter `bats` plus pitcher `hand`.
- Recent pitcher K/9 from detail rows when IP and strikeouts are present.
- Recent pitcher K rate from workload shadow when strikeouts and batters faced are present.
- Expected batters faced from workload shadow, or from projected IP times an explicit BF/IP assumption.
- Opponent recent K rate from workload shadow recent team strikeouts and plate appearances.
- Team-adjusted expected Ks from workload expected BF times adjusted K rate.

## Missing Data

- Pitcher home K% and away K%.
- Pitcher home whiff% and away whiff%.
- Pitcher strikeout splits versus left-handed and right-handed hitters.
- Team home K% and away K%.
- Team home whiff% and away whiff%.
- Team whiff% versus LHP/RHP.
- Populated team K% versus LHP/RHP in the current workload shadow artifact.
- Recent team whiff%.
- CSW%.
- Swinging-strike%.
- Pitch velocity trend tied to the K model.
- Contact-quality inputs directly tied to strikeout probability beyond whiff/xBA proxies.
- Batters faced and pitch counts in the expanded-row details artifact.
- A dedicated server-side K props row artifact.

## Questionable Or Low-Confidence Data

- `opponentTeamKRate` and `opponentTeamWhiffRate` in the table are flat averages of listed opponent hitters, not true team rates or PA-weighted lineup projections.
- `pitcherKSkillScore`, `opponentTeamStrikeoutScore`, and `strikeoutMatchupScore` are client-only display scores, not generated server-side model outputs.
- Workload shadow contains richer context, but some rows can have missing hand or whiff context even when the final HR raw payload has those fields. This suggests date/order/raw-context alignment should be verified before promoting shadow fields to canonical production inputs.
- `MlbHrProps.tsx` normalizes missing pitcher hand to `"R"` in some paths, which can hide missing handedness from downstream consumers.
- The strikeout details artifact is useful for UI context, but its pitcher-start schema lacks batters faced and pitch count, so it cannot fully support workload modeling by itself.

## Duplicated Calculations

- Legacy projected Ks are generated server-side, then partially duplicated as a fallback in `src/lib/mlb/kPropBestBets.ts`.
- Strikeout matchup scores are computed client-side from normalized raw data rather than persisted as canonical server-side fields.
- X/social selection code has separate filtering and artifact-building logic around K rows after scraping rendered page data.

## Client-Only Calculations

- K props table row assembly.
- Opponent current-lineup K% and whiff% averages.
- Pitcher K Score, Opp K Score, and overall K Score.
- Expanded-row merge of table rows with `strikeout-prop-details.json`.
- The visible social export route rendering from an immutable querystring artifact.

## Recommended Source Of Truth

The next architecture should introduce a dedicated canonical K props artifact generated server-side, separate from HR props naming and lifecycle. It should include:

- Raw normalized model inputs.
- Explicit availability/fallback flags.
- Legacy projection fields for comparison.
- V2 projection output and explanation.
- Workload and opponent-context components.
- Odds line, over price, under price, book, and slate date.
- UI-ready but non-authoritative display scores.
- Social/X-ready row attributes.

Until that artifact exists, the safe migration path is to keep the current `projectedKs` untouched, compute V2 in a pure shared library, and add shadow comparison fields from the generation pipeline before any production replacement.

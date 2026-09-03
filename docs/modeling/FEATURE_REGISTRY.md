# Football Feature Registry

Status values: **production input**, **research/diagnostic**, **eligibility/provenance**, **comparison only**, or **available unused**. “Window” describes the implemented source window; player encoders generally coalesce `seasonPrior -> priorSeason -> train mean`, while snapshots also expose `last3`.

## Implemented load-bearing features

| Feature | Definition | Source | Availability timing | Window/transformation | Models | Leakage risk | Status/notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Current OVR | Blend of preseason v0.4 rating and full-season live Performance Rating by team games played | v0.4, v0.3.1, Team Performance Analytics | After completed games and source refresh | Fixed 0-6+ game ramp; clamp 1-99 | Spread | Mutable aggregates lack prediction-level cutoff/hash | production input |
| Power Number | `(Current OVR - 32-team mean) * 0.24` | Current OVR | Same as OVR | League-centered | Spread | Subset/partial league would mis-center; guarded at 32 teams | production input |
| Home field | 2.0 points, zero neutral | Schedule neutral-site flag | Pregame | Fixed | Spread | Schedule corrections | production input |
| Team offensive plays/game | Eligible pass+rush plays/game | nflverse PBP play-volume cache | Postgame, usable for later games | season-prior then prior season | Passing | Target/future game inclusion | production input |
| Team pass attempts/game | Team pass plays/game | play-volume cache | Postgame | season-prior -> prior season | Passing | Same | production input |
| QB attempts/game | Player attempts/game | player-week stats | Postgame | strictly prior QB games | Passing | Starter identity and target-game stats | production input |
| QB yards/attempt | Player passing yards / attempts | player-week stats | Postgame | strictly prior games; train-mean impute | Passing | Zero-attempt denominator/target row | production input |
| QB completion percentage | Completions / attempts | player-week stats | Postgame | strictly prior games | Passing | Same | production input |
| Opponent pass attempts allowed/game | Opponent-facing team pass volume | play-volume/game joins | Postgame | strictly prior opponent games | Passing | Opponent orientation/join | production input |
| Opponent dropback rate allowed | Allowed dropbacks / plays | play-volume cache | Postgame | strictly prior opponent games | Passing | Same | production input |
| Opponent pass EPA/play allowed | Opponent pass EPA allowed | EPA team-game cache | Postgame | strictly prior opponent games | Passing | Team alias and future-game leakage | production input |
| Team dropback rate | Pass plays / eligible plays | play-volume cache | Postgame | strictly prior games | Passing | Target-game inclusion | production input |
| Early-down neutral pass rate | Pass rate on downs 1-2, WP 0.20-0.80, >120 seconds in half | PBP play-volume cache | Postgame | strictly prior games | Passing | nflfastR WP is modeled but known after play; target game forbidden | production input |
| Pass rate over expected | Mean nflfastR `pass_oe` on eligible plays | PBP play-volume cache | Postgame | strictly prior games | Passing | Target game forbidden; upstream model revisions | production input |
| Team game spread | Team-oriented settled historical line or live current line | nflverse game market context / matchup market | Pregame, exact historical timestamp often unknown | Scalar | Passing | Closing information can leak into earlier snapshot simulations | production input; explicitly market-informed |
| Game total | Settled historical or live market total | same | Pregame, timestamp caveat | Scalar | Passing | Same | production input; explicitly market-informed |
| Implied team total | `total/2 - team spread/2` under stored sign convention | market context | Same as inputs | Derived scalar | Passing | Sign and timestamp | production input |
| Home indicator | Team side in schedule | schedule join | Pregame | 1/0 | Passing | Join orientation | production input |
| Dome indicator | Game/team dome flag | schedule/team metadata | Pregame | 1/0 | Passing | Retractable roof/game-day state not represented | production input |
| Carries/game | Player carries per prior qualifying game | player-week stats/universe | Postgame | season-prior -> prior season -> training fallback | Rushing | Zero/missing population semantics | production input |
| Yards/carry | Player rushing yards / carries | player-week stats | Postgame | coalesced, four-game shrinkage to training mean | Rushing | Small samples; kneels included | production input |
| Targets/game | Player targets per prior qualifying game | player-week stats/universe | Postgame | season-prior -> prior season -> training fallback | Receiving | Zero/missing population semantics | production input |
| Yards/target | Receiving yards / targets | player-week stats | Postgame | coalesced, four-game shrinkage to training mean | Receiving | Small samples and role changes | production input |

## Team opportunity model features (WU4A, `nfl-team-opportunity-ridge-market-v1.0.0`)

All windows use the compact play-volume cache via `teamPlayVolume.ts` selectors, `seasonPrior -> priorSeason` coalesce, strictly-prior kickoffs. Opponent-allowed windows read the opponent field of the same records. Target quantities: `eligible_plays` and `pass_plays / eligible_plays` for the same team-game.

| Feature | Definition | Availability timing | Models | Leakage risk | Status |
| --- | --- | --- | --- | --- | --- |
| Prior team offensive plays/game | Team `eligible_plays`/game, prior windows | Postgame, prior games only | Team opportunity | Target-game inclusion (guarded) | production input |
| Prior team dropback rate | `pass_plays / eligible_plays`, prior windows | Postgame | Team opportunity | Same | production input |
| Prior team PROE | Mean `pass_oe`, prior windows | Postgame | Team opportunity | Upstream xpass revisions | production input |
| Prior team early-down neutral pass rate | Neutral-situation pass rate, prior windows | Postgame | Team opportunity | nflfastR WP known after play; target game forbidden | production input |
| Opponent plays/game allowed | Opponent-facing `eligible_plays`/game, prior windows | Postgame | Team opportunity | Opponent orientation/alias | production input |
| Opponent dropback rate allowed | Opponent-facing `pass_plays / eligible_plays`, prior windows | Postgame | Team opportunity | Same | production input |
| Game spread / total / implied team total | Historical settled nflverse line or live consensus feed | Pregame; exact historical timestamp often unknown | Team opportunity | Closing information can leak into early-week simulations | production input; explicitly market-informed |
| Home indicator | Team side in schedule | Pregame | Team opportunity | Join orientation | production input |
| Neutral-site indicator | Schedule neutral-site flag | Pregame | Team opportunity | Schedule corrections | diagnostic (recorded, not a ridge column) |

Team plays: walk-forward showed no candidate beats the training league mean, so the projection stays near league-average by evidence. The pass/rush split is where the ridge earns its keep (dropback-rate correlation ~0.25-0.38 across folds, beating every history-only baseline). Prior team rush/pass attempts per game are also recorded in the feature snapshot for diagnostics but are not ridge columns.

## Receiving allocation features (WU4B, `nfl-receiving-share-x-efficiency-v2.0.0`)

Fitted deterministically from `data/nfl/props/role-allocation-dataset-2022-2025.json` (per player-game receiving share observations + per team-game targetable-pass pools, 2,142 / 2,174 REG team-games; 2023-2025 weekly-roster coverage, 2022 gap documented in the dataset). All windows are strictly-prior-game by kickoff.

| Feature | Definition | Availability timing | Models | Leakage risk | Status |
| --- | --- | --- | --- | --- | --- |
| Targetable-pass ratio | Point-in-time team (-> training league) `attempts / dropbacks`, shrunk to league (6-game prior), clamped `[0.5, 1.0]` | Postgame (`stats_team_week`), prior games only | Receiving v2 | Target-game inclusion (guarded); upstream stat revisions | production input |
| Prior player target share | Point-in-time mean `player targets / team pass attempts`, `seasonPrior -> priorSeason` coalesce | Postgame, prior games only | Receiving v2 | Same | production input |
| Fitted depth-rank prior | Training-set mean realised within-pool target share by `<position>:<depth-rank>` bucket | Fit-time constant (2022-2025) | Receiving v2 | Rank pre-2025 is usage-derived; live 2026 rank is sourced | production input |
| Depth rank / sourced flag | From the live ESPN depth chart (`roleConfidence === "sourced"`) | Latest pregame snapshot | Receiving v2 | Latest-snapshot-only; staleness gate applies | production input (role weight) |
| teamChanged | Player's target-week team differs from their most recent prior-season team | Pregame roster | Receiving v2 | Roster publication timing | diagnostic + evidence vector |
| Roster competition count | Same-team same-position eligible receivers this week | Pregame roster | Receiving v2 | Roster timing | diagnostic + evidence vector |
| WU4A projected dropbacks | `team_opportunity.projected_pass_attempts` for the target week | Pregame (WU4A run) | Receiving v2 | Inherits WU4A leakage profile | production input (pool size) |

Coherence is a hard accounting constraint, not evidence of predictiveness: player target shares are clipped `>= 0` and renormalised to sum to 1 within a team-game, so allocated targets sum exactly to the targetable pool. `E[sacks] + E[scrambles]` subtraction (`scrambles = dropbacks - team_pass_attempts - sacks_suffered`) was tested against the calibrated ratio and is downstream-identical on player target projections. The receiving efficiency (yards/target) leg is unchanged from v1.

## Implemented eligibility, provenance and diagnostic features

| Feature | Definition/source | Timing/window | Models | Risk/status |
| --- | --- | --- | --- | --- |
| Player/game identity | Canonical `gsis:` ID plus schedule team/opponent | Per week | All player models | eligibility/provenance; provider name joins remain strict |
| ACT roster status | nflverse weekly roster `status == ACT` | Target-week snapshot; 2023-2026 | All player models | eligibility; revisions are not archived with prediction |
| Depth rank/starter flag | nflverse ESPN depth-chart `pos_rank`; snapshot timestamp/staleness recorded | Latest pregame snapshot | All player models | eligibility/provenance, not projected yards directly |
| Historical activity eligibility | Any positive current-season prior game or prior-season totals >= 50 attempts/20 carries/20 targets | Strictly prior games | All player models | eligibility; tested against target/future leakage |
| Roster-scarcity fallback | Minimum 2 RB and 3 WR+TE per team after stronger evidence | Target week | Rushing/receiving | disclosed inferred eligibility; deterministic ID tie-break can select wrong rookie |
| History status | no/limited/normal history | Strictly prior | All player models | diagnostics/status |
| Multi-QB/role uncertainty | Competing QB or ambiguous/no depth evidence | Pregame evidence | Passing | diagnostic; target-game multi-QB result is outcome-only |
| Carry share | Player carries / team carries | season-prior/last3/prior season | Rushing | research/diagnostic; not Baseline C final formula |
| Team rush attempts, dropback rate, PROE | Team play-volume features | prior windows | Rushing | research/diagnostic; encoded ridge features but not selected formula |
| Opponent rush attempts and rush EPA allowed | Opponent prior windows | prior windows | Rushing | research/diagnostic |
| Committee concentration | Leading RB carry share | prior last-three style window | Rushing | diagnostic only |
| Target share, catch rate, YPR | Player/team stats | prior windows | Receiving | research; only targets and YPT enter selected formula |
| aDOT | Receiving air yards / targets | prior windows | Receiving | research; source had full targeted-player coverage |
| Team pass environment | Pass attempts, dropback rate, PROE | prior windows | Receiving | research/diagnostic |
| Target concentration | Leading receiver target share | prior window | Receiving | research/diagnostic |
| Opponent targets/pass EPA allowed | Opponent prior windows | prior windows | Receiving | research/diagnostic |
| Market/game environment | Spread, total, implied total, home, dome | historical/live | Rushing/receiving | encoded for research but selected decomposition does not consume it |
| Matchup Score | Frozen percentile transforms/weights from 2022-2024 reference | Pregame features | Player display | separate presentation output; must never feed projected yards without new version |
| Prediction interval | Empirical residual quantiles from 2024 validation after 2022-2023 fit | Fixed reference | All player models | production-candidate diagnostic range |

## Team performance and total-reusable data (implemented, not a current total model)

| Feature family | Available definition | Current use |
| --- | --- | --- |
| EPA/play | Overall, early down, pass, rush; offense and allowed | Spread Current OVR, player opponent context, UI |
| Success rate | Traditional down-based success plus EPA-positive diagnostic | Spread Current OVR and UI |
| Explosive rate | Explosive pass+rush rate/count | Spread Current OVR and UI |
| Points/drive | Offense and allowed | Available/display; excluded from Current OVR composite as collinear |
| Point differential/game | Raw and opponent-adjusted | Spread Current OVR |
| Play volume/pass tendency | Plays/game, pass/rush attempts, dropback rate, early neutral pass rate, PROE | Player models; reusable for totals |
| Schedule strength/opponent adjustment | One-pass opponent comparison | v0.3.1/live performance; SOS fields are separately available |
| Scores | Final home/away scores, margin, total | Outcomes/backtests |
| Game market | Multi-book spread/total/moneyline observations with timestamps | Comparison infrastructure, not current JKB spread input or total model |

## Candidate/future features — not currently implemented as model inputs

These are inventory items, not approved features: normalized weather (wind, temperature, precipitation), game-day roof state, surface, seconds/play pace, rest, travel/time-zone distance, current archived injury/availability, offensive-line/trench and defensive-front history, routes and route participation, snap-share projections, red-zone/goal-line role, air-yards share, player-prop closing designation, and consensus market construction. Their existence in raw PBP or display artifacts does not make them point-in-time model features.

The WU3 evaluation dataset (`jkb-football-evaluation-v1`) exposes the archived feature snapshot (`feature_snapshot_values`, and the passing `ordered_vector`) read-only for feature-conditioned research, and surfaces a subset of these candidate items as `candidate__<key>` cohort fields **only when a snapshot already contains them**. This changes no feature definition, status, or model input; it is diagnostic exposure of what WU1 already archived.

## Identity/data-quality warnings

- Canonical team aliases must cover JAC/JAX, LA/LAR, WAS/WSH and AZ/ARI. Do not add a local alias without updating/testing the canonical layer.
- `stats-player-week` and `player-week-stats` are separate cache paths with overlapping content/provenance; new code must name the authoritative input explicitly.
- 2022 lacks weekly roster coverage, so ACT-inferred zero semantics differ from 2023-2025.
- Historical market context has lines but not book or exact observation timestamp. It cannot represent a specific early-week market snapshot.
- Latest-only depth chart and injury artifacts cannot reconstruct historical knowledge.
- Target-game snap counts, injuries recorded after cutoff, final stats and corrected results are outcome data, never pregame features.

# NBA player props — Phase 1: data foundation and baseline benchmark

Status: research only, uncommitted vertical slice on `feat/nba-player-props-v1`
(2026-10-12). No UI, workflow, sportsbook, or published artifact. Not a betting
model: no historical pregame market lines are used, so nothing here supports a
profitability claim.

## 1. Audit findings (Stage A)

| Question | Finding |
|---|---|
| Existing basketball data | None. NBA appears only as a "coming soon" route and in Action Network public-betting splits (`scripts/fetch-public-betting.mjs`). |
| Python tooling | Python 3.12 / 3.13 exist locally; repo Python is limited to ad-hoc research scripts (`scripts/research/*.py`, pandas/numpy, `unittest`). No `requirements.txt`/`pyproject.toml`, no workflow installs Python. |
| Repository convention | TypeScript-first. Closest analogue is the NFL props system: typed pure logic in `src/lib/nfl/props/`, `tsx` generators in `scripts/`, caches under `data/nfl/...` with provenance manifests, a written leakage contract, colocated Vitest tests. |
| nba_api | `nba_api` 1.11.4 works, but it is a thin wrapper over stats.nba.com. Node `fetch` with the same headers also works (200, ~2 s), so no Python dependency is needed. |
| Access | `curl` to stats.nba.com hangs and `cdn.nba.com` returns Akamai 403, which looks like client-fingerprint filtering. Node `fetch` and Python `requests` succeed. Cloud CI IPs are widely reported as blocked; **untested**, so scheduled ingestion from GitHub Actions is unproven. |
| Licensing | NBA.com Terms of Use §9: NBA Statistics "may only be used, displayed, or published for legitimate news reporting or private, non-commercial purposes", need "prominent attribution to NBA.com", and "may not be used in connection with any fantasy game or other commercial product or service". The repository is **public**, so committing raw data would republish it. **Decision taken:** all `data/nba/` is gitignored and tests use synthetic fixtures. Publishing any NBA-derived output requires a separate licensing decision. |
| Blocker? | Not for a private research benchmark. A blocker for production publication until licensing is resolved. |

### Endpoint evaluation

| Endpoint | Cost | Gives | Lacks |
|---|---|---|---|
| `playergamelogs` (used) | 1 request per season × season type | Every player-game appearance; decimal `MIN` and `MIN_SEC`; full box score | DNP / inactive rows, starter flag, position, tip time |
| `teamgamelogs` (used) | 1 request per season × season type | Team box score, home/away, team minutes (48 + 5/OT) | Same as above |
| `leaguegamelog` | 1 request | Same rows as `playergamelogs` | `MIN` is a **rounded integer** — unusable for per-minute rates |
| `boxscoretraditionalv3` | 1 request **per game** (~1,230/season) | Starter (position populated), DNP rows with reason ("DNP - Coach's Decision") | Pregame injury status; costs ~150× more requests |

History is available at least back to 1996-97 (spot check: zero null minutes,
zero duplicate keys; row counts in the local results report).

### Data-quality quirks found

- `MIN_SEC` can read `"31:60"`. Decimal `MIN` is authoritative and `MIN_SEC` is only a cross-check (tolerance 1/60 min).
- Neutral-site games (Paris, Mexico City, Berlin/London, NBA Cup knockout games in Las Vegas, Abu Dhabi preseason) list **both** teams as `@`. These are modeled as `neutralSite: true` with null home/away. (count in the local results report)
- Preseason includes non-NBA clubs (Guangzhou, Melbourne, Hapoel Jerusalem, …).
- The NBA Cup championship game (GAME_ID prefix `006`) is not in any season-type log.
- Team `MIN` can be slightly below 48 because of source rounding.

## 2. Architecture

```
stats.nba.com ──local-only fetch tool──▶ data/nba/raw/stats-nba/…/<stamp>.{body,meta}.json   (immutable, sha256)
                                              │
                        nba:build-dataset (offline: verify sha → normalize → dedupe → validate)
                                              ▼
                                   data/nba/canonical/*.jsonl|json   (+ coverage, issues, manifest)
                                              │
                     nba:backtest-baseline (offline: features → projections → evaluate)
                                              ▼
       data/nba/backtest/<runId>/predictions-*.jsonl | outcomes-*.jsonl | tuning.json | metrics.json | report.md
```

| Path | Kind | Role |
|---|---|---|
| `src/lib/nba/props/seasonType.ts` | source | Season strings, season types, GAME_ID prefix ↔ season-type checks |
| `src/lib/nba/props/types.ts` | source | Canonical schemas (below) |
| `src/lib/nba/props/ingest/statsNbaPayload.ts` | source | Parses preserved stats.nba.com bodies. The retrieval client (timeout, retry/backoff on timeout/429/5xx, fail-fast on 403) and the fetch CLI are local-only retrieval tooling (not in the repository; Phase 2B review decision). |
| `src/lib/nba/props/normalize.ts` | source | Raw result set → canonical rows; schema-drift detection; row validation |
| `src/lib/nba/props/dataset.ts` | source | Latest-snapshot selection, revision diffing, dedupe, game table, opponent resolution, PTS/minutes reconciliation, identity maps, coverage |
| `src/lib/nba/props/features.ts` | source | Pregame features (leakage contract below) |
| `src/lib/nba/props/projection.ts` | source | `nba-props-baseline-v0` and naive comparison methods |
| `src/lib/nba/props/backtest.ts` | source | Targets, prediction snapshots, outcomes, metrics, segments, validation-only tuning |
| `scripts/nba-*.ts` | source | The three CLIs above |
| `src/lib/nba/props/*.test.ts`, `__fixtures__/synthetic.ts` | test | 40 Vitest tests, synthetic data only |

Incremental updates: a whole season is one request, so an in-progress season is
re-fetched in full and stored as a new snapshot. The builder uses the latest
snapshot per (endpoint, season, season type) and reports added, removed, and
changed rows against the previous snapshot (stat corrections). A season is
skipped once a snapshot exists from after 15 July of its end year (`--refresh` overrides).

## 3. Schemas

All keys are stats.nba.com ids: `playerId` (PERSON_ID), `teamId` (TEAM_ID),
`gameId` (10-char GAME_ID). Abbreviations are display-at-time values only.

- **`NbaPlayerGame` (`nba-player-game-v1`)** — one row per appearance: `gameId, gameDate, season, seasonType, playerId, playerName, teamId, teamAbbr, opponentTeamId, opponentAbbr, isHome, minutes` (decimal), `pts, reb, ast, oreb, dreb, fgm, fga, fg3m, fg3a, ftm, fta, stl, blk, tov, pf, plusMinus, sourceSnapshotId`.
- **`NbaTeamGame` (`nba-team-game-v1`)** — same context and box fields at team level, plus `minutes` (48 + 5/OT) and `won`.
- **`NbaGame`** — `gameId, gameDate, season, seasonType, teamIds[2], homeTeamId|null, awayTeamId|null, neutralSite`.
- **`NbaPlayerIdentity`** — `playerId, playerName` (latest), `namesSeen[], firstGameDate, lastGameDate, teamIdsSeen[]`.
- **`NbaTeamIdentity`** — `teamId, abbreviationsBySeason{}, namesSeen[]`.
- **`RawSnapshotMeta` (`nba-raw-snapshot-meta-v1`)** — `snapshotId, endpoint, season, seasonType, params, requestUrl, retrievedAtUtc, httpStatus, attempts, bodyFile, bodyByteSize, bodySha256, rowCount`.
- **`NbaPredictionSnapshot` (`nba-prediction-snapshot-v1`)** — `modelVersion, cutoffDate, gameId, playerId, teamId, season, seasonType, flags{historyTier, teamChanged, teamChangedRecently, returningFromAbsence, roleChange}, priorGames, projections{method → {minutes, pts, reb, ast}}`. **Contains no results.**
- **`NbaOutcomeRecord` (`nba-outcome-v1`)** — `gameId, playerId, minutes, pts, reb, ast`. Written to a separate file and joined only during evaluation.

`seasonType` ∈ `preseason | regular | play_in | playoffs`, derived from the
request and checked against the GAME_ID prefix (`001/002/005/004`).

## 4. Participation and leakage contract

- **Conditional on participation.** Season logs list only players who appeared, so each projection answers "if the player plays, what are their minutes, PTS, REB, and AST?" Phase 1 does not model whether a player plays, because no pregame availability data is ingested.
- **Cutoff.** Features use only competitive games (regular, play-in, playoffs) with `gameDate < cutoffDate`, where the cutoff is the target game's date. No tip time exists, and teams never play twice on one date. The filter lives inside `computePregameFeatures`, so callers cannot leak by passing full history. Tests confirm that altering or removing the target game, any later game, or a same-date row leaves features unchanged. A mutation test that changes `<` to `<=` fails 5 tests.
- **Preseason** is ingested and stored but excluded from features and targets.
- **Pregame-known context used:** the player's team for the target game (rosters are known pregame), season, and date.
- **Population priors** (league per-minute rates) come from the training period only. Hyperparameters are tuned on validation only. The holdout is scored once with frozen parameters.

## 5. Baseline method (`nba-props-baseline-v0`)

- **Expected minutes** = blend of L5/L10/L20/season-to-date minutes (weights 0.4/0.3/0.2/0.1, renormalized over available windows), shrunk toward a prior by `K_min` games. The prior is the previous regular-season average (≥ 10 games), else `newPlayerMinutes`. L-windows cross season boundaries.
- **Trades:** once a player has ≥ 3 games with the current team, minutes windows use only current-team games.
- **Per-minute rate** = (L20 stat + `K_rate` × prior rate) / (L20 minutes + `K_rate`). The prior rate is the previous regular-season rate (≥ 200 min), else the league rate.
- **Projection** = expected minutes × rate, for PTS, REB, and AST.
- **Insufficient history:** with zero prior games, the priors apply. Players are tiered `none / thin (<5) / partial (<20) / full`.
- **Flags** (reported, not yet modeled): `roleChange` (|L5 − L20 minutes| ≥ 8 with ≥ 10 games), `returningFromAbsence` (≥ 3 same-season team games missed immediately before; offseason gaps never count), `teamChangedRecently` (< 10 games into a new-team stint). Logs have no DNP rows, so `returningFromAbsence` cannot distinguish an injury from a healthy scratch.
- **Zero-minute appearances** stay in history (they are rare; counts in the local results report).
- **Tuned on 2024-25** (validation period only). The tuned values are NBA.com-derived. Since Phase 2B they are held only in a gitignored local artifact pending a rights determination. Public code uses the untuned design defaults (`BASELINE_V0_PUBLIC_PARAMS` in `src/lib/nba/props/projection.ts`, pinned by `baselineV0.golden.test.ts`). Results with those defaults are **not** numerically equivalent to the Phase 1 benchmark.
- **Comparison methods:** direct L5, L10, L20, and season-to-date averages of each stat.

## 6–7. Validation and accuracy results (moved)

The NBA.com-derived numbers from this phase (per-season coverage counts,
reconciliation counts, MAE/RMSE tables, paired confidence intervals, segment
errors, missing-data rates) were moved on 2026-10-12 to a **gitignored local
report**: `data/nba/reports/phase-1-results.md`. NBA.com Terms of Use §9 limit
NBA Statistics to private, non-commercial use, and this repository is public.
See `docs/nba-player-props-phase-2b-plan.md`.

What was checked, without the numbers:

- Every season and season type from 2023-24 to 2025-26 was ingested with zero
  validation issues, zero duplicate keys, exact player-to-team points
  reconciliation, and minutes reconciliation within 1 minute of 5 × team minutes.
  Two builds from the same raw data are byte-identical.
- On the 2025-26 regular-season holdout, baseline v0 had lower MAE than every
  naive rolling average for minutes, PTS, REB and AST, with player-clustered
  intervals excluding zero. The gain was small. In the 2025-26 postseason, v0
  was not better than naive L5/L10.
- Weakest segments: returning from absence, recent team change, and flagged
  role change. These motivated Phase 2A.

## 8. Running it

```sh
# Retrieval is local-only tooling and is not in the repository (Phase 2B).
npm run nba:build-dataset                                                    # offline, ~4 s
npm run nba:backtest-baseline                                                # offline, ~40 s
npx vitest run src/lib/nba
```

## 9. Missing fields and known limits

- **No participation model.** DNP and inactive status, pregame injury reports, and starting lineups are not ingested. A real prop projection must first estimate P(plays), and minutes given a confirmed starter, before tip.
- **No starter flag or position** in season logs. Role tiers come from the model's own expected minutes.
- **No tip time.** The cutoff is date-level, which is acceptable for backtesting. Live use needs lineup-time snapshots.
- **No opponent, pace, rest/back-to-back, home/away, or blowout context** in the projection yet.
- **No market lines**, so nothing about edge, calibration against lines, or ROI can be claimed.
- **Seasons covered:** 2023-24 to 2025-26 only.

## 10. Recommended next steps

1. Decide on licensing before any NBA-derived surface is published (NBA.com ToU §9; also consider a licensed provider).
2. Backfill history (≈ 8 requests per season; 2015-16 onward is ≈ 90 requests) so 2023-24 gets warm history and evaluation spans more seasons.
3. Fix the absence and role-change segments: decay toward the stint after returning from absence, and weight L5 more heavily after a flagged role change.
4. Add pregame context features: opponent pace and defensive rates, rest and back-to-back, home/away, spread-implied blowout risk.
5. Add participation and starter data: box-score V3 for starter and DNP history (≈ 1,230 requests per season; cache per game), and the official NBA injury report for pregame status.
6. Add distributional outputs (e.g., per-stat variance) before any comparison to prop lines.
7. Only then ingest historical pregame prop lines and evaluate against the market.

## 11. Risks and costs

- **Licensing** (high): see §1. It is the main gate for production.
- **Access fragility** (medium): unofficial endpoints with undocumented header requirements and possible CI IP blocks. Mitigations: append-only raw snapshots, a request cap, fail-fast on 403, and offline rebuilds.
- **Schema drift** (low–medium): the normalizer throws on missing columns instead of producing partial data.
- **Cost:** $0 API spend. A full refresh is 2 requests per season type (8 per season). Storage is ~12 MB raw per season (local, gitignored).

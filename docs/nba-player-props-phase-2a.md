# NBA player props — Phase 2A: licensing readiness and minutes-v1

Status: uncommitted, on `feat/nba-player-props-v1` (2026-10-12). Builds on
[Phase 1](nba-player-props-phase-1.md). Nothing was published, deployed,
committed, or pushed. No NBA.com requests were made.

**Evaluation boundary (user decision, 2026-10-12):** the local NBA.com data
from Phase 1 was **not** used in Phase 2A, neither for development, nor for
tuning, nor for evaluation. All numbers in this document come from a
seeded synthetic league. They show that the mechanisms work as designed. They
are **not** evidence of real-world accuracy, and no accuracy improvement over
baseline v0 is claimed.

Approved decisions carried into this phase: keep the `data/nba/` gitignore
rule, no further NBA.com backfill, no publication of NBA-derived data or
models, keep the TypeScript architecture, and prioritize minutes and role
accuracy over advanced ML.

## 1. Data licensing and provider recommendations

### 1.1 Current provider: what the NBA.com terms restrict

NBA.com Terms of Use §9 (read 2026-10-12): NBA Statistics "may only be used,
displayed, or published for legitimate news reporting or private,
non-commercial purposes". Any use requires "prominent attribution to NBA.com",
and the statistics "may not be used in connection with any fantasy game or
other commercial product or service".

Repository evidence relevant to "commercial": `public/ads.txt` and
`index.html:51` load Google AdSense (`ca-pub-…`), so JoeKnowsBall is a
monetized, public, betting-research product. Whether internal model
research for such a product counts as "private, non-commercial" is
unresolved and needs a legal answer, not an engineering one.

| Operation | Restriction risk | Phase 2A status |
|---|---|---|
| Automated retrieval (the fetch CLI) | High: retrieval for a commercial product | Not run; no further backfill. Since Phase 2B the CLI and client are local-only, not in the repository |
| Keeping raw and canonical data locally (`data/nba/`, 377 MB) | Medium: storage for private use only | Kept per decision; never committed |
| `nba:build-dataset` / `nba:backtest-baseline` on local data | Medium–High: research toward a commercial product | Not run in Phase 2A |
| Committing `docs/nba-player-props-phase-1.md` | **Medium: contained NBA.com-derived numbers** (coverage counts, MAE tables, segment errors) in a public repo | **Resolved in Phase 2B:** numbers moved to gitignored `data/nba/reports/phase-1-results.md` |
| v0 hyperparameters tuned on NBA.com data | Medium: derived from restricted data | **Removed in Phase 2B:** held in a gitignored local artifact; public code uses untuned defaults (`BASELINE_V0_PUBLIC_PARAMS`) |
| Publishing any NBA-derived projection or page | High: explicitly barred for commercial products | Not done; blocked |
| CI test runs | None: NBA tests use synthetic fixtures only | No action needed |

### 1.2 Candidate providers

"Verified" means the provider's own published terms say it, as read on
2026-10-12. "Unverified" means it comes from third parties, is not public, or
needs a contract.

| Provider | Verified | Unverified / assumptions | Fit |
|---|---|---|---|
| **SportsDataIO** | The data-rights help page says commercial licenses "cover betting analytics, modeling, and decision-support products". "Displaying scores, schedules, statistics, injuries, and similar data inside your licensed product is a standard licensed use." "No forced refresh intervals or caching restrictions". The free Discovery Lab is "personal, non-commercial use only". Reselling the feed as a standalone product is not permitted. | Price ("quoted per client"). NBA field coverage: decimal minutes, starter/DNP flags, injury history depth. Post-termination rights to stored data ("set in your individual license agreement"). | **Best documented fit** for public betting analytics |
| **BALLDONTLIE** | ToU updated 2026-09-17 allow use, publish, display, distribute, and derivative works "for lawful personal or commercial purposes". "Lawful gambling-industry uses are expressly permitted". No attribution required. Raw data may not be resold. | **Chain of title:** the ToU say data is "compiled and aggregated from a variety of third-party sources", disclaim non-infringement, and make the user "solely responsible" for third-party rights. The upstream may be NBA.com, so its permissions may not protect JKB. Pricing page returned 404; tiers and fields unverified. | Permissive on paper, weak on IP assurance |
| **Sportradar** (also **Genius Sports**) | Official NBA betting-data distributors per the NBA's 2018 announcement and 2020 extension (press coverage). Sportradar's developer docs describe a B2B service. | All license terms, price (likely the highest of these), and whether a media/analytics license covers a free, ad-supported site. | Strongest rights position; highest cost and procurement effort |
| MySportsFeeds | — | Pricing page 404. Third-party sources say free non-commercial use and paid commercial use. | Needs direct inquiry |
| API-Sports (API-NBA) | — | Terms page returned 403. | Needs direct inquiry |
| ~~Sports Reference / Basketball-Reference~~ | Prohibits automated access without written permission. "You should not create websites or tools based on data you scrape". Some licenses "completely preclude any redistribution". | — | **Rejected** |
| ~~nba_api-, Kaggle-, or NBA.com-derived datasets~~ | `nba_api` is MIT-licensed code but points to NBA.com's terms for the data. | Assumption: derived datasets inherit NBA.com's restrictions. | **Rejected** |

**Recommendation:** ask SportsDataIO and BALLDONTLIE for written quotes and
written answers to the checklist below. Bring in Sportradar only if
official-data assurance becomes a requirement.

Questions every provider must answer in writing before selection:
1. Public display of derived projections on a free, ad-supported betting-research site.
2. Historical NBA player box scores with decimal minutes, back to at least 2015-16.
3. Starter flag and DNP/inactive status with reasons.
4. Historical pregame injury reports.
5. Retention rights to stored data after the subscription ends.
6. Whether trial or evaluation data may be used for model development.

The current provider stays in place for now, per instruction.

## 2. Phase 1 readiness audit

### 2.1 Changed files (all uncommitted)

| Path | Kind | Notes |
|---|---|---|
| `src/lib/nba/props/{seasonType,types,normalize,dataset,features,projection,backtest}.ts`, `ingest/statsNbaPayload.ts` | source | Phase 1 (the retrieval client became local-only in 2B). In 2A: `features.ts` gained the exported `selectPriorGames` (pure extraction); `projection.ts` gained a benchmark-params constant (untuned `BASELINE_V0_PUBLIC_PARAMS` since 2B); `backtest.ts` re-exports `roleTier` from `role.ts`. v0 behavior is unchanged and pinned by the golden test. |
| `src/lib/nba/props/{minutesFeatures,minutesV1,minutesV1Backtest,stats,role}.ts` | source | Phase 2A: minutes-v1 candidate |
| `scripts/nba-{build-dataset,backtest-baseline}.ts` | source | Phase 1 CLIs (the fetch CLI is local-only since 2B) |
| `scripts/nba-minutes-synthetic-harness.ts` | source | Phase 2A, synthetic only |
| `src/lib/nba/props/*.test.ts` (6 files) | test | Synthetic fixtures only |
| `src/lib/nba/props/__fixtures__/{synthetic,v0Golden,syntheticLeague}.ts` | test fixture | Invented ids and numbers; no NBA.com data |
| `.gitignore`, `package.json` (4 `nba:*` scripts) | config | |
| `vite.config.ts` | config | Phase 2A: `server.fs.deny` adds `**/data/nba/**` (§2.2) |
| `docs/nba-player-props-phase-1.md`, `docs/nba-player-props-phase-2a.md`, `docs/DATA_SOURCES.md`, `docs/ARCHITECTURE.md` | documentation | Phase 1 numbers moved to a local report in Phase 2B (§1.1) |
| `data/nba/{raw,canonical,backtest}/` (377 MB, 4 backtest runs) | **restricted source data** | Gitignored, never tracked |

Source code and synthetic tests contain no NBA.com statistics. The real
team and player names in the code are limited to the parse-test strings
`DEN vs. LAC` / `LAC @ DEN` in `ingest.test.ts`; every fixture uses invented
ids and values.

### 2.2 Containment checks

| Path to exposure | Check | Result |
|---|---|---|
| Git | `git ls-files data/nba` → 0. `git check-ignore` matches `.gitignore:119 data/nba/` for raw, canonical and backtest. `git status --ignored` shows `!! data/nba/`. | Contained. `git add -f` could still force it in; there is no hook guard. |
| Application bundle | No `src/` file outside `src/lib/nba` imports it. Vite emits only the module graph from `src/main.tsx` plus `public/`. A post-build scan of `dist/` for `stats.nba.com`, `playergamelogs`, `teamgamelogs`, `nba-player-game-v1`, `nba-props-baseline`, `nba-minutes-v1`, `data/nba`, `nba-raw-snapshot` found 0 files. | Contained (`dist/logos/nba.png` is the existing league logo) |
| Public assets | `data/nba/` is outside `public/`. No script copies, globs or walks `data/` into `public/`. | Contained |
| Build artifacts | `wrangler.jsonc` uploads `./dist`. `vercel.json` outputs `dist` and builds from Git, where `data/nba/` never exists. | Contained. **Unverified:** a local `vercel deploy` CLI upload; there is no `.vercelignore`. |
| CI logs | CI checkouts have no `data/nba/`. NBA tests print only synthetic values. No workflow runs `nba:*` scripts. No workflow uploads artifacts from `data/nba`. | Contained |
| **Local dev server** | `vite.config.ts` binds `host: "::"` (all interfaces). Before 2A, `GET /data/nba/raw/stats-nba/ingest-log.jsonl` and `/data/nba/canonical/manifest.json` returned **200**, i.e. readable from the LAN while `npm run dev` ran. | **Fixed:** `server.fs.deny` now returns **403** for the direct path, `/@fs/…`, `?raw` and `?import`. `package.json` and `src/main.tsx` still return 200. |

Recommended but not done, because they touch production-sensitive deploy
settings or the user's tooling: add `data/nba/` to a `.vercelignore`, and add
a pre-commit guard that rejects paths under `data/nba/`.

## 3. Minutes improvements

Baseline v0's logic is untouched and remains the benchmark. Its outputs on a frozen
synthetic fixture are pinned in `baselineV0.golden.test.ts`. They were captured before
any Phase 2A edit, then re-captured in Phase 2B with the public untuned parameters. The candidate is a separate model,
**`nba-minutes-v1-candidate`**. It is not promoted and is not wired into any
script that reads NBA.com data.

| Item | v0 (Phase 1) | minutes-v1 candidate |
|---|---|---|
| Leakage gate | inline filter | Shared `selectPriorGames` (same rule: competitive games, `gameDate < cutoff`). The team schedule is also cut at the cutoff. |
| Recency | fixed L5/L10/L20/STD blend | EWMA (`halfLifeGames`) over the current-team stint once it has 3+ games |
| Regression target | league-agnostic prior only with no history | **The player's own role:** same-season current-team mean blended with previous regular-season mean (capped weight), shrunk by `roleShrinkGames` |
| Return from absence | flag only (first game back) | Detects the most recent ≥ 3-game same-season absence within the last 5 appearances. Inside the ramp, uses the **pre-absence mean** × `rampFactors[gamesSinceReturn]`. Offseason gaps never count. |
| Team change | stint windows after 3 games | Stint-only level and anchor; separate uncertainty multiplier |
| Role change | \|L5 − L20\| ≥ 8 | Changepoint test: last 4 games vs the prior ≤ 16, pooled-SD z ≥ 2.5 **and** \|Δ\| ≥ 4 min. Suppressed inside a return ramp. Switches to `roleChangeHalfLifeGames` and `roleChangeShrinkGames`. |
| Volatility | — | SD of the last ≤ 10 level games |
| Uncertainty | — | `sd = sqrt((v·s² + K·sdPrior[tier]²)/(v+K))` × multipliers (base, returning, role shift, recent team change). 80% interval clamped to [0, 48]. |
| Participation (DNP / zero-minute) | out of scope | **Separate component:** P(appears) = shrunk share of the last ≤ 10 team games played since the same-season stint began. Unconditional minutes = P × conditional minutes. Kept apart from the conditional-minutes error metrics. |
| PTS / REB / AST | minutes × v0 rate | v1 minutes × **v0 rate** (unchanged), so stat changes come only from minutes |

**Calibration** (`calibrateMinutesV1`, development period only):
1. A grid over half-lives, shrinkage and new-player minutes (72 combinations) minimizes MAE.
2. Ramp factors = (Σ actual + 10·p̄)/(Σ predicted + 10·p̄) per games-since-return, shrunk toward 1.
3. `sdPrior` per role tier = RMS residual.
4. Multipliers = RMS of standardized residuals per segment, bounded to [0.5, 3].
5. The participation prior = the dev-period observed rate.

`assertNoHoldout` throws if any calibration target belongs to a declared
holdout season. Defaults are neutral design values, not evidence: ramp = 1,
multipliers = 1.

**Zero-minute and DNP handling:**
- *Conditional* minutes are scored only on appearances, including sub-minute appearances.
- *Participation* is scored separately, with Brier score, on every team game inside each player-team stint (first to last appearance, excluding the first game).
- Known bias: absences after a player's final appearance (for example, season-ending injury) are not observable from logs and are excluded.
- Injury, rest and coach's decision are indistinguishable without provider DNP data.

## 4. Backtesting results

**Real-data backtest: not performed.** The local NBA.com data is out of
bounds for Phase 2A, and no independently authorized dataset exists. No
real-world accuracy change is claimed.

**Synthetic harness** (`npm run nba:minutes-synthetic`): a seeded league with 8
teams × 12 players × 60 games per season. It has injected effects: a true return
ramp of [0.72, 0.86, 0.95], 30% of players with a mid-season ±6–12-minute role
shift, 6 trades per season, and role-dependent DNPs.

Seasons:
- 2040-41: warm-up only.
- 2041-42: development (v0 priors and v1 calibration).
- 2042-43: validation (scored).
- 2043-44: holdout (generated, never scored).

The generator and the model have the same author, so these results test
mechanics, not accuracy.

**Re-computed in Phase 2B.** The v0 side of these comparisons now uses the
public, **untuned** design defaults (`BASELINE_V0_PUBLIC_PARAMS`). The Phase 1
values tuned on NBA.com data were removed from tracked code pending a rights
determination. An untuned v0 is a weaker benchmark, so v1's margins below are
larger than they were against the tuned v0. They are not comparable to the
Phase 2A figures first reported, and nothing here is equivalent to the Phase 1
benchmark. v1's own minutes numbers are unchanged. v1's PTS/REB/AST change
slightly, because they reuse v0's per-minute rate shrinkage.

**Default seed 20261012, validation n = 4,685.** MAE; CIs are 95% for v1 − v0,
clustered by player / by 14-day block.

| Stat | v0 (untuned) | v1 | Δ (player CI) | Δ (time-block CI) |
|---|---|---|---|---|
| Minutes | 3.768 | 3.664 | −0.105 [−0.146, −0.063] | [−0.154, −0.056] |
| PTS | 3.237 | 3.213 | −0.024 [−0.037, −0.012] | [−0.037, −0.011] |
| REB | 1.886 | 1.873 | −0.012 [−0.019, −0.006] | [−0.022, −0.003] |
| AST | 1.569 | 1.559 | −0.010 [−0.015, −0.005] | [−0.017, −0.004] |

| Minutes segment | n | v0 (untuned) | v1 | Player CI | Block CI |
|---|---|---|---|---|---|
| Returning (v1 ramp, games 0–2) | 230 | 4.71 | 3.60 | [−1.47, −0.76] | [−1.49, −0.74] |
| Returning (v0 flag) | 81 | 5.88 | 3.02 | [−3.75, −1.98] | [−3.70, −2.03] |
| Role shift (v1 flag) | 183 | 4.29 | 4.16 | [−0.35, 0.09] | [−0.47, 0.22] |
| Role change (v0 flag) | 45 | 5.87 | 3.55 | [−3.61, −1.03] | [−3.45, −1.20] |
| Recent team change | 50 | 7.72 | 6.00 | [−3.52, 0.09] | [−2.62, −0.81] |

Calibrated ramp: [0.79, 0.92, 0.94] against the true [0.72, 0.86, 0.95].
The direction is recovered, but the shrinkage prior and DNP noise bias it
toward 1. The 80% interval covers **82.5%**, with a mean width of 12.3 minutes,
so it is slightly conservative. Participation Brier is 0.137 for v1 against
0.151 for a constant rate. None of these depend on v0.

**Five-seed sensitivity (seeds 1–5, against untuned v0):**
- *Overall minutes:* v1 − v0 ranges from −0.079 to −0.112, and every player- and block-clustered CI excludes 0.
- *PTS:* −0.031 to −0.035; every player CI excludes 0.
- *Returning:* −0.87 to −1.18 minutes in every seed.
- *Role shift:* −0.14 to −0.42. Significant in 3 of 5 seeds.
- *Recent team change:* −0.33 to −2.19 (n = 60). Significant in 3 of 5 seeds.
- *Interval coverage:* 0.811–0.816.
- *Participation Brier:* below the constant rate in every seed.

What this supports:
- The ramp and pre-absence logic correct a return effect when one exists.
- The intervals are close to nominal.
- The participation component is informative.

What it does not support: any claim that real NBA players follow these
dynamics, or the size of real gains. Against the earlier tuned v0, the
role-shift and team-change mechanisms were not shown to help. The larger
margins above come mostly from the weaker untuned benchmark, not from a
better v1. The detector needs 4 post-shift games, and trade samples are small.

## 5. Regression-test results

| Check | Result |
|---|---|
| `npx vitest run src/lib/nba` | **71/71 pass** (6 files: golden 7, minutesV1 22, model 20, ingest 14, dataset 8) |
| v0 golden | 7/7. Outputs captured before 2A edits were reproduced to 9 decimals after the `selectPriorGames` extraction and the `roleTier` move. (Re-captured in 2B with untuned public parameters.) |
| Leakage mutations | Phase 1 `<` → `<=` cutoff mutation fails 5 tests. Removing v1's team-schedule cutoff in both layers fails 3 tests. Removing only the outer filter is an equivalent mutant: both consumers also filter `< cutoff`. |
| Typecheck, NBA files and `vite.config.ts` | 0 errors under `tsconfig.app`, `tsconfig.node`, `tsconfig.scripts` |
| ESLint on changed files | Clean |
| `npm run build` | Passes (sitemaps, `vite build`, prerender 5/5 routes, 0 network attempts) |
| Full `npx vitest run` | See §5.1 |

### 5.1 Pre-existing, unrelated failures

**Full `npx vitest run`** (run at the same time as `npm run build`, so CPU was contended):
- 783 test files passed and 68 had failures.
- The run then crashed with `ERR_IPC_CHANNEL_CLOSED` before printing its summary.
- **All 5 NBA test files passed.** The golden file was not yet in that run's 6-file set.
- Of the failing tests, 51 hit their 5 s or 30 s timeouts.

**Re-run of the 68 failing files alone:** 8 files then passed and 60 still failed (157 of 1,195 tests; 72 timeouts). They are MLB, NFL, CFB, PGA, fantasy, SEO, numerology and sixteen-zero suites, and none are NBA.

**Attribution:**
- **By construction.** The Phase 2A/1 changes cannot reach these suites. `vitest.config.ts` does not load `vite.config.ts`, which is the only runtime config changed. No file outside `src/lib/nba` and `scripts/nba-*` imports the NBA code. `package.json` changed only by adding `nba:*` scripts.
- **Empirical check (partial).** I ran the same 60 files in a clean detached checkout of `HEAD` (`62d7aff7b`). Claude Code stopped it for low system memory after 3 files. All 3 (`cfb-build-season-stats`, `cfb-v2-audit-shadow`, `cfb-v2-publish-browser-artifact`) also fail on `HEAD`, with more failures (5/3/3) than on the branch (1/1/2), which is consistent with load-dependent timeouts.
- **Not done.** A complete `HEAD`-vs-branch comparison was not finished, and I did not restart it, because of the memory stop.

- `tsconfig.app.json`: 1 error, `src/lib/mlb/mlbPitcherRegression.ts(28,1) TS1128`. The file is identical to `HEAD` (last changed in `14a05de98`).
- `tsconfig.scripts.json`: 165 errors, none in NBA files. The largest groups are `generate-fantasy-player-week-history.ts` (23), `run-nfl-td-early-season-study.ts` (17), and `nfl-role-allocation/walk-forward.ts` (10).
- `eslint .`: 216 problems (83 errors) across 65 files, none NBA or `vite.config.ts`.
- `npm run build` regenerated `public/sitemap-nfl-matchups.xml`. It was clean before the build and changed only a date-dependent NFL matchup slug, so it was restored to `HEAD`.

## 6. Remaining blockers

1. **Licensing (blocking).** There is no provider whose terms clearly permit JKB's use. Nothing NBA-derived can be published, and v1 cannot be validated on real data.
2. ~~**The Phase 1 doc contains NBA.com-derived numbers.**~~ Resolved in Phase 2B: moved to a gitignored local report.
3. **minutes-v1 is unvalidated.** It needs calibration on a licensed development period, a validation comparison against v0, and one holdout run before any promotion.
4. **Participation ground truth.** Logs cannot separate injury from coach's decision or roster absence. Provider DNP and inactive data and injury reports are needed.
5. ~~**Containment gaps**~~ Addressed in Phase 2B: `.vercelignore`, `nba:check-containment`, a repository test, and a post-build scan.

## 7. Recommendation for the next phase (2B)

1. **Procurement first.** Get the written answers from SportsDataIO and BALLDONTLIE (§1.2), choose a provider, and confirm that trial or evaluation data may be used for development.
2. **Provider adapter.** Map the licensed feed into the existing canonical schemas (`NbaPlayerGame` and others). Normalizer and dataset validation, reconciliation and the coverage report are reusable as-is. Add starter, DNP-reason and injury fields as optional schema extensions.
3. **Re-establish the v0 benchmark** on licensed data: re-tune on a licensed validation period. The Phase 1 tuned values are not public.
4. **Evaluate v1 under the protocol already coded:**
   - development season → `calibrateMinutesV1`;
   - validation season → `evaluateMinutesV1` against v0 (player- and time-block-clustered CIs);
   - holdout once.
   - Promote only if minutes MAE improves with both CIs excluding 0, no segment (returning, role shift, team change, role tier) degrades significantly, and 80% interval coverage is within 0.75–0.85.
5. **Then extend participation** using provider DNP and injury data. Use participation × conditional minutes as the prop-relevant output.

Do not start advanced ML, sportsbook integration, or UI work before steps 1–4.

# NBA zero-cost data collection (Phase 5B)

Status: design, measurement and offline code only. No provider request, subscription, secret, migration, workflow, commit, push or deployment was made. Facts were read on 2026-10-19 from this repository, from GitHub Actions run logs of past scheduled runs (read-only, via the GitHub API), and from provider documentation pages. Anything marked **unverified** is treated as "not permitted / not available".

**Update 2026-10-20:** the seasonal budget in section 2 is superseded by merged PR #432's MLB and NCAAB odds-credit protections and the current NBA allowance in `src/lib/nba/props/pipeline/allowance.ts`: at most 15 credits per day and 206 per month, subject to the peer reserve and fresh provider evidence. This is a planning cap, not live collection approval.

Re-measure with `npm run nba:credit-headroom` (local `git` only, no network, no secrets).

## 1. The Odds API keys are one account

Three credential names exist (`ODDS_API_KEY`, `THE_ODDS_API_KEY`, `ODDS_API_KEY_BACKUP`). Phase 5A could not tell whether they shared an account. Past workflow logs settle it for the first two:

| Time (UTC) | Workflow, key | Counter reported |
|---|---|---|
| 2026-10-11 16:11 | NFL Betting Lines Daily, `THE_ODDS_API_KEY` | used 133, remaining 367 |
| 2026-10-11 16:48 | Generate MLB Data, `ODDS_API_KEY` | remaining 367, then used 134, remaining 366 after its h2h call |
| 2026-10-12 19:42 | NFL Betting Lines Daily | used 146, remaining 354 |
| 2026-10-12 20:28 | Generate MLB Data | remaining 354, then used 147, remaining 353 |

Two keys, one continuous counter: **same account, same 500-credit monthly pool.** `ODDS_API_KEY_BACKUP` is unverified (a different account would be a second free account, which the repo's own provider rules already forbid creating on purpose). ParlayAPI is a separate pool (829 to 793 remaining over the same days) and is barred for NBA by its terms.

### Who spends the shared pool

| Consumer | Cost | Basis |
|---|---|---|
| NFL betting lines (daily) | 3 credits/day | one league call, h2h + spreads + totals; 12 daily runs Oct 1 to 12 |
| MLB moneylines (Generate MLB Data) | up to 1 credit per run | 73 runs in 12 days (about 6/day); log lines show `[the-odds-api:h2h]` costing 1 |
| Other (PGA outrights, NFL yardage cross-check, manual runs) | about 3.5/day | unattributed remainder; **unmeasured** |
| Site pages polling `/api/odds/current` (NCAAB) | 2 credits per uncached request | **not running now** (empty NCAAB slate is free); starts when the season does |

The counter's committed history (44 readings since 2026-08-31) gives **12.5 credits/day, about 388 a month**, and a September peak of 387 by the 30th. A month-to-month spread of about 3%.

The NFL job refuses to run below 50 remaining (`DEFAULT_QUOTA_REMAINING_FLOOR`). NBA must not be the reason that floor trips.

## 2. Free credit budget

`free = 500 − 50 (NFL floor) − other sports' projected spend × 1.05`

| Period | Active spenders | Other sports / month | **Free for NBA / month** | PTS-only games per night | 3-market games per night |
|---|---|---|---|---|---|
| **Now** to the World Series end | NFL + MLB postseason | 391 | **39** (measured, the only firm number) | 1.6 | 0.5 |
| Nov to Feb | NFL; MLB off (empty responses are free per the docs) | 202 | **238 (estimate)** | 9.5 (whole average slate) | 3.2 |
| Mar to Jun (NBA playoffs) | MLB; NFL off | 298 | **137 (estimate)** | 5.5 | 1.8 |

Average NBA slate: 7.5 games/night, 25 game nights/month. The two later rows rest on MLB and NFL stopping when their seasons do, which is plausible and **not yet observed**; the first full week of November settles it. They exclude NCAAB site polling.

**Risks to the budget, none caused by NBA**
- `src/hooks/useLiveOdds.ts` polls `/api/odds/current` every 5 minutes from three pages. Each uncached serverless call costs 2 credits against this same pool once NCAAB has games (early November). Traffic decides the cost; it is capped only by a per-warm-instance 5-minute cache. This alone could consume the free headroom. It is unmanaged and I did not touch it.
- MLB runs have no quota guard and fall over to `ODDS_API_KEY_BACKUP` when the primary reports exhaustion.

### What the code now enforces
- `NbaAllowance.peerReserveCredits`: the planner defers, and the request gate refuses, any call that would leave fewer credits than the other sports' projected spend to month end plus the NFL floor (`peerReserveCredits()` computes it). Unknown remaining credits means no spend.
- Existing 5A ceilings still apply: NBA-only daily and monthly allowance, quota-manager admission, account binding.
- Recommended starting values: `perDayCredits 3`, `perMonthCredits 39`, reserve recomputed each run from the measured peer rate. The numbers rise only after November is measured.

## 3. Confirmed $0 options

| Option | $0? | Usable now? | Why |
|---|---|---|---|
| **Manual CSV lines and results**, local gitignored store | Yes | **Yes** | No provider. Batch attestation, freshness and window checks already enforced. |
| The Odds API, existing free account, existing keys | Yes (credits only) | **No** | Rights record is `unlicensed`; no live approval; plan/usage unverified; adapter not written. Free-plan access to NBA player props is **unconfirmed** (the pricing page says "all betting markets"; the docs do not say). The market keys `player_points`, `player_rebounds`, `player_assists` are confirmed. |
| `/events` and `/sports` endpoints | Yes, free | No (needs the same approval) | Cost 0 credits and give event IDs and tipoffs, which removes the need for a separate schedule source. |
| GitHub Actions | Yes | Not activated | Repository is public: standard runners are free. |
| Supabase free project | Yes | Not activated | See section 5. |
| ParlayAPI | Free | **No** | Terms bar derived/public use and cap storage at 90 days. |
| SportsGameOdds free tier | Yes (2,500 objects/month, 10 req/min, NBA listed) | No | Player-prop access on the free tier **unverified**, terms **unread**, no CI secret is wired. Candidate for a rights review only. |
| TheRundown, odds-api.io | Unknown | No | Plan, terms unknown. |
| Kalshi NBA player-prop contracts | Public read, per third parties | No | Prices are contract prices, not sportsbook lines; terms page returned HTTP 429, so unread. Would be a new source type with its own record. |
| Polymarket, ESPN odds | Free | No | No NBA player props found; ESPN-origin data stays blocked (`docs/nba-espn-upstream-rights-review.md`). |

Final player stats: **no permitted free source exists** (unchanged from Phase 3E: API-NBA free ends June 2025, hoopR/ESPN blocked, BALLDONTLIE stats start at ALL-STAR, NBA.com barred). Postgame settlement is manual CSV until one is cleared.

## 4. Minimal automatic collection schedule

Nothing below is created. It applies only after the prerequisites in section 7.

| What | When (ET) | Calls | Credits |
|---|---|---|---|
| Discover slate and tipoffs | first pregame run of the day | `/events`: free | 0 |
| Pregame capture | hourly at :05, 11:05 to 20:05 (weekends from 09:05) | one `/events/{id}/odds` per game that is 120–180 minutes from tipoff, **points only** at first | 1 per game |
| Postgame settlement | once daily 06:30 | none while results are manual; later one results call per unsettled game | 0 |
| Headroom check | before every capture run | none (reads the counter already reported by the last response) | 0 |

- A run with no game in window, no budget, or an unknown remaining count makes **zero** calls.
- One capture per game, not repeated; a game that is missed is recorded as missed, never back-filled.
- Selection under scarcity: earliest tipoff first, up to the day and month ceilings. At 39 credits/month that is about 1.6 games a night; from November it can cover the whole average slate for points.
- Credits for rebounds and assists are added only after November shows the headroom is real (3 credits per game for all three markets).

## 5. Storage and operations

### Supabase: capacity yes, current security no

- **Capacity.** Free plan: 500 MB database, 5 GB egress. A snapshot measured 1,424 bytes of JSON; with row overhead, indexes and related result rows about 2.8 KB per snapshot. 10 rows/game × 600 games ≈ 17 MB; 60 rows/game × all 1,230 games ≈ 206 MB. Fits, with a hard cap of 60 rows per game.
- **Security.** The existing project (`wbjycdfakdjlrhuxlroc`) is the public bracket app: its browser client uses the publishable key, and `public.live_brackets` has **row-level security disabled**. The proposed NBA tables are also in `public`, protected only by RLS plus revoked grants. Restricted odds data should not share a project, or an exposed schema, with an anonymous-key client.
- **Recommendation.** Create a **second free project** (two active free projects are allowed) dedicated to this data, with the migration from `supabase/proposed/` after moving its objects out of `public`. This is a manual step and a new secret pair; I did not do it.
- **Free-tier limits that matter.** Projects pause after one week of inactivity (the daily jobs keep it awake, but a paused project would fail a run: the job must treat that as `blocked`, not as an empty slate). There are **no automatic backups** on the free plan, so "permanent" needs a periodic local export (an `export` command is not yet written).

### GitHub Actions
- Free, unlimited standard-runner minutes on a public repository. Scheduled workflows run only from the default branch, so activating them means merging the workflow files to `main`, which triggers **one** Vercel build (the `ignoreCommand` skips only non-`main` `test/chore/ci/docs` commits). After that, runs commit nothing and trigger no deployment.
- GitHub warns scheduled runs can be delayed or dropped at the top of the hour (the :05 offset helps) and disables schedules after 60 days without repository activity.
- **Run logs and artifacts on a public repository are public.** The jobs must log counts and keys only, never line-level data, and must not upload artifacts.

### Retention
`OddsSourceProfile.retentionCapDays` now records caps: ParlayAPI 90, others none. `expiredSnapshots()` lists what a purge would cover; nothing deletes automatically because the stores are append-only. The Odds API terms (read through a summarizing fetch on 2026-10-19) were summarized as allowing indefinite storage; that stays **unconfirmed** until the page is read directly. Manual batches are kept permanently as private research.

## 6. What runs now at $0

`npm run nba:pipeline` (import lines, import results, settle, report) on `data/nba/pipeline/`, plus `npm run nba:credit-headroom`. Manual capture cost is the only cost: record each prop's line and prices 2–4 hours before tipoff, then enter final results the next morning.

## 7. Remaining manual steps (all need the owner)

1. Record a rights decision for The Odds API and confirm the plan and the NBA player-prop entitlement from the account dashboard (zero credits).
2. Approve one zero-credit probe (`/sports`, `/events`) to confirm the counter and the NBA event list, then a one-credit `player_points` probe.
3. Accept the NBA allowance (start: 3/day, 39/month, reserve for other sports) and the shared-pool accounting.
4. Write the real provider adapter and the free `/events` schedule call (not written).
5. Decide how to handle NCAAB site polling before November.
6. Create the dedicated Supabase project, approve the migration, add two secrets; write the export command.
7. Merge two workflow files to `main` (one Vercel build) and enable them.
8. Pick a permitted source for final player stats, or keep entering them by hand.

## 8. Recommended first activation (consumes nothing paid)

Run the manual path for a week on a single nightly game, and re-run `npm run nba:credit-headroom` weekly. That produces real captured lines at zero credits and measures November's actual headroom before any provider is touched. The first provider step after that is item 2 above.

## Known limits
- The seasonal scenarios assume MLB and NFL spending stops with their seasons; the "other" component is an unattributed remainder.
- The row-overhead factor is an estimate, unverified on a real Postgres.
- Free-plan player-prop availability and The Odds API's storage terms are unconfirmed.
- One equivalent mutant survives: an unknown remaining count in the gate is also refused by arithmetic, so the explicit check is for type safety.

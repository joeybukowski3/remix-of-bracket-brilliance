# NBA pregame-line and postgame-result pipeline (Phase 5A)

Status: **offline infrastructure only.** Nothing is scheduled, no workflow was added or changed, no provider was called, no credential or secret was added, no migration was applied, and no license record was widened. Every test uses synthetic data and mock providers.

Goal: build a persistent research record of (1) the sportsbook player-prop line a few hours before tipoff, (2) the JKB projection made at that time, and (3) the final player result, so that model quality can later be judged against authentic archived lines. A postgame update can never overwrite what was captured before the game.

## 1. Infrastructure audit

Repository evidence only; no provider request was made.

| Area | Evidence | Reusable for NBA without touching NFL/MLB/PGA? |
|---|---|---|
| **The Odds API** | One registered account, `the-odds-api:unverified-pool`, funded by three env var names (`ODDS_API_KEY`, `THE_ODDS_API_KEY`, `ODDS_API_KEY_BACKUP`). Plan and identity UNKNOWN; the only evidence is 500 credits/month on the free plan for one key (`quota-state.json`). Unmanaged consumers: NFL daily lines (~3 credits/day, ~90/month by the workflow's own comment), MLB props, PGA, best-bets, NFL yardage, and the Vercel odds route. | **No.** It is one shared pool. NBA use is blocked by your 2026-10-12 decision, there is no live approval, and usage is not reported to the quota manager. |
| **ParlayAPI** | Free tier, 1,000 credits/month. Terms (2026-09-30): s4.1 personal evaluation and non-commercial research only; s4.2(f) no public product including derived insights without a signed agreement; s4.2(c) 90-day cap on stored line-level prices. | **No.** Blocked by its terms for a public site. |
| **TheRundown** | MLB moneyline fallback only; no plan evidence. | Not assessed for NBA. |
| **NBA schedule** | The Odds API `/events` costs no credits but sits behind the blocked pool. BALLDONTLIE's free tier lists games (5 requests/min) but has no recorded license decision. API-NBA's free plan ends at 2024-25. ESPN/hoopR is rights-blocked. | **Manual CSV** (schedule rows are derived from the imported lines) works today. |
| **NBA results** | No permitted free source: API-NBA free stops at June 2025, hoopR/ESPN is blocked, BALLDONTLIE game stats need ALL-STAR ($9.99/month, explicit rights, not subscribed). | **Manual results CSV** works today. |
| **Database** | Supabase has one migration (`live_brackets`) and a server pattern using the service-role key on Vercel (`api/_lib/supabase.ts`). The quota manager's Supabase SQL is proposed and unapplied. No Redis or KV exists. | Supabase is the only durable, private store already in the stack. |
| **GitHub Actions** | 47 workflows. 28 share the `main-data-writers` lock and commit generated data to `main` (every commit to `main` triggers a Vercel build). The repo documents that GitHub schedules "are delivered hours late or dropped". Per-trigger `timezone: America/New_York` is already used. | Yes, as the scheduler, in a separate workflow that commits nothing. |
| **Vercel functions** | One cron (`/api/cron/generate-mlb-data`, daily 08:17 UTC); Hobby allows daily crons only. | **No** for hourly windows, and a function must not fetch providers on a page request. |
| **Quota manager** | Built and tested, but no existing workflow is routed through it. FileUsageStore is single-machine; the Supabase store is proposed, not migrated. | The NBA pipeline routes every live call through it (below). |
| **NBA stat licenses** | Every real source is unlicensed or restricted; only synthetic data is usable. | n/a |

**Which integrations can be reused without consuming existing allocations: none of the paid or free odds APIs today.** The only no-cost, no-conflict path is manual import.

## 2. Persistent records

All records are versioned, canonical-JSON content-hashed, and validated on parse (shape, cross-field rules and the hash). The stores have no update or delete.

| Record | Key fields | Rules enforced |
|---|---|---|
| **Pregame snapshot** | game (canonical key, provider event id, tipoff), player (canonical id or name+team), market (PTS/REB/AST), sportsbook, line, **both** prices, source last-update and capture instants, minutes to tipoff, window (early/in_window/late), freshness (fresh/stale + age), JKB projection (value, minutes, model version, input cutoff, or an explicit reason it is missing), calibrated probabilities and EV or null, permissions at capture, provenance (run id or import batch, credits charged), content hash | Captured **45 to 240 minutes before tipoff** (enforced by the record itself, the importer and the SQL function, not only by the job); projection inputs cannot postdate the capture; lines are half-point multiples; American prices only; manual imports carry an attestation and a `backfilled` flag; raw redistribution is never granted to captured lines; freshness is fresh, stale or **unknown** (a line whose age cannot be established is never authentic); id is derived from the hash |
| **Final result** | game (status, periods, finalization time), player, participation (`played` / `dnp_confirmed` / `inactive_confirmed` / **`unverified_absent`**), stats, revision, supersedes, correction reason, provider, evidence reference, permissions | Stats exist exactly when the player played, and a played line needs positive minutes (a zero-minute row is unverified or a confirmed DNP, never a played Under); a confirmed DNP needs a final game; revisions chain by exactly one; a correction needs a reason; an evidence reference is required |
| **Evaluation** | snapshot id **and hash** (immutable link), result id and revision used, settlement (over/under/push/void/pending) with reason, actual, margin, projection and minutes error, revision chain | Settlement must agree with actual vs line; void and pending need a reason |
| **Capture attempt** | per game: captured / deduplicated / no_market / stale_only / missed_window / postponed / blocked / budget_exhausted / error, plus result fetches | Gives every game with no line an explicit marker |

Immutability: the snapshot table accepts inserts only; a repeated insert is a duplicate. A result or evaluation revision must be exactly latest+1 and must change something. A postgame job has no operation that touches a snapshot.

## 3. Scheduling design

**Platform: GitHub Actions, in two new workflows that commit nothing,** with durable dedupe and a lock in the database. Rationale: it already exists, supports Eastern-time cron, and costs nothing on a public repo. Because it commits nothing to `main`, it triggers **no Vercel deployments**. Vercel cron cannot run hourly windows on Hobby and would put provider fetching in a serverless request path.

Do not assume one daily run covers every game: NBA tipoffs span roughly 12:00 to 22:30 ET, so the 2-4 hour windows span roughly 08:00 to 20:30 ET.

| Job | Proposed schedule (Eastern) | Behavior |
|---|---|---|
| **Pregame snapshot** | Hourly at :05 from 08:05 through 21:05 (14 runs on game days; a run with no game in window makes no provider call) | Captures a game when it is 180 minutes or less from tipoff; "in_window" at 120-180, "late" at 45-120, never below 45, never before it is due. One dropped or delayed run lands in the late band instead of missing the game. A game with no lines yet is retried once. |
| **Schedule refresh** | First run of the day (08:05) | One free events call (if a provider is ever enabled), else the schedule comes from the imported lines |
| **Postgame settlement** | Once daily at 06:30 | Processes only games at least 4 hours past tipoff that are unprocessed or inside the bounded correction window (72 hours, at most 2 re-checks). A missing box-score row becomes `unverified_absent` (pending), never a DNP. A postponed game voids with no provider call. |

Safeguards (all tested, and each one mutation-checked: breaking it fails the suite): a durable, **non-reentrant** lock (a second run, even with the same run id, exits without calling anything); one audit row per provider contact with a per-game sequence id, so a re-dispatched slot is audited and the try limit still trips; a game that already has lines is skipped, so a repeat run is a no-op; fingerprint dedupe (an unchanged market is not re-stored, a moved line is a new snapshot); a response that arrives after the capture floor is discarded, never stored as a pregame price; stale lines are stored but flagged and excluded from every trend; no public page ever triggers a fetch.

## 4. Odds-source feasibility and budget

The Odds API charges markets-returned x regions per event odds call (`/events` and `/sports` are free). Three markets, one region-equivalent: **3 credits per game**. (Whether up to 10 named bookmakers count as one region is from memory of the docs and must be confirmed before enabling; the docs I could read confirm only the formula and `player_points`. The `player_rebounds` and `player_assists` keys are also unconfirmed in what I read.)

| Slate | Credits/day | Credits/month (25 game days) | Points only, per month |
|---|---|---|---|
| 5 games, 3 markets | 15 | 375 | 125 |
| 10 games, 3 markets | 30 | 750 | 250 |
| Full regular season (1,230 games) | | 3,690 (+ up to ~315 for playoffs) | 1,230 |

- **Free plan (500/month, shared):** NFL alone uses about 90/month; MLB and PGA usage is not measured, so the NBA share cannot be sized from evidence. A nightly 5-game, 3-market slate would need 75% of the whole pool. Full-slate NBA capture is **not** feasible on the free shared pool.
- **Smallest honest live option:** points only, the 2-3 best games a night (about 50-75 credits/month), under a hard NBA-only cap, and only on an account whose identity and plan are verified.
- **Paid (not subscribed):** the 20K plan at $30/month would carry 750 credits/month at under 4% use.
- **Where licensing blocks automation:** ParlayAPI (terms), and The Odds API until you record a decision and verify the account. Its terms, as I read them through a summarizing fetch, allow storage, derived display and ML use and forbid resale; they are silent on the free plan. Confirm against the page and, if unsure, ask the provider.
- **Never borrowed:** the request gate itself enforces a separate NBA-only daily and monthly allowance, counted from the ledger by sport, on top of the quota manager's own admission, and the planner uses the same counts. A reservation by another sport consumes the pool but never counts against the NBA allowance. A metered source runs only through a gate bound to **its own registered quota account** that enforces the allowance; otherwise the job is blocked before any call. The same holds for a metered results provider, and the settlement job also refuses to run with no recorded permission to store the provider's results.

**Manual fallback (no API cost):** CSV import of lines and results, with the importer's attestation of where the data came from and which uses it permits. Raw redistribution can never be attested. A row is rejected, with a reason, if it was captured at or after tipoff, outside 45-240 minutes before tipoff, dated in the future, or imported after the game started. The last case can be kept with `--allow-backfill`, flagged as unverifiable: it is stored but is never treated as an authentic line or as training data.

## 5. Incremental statistics

Computed from stored snapshots, results and evaluations (`pipeline/statistics.ts`): last-5/10/season minutes (played games only, final before the as-of time), minutes and PTS/REB/AST projection error (projection minus actual), O/U/push/void history relative to the captured line by player, opponent, home/away/neutral, market and sportsbook, calibration bins and realized EV (only where a calibrated probability exists), and frozen chronological partitions.

- **Authentic lines only:** captured before tipoff, fresh, not synthetic, and carrying at least private-research rights. A reconstructed, stale or post-tipoff price never feeds a trend.
- **Training rights:** a row enters the training partition only if its own record carries model-development rights; it is counted as excluded otherwise.
- **Frozen partitions:** train up to a cutoff, a gap, then a holdout; the manifest hashes the membership, and verification reports late arrivals.
- JKB projections are optional on a snapshot (`unavailable: no permitted history`) because no permitted real history exists yet. Line-versus-result statistics work without them.

## 6. What was built

New, under `src/lib/nba/props/pipeline/`: `contracts`, `oddsSources` (license records, all closed), `captureWindow`, `store` (in-memory and local JSONL; same contract a Supabase store would follow), `budget` (planner, slate projection, request gate over the quota manager), `settlement`, `csv`, `manualImport`, `resultsRecorder`, `pregameJob`, `postgameJob`, `statistics`; fixtures in `__fixtures__/pipelineFixtures.ts`; tests in `pipelineCore.test.ts` and `pipelineJobs.test.ts`; the CLI `scripts/nba-pipeline.ts` (`npm run nba:pipeline`); the proposed SQL `supabase/proposed/20261019_nba_research_pipeline.sql` (not in `migrations/`). Small edits: the shared canonical-JSON helper moved to `canonicalJson.ts`; the containment rule now also covers the new record types.

Not built, on purpose: any live provider adapter (the interface is `PropsProvider` / `ResultsProvider`, to be implemented behind the quota gate), the Supabase store class, and any workflow.

## 7. Storage and deployment

- **Now:** local JSONL under `data/nba/pipeline/`, which is gitignored, vercelignored, excluded from the dev server and refused by the CLI anywhere else. Lines are restricted research data and must never be committed to the public repo.
- **For scheduled cloud runs:** a private Supabase database using the proposed append-only schema (triggers reject update/delete; row-level security with no client access; service-role-only functions for the revision chains and the lock). It needs two new GitHub secrets (the project URL and a service key, ideally a dedicated role) and a migration approval. It is untested against a real Postgres.
- **Deployments:** the jobs write nothing to the repository, so they cause none. Only code and docs merges build, and `ignoreCommand` already skips non-main `chore/ci/docs/test` commits.

## 8. What runs now, what blocks, and the smallest safe step

**Runs immediately with no paid provider:** manual lines and results CSV, validation, settlement, evaluation, statistics and frozen partitions, on the local store (`npm run nba:pipeline`). The only cost is the effort of entering lines by hand.

**Blockers:**
1. A recorded rights decision for The Odds API (and a way to confirm the account behind its three keys).
2. A verified plan and an NBA-only credit allowance that does not reduce NFL/MLB/PGA, which needs account facts I cannot see.
3. A `liveApproval` on the account, and quota usage reported to the manager.
4. A real `PropsProvider` adapter and a verified list of NBA player-prop market keys and bookmaker cost.
5. A permitted source of final player stats (nothing free is permitted today).
6. A Supabase migration approval and secrets, if cloud scheduling is wanted.
7. Any JKB projection on a snapshot needs permitted real player history.

**Smallest safe activation step:** a **single-game live probe, run locally,** mirroring the API-NBA probe: one game, one `player_points` call (1 credit) through the quota gate, with a `liveApproval` capped at about 3 credits, stored in the local store. It validates the market keys, the response shape and the true credit cost with no workflow, no secret in GitHub and no deployment. It needs items 1-4 first. Until then, the manual path above is the only thing worth running, and a week of it will show how many lines you can realistically obtain and how the settlement behaves on real games.

## Known limits (from the independent review)

- **Authenticity rests on attestation for manual lines.** The importer can prove a row is internally consistent and was imported before tipoff; it cannot prove the capture time is true. `recordedAtUtc` and `evaluatedAtUtc` are not covered by the content hash, and they drive ordering and the correction window.
- **One outcome can be counted several times.** Two sportsbooks' lines for the same player and market are separate rows in hit rates and partitions. Treat counts as per-line, not per-outcome, or filter to one book.
- **Early-lines bias.** A game is captured once. If only some props are posted three hours out, those become its permanent capture; later-posted props are not added.
- **Append-only conflicts with retention.** Nothing can be deleted, so the store must not be enabled for a source whose terms cap how long prices may be kept or that can be revoked (ParlayAPI's 90 days is the example). The Odds API terms I read allow retention, but confirm.
- **Local store is single-machine.** The CLI takes a lock per command and re-reads the store after taking it, but the file lock is best effort across processes; a torn trailing line fails the load rather than being skipped. Use the database store for cloud runs.
- **The NBA allowance day is Eastern; the provider quota month is assumed UTC.** A game near month end can land in different windows.
- **Supabase SQL is unexecuted.** It uses the database clock, not the job's injected clock, and has never run against a real Postgres.
- **No live adapters exist**, so none of the provider-facing paths has met a real response.

## Manual CSV layouts

Lines: `captured_at_utc, tipoff_utc, away_team, home_team, player, team, market, sportsbook, line, over_price, under_price` plus optional `source_last_update_utc`. Instants carry an explicit offset (Z or +/-hh:mm). Market is points, rebounds or assists. Both prices are required.

Results: `tipoff_utc, away_team, home_team, player, team, participation, game_status` plus `finalized_at_utc, minutes, pts, reb, ast, periods, correction_reason`. Participation is `played`, `dnp_confirmed` or `inactive_confirmed`; an absent player is never imported as a DNP unless confirmed.

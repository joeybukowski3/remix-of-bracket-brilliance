# NBA free-first data strategy (Phase 3E)

Status: research and architecture only. No live API request, dataset download, subscription, commit or deployment was made. All provider facts below come from provider documentation read on 2026-10-18; items marked **unresolved** could not be confirmed and are treated as "no permission".

## Rights vocabulary

Every source is judged on four separate questions, and a yes to one never implies another:

| Question | `DataUse` |
|---|---|
| May we look at it ourselves? | `private-research` |
| May it train or tune a model? | `model-development` |
| May we publish projections derived from it? | `public-display` |
| May we republish or serve its rows? | `raw-redistribution` |

Two further rules are enforced in code (`sources/registry.ts`, `sources/ingest.ts`):

- A repository's **code license is not a data license.** `codeLicense` is recorded on the profile and ignored by every gate.
- A redistributor's rights are **capped by its origin's.** Effective permission is the intersection of three things: the adapter's license, the registry's record for the source, and each origin's record. No one of them can widen another, so a mirror of restricted data stays restricted whatever the mirror's own record says. `validateSourceRegistry` flags a static dataset with no declared origin and any origin cycle, because either silently removes the cap.

The ESPN terms review, the recommended decision and the draft public question to SportsDataverse are in `docs/nba-espn-upstream-rights-review.md`.

## Ranked $0 candidates

| Rank | Candidate | Player-game PTS/REB/AST/MIN | DNP / game IDs | Freshness and depth | Rights status |
|---|---|---|---|---|---|
| 1 | **API-NBA free plan** (direct api-sports.io) | **Verified** in our saved Phase 3C data: all four fields complete; minutes are whole-minute strings | Zero-minute DNP rows present (0.8% of rows), inactive players absent, no DNP reason; integer game IDs, stage and status fields | Seasons 2022-23 to 2024-25 only (ends June 2025); 100 requests/day, 10/min | **Unresolved.** Recorded as "terms grant no publication license; private-evaluation permission unverified". API-Sports' terms were not read in Phase 3E (its pricing and documentation pages returned 403/404 to our fetches). |
| 2 | **hoopR-nba-data** (sportsdataverse; ESPN-derived release files) | Player box scores are published (79-asset release, last published 2026-08-26); column names for minutes and did-not-play **unresolved** | Not verified | Repo states 2002 to present; daily workflow October to July; the only $0 source covering 2025-26 and the live season | **Partly resolved.** `LICENSE.md` is **CC BY 4.0** over the repo's "data, code, and documentation" (commercial use allowed with attribution). It says nothing about ESPN, the README labels the data "source: ESPN", and ESPN's terms could not be retrieved. A licensor can only license what it holds, so the upstream grant is **unresolved** and the record stays empty. (An earlier version of this table said no data license existed; that was wrong, I had read only the `LICENSE` stub.) |
| 3 | TheSportsDB free key | Not available: no per-game player statistics endpoint is documented; NBA not mentioned | n/a | 30 requests/min | Terms not retrieved. **Not viable on capability alone.** |
| 4 | llimllib/nba_data | Minutes not mentioned in the README | game_id, player_id keys | Per-season parquet, refreshed every 4 hours, 2009-10 onward | **Blocked.** Data comes from stats.nba.com, so the existing NBA.com restriction (Terms section 9; user decision 2026-10-12) applies. No license is stated for code or data. |
| 5 | Kaggle / Zenodo / TU Wien NBA datasets | Varies | Varies | Static snapshots | **Blocked in practice.** The ones found are built from NBA.com or Basketball-Reference. Sports Reference's data-use page prohibits using its content to train or tune AI models. No dataset with an explicit open data license was found. |
| - | BALLDONTLIE free tier | Not available: game player stats start at ALL-STAR | n/a | 5 requests/min | Not $0 for stats. Terms explicitly permit analytics, wagering products and ML training. |

Reference for the lowest paid option with explicit rights: BALLDONTLIE ALL-STAR, $9.99/month per sport (`/v1/stats`: pts, reb, ast, min string; 60 requests/min; cursor pagination, 100 rows per page).

### What was ruled out and why

- **Highlightly** (Phase 3D): terms section 7 prohibits using the data to support gambling or betting.
- **SportsDataIO trial:** scrambled data, not usable for analysis.
- **ESPN hidden endpoints, nba_api, direct NBA.com:** undocumented or restricted; not accessed.
- **A GitHub-hosted or publicly downloadable file** is not licensed for betting analytics by being downloadable. Nothing in this table is treated as permitted until a verified record says so.

## Recommendation: first permitted real-data evaluation

No $0 source has a verified right for `model-development` today, and that is the binding constraint, not coverage or price.

1. **Recorded decision needed first:** read API-Sports' terms (and ask their support in writing if unclear) for **private evaluation**. If it permits it, record `private-research` for `api-sports-nba` in `licenses.ts` citing the terms version and date. Do not record `model-development` or `public-display` without separate evidence.
2. **First evaluation = pipeline smoke on the data already saved locally** from the Phase 3C probe (gitignored): adapter normalization, canonical IDs, acceptance gate, dataset reconciliation. It makes no new requests and no model claims, and it is only one team's 93 games.
3. **Then a 93-request backfill** of 2022-23 to 2024-25 (3 game lists + 30 team-seasons x 3), split across two days inside the 100/day limit and the 5-unit reserve. That needs a new approval.
4. **hoopR/ESPN is the right second track** because it is the only free path to 2025-26 and the live season. Before any download: obtain ESPN's terms and a written data-rights statement from the sportsdataverse maintainers, then decide.

Note on "current season": the 2026-27 regular season is only starting, so almost no games exist yet. For model validation the practical current hold-out is the completed 2025-26 season, which API-NBA's free plan does not include.

## Architecture changes

Done in this phase (synthetic tests only, `sourceStrategy.test.ts`):

| Need | Change |
|---|---|
| Multiple authorized sources, explicit permissions | `SOURCE_PROFILES` registry; source ids added for `espn`, `hoopr-espn`, `llimllib-nba-data`, `thesportsdb`; `DATA_USES` gains `raw-redistribution` |
| License gates | `effectivePermittedUses` (own record AND origin chain); `assertUsePermitted` now applies it at ingestion, so a mirror adapter can no longer pass on its own record alone |
| Stable canonical IDs | `canonical.ts`: Eastern-date + franchise-code game key (providers disagree on UTC vs local dates), alias-mapped team codes (unknown codes reported, never guessed), explicit player links with conflict reporting |
| Provenance and quality | `sources/qualityGate.ts`: declared-vs-delivered minutes precision, DNP representation, snapshot traceability, and completeness measured as games WITH PLAYER ROWS against per-season expectations (a missing expected season fails); dataset reconciliation already existed |
| Free-to-paid migration | `sources/selection.ts`: per-season, free-first plan with gate order access, license, fields, coverage, quota, cost (the budget applies to each season on its own, not to the plan total; season strings and the budget are validated); moving to a paid provider is a registry plus license entry; `compareSources` measures two providers' agreement before one replaces the other |
| Quota for every live API | `validateSourceRegistry` fails a live-API offering that delivers player stats without a registered or planned quota account; selection will not choose an offering whose account is not registered. This checks the registry only: that requests actually pass through `guardedRequest` is a property of each transport, to be tested when one is written |

Still needed before any real ingestion:

1. **Static-dataset loader with a download gate.** `SourceTransport` assumes HTTP. File sources (hoopR, any dump) need a pinned URL, size and checksum, plus an explicit approval like the live-request approval.
2. **Real adapters** (API-NBA exists; hoopR is not written because its columns and file format are unverified). Parquet support would be a new dependency decision.
3. **Date handling in adapters:** convert start times with `etGameDate` before building rows. It refuses date-only or zone-less strings rather than guessing a timezone. Neutral-site games (for example a cup final) can carry a different designated home team per provider; `canonicalizePlayerGames` does not yet use the neutral-site key, so those games need handling before cross-source comparison.
4. **Containment rules** for any new raw file shapes. `data/nba/` is already gitignored and excluded from the dev server and deploy, which covers local copies.
5. **Player crosswalk data** (names, birth dates or a vendor table) to populate `PlayerLink`s. Linking is explicit and conflict-reported by design.

## Incremental plan to baseline PTS / REB / AST / minutes projections

| Step | Gate to pass | Output |
|---|---|---|
| 0. Architecture (done) | Offline tests green | Registry, selection, canonical IDs, gate |
| 1. Rights decisions | Written basis recorded in `licenses.ts` | Which uses are open for API-NBA; ESPN position |
| 2. Pipeline smoke on saved probe data | Acceptance gate passes; reconciliation clean | Confidence in the adapter, no metrics |
| 3. Free historical backfill (93 requests, two days) | Gate passes per season | Three seasons of player-games |
| 4. Baselines on existing code (v0 rates, minutes v1) | Time-ordered split: train 2022-23 and 2023-24, validate 2024-25; beat the naive trailing-average methods on out-of-sample MAE | First honest metrics |
| 5. Hold-out on the latest completed season | Needs 2025-26 from a permitted source | Decision point: hoopR rights, or paid |

## When a paid API is actually necessary

Buy only when all of these hold:

1. Step 4 shows the model beats the naive baselines out of sample, so more or fresher data has value.
2. A permitted $0 source cannot supply a required season or field. Free API-NBA ends June 2025; no free source documents DNP reasons, starters, or pregame availability with as-of timestamps, which leakage-safe features need.
3. The need is operational: daily in-season ingestion of the current season. API-NBA free blocks the current season, and a team-season pull is too heavy for it, while a per-game pull of at most about 15 games a day would fit a paid quota easily.
4. The candidate's license for the intended use is verified before paying. Price is secondary: the cheapest explicit-rights option found is $9.99/month (BALLDONTLIE ALL-STAR), and paying for a source whose terms forbid the use buys nothing.
5. Its quota account is registered and the selection plan, not a person's memory, shows the season it unlocks.

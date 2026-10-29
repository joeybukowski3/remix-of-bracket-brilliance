# BALLDONTLIE NBA as the replacement statistics source

Evaluated 2026-10-29. Sources: the public docs (https://nba.balldontlie.io/), pricing page (https://www.balldontlie.io/#pricing) and Terms of Service ("Last Updated: October 20, 2026"), all read on 2026-10-29. **No API key was used, no request was made to any BALLDONTLIE API endpoint, nothing was subscribed or bought.** Every capability below is therefore *documented, not live-verified*; section 6 lists what only a capped live probe can settle. This is an engineering assessment, not legal advice.

## 1. Verdict

**Yes, the complete dashboard can run on BALLDONTLIE, conditionally.** The ALL-STAR tier ($9.99/month, NBA only) documents every field the model, L10 and the opponent tables use. Three things are not simply "swap the source": the five-position DvP labels, an owner decision on them, and several behaviors the docs do not state. The free tier cannot do it (no `/v1/stats`).

| Requirement | Free ($0, 5 req/min) | ALL-STAR ($9.99, 60 req/min) | Notes |
|---|---|---|---|
| Player-game PTS/REB/AST, minutes, team, opponent, date | No: `/v1/stats` is "ALL-STAR, GOAT" | **Yes**, `GET /v1/stats` (`pts`, `reb`, `ast`, `min`, nested `player`, `team`, `game`) | `min` is a string, example `"30"`. |
| Historical seasons for the baseline (2025-26 plus the current one) | n/a | Documented as "data from 1946-current"; **the `/stats` start season is not stated** | Seasons are labelled by start year (2025 = 2025-26). Verify 2025 in the probe. |
| Player identity | `GET /v1/players` (id, name, position, team) | same, plus `GET /v1/players/active` | BALLDONTLIE's own integer ids; no ESPN, NBA.com or Basketball-Reference id. |
| Team data | `GET /v1/teams` (id, abbreviation, conference, division) | same | Abbreviations need the existing alias table (`canonical.ts`) to be checked, not assumed. |
| Schedule and slate | `GET /v1/games` (`datetime`, scores, `status`, `season_type`) | same | Replaces hoopR's schedule file at no cost. |
| Opponent box scores (every player in a game) | n/a | `/v1/stats?game_ids[]=` or `dates[]=` | Same endpoint, no extra tier. |
| Starter flag | n/a | **Not on `/stats`.** `GET /v1/lineups` is GOAT ($39.99), 2025 season onward only | Used only for the position role heuristic, not the projection. |
| Did-not-play rows | n/a | **Not documented** | The import already drops zero or empty minutes; the adapter must treat a null or `"00"` minute value as a DNP, counted, never repaired. |
| Pregame injuries | n/a | `GET /v1/player_injuries` | Not used by the model today; not needed. |
| Season averages, advanced stats, box scores endpoint | n/a | **GOAT only** | Not needed: the app computes season totals itself from player-games. |

## 2. Rights (BALLDONTLIE Terms, Last Updated October 20, 2026)

The 2026-10-18 record in `licenses.ts` cites terms "updated 2026-09-17" and says raw resale is forbidden; the live terms are newer and read differently, so that record's text is stale. **I did not change the record**: it grants nothing, and nothing is permitted until a subscription and an owner decision exist.

| Topic | Terms (short quotes) | Fit |
|---|---|---|
| Commercial use | "You may use Data you lawfully obtain for any lawful personal or commercial purpose, subject to these Terms." | Covers a commercial site. |
| Storing, caching, displaying | "copying, caching, storing, archiving, modifying, combining, analyzing, publishing, displaying"; "no fixed retention or deletion deadline" | Covers a hosted copy (`private-hosted`) and display (`public-display`). |
| Model training and backtesting | "You may use Data for model training, evaluation and backtesting" | Covers `model-development`. |
| Betting analytics | Lawful sportsbook and wagering products are permitted uses; do not rely on the Data "as the sole source for accepting, grading, or settling a wager without independent verification" | We do not settle wagers. |
| Raw data | Resale of original or modified Data is allowed, but "You may not use Data to build or operate a sports-data API or equivalent data feed that serves as a substitute" | Keep `raw-redistribution` unrecorded: the board is a product, not a feed. |
| Attribution | Not required | None needed. |
| Limits | No evading "rate limits or subscription restrictions"; keys not shared outside plan permissions | Capped, serial fetcher. |
| Upstream rights | "not legal clearance from any third party" | **Residual risk.** The terms do not say where the data originates. This is the same *kind* of disclaimer as hoopR, but here the actual data vendor grants commercial, display, storage and ML use in writing. That is materially stronger than hoopR's position, not zero risk. Accepting it is an owner decision, as with The Odds API. |

**Proposed record when (and only when) the owner subscribes and decides:** `permittedUses: ["private-research", "private-hosted", "model-development", "public-display"]`, `raw-redistribution` absent, basis citing the Terms date above and the subscription. With that record, the existing hosting gate returns the `full` tier by itself (statistics source cleared), and the public board builder's `model-development` plus `public-display` gate opens for derived outputs too. A paid tier does not apply across sports ("Paid tiers do not apply across sports").

## 3. What the model actually needs (and does not)

Read from the code, not assumed:

- **Projection** (`projection.ts`, `features.ts`, `minutesFeatures.ts`, `role.ts`): a deterministic function of player-game rows (date, season type, team, opponent, minutes, PTS, REB, AST). It never reads position, starter flag, or player-id meaning (ids become surrogate numbers). So **projections depend on BALLDONTLIE only through the rows.**
- **L10, last five, season stats and opponent box tables:** computed from the same rows. The opponent tables additionally need every player's row for each opposing game, and a position label per player.
- **DvP and the position filter:** need a position per player per season. This is the real dependency (section 4).
- **Odds lines:** matched to players by normalized name and team. Names change source, so the unmatched-line report needs a re-check (section 6).

## 4. The position gap: the one real design problem

Today's five-position (PG/SG/SF/PF/C) DvP labels come from **Wikidata CC0 career-level five-position labels joined by ESPN athlete id**, narrowed by ESPN's coarse G/F/C listing and the starter share (`positionMapper.ts`). About 70% of minutes have a label; the rest are unclassified. BALLDONTLIE gives only a coarse `position` on the player object (examples: G, F, C, G-F). That affects the migration in three ways:

1. **The ESPN-id join to Wikidata breaks.** BALLDONTLIE has no ESPN id. The smallest fix is a name-plus-team bridge from the existing estimate records (which carry name and team) to BALLDONTLIE ids, with every ambiguous or unmatched player listed, never guessed. The Wikidata labels (CC0) carry over unchanged.
2. **ESPN-derived inputs must be replaced for hosting.** The ESPN tie-break and "25 ESPN C" cases in the current position files are ESPN-derived. They would be re-derived from BALLDONTLIE's coarse label with the same rule (`ESPN_ALLOWS`), which is a one-for-one swap of the listing.
3. **The starter flag is unavailable** below GOAT, so the "starter" role (starts/games share) cannot be computed from stats. It affects the position role/basis, not projections. Options: derive role from minutes only (rotation/bench), or pay GOAT $39.99 for `/v1/lineups` (2025 season onward). I recommend minutes only until a probe shows a need.

Using BALLDONTLIE's coarse labels *directly* is possible (`dvpPositions.ts` already expands G, F, G-F, F-C with fixed weights) but it would make most guards "PG+SG" and collapse the five-position view the current DvP and last-10 opponent tables show. That is a dashboard change, which you excluded, so it is **not** the recommendation. Whether a rule may split G and F further is the same open owner decision already noted in `docs/nba-props-v1.md`.

## 5. Smallest migration, and expected output differences

**Changes (no model code, weights or dashboard layout):**

| Step | What | Size |
|---|---|---|
| 1 | `balldontlieAdapter.ts` (pure): `/v1/stats` rows to the existing `jkb-player-games-import-v1` file with `sourceId: "balldontlie"` (already an allowed id in `playerGameImport.ts`). Season label from `game.season`; `isHome` from `game.home_team_id`; minutes from `min`; a null, empty or zero minute is a counted DNP exclusion; `season_type` mapping with an explicit NBA Cup policy (below). | one module plus fixture tests |
| 2 | Capped, serial, gated fetcher `scripts/nba-balldontlie-fetch.ts`: teams, games, stats (cursor, `per_page=100`), active players. Raw responses under gitignored `data/nba/`, sha256 manifest, hard request cap, backoff, refuses without an owner approval variable and a license record. | one script, none of it run |
| 3 | Position bridge and re-derivation (section 4): BALLDONTLIE id keyed position files, same five-position format, coarse label replaces the ESPN listing. | one module plus a review CSV |
| 4 | Slate from `/v1/games` instead of the hoopR schedule. | small |
| 5 | Parity harness (below), then the license record and gate (no code). | one script |

The hoopR fetch, hoopR adapter and Wikidata ESPN-id join stop being used. The board builders, `projection.ts`, the page, the hosting gate and the hosted API are unchanged: once the record exists the gate returns `full` and the hosted board carries projections, season stats, L10 and DvP.

**Request volume (estimate from the current import):** 2025-26 has about 34.9k source rows (hoopR, including did-not-play), so about 350 `/stats` pages at 100 rows, plus about 15 game pages, 1 team page and about 6 player pages: roughly **380 requests, about 7 to 10 minutes at 60/minute**, once. A daily refresh is a handful of requests. One month of ALL-STAR is enough for the backfill.

**Expected model-output differences, with evidence:**

| Output | Expected difference | Evidence |
|---|---|---|
| Minutes precision | **None.** `min` is whole minutes, and the current model already runs on whole minutes: **0 of 29,765** imported hoopR rows have a fractional minute value. A sensitivity run that rounded or floored every minute value through the real private-preview builder changed no projection and no minutes figure (978 entries, 0 differences), as expected since the values were already integers. | Local, private, aggregates only. |
| PTS/REB/AST projections, minutes | **None for identical rows.** The projection is a pure function of the rows. Differences can only come from rows that differ between sources: stat corrections, games or players present in one and not the other, NBA Cup classification, cameo appearances under 1 minute. | Code reading (section 3). |
| L10, last five, season stats, opponent box scores | Same: identical for identical rows. Player names and ordering may differ in spelling. | Same. |
| DvP and position filter | **The only expected visible change**, and only through the position source: re-keyed labels, ESPN tie-breaks replaced by BALLDONTLIE's coarse label. Coverage (now about 70% of minutes) is unlikely to change much because the unclassified players lack Wikidata statements, not a coarse label. | Section 4. |
| Role (starter/rotation/bench) | May shift for the starter cases, display only. | Section 4. |
| Lines joined to players | Possibly more or fewer unmatched lines until names are compared; the existing report lists every unmatched line. | Section 6. |

**Parity harness (the acceptance test, offline once data exists):** join BALLDONTLIE and the local hoopR rows by date, team and normalized name for 2025-26 and report row counts, rows with equal minutes/PTS/REB/AST, and the differing rows; then run the unchanged builder on both and diff the board (as in the sensitivity run above). Proposed gate: no unexplained projection differences, and every row difference attributed (correction, NBA Cup, cameo, name).

## 6. What the docs do not say: probe before relying on it

Each is a risk to the plan, not a blocker, and each needs one cheap live observation:

1. **`/v1/stats` earliest season, and 2025 completeness** (the docs say 1946 for the API, nothing for `/stats`).
2. **Did-not-play representation** in `/stats` (absent rows, `"00"`, null, or empty string).
3. **Whether `min` ever carries seconds** (`"30:12"`); the example is whole minutes.
4. **NBA Cup:** the API has `season_type=ist` and an `ist_stage` field. hoopR counts group-stage Cup games as regular season; the adapter needs the same documented policy or the sample windows differ. Unknown stage values must fail the import, not default.
5. **Team abbreviations** against `canonicalTeamCode` (aliases exist for PHO, BRK, GS, NO, SA, WSH, UTAH, CHO, NY), and **neutral-site or international games**.
6. **Pagination:** the stats section calls `cursor` "the page number" while the rest describes opaque cursors.
7. **Player name spelling versus the Odds API** (diacritics, suffixes) for line matching.
8. **Rate-limit and abuse behavior** on 429, and whether a month's requests are capped (none is documented besides the per-minute limit).
9. **Upstream data origin**, which the terms decline to state.

The pricing page lists a "48h free trial available in your dashboard" with trial keys capped at 5 requests/minute. Whether the trial includes `/v1/stats` is not documented. **Starting a trial is an account action for the owner, not something done here.**

## 7. Exact next implementation step

**Authorize a capped coverage probe (owner action), then build the adapter against its output.** Concretely:

1. *Owner decision:* start the 48h trial, or subscribe to NBA ALL-STAR for one month (approve spending $9.99), and put the key only in a local environment variable.
2. *Approve a probe of at most about 20 requests* (1 teams, 1 games page for season 2025 and one for 2026, `/v1/stats` for three fixed dates plus one cup game and one preseason game, 1 active-players page). I will build it as a gated, serial script with a hard cap and no retries, record only counts, field presence and the nine items in section 6, and write nothing outside the gitignored data folder.
3. *Then I build steps 1 to 5 of section 5,* with the probe's observed responses as fixtures, and run the parity harness against the local hoopR rows.
4. *Owner decisions at that point:* record the BALLDONTLIE license (proposal in section 2), and the position approach in section 4.

Nothing in 2 to 4 changes a model weight, the dashboard, a deployment or the hoopR/ESPN records.

If you would rather not spend anything before building, I can start step 1 and 2 now from the documented schema alone (offline adapter and the gated fetcher, with synthetic fixtures); it will be correct for the documented fields and will need the probe to close the nine unknowns.

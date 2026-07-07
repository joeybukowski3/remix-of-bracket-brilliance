# NFL Data Inventory (free-first pipeline foundation)

Status: PR-1 foundation. This document is the single reference for what NFL data
exists in the repo, what free external sources the pipeline uses, and the
schema conventions every generated NFL file must follow.

## Mandate

The NFL pipeline is **free-first**:

- No new paid subscriptions or vendors.
- No paid The Odds API usage, no sportsbook scraping, no player-props products.
- Free public data (nflverse) plus data already in the repo.
- Warren Sharp / VSiN material already in the repo stays available as
  internal/model inputs; the pipeline does not expand public reposting of
  paid-source tables.

## Canonical teams

`public/data/nfl/teams.json` is the single source of truth for team identity.
Every generated NFL data file must reference teams by these codes, and
ingest scripts must fail on any team code they cannot resolve.

| Field | Meaning |
| --- | --- |
| `id` | Stable internal id (`nfl-<abbr>`) |
| `slug` | URL slug, equals `slugifyNflTeam(name)` from `src/lib/nfl/guide2026.ts` (keeps `/nfl/guide/team/<slug>` links working) |
| `abbr` | Site-wide ESPN-style lowercase code (`buf`, `wsh`, `lar`) used for logos and lookups |
| `nflverseAbbr` | Code used by nflverse files (`BUF`, `WAS`, `LA`) |
| `name` / `fullName` / `shortName` | Display name (matches `nflPreseason2026.ts`), official name, nickname |
| `conference` / `division` | `AFC`/`NFC` and full division label (`AFC East`) |
| `primaryColor` / `logoUrl` | Matches existing site styling helpers |
| `isDome` / `latitude` / `longitude` | Home stadium environment (fixed + retractable roofs count as dome) |

Known mapping gotchas:

- Rams are `LA` in nflverse, `lar` on the site.
- Commanders are `WAS` in nflverse, `wsh` on the site.
- Historical nflverse files may use `OAK` (pre-2020) or `SD`/`STL` — out of
  scope while the pipeline starts at 2022, but ingest must fail loudly if seen.

## `_meta` schema (`nfl-v0.1`)

Built by `scripts/lib/nfl-data-meta.mjs` (`buildNflMeta`). Every generated
file under `public/data/nfl/` carries:

```json
{
  "schemaVersion": "nfl-v0.1",
  "generatedAt": "ISO timestamp",
  "source": "human-readable source description",
  "season": 2025,
  "week": null,
  "modelVersion": null,
  "notes": []
}
```

`season` is `null` for season-agnostic files (teams.json). `modelVersion` is
`null` for raw data and set for model outputs (e.g. power ratings later).

## NFL data already in the repo (pre-pipeline)

Static/curated inputs that predate the pipeline and stay untouched:

| Location | Contents |
| --- | --- |
| `src/data/nflPreseason2026.ts` | 2026 preseason power ratings + division cards (based on 2025 results) |
| `src/lib/nfl/guide2026.ts` | 2026 team guide composite (projections, schedule ranks, slugs) |
| `src/lib/nfl/vsinGuide2026.ts` | VSiN 2026 guide extracts (internal/model input) |
| `src/lib/nfl/warrenSharpTeams2026.ts`, `warrenSharpSchedule2026.ts` | Warren Sharp 2026 team/schedule extracts (internal/model input) |
| `src/lib/nfl/superBowlMarkets.ts` | Super Bowl futures snapshot page data |
| `src/lib/nfl/coachOfYear2026.ts` | Coach of the Year tracker data |

## Free external sources (pipeline inputs)

| Source | URL | Used for |
| --- | --- | --- |
| nflverse `nfldata` games file | `https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv` | Schedules + final scores, all seasons (PR-2) |
| nflverse-data team/weekly stats releases | `https://github.com/nflverse/nflverse-data/releases` | Team stats + efficiency metrics (PR-4, later) |

Notes on `games.csv`:

- One row per game with season, week, game type (`REG`/`WC`/`DIV`/`CON`/`SB`),
  kickoff date/time, teams, final scores, stadium.
- It also includes historical closing spread/moneyline/total columns for
  completed seasons. These are **documented for potential future private
  backtesting only** — the pipeline does not ingest or publish them.
- The 2022 season has one cancelled game (BUF–CIN, Week 17) with no final
  score; season totals must tolerate 271 completed regular-season games.

## Generated files (season-keyed)

Written by pipeline scripts into `public/data/nfl/<season>/`:

| File | Producer | Status |
| --- | --- | --- |
| `teams.json` (season-agnostic, repo root of `public/data/nfl/`) | hand-curated (PR-1) | current |
| `<season>/games.json` | `scripts/generate-nfl-schedules-results.mjs` (PR-2) | planned |
| `<season>/results.json` | same script (PR-2) | planned |
| `<season>/team-stats.json` | PR-4 | planned |
| `<season>/power-ratings.json` | PR-4 | planned |

Seasons covered: 2022–2026. 2026 files are generated in a safe preseason/empty
state until games complete.

## Validation rules

- Every team code in generated files must resolve against `teams.json`
  (scripts fail on unknown codes rather than guessing).
- Generated JSON is deterministic (`toNflJsonFileString`): stable ordering,
  2-space indent, trailing newline; only `_meta.generatedAt` changes between
  identical runs.
- `src/lib/nfl/teamsCanonical.test.ts` guards the canonical file (32 teams,
  unique codes, slugs resolve, site data agreement).

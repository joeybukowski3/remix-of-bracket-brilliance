# PGA player-history refresh

`npm run pga:refresh-history-scoped` refreshes only the player pool supplied by
`--scope-file`, using the canonical PGA Tour player IDs already stored in
`player-history.json`. It queries the PGA Tour GraphQL
`PlayerTournamentHistory` operation (`playerProfileTournamentResults`) on tour
code `R`. When expected-event arguments are supplied, it merges only that
verified event ID and season; it never writes major history.

Refreshed `recentResults` are the single recent-history contract for Last 5
Starts, recent-form scoring, and JKB Trend. A newly completed result therefore
flows through the existing formulas and may legitimately change model scores,
ranks, and trend ranks; the refresh does not change formulas or weights.

The command requires an explicit `--output` unless `--dry-run` is used. Use a
temporary output first, then run `npm run pga:validate-history-refresh` before
replacing `public/data/pga/player-history.json`. Optional `--cache-dir` files
make interrupted runs resumable without repeating completed player requests.
`--participant-file` supplies canonical official-field IDs that must all have
the expected event when they intersect the refreshed pool.

The weekly history workflow runs Monday against the featured next-tournament
pool and the validated prior-event metadata in `current-field.json`. It uses the
shared main-data-writer lock and stages only `player-history.json`. A successful
completion triggers `sync-pga-data.yml`, which checks out the resulting `main`,
refreshes the provisional field and player statistics, generates JKB Trend,
generates rankings/models, and commits the upcoming-tournament transition. Its
Tuesday/Wednesday fallback runs update provisional entries without staging or
overwriting `player-history.json`.

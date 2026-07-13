# PGA player-history refresh

`npm run pga:refresh-history-scoped` refreshes only the player pool supplied by
`--scope-file`, using the canonical PGA Tour player IDs already stored in
`player-history.json`. It queries the PGA Tour GraphQL
`PlayerTournamentHistory` operation (`playerProfileTournamentResults`) on tour
code `R`. When expected-event arguments are supplied, it merges only that
verified event ID and season; it never writes major history.

Refreshed records retain the prior `recentResults` sequence in the additive
`modelRecentResults` field. The existing PGA model formulas read that snapshot,
while Last 5 Starts renders the refreshed `recentResults`, preventing a display
artifact refresh from changing published model scores or ordering.

The command requires an explicit `--output` unless `--dry-run` is used. Use a
temporary output first, then run `npm run pga:validate-history-refresh` before
replacing `public/data/pga/player-history.json`. Optional `--cache-dir` files
make interrupted runs resumable without repeating completed player requests.
`--participant-file` supplies canonical official-field IDs that must all have
the expected event when they intersect the refreshed pool.

The weekly workflow runs later Monday against the featured next-tournament
pool and the validated prior-event metadata in `current-field.json`. It uses the
shared main-data-writer lock and stages only `player-history.json`.

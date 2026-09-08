# NFL DFS historical context — WU6A.1 / WU6A.2

WU6A.1 supplies the domain/data foundation; WU6A.2 exposes it on the DFS board
and in expanded history. Projection, ranking, eligibility and optimizer behavior
remain unchanged. The existing weekly research join remains the FPA authority.
See [DFS analyzer](nfl-dfs-contest-analyzer.md).

## Producer and compatibility

`scripts/generate-nfl-yardage-history.mjs` now emits
`nfl-yardage-history-v2`, extending the existing season-keyed public artifact
with `individualContext` (`nfl-individual-yardage-history-v1`). Existing `players`
and `teamDefense` fields retain their v1 shapes, data sources, market-active
player selection and one-volume-leader-per-game opponent semantics. Existing
Yardage Review comparisons against today's line remain unchanged.

The new context is built by `scripts/lib/nfl-individual-yardage-history.mjs`.
It includes season/week/asOf, excluded target game IDs, policy versions,
diagnostic exclusion counts, player logs keyed by `gsis:id:market` and defense
individual logs keyed by `canonicalDefense:market:position`. Requests come from
the current yardage projection universe; off-universe players are unavailable,
not fuzzy-matched. Each log contains at most ten rows; no raw provider payload
is published. Row identity is game ID + canonical player ID + market.

Type contracts live in `src/lib/nfl/history/contracts.ts`. The additive context
is optional on the legacy artifact type. `src/lib/nfl/dfs/history.ts` rejects
missing/v1 context and mismatched season/week/cutoff. It deliberately does not
re-slice a bounded artifact to an earlier cutoff, because omitted older rows
cannot be recovered in the browser.

## Cutoff and reference policy

The builder requires UTC `asOf`. It excludes target game IDs, games at/after
asOf, unjoined/undated games and games without a recorded result. The CLI uses
the earlier of current time and the first target-week kickoff unless supplied
`--as-of=<UTC>`; a supplied cutoff cannot exceed either boundary. Context source
seasons are the available caches from 2022 through the requested season. Missing
years are disclosed in provenance, not generated or fetched.

`buildTrailingPregameAverage` remains the sole averaging authority. Its optional
kickoff map orders the new consumer by actual scheduled chronology rather than
assuming week-number order. Only strictly earlier kickoffs enter a reference;
equal kickoff observations do not influence each other. It uses at most ten
preceding recorded games across season boundaries. Legacy callers omit the map
and retain their existing behavior.

**Temporal quality is `event-time-reconstructed`.** This excludes target/future
game information from references but is not an immutable pregame knowledge
archive: cached results/stat corrections lack historical source publication
timestamps, and scheduled kickoff is not a publication/completion timestamp.
Do not present these rows as proof of what the live site knew at an intragame
or historical publication cutoff. Frozen observations are separate WU6B work.

## Appearance and missing-data policy

The new cohort is individual recorded offensive appearances at the requested
position. A source row must record a positive attempt, carry, target, reception
or explicit offensive snap count. Zero yardage remains valid, including zero
in one market when participation occurred in another. This conservative policy
cannot identify a no-touch appearance without explicit snap evidence; an
all-zero row without evidence is counted as unknown/DNP and excluded. Absent
rows never become zeros. Missing/nonfinite yardage is excluded for that market,
not coerced to zero. Duplicate player/game identities are all excluded rather
than picking an arbitrary source row.

Rows sort by kickoff descending, game ID ascending, then canonical player ID
ascending. Multiple players from the same defensive game each occupy one of
the last-N rows, including boundary ties resolved by player ID. This is not the
old postgame attempts/carries/targets leader cohort.

Player reference: entering-game trailing-ten recorded appearances with valid
yardage in that market. `actualMinusPlayerAverage` compares the individual's
yards with this reference; `playerReferenceSampleSize` records its denominator.

Defensive reference: trailing-ten complete recorded defense/position games,
using `buildYardsAllowedPerGame` to sum all recorded opposing players in the
position group. A group containing missing yardage or conflicting player identities is omitted, never partially
summed. `actualMinusOpponentAllowance` compares one player's actual with this
**entire-position-group-per-defense-game** allowance. It is not a single-player
defensive expectation. An absent prior reference is null, with sample size zero
and an explicit reason. No allowance rank is invented from the legacy EPA rank.

## Lines, summaries and FPA

Historical lines reuse `resolveFinalPreKickoffLineFromIndex`: exact canonical
player/game/market, approved sportsbook, strictly pre-kickoff observation, latest
eligible observation with existing book-priority tie breaking. The context keeps
point/bookmaker/observedAt and `approved-final-pre-kickoff-v1`. The result compares
that game's actual to that game's selected line: over/under/push/unavailable.
Today's line and other games are never fallbacks. This is not a consensus or a
verified official closing line. Missing historical coverage remains null.

`summarizeHistoryDeltas` reports total input `n`, valid `comparisonCount`, mean,
median, above/below/equal and missing counts. Nonfinite deltas are missing. The
UI uses aboveCount/comparisonCount, never divides by ten by default.

`adaptDfsFantasyPointsAllowed` passes `opponentFpaSeason` and `opponentFpaLast5`
from an already compatibility-checked DFS research join unchanged, including
value/rank/poolSize/sampleSize/sampleSeason/games. No averaging, ranking or
standalone 2025 CSV substitution occurs.

## Validation and rollout

Run the new Node suite, focused TypeScript tests, existing rolling/line and
Yardage Review suites, DFS domain regressions and typecheck. Generator validation
uses `--dry-run` (local committed inputs only, no network or artifact writes).
Existing published v1 artifacts remain valid for Yardage Review. WU6A.2 uses
separate DFS transport files below; no workflow or schedule changes are included.

## WU6A.2 browser delivery and UI

Generate only the selected week's DFS files, leaving legacy season artifacts untouched:

```sh
node scripts/generate-nfl-yardage-history.mjs --season=2026 --as-of=2026-09-07T00:00:00.000Z --dfs-only
```

`scripts/lib/nfl-dfs-history-delivery.mjs` slices the existing context into
`public/data/nfl/yardage-history/<season>/week-<NN>/{index,QB,RB,WR,TE}.json`.
The index (`nfl-dfs-history-index-v1`) carries original metadata, covered player
keys and at most ten source defense deltas per key. Position detail retains
`nfl-individual-yardage-history-v1` with a transport `position` discriminator.
Only QB passing, RB rushing, WR receiving and TE receiving are delivered. Empty
player logs are omitted from coverage. Defense coverage remains independent.

No history fetch occurs before a CSV board exists. The board requests only the
index; expanding a player requests that position's detail file. Session caches
deduplicate pending and completed requests. Network/schema failures can retry on
remount; week changes hide previous-week history immediately while preserving
the analyzer's existing filters and expansion behavior.
The loader rejects wrong schemas/policies, season/week mismatch, future cutoff,
different index/detail asOf or excluded targets, wrong position/market/lookup
identity, duplicate row IDs, target/future rows and post-kickoff archived lines.
It never re-slices a bounded context or substitutes an older week's artifact.

Desktop and mobile use one compact scrollable table with separate sortable
FPA SZN and FPA L5 columns, showing canonical values and ranks. Source seasons,
sample sizes and rank pools are in tooltips. DEF VS AVG displays and sorts the
existing mean; above/valid counts remain in expanded history. The shared
`summarizeHistoryDeltas` remains the only summary authority. DST omits these
offensive-history columns. History availability changes only the historical
cells and their display sort; it does not change projections, ranks, readiness,
eligibility or player usability. See [DFS UI/stability](nfl-dfs-ui-stability.md).

Expanded weekly research stays visible above Player Last 10 / Opponent Last 10
tabs. Player rows show date, opponent, home/away, actual yardage, entering-game
whole-position allowance, signed delta, archived line/book and O/U/push. Opponent
rows show date, individual player/team, actual yardage, own pregame average,
signed delta and the same line fields. Baseline tooltips show prior-game sample
size; line tooltips show observed timing. Summaries include mean/median,
above/below/equal/missing counts with valid denominator and archived O/U/push
coverage. Tables scroll within their own region on narrow screens.

Missing player history reads "No historical sample"; artifact failures read
"History unavailable". No line is fabricated, no current line is substituted,
and none is labeled closing. Expanded notes and board methodology tooltips
disclose event-time reconstruction and possible later official corrections.

The local 2026 W1 output has 3,106 player rows and 1,280 defense appearances:

| File | Uncompressed bytes | gzip bytes | Player rows | Defense rows |
| --- | ---: | ---: | ---: | ---: |
| index.json | 25,311 | 5,838 | — | — |
| QB.json | 411,505 | 25,231 | 320 | 320 |
| RB.json | 723,235 | 40,695 | 781 | 320 |
| WR.json | 972,562 | 52,205 | 1,139 | 320 |
| TE.json | 783,701 | 42,689 | 866 | 320 |

Gzip sizes are measured with Node zlib, not a guarantee about a hosting provider's
compression. All 4,386 serialized appearances have null archived lines. Their
historical game coverage predates the available player-line archive.

Browser validation uses `tests/nfl-dfs-contest-analyzer.spec.ts` and the repository
analytics-blocking fixture. If local server binding is unavailable, build first,
then set `PLAYWRIGHT_DFS_LOCAL_DIST=1` and `PLAYWRIGHT_BASE_URL=http://jkb-dfs.local`;
the spec fulfills same-origin requests directly from this workspace's `dist`
without mocking application behavior or data.

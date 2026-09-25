# NFL DraftKings betting splits (WU2B/WU3)

`scripts/generate-nfl-betting-splits.mjs` fetches the NFL Spread, Moneyline, and
Total pages directly from DraftKings Network at runtime. It follows the
source's pagination for each market, parses two-sided handle and bet
percentages, resolves teams through `public/data/nfl/teams.json`, and joins
oriented matchups to `public/data/nfl/<season>/games.json`. The current week is
the earliest scheduled regular-season week in that canonical schedule.

Publication requires all canonical games in the selected week whose
`kickoffUtc > sourceCapturedAt` to have valid data for all three markets, with
no unresolved source diagnostics. Games already started by `sourceCapturedAt`
are outside the live pregame coverage denominator and are omitted even if an
old source row remains. A missing pregame game blocks publication; there is no
partial-coverage threshold. Valid games from another week in the `n7days`
source window are joined to the canonical schedule, reported as adjacent-week
diagnostics, and omitted from the selected-week artifact. They do not block
publication. The producer then atomically replaces
`public/data/nfl/betting-splits/current.json`. A failed fetch, parse, join, or
validation leaves the previous artifact intact. This is a current-only
research artifact: no archive, outcome grading, model input, pick, or public UI
is added in WU2B. `src/lib/nfl/bettingSplitsData.ts` defines the read contract;
`src/hooks/useNflBettingSplits.ts` is a read-only loader.

For offline development, run
`node scripts/generate-nfl-betting-splits.mjs --dry-run --input-dir <path>`.
The directory contains `spread-page-1.html`, `moneyline-page-1.html`, and
`total-page-1.html`, plus each subsequent page discovered from the captured
pagination links (for example, `spread-page-2.html`). This mode reads local
HTML and validates the in-memory artifact without writing `current.json`.
File modification times serve as test timestamps and are not treated as
verified source capture times. The existing `--capture-manifest=<path>` dry-run
mode can supply verified request metadata when available. Without an offline
flag, the generator always fetches DraftKings directly.

The artifact records the canonical selected-week total, already-started and
eligible pregame counts, matched eligible count, missing eligible game IDs,
and adjacent-week counts. These describe source coverage at
`sourceCapturedAt`; this current-only artifact is not a history of closed
markets. If no eligible games remain, the nonempty artifact validation still
blocks publication.

The source markup and pagination are external and can change. Parser and
publication diagnostics must be resolved against a fresh capture before a
production publication is trusted.

## Production refresh and publication (WU3)

The production command is `npm run generate:nfl-betting-splits`. It uses plain
Node `fetch` for the live DraftKings HTML pages. `--dry-run` still fetches live
pages but writes nothing; `--dry-run --input-dir <path>` remains an offline test
only. Production never requires local captures. `sourceCapturedAt` is the
earliest successful live page collection completion in the run, and
`captureEndAt` is the latest. Neither is a claimed provider update time.
`generatedAt` is assigned after collection and join, when the artifact is
built. Offline input-directory runs use local file modification times as test
timestamps only.

The scheduled workflow is `.github/workflows/nfl-betting-splits-refresh.yml`.
It follows the existing NFL GitHub Actions pattern: Node 20, `npm ci`, the
shared `main-data-writers` lock, one generator command, exact-path staging,
and push/rebase retry. It runs at 08:37, 12:37, and 17:37 America/New_York
each day in September–January. The three daytime passes target morning,
early-game pregame, and evening-game pregame windows. The off-hour minute
reduces top-of-hour GitHub Actions queue contention, but scheduled jobs may
still be delayed or dropped. The generator cleanly skips when the canonical
season has no scheduled regular-season week. The current default season is
2026 and must be reviewed at season rollover.

The first live run must be manually dispatched with the default `dry_run=true`
after the workflow exists on the default branch. That run must prove GitHub's
runner can fetch DraftKings and produce complete diagnostics. Scheduled or
manual production publication fails until the repository variable
`NFL_DK_SPLITS_LIVE_VERIFIED` is set to `true` after review. A successful
production run validates the full eligible pregame slate, writes a temporary
file, atomically renames it to `current.json`, and stages only that artifact.
After a successful push, it calls the repository's existing reusable GitHub
Pages deployment for the exact pushed commit. A `GITHUB_TOKEN` push alone would
not trigger the `deploy.yml` push event. A dry run, failed run, or no-change
run does not call deployment.
Fetch, parse, join, coverage, or validation failure exits nonzero and leaves
the previous file and its timestamps untouched. No empty failure artifact or
history file is created.

## Consumer freshness (WU3)

`src/lib/nfl/bettingSplitsData.ts` owns a six-hour fresh limit, matched to the
four- and five-hour gaps between daytime scheduled runs with room for queue
delay. Freshness ages `sourceCapturedAt`, never `generatedAt` or page render
time. A structurally valid artifact for the expected season/week is `fresh`
within six hours and `stale` after that; a valid artifact for another week is
also `stale` even if recently collected. Missing, schema-invalid, or
implausibly future-dated data is `unavailable`. The read contract exposes
the capture and generation timestamps, source, season/week, age, and reason;
the hook updates age each minute and requires the expected season/week. No
visual consumer is added in WU3.

Repository deployment authority remains open (`OPEN-001` in
`docs/DECISIONS.md`): Vercel configuration and GitHub Pages deployment both
exist. The refresh workflow publishes a validated artifact to `main` and
invokes the configured GitHub Pages path; confirming which host is authoritative
and when the public site serves that commit remains an operational check.

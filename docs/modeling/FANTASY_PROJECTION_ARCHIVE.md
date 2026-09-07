# WU6B.1 weekly fantasy projection archive

This extends the NFL prediction archive with immutable evidence of **JKB Full PPR projections**, using `FANTASY_SCORING_VERSION` and `FANTASY_SCORING_FORMAT` from `src/lib/fantasy/weekly/scoring.ts`. No scoring, projection, rank, role, backup-player, DST, UI, or optimizer behavior changes. No external benchmark ingestion or outcome grading.

## Storage and authorities

`scripts/lib/nfl-production-prediction-archive.ts` owns shared canonical JSON, SHA-256 identities, append/deduplication, collision validation, atomic persistence and immutable manifests. Both existing production predictions and fantasy events use its `appendArchiveEvents`. The fantasy adapter is `scripts/lib/nfl-fantasy-projection-archive.ts`.

Canonical partition: `data/nfl/predictions/<season>/<NN>/`:

- `jkb-weekly-fantasy.jsonl`: `jkb-football-fantasy-prediction-v1` events, including invalid and unresolved rows.
- `fantasy-runs/<runId>.json`: immutable observations, prediction IDs, timestamps, mutually exclusive accepted/unresolved/rejected counts, eligible count, exact reason summaries.
- `fantasy-selections/<selectionId>.json`: derived references to prediction/run IDs; no copied projection payloads.
- Shared `data/nfl/predictions/manifests/sources/<hash>.json`: projection, canonical schedule, player cache and player cache manifest paths/hashes.

Retain events, runs and manifests permanently. Corrections append new material states. No redundant `data/fantasy/projection-history` store is needed. Existing WU1 records/IDs remain unchanged. WU2/WU3's shared loader explicitly excludes the fantasy filename because its evidence includes rejected and postkickoff observations; WU6B.3 will consume the fantasy contract separately. Unknown other prediction files still fail normal validation.

The additional schema is necessary: WU1 requires resolved pregame identity and a fitted-model manifest, and cannot represent rejected/postkickoff evidence. Fantasy preserves published model, inference, fit, context/component metadata and input provenance rather than fabricating fitted coefficients or mislabeling late captures as WU1 production states.

## Identity and validation

The original source row and artifact metadata are preserved exactly as parsed, alongside the source artifact's byte-content SHA-256. Canonical GSIS IDs must uniquely match the manifest-verified NFL players cache and position. Duplicate source IDs are unresolved. Team aliases reuse the NFL canonical identity helper. Team/opponent must uniquely match a REG game in the requested season/week in `public/data/nfl/<season>/games.json`; `gameId` and UTC `dateUtc` come directly from that authority. Missing/invalid canonical kickoff is never inferred. Null source kickoff is disclosed and does not invalidate a successfully resolved canonical kickoff; conflicting non-null source kickoff does invalidate it.

Unsupported versions, malformed rows, invalid points, wrong season/week and unresolved identities remain events with reason codes. Envelope/version validation uses the existing production schema; row validation is independent so one bad row never silently removes evidence. Unreadable JSON or malformed row containers fail before writes because their row population cannot be determined safely.

State ID = `pred_` + canonical SHA-256 of all immutable event material except `predictionId` and operational `capturedAt`. Source hashes and original metadata are material. The first persisted capture timestamp stays unchanged. Later identical captures append lightweight run observations, not new prediction states; exact run retries write nothing. A source/metadata/resolution change produces a new state. A change elsewhere in the source artifact can therefore create new IDs for otherwise unchanged rows.

## Clocks and selection

`generatedAt` and `inputAsOf` are copied separately from the source; `capturedAt` is actual observation time. None substitutes for another. The CLI reads local sources, then takes the real clock. Explicit `--captured-at` supports dry-run simulation and exact already-persisted retries only; it cannot create a new historical real capture.

Policy `jkb-fantasy-capture-v1` supports **player/game prekickoff** selection: latest eligible observation strictly before canonical game kickoff wins per player/game. Equality and later captures are ineligible. Known generated/input timestamps must be valid UTC and no later than capture. Source/model/scoring versions, identity and projection validity must pass. Unknown source timestamps remain null with schema rejection under today's producer contract. Staleness (>24 hours since generation) is warning metadata, consistent with current product freshness policy, and never becomes a freshness claim. Generation and input ages are both retained.

Selection uses run observations, allowing A -> B -> A refreshes while preserving stable state IDs. Runs and states are hash-validated. Ties use run ID then prediction ID lexicographic ordering. Later postkickoff observations never replace pregame evidence. Before cutoff, selection is explicitly provisional; it is final only relative to captured evidence after cutoff. Missing earlier snapshots cannot be reconstructed from old generation timestamps.

`slate-prelock` is separate and requires game IDs and a supplied canonical first-slate-kickoff `lockAt`. Capture must precede that lock; a lock after the selected game's kickoff is disallowed. Contest parsing, complete slate membership/first-kickoff validation and upload integration are deferred. Callers must not substitute player/game selection for slate reconstruction.

## Command and operations

```sh
npx tsx scripts/archive-fantasy-weekly-projections.ts --season=2026 --week=1 --dry-run
npx tsx scripts/archive-fantasy-weekly-projections.ts --season=2026 --week=1
```

Space-separated flags work too. Dry-run validates/resolves, reads existing evidence, shows counts and intended paths, and writes nothing. Exact retries can supply a persisted run's `--captured-at`; source/resolution hashes must still match. Local reads only; no generation, network fetch, publishing, grading or source mutation. Run one writer per partition at a time, matching the existing archive's serialization requirement. Multi-file persistence is retry-recoverable, not transactional; missing referenced evidence fails selection.

Best future insertion point: immediately after successful production generation in `.github/workflows/generate-fantasy-weekly-projections.yml`, before research companion and commit. Current cadence is Tuesday 04:00 UTC plus existing manual/path triggers. Future integration must persist events/manifests/runs/selections through explicit allowed paths, include archive-only changes in change detection, and serialize writers. Workflow and cadence are unchanged here. Generator-level freeze-before-live-replacement integration is deferred; this capability freezes the artifact it reads.

## Outcomes boundary (WU6B.3)

`FantasyOutcomeContract` reserves prediction/player/game IDs, actual fantasy points, canonical scoring version, stats source/hash, outcome revision, recorded time, correction status and superseded outcome ID. Actuals must use existing scoring. Superseded status derives from later correction links, never by overwriting an outcome. Actual-minus-projection and defense-vs-projection aggregation remain future analysis over selected prediction IDs. No current outcome files change.

## Validation

`src/lib/nfl/fantasyProjectionArchive.test.ts` covers stable IDs, immutable retries, clocks, strict cutoff, resolution/version failures, multiple refreshes/repeated states, staleness, slate separation, dry-run and CLI backdating protection. Run alongside existing archive, resolver and evaluation materializer tests. Application/browser checks are unnecessary for this CLI-only change.

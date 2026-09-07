# WU6B.1 implementation report

## 1. Outcome

Implemented manual immutable weekly fantasy capture using the existing NFL archive framework. Captured the currently available 2026 Week 1 artifact without regenerating or changing any projection.

## 2. Workspace gate

Workspace: `C:\Users\jbloo\remix-of-bracket-brilliance-dfs-v2`. Branch: `feat/nfl-dfs-lineup-intelligence-v2`. HEAD: `de3b6df91707c6206591451c663a4d65d4f99f27`. Initial worktree was clean. Origin: `https://github.com/joeybukowski3/remix-of-bracket-brilliance.git`.

`git fetch origin` succeeded. Current origin/main is `0c2f0500c91f48d290b128f281a1427d90fcd43e`; merge base is `1129f357268e28da21f079651a2c9d38b18d1cc0`. The feature branch does **not** include current main. No switch, merge, rebase or history mutation was performed. Incoming main commits concern NFL 2026 projection comparison/power ratings/matchup refresh.

## 3. Framework reuse

Both WU1 and fantasy use shared `appendArchiveEvents`, canonical JSON, hashing and atomic persistence in `nfl-production-prediction-archive.ts`. Fantasy uses an additional evidence schema because WU1 cannot represent unresolved or postkickoff captures. Existing prediction IDs and payloads are unchanged. Existing outcome/evaluation loading excludes this named fantasy partition until WU6B.3.

## 4. Identity and kickoff

Resolved team/opponent/game/UTC kickoff from canonical `public/data/nfl/2026/games.json`, using shared NFL aliases. Player identity requires an exact unique GSIS/position match in the manifest-verified players cache. All 498 source kickoffs were null; all canonical game/kickoff resolutions succeeded. Twelve player identities remain unresolved, with explicit reasons and original rows retained.

## 5. Immutable event identity

SHA-256 material identity includes source and resolution hashes, original metadata/row and resolved fields. Operational capture time does not duplicate a state. Runs record later observations; corrections create new material states. The exact retry appended zero records and preserved all four generated files byte-for-byte.

## 6. Timestamps

| Field | Preserved value |
| --- | --- |
| generatedAt | `2026-08-23T10:49:47.679Z` |
| inputAsOf | `2026-08-22T12:00:00Z` |
| capturedAt | `2026-09-07T12:24:44.005Z` |

Capture uses the actual read-time clock. Explicit historical capture arguments only support dry-run simulation or exact persisted retries. No backdating occurred.

## 7. Selection policy

Latest valid observation strictly before player/game kickoff wins. Equal/late captures cannot displace earlier eligible observations. Stale evidence is allowed with generation/input ages and a stale flag. Selection is explicitly provisional before cutoff. Slate prelock is a separate explicit policy contract; contest-specific validation/integration remains deferred.

## 8. Week 1 results

| Count | Rows |
| --- | ---: |
| Input / archived | 498 |
| Accepted / pregame eligible | 486 |
| Unresolved | 12 |
| Other rejected | 0 |
| Stale selections | 486 |
| Source kickoff missing | 498 |

No game had kicked off according to the canonical schedule at capture (earliest kickoff September 10 UTC). These are stale projections first observed September 7, not August snapshots or guaranteed final projections.

Unresolved rows: Adrian Martinez, Carson Beck, Kyle Juszczyk, Alec Ingold, Nicholas Singleton, De'Zhaun Stribling, Travis Hunter, Colbie Young, Deion Burks, Dillon Bell, Oscar Delp and Joe Royer. Reason codes: `canonical-player-id-position-not-found` and `player-identity-unresolved-or-duplicate`. No player, role or projection corrections were attempted.

## 9. Provenance

Source artifact hash: `2958ed4b24f2b6b55364ea51185ec09f7c419602a3a4304f11753b5dd4d97eaa`.

Source manifest: `142cbdcd3000546f96c021ec267a23a341b1d7347165ed3973e9bd7812e3a321`.

Run: `run_2d8c958c06a57f60d53efd588cd995c1372c9005021cd6c438a747054e3a0f92`.

Selection: `selection_ae5c5d7c86c4ddfea94f3cf65ff15001b531190a0f2def4d7c12ba0654f7b4c2`.

## 10. CLI and workflow

Use `npx tsx scripts/archive-fantasy-weekly-projections.ts --season=2026 --week=1 [--dry-run]`. Space-separated arguments work. `--captured-at` cannot manufacture a new historical capture.

Future insertion point: immediately after successful generation in `generate-fantasy-weekly-projections.yml`, before research companion/commit, with explicit archive persistence and archive-only change detection. No workflow/cadence changes. Current capability is manually invoked. Writers must be serialized, as in the existing framework; multi-file persistence is retry-recoverable rather than transactional.

## 11. Outcomes boundary

Typed future contract reserves prediction/player/game IDs, actual fantasy points, scoring version, stats source/hash, revision/correction linkage and recorded time. No actuals, grading or defense aggregation were materialized. Canonical Full PPR scoring is reused; no DK scoring or consensus ingestion.

## 12. Changed files

All paths are relative to repository root. Generated identifiers below are the exact full filenames in sections 9 and 16.

| Classification | File |
| --- | --- |
| Source | `scripts/archive-fantasy-weekly-projections.ts` |
| Source | `scripts/lib/nfl-fantasy-projection-archive.ts` |
| Source | `scripts/lib/nfl-production-prediction-archive.ts` |
| Source | `scripts/resolve-nfl-prediction-outcomes.ts` |
| Source (tests) | `src/lib/nfl/fantasyProjectionArchive.test.ts` |
| Documentation | `docs/modeling/FANTASY_PROJECTION_ARCHIVE.md` |
| Documentation | `docs/modeling/JKB_MODELING_MASTER_SPEC.md` |
| Documentation | `docs/modeling/PREDICTION_ARCHIVE_SCHEMA.md` |
| Documentation | `docs/models/fantasy-weekly-projections.md` |
| Documentation | `docs/modeling/WU6B1_IMPLEMENTATION_REPORT.md` |
| Generated | `data/nfl/predictions/2026/01/jkb-weekly-fantasy.jsonl` |
| Generated | `data/nfl/predictions/2026/01/fantasy-runs/run_2d8c958c06a57f60d53efd588cd995c1372c9005021cd6c438a747054e3a0f92.json` |
| Generated (derived) | `data/nfl/predictions/2026/01/fantasy-selections/selection_ae5c5d7c86c4ddfea94f3cf65ff15001b531190a0f2def4d7c12ba0654f7b4c2.json` |
| Generated | `data/nfl/predictions/manifests/sources/142cbdcd3000546f96c021ec267a23a341b1d7347165ed3973e9bd7812e3a321.json` |

No retained config changes.

## 13. Validation

- `npx vitest run src/lib/nfl/fantasyProjectionArchive.test.ts src/lib/nfl/predictionArchive.test.ts src/lib/nfl/predictionOutcomeResolver.test.ts src/lib/nfl/evaluationMaterializer.test.ts`: 124 tests passed (23 new, 101 regression).
- Focused ESLint on the five source/test files in section 12: passed.
- Archive CLI dry-run: passed, showed counts/paths without writes. Focused test also verifies an empty temporary output directory stays empty.
- Real CLI capture: passed, 498 appended. Exact `--captured-at=2026-09-07T12:24:44.005Z` retry: passed, zero appended/498 duplicates; SHA-256 comparison confirmed all four output files unchanged.
- `git diff --check`: passed.
- `npx tsc --noEmit -p tsconfig.app.json`: blocked by pre-existing `src/lib/mlb/mlbPitcherRegression.ts:28` TS1128 syntax error. File untouched.
- `npx tsc --noEmit -p .wu6b1-tsconfig.json`: passed. This temporary config extended `tsconfig.app.json`, selected the archive entry point/adapter and Vite declarations, and enabled ES2022 libs and TS extension imports. The temporary config was removed after checking.
- Build, full app suite and browser checks skipped: no application runtime/UI/build-consumed artifact changes. No automated analytics traffic.

Initial new-test setup mismatch and a slow full-source CLI test were corrected; final focused suite passes. Scoped typing found and corrected two new inference errors, without runtime/payload changes.

## 14. Scope preservation

No formula/scoring/rank/UI/role/DST/optimizer changes. Backup projections archived as produced. CFB, production workflows, deployment, environments, Supabase, live projections, existing prediction/outcome artifacts and external integrations untouched. No consensus/DK benchmark ingestion. Initial worktree was clean; unrelated files remain unchanged.

## 15. Open issues

No blocker to the manual WU6B.1 capability. The repository-wide typecheck remains blocked by the unrelated MLB syntax error. Twelve unresolved canonical player/position joins are preserved and excluded; fixing identity sources is separate work.

## 16. Final Git status

No staging, commit, push, merge, rebase, deployment or PR. HEAD and branch remain as in section 2. Final status is five modified tracked files (three existing documentation files and two existing source files) plus nine new files (two source, one test, two documentation, four generated); section 12 lists all fourteen paths. Temporary typecheck configuration is not retained.

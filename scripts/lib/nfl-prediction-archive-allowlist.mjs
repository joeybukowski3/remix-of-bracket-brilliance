/**
 * WU4C.1: single source of truth for the commit-path allowlists used by the
 * scheduled NFL workflows that write generated data to `main`. Each
 * workflow's "Commit and push" step shells out to this module (via
 * `node -e`) instead of re-declaring the regexes inline, so the same
 * patterns that are unit-tested here are exactly what runs in CI -- no
 * copy-paste drift between the YAML and a test file.
 *
 * Every function fails closed: an unrecognized path is REJECTED, never
 * silently allowed. Nothing here ever widens to `git add .` or a wildcard.
 */

/** WU1 prediction-archive partitions + their content-addressed manifests (nfl-yardage-projections.yml). */
export function isAllowedPredictionArchivePath(path, season) {
  const partition = new RegExp(
    `^data/nfl/predictions/${season}/[0-9]{2}/nfl-(passing-direct-ridge|rushing-carries-x-shrunk-ypc|receiving-targets-x-shrunk-ypt|team-opportunity|total-ridge)\\.jsonl$`,
  );
  const manifest = /^data\/nfl\/predictions\/manifests\/(sources|fitted-models)\/[0-9a-f]{64}\.json$/;
  return partition.test(path) || manifest.test(path);
}

/** WU2 outcome-event partitions (nfl-schedules-results.yml). */
export function isAllowedOutcomePath(path, season) {
  const partition = new RegExp(
    `^data/nfl/prediction-outcomes/${season}/[0-9]{2}/(spread|passing|rushing|receiving|team_opportunity|team_total)\\.jsonl$`,
  );
  return partition.test(path);
}

/** WU3 derived evaluation datasets (nfl-schedules-results.yml, after resolution). Derived-only, never a source/outcome path. */
export function isAllowedEvaluationPath(path) {
  const versionedFile = /^data\/nfl\/prediction-evaluations\/jkb-football-evaluation-v1\/(spread|passing|rushing|receiving|team_opportunity|team_total)\/[0-9]{4}\.jsonl$/;
  const ledgerFile = /^data\/nfl\/prediction-evaluations\/jkb-football-evaluation-v1\/resolution-status\/[0-9]{4}\.jsonl$/;
  const summaryFile = /^data\/nfl\/prediction-evaluations\/jkb-football-evaluation-v1\/summary\/[0-9]{4}\.json$/;
  return versionedFile.test(path) || ledgerFile.test(path) || summaryFile.test(path);
}

/**
 * CLI entrypoint used from workflow bash via:
 *   node scripts/lib/nfl-prediction-archive-allowlist.mjs <kind> <season> <path>
 * Exits 0 (allowed) or 1 (rejected) -- no stdout parsing required by the caller.
 */
function main() {
  const [, , kind, season, path] = process.argv;
  if (!kind || !season || !path) {
    console.error("usage: nfl-prediction-archive-allowlist.mjs <predictions|outcomes|evaluations> <season> <path>");
    process.exitCode = 1;
    return;
  }
  const allowed =
    kind === "predictions" ? isAllowedPredictionArchivePath(path, season)
    : kind === "outcomes" ? isAllowedOutcomePath(path, season)
    : kind === "evaluations" ? isAllowedEvaluationPath(path)
    : false;
  if (!allowed) {
    console.error(`ERROR: Refusing unexpected ${kind} path: ${path}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("nfl-prediction-archive-allowlist.mjs")) {
  main();
}

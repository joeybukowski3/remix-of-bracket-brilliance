/**
 * CI validation gate for the generated `public/data/nfl/{season}/
 * yardage-projections.json` artifact (Phase 9 schema, see
 * `src/lib/nfl/props/types/currentWeekProjection.ts`). Read-only: never
 * mutates the artifact, never touches projection formulas.
 *
 * `validateCurrentWeekProjectionArtifact` returns a list of problems; an
 * empty list means the artifact is safe to commit. Every check reads a
 * field the generator itself already computes and discloses (`qa.*`,
 * `depthChartSource`, row `status`) -- this never invents a looser or
 * stricter notion of correctness than the generator's own QA summary
 * already exposes.
 *
 * Usage (CLI):
 *   node scripts/validate-nfl-current-week-yardage-projections.mjs --season=2026 --week=3
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EXPECTED_SCHEMA_VERSION = "nfl-current-week-yardage-projection-v1";

/**
 * @param {unknown} artifact
 * @param {{ expectedSeason: number, expectedWeek: number, expectedGameIds: ReadonlySet<string> }} expectations
 * @returns {string[]} problems; empty means the artifact passed every gate.
 */
export function validateCurrentWeekProjectionArtifact(artifact, { expectedSeason, expectedWeek, expectedGameIds }) {
  const problems = [];
  const a = /** @type {Record<string, unknown>} */ (artifact ?? {});

  if (a.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    problems.push(`unexpected schemaVersion "${a.schemaVersion}" (expected "${EXPECTED_SCHEMA_VERSION}")`);
  }
  if (a.season !== expectedSeason) problems.push(`season mismatch: artifact has ${a.season}, expected ${expectedSeason}`);
  if (a.week !== expectedWeek) problems.push(`week mismatch: artifact has ${a.week}, expected ${expectedWeek}`);
  if (!a.generatedAt || typeof a.generatedAt !== "string") problems.push("missing generatedAt");

  const rows = Array.isArray(a.rows) ? a.rows : [];
  if (!Array.isArray(a.rows)) problems.push("rows is not an array");

  const qa = /** @type {Record<string, any>} */ (a.qa ?? {});
  if (!a.qa) problems.push("missing qa summary");

  // No duplicate (market, player, game) rows.
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.market}|${row.playerId}|${row.gameId}`;
    if (seen.has(key)) problems.push(`duplicate row for market/player/game ${key}`);
    seen.add(key);
  }

  // Zero unresolved identities.
  if ((qa.unresolvedIdentityRows ?? null) !== 0) {
    problems.push(`qa.unresolvedIdentityRows=${qa.unresolvedIdentityRows}, expected 0`);
  }

  // All expected gameIds resolve: every row's gameId is one of this week's
  // real REG-season games, and every one of this week's games produced at
  // least one row.
  if (expectedGameIds) {
    const rowGameIds = new Set(rows.map((r) => r.gameId));
    const unknownGameIds = [...rowGameIds].filter((id) => !expectedGameIds.has(id));
    if (unknownGameIds.length > 0) problems.push(`rows reference gameId(s) not in this week's schedule: ${unknownGameIds.join(", ")}`);
    const unresolvedGames = [...expectedGameIds].filter((id) => !rowGameIds.has(id));
    if (unresolvedGames.length > 0) problems.push(`gameId(s) with zero rows: ${unresolvedGames.join(", ")}`);
    if (qa.gamesExpected !== expectedGameIds.size) {
      problems.push(`qa.gamesExpected=${qa.gamesExpected} does not match the independently-computed schedule count ${expectedGameIds.size}`);
    }
  }
  if ((qa.gamesResolved ?? null) !== (qa.gamesExpected ?? undefined)) {
    problems.push(`qa.gamesResolved=${qa.gamesResolved} != qa.gamesExpected=${qa.gamesExpected}`);
  }

  // Passing coverage reconciles to a full 32-team slate (16 games), or the
  // shortfall is explicitly documented via qa.excludedByEligibility.passing
  // (teams with zero ACT QB this week -- a real, disclosed reason, not a
  // silently dropped row).
  const passingRows = rows.filter((r) => r.market === "passing");
  const expectedPassingSlots = (qa.gamesExpected ?? 0) * 2;
  const excludedPassing = qa.excludedByEligibility?.passing ?? 0;
  if (passingRows.length + excludedPassing !== expectedPassingSlots) {
    problems.push(
      `passing coverage does not reconcile: ${passingRows.length} passing rows + ${excludedPassing} documented eligibility exclusions != ${expectedPassingSlots} expected team slots (2 * qa.gamesExpected=${qa.gamesExpected})`,
    );
  }

  // projectedYards finite for every row the generator marked "projected".
  const badProjected = rows.filter((r) => r.status === "projected" && !Number.isFinite(r.projectedYards));
  if (badProjected.length > 0) {
    problems.push(`${badProjected.length} row(s) with status "projected" have a non-finite projectedYards (e.g. ${badProjected[0]?.market}/${badProjected[0]?.playerId})`);
  }

  return problems;
}

function parseArgs(argv) {
  const args = { season: 0, week: 0, artifact: null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--artifact=")) args.artifact = resolve(ROOT, raw.slice(11));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1) {
    throw new Error("Usage: --season=YYYY --week=N [--artifact=path]");
  }
  return args;
}

function buildExpectedGameIds(season, week) {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  const schedule = JSON.parse(readFileSync(path, "utf8"));
  const games = Array.isArray(schedule.games) ? schedule.games : [];
  return new Set(
    games.filter((g) => g.season === season && g.week === week && String(g.seasonType).toUpperCase() === "REG").map((g) => g.gameId),
  );
}

function main() {
  const args = parseArgs(process.argv);
  const artifactPath = args.artifact ?? join(ROOT, "public", "data", "nfl", String(args.season), "yardage-projections.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const expectedGameIds = buildExpectedGameIds(args.season, args.week);

  const problems = validateCurrentWeekProjectionArtifact(artifact, { expectedSeason: args.season, expectedWeek: args.week, expectedGameIds });

  if (problems.length > 0) {
    console.error(`[nfl:validate-current-week-projections] FAILED (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[nfl:validate-current-week-projections] OK: season=${args.season} week=${args.week} rows=${artifact.rows.length} games=${expectedGameIds.size}`);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:validate-current-week-projections] FAILED: ${err.message}`);
    process.exit(1);
  }
}

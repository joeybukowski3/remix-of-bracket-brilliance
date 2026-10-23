/**
 * NBA props board V1: build projections, the roster and approximate (estimated primary-position) DvP from a local
 * player-game import, season position estimates and a slate, then run the existing board builder. Offline: no
 * network, no provider, no credential, no Odds API request, no quota, no scheduled job.
 *
 *   npx tsx scripts/nba-props-v1-build.ts [--input-dir=data/nba/props-v1] [--out=data/nba/props-v1/nba-props-board.json]
 *
 * The board goes to a private copy by default. To publish, pass --out=public/data/nba-props-board.json; the
 * existing builder still withholds anything the source's effective rights do not permit. Formats: docs/nba-props-v1.md.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runV1Build } from "../src/lib/nba/props/v1/run";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string): string | undefined => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

function groupReasons(rejected: ReadonlyArray<{ reason: string }>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const { reason } of rejected) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

async function main(): Promise<void> {
  const result = await runV1Build({ root, generatedAtUtc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), inputDir: arg("input-dir"), outFile: arg("out") });
  const { board, v1 } = result;
  const { entries, projections, dvp } = board.report;
  console.log(`Source ${v1.source.sourceId}: ${v1.source.rows} player-games, ${v1.source.players} players (${JSON.stringify(v1.source.rowsBySeason)})`);
  console.log(`Projected by the V1 builder: ${v1.projections.playersProjected} players, ${v1.projections.propsProduced} props; skipped ${v1.projections.skipped.length}`);
  console.log(`Position estimates (${v1.positions.method}): ${JSON.stringify(v1.positions.estimates)}; overrides ${v1.positions.overridden}`);
  console.log(`DvP minutes attributed to a position: ${JSON.stringify(v1.dvp.minutesCoverage)}`);
  console.log(`\nBoard: wrote ${path.relative(root, board.outFile)}`);
  console.log(`  props populated: ${entries.total} entries; ${entries.withProjection} with a projection, ${entries.withLine} with a sportsbook line`);
  console.log(`  projections accepted ${projections.accepted} of ${projections.supplied}; DvP ${dvp.status}, ${dvp.rows} rows`);
  for (const [reason, count] of groupReasons(projections.rejected)) console.log(`  WITHHELD ${count} projection(s): ${reason}`);
  if (dvp.status === "withheld") console.log(`  WITHHELD DvP: ${dvp.reason}`);
  for (const w of v1.warnings) console.log(`  WARNING: ${w}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "NBA props V1 build failed");
  process.exitCode = 1;
});

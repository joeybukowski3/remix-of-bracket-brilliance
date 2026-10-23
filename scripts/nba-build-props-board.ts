/**
 * Offline build of public/data/nba-props-board.json. No provider, no network, no credentials, no quota.
 *
 *   npx tsx scripts/nba-build-props-board.ts [--captures=data/nba/odds-captures] [--store=data/nba/pipeline]
 *     [--projections=data/nba/board-inputs/projections.json] [--roster=data/nba/board-inputs/roster.json]
 *     [--dvp=data/nba/board-inputs/dvp.json] [--out=public/data/nba-props-board.json] [--publish-lines]
 *
 * Sportsbook lines are left out of the artifact unless --publish-lines is given; do not give it until the owner
 * has recorded that showing raw lines publicly is permitted. With no qualifying data the output is a valid, empty
 * board. Inputs must live under the gitignored data/nba/. Format and gates: docs/nba-player-props-dvp.md.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBoardBuild } from "../src/lib/nba/props/pipeline/boardBuildRun";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string): string | undefined => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const result = await runBoardBuild({
    root,
    generatedAtUtc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    capturesDir: arg("captures"),
    storeDir: arg("store"),
    projectionsFile: arg("projections"),
    rosterFile: arg("roster"),
    dvpFile: arg("dvp"),
    outFile: arg("out"),
    publishLines: process.argv.includes("--publish-lines"),
  });
  console.log(JSON.stringify({ wrote: path.relative(root, result.outFile), conversion: { ...result.conversion, rejected: result.conversion.rejected.length }, report: result.report }, null, 2));
  for (const r of result.conversion.rejected.slice(0, 10)) console.log(`  rejected capture line: ${r.player} ${r.market} @ ${r.bookmaker}: ${r.reason}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "NBA board build failed");
  process.exitCode = 1;
});

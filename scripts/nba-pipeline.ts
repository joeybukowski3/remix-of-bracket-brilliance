/**
 * Manual NBA research pipeline: no provider, no API credits, no network.
 *
 *   npx tsx scripts/nba-pipeline.ts import-lines   --file=lines.csv   --attested-by="Name" --origin="where the lines came from" [--uses=private-research,model-development] [--allow-backfill]
 *   npx tsx scripts/nba-pipeline.ts import-results --file=results.csv --attested-by="Name" --origin="where the results came from" [--uses=...]
 *   npx tsx scripts/nba-pipeline.ts settle
 *   npx tsx scripts/nba-pipeline.ts report
 *
 * The store is local JSONL under data/nba/pipeline/ (gitignored, vercelignored,
 * and refused anywhere else). Imports are idempotent and append-only: running
 * the same file twice adds nothing, and nothing ever edits a stored line.
 * Lines captured at or after tipoff, outside 45-240 minutes before tipoff, dated in
 * the future, or imported after the game started (unless --allow-backfill, which
 * keeps them flagged as unverifiable and never authentic) are rejected with the
 * reason printed. One command runs at a time per store.
 *
 * Column layouts: docs/nba-research-pipeline-phase-5a.md.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { etGameDate } from "../src/lib/nba/props/canonical";
import { gamesFromSnapshots, importLinesCsv, importResultsCsv, type ImportAttestation } from "../src/lib/nba/props/pipeline/manualImport";
import { settleStoredResults } from "../src/lib/nba/props/pipeline/postgameJob";
import { recordResultDraft } from "../src/lib/nba/props/pipeline/resultsRecorder";
import { joinEvaluations, overUnderRecords, projectionErrors } from "../src/lib/nba/props/pipeline/statistics";
import { FilePipelineStore } from "../src/lib/nba/props/pipeline/store";
import { DATA_USES, type DataUse } from "../src/lib/nba/props/sources/types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_ROOT = path.join(repoRoot, "data", "nba");

function arg(name: string, fallback?: string): string {
  const hit = process.argv.slice(3).find((value) => value.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}=`);
}

function storeDir(): string {
  const dir = path.resolve(repoRoot, arg("dir", "data/nba/pipeline"));
  if (dir !== ALLOWED_ROOT && !dir.startsWith(`${ALLOWED_ROOT}${path.sep}`)) throw new Error(`The store must live under data/nba/ (got ${dir}); captured lines are restricted research data`);
  return dir;
}

function attestation(): ImportAttestation {
  const uses = arg("uses", "private-research").split(",").map((u) => u.trim()).filter(Boolean);
  const bad = uses.filter((u) => !(DATA_USES as readonly string[]).includes(u));
  if (bad.length > 0) throw new Error(`Unknown use(s): ${bad.join(", ")}`);
  return { attestedBy: arg("attested-by"), attestedOn: etGameDate(new Date().toISOString()), origin: arg("origin"), permittedUses: uses as DataUse[] };
}

function printRejected(rejected: ReadonlyArray<{ line: number; code: string; message: string }>): void {
  for (const r of rejected) console.log(`  rejected line ${r.line}: ${r.code} - ${r.message}`);
}

const COMMANDS = ["import-lines", "import-results", "settle", "report"];

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!COMMANDS.includes(command)) throw new Error("Usage: nba-pipeline <import-lines|import-results|settle|report> [options]");
  const dir = storeDir();
  // One command at a time per store, and the store is opened only after the lock is held, so it reflects every earlier write.
  await FilePipelineStore.withLock(dir, "nba-pipeline-cli", 10 * 60_000, () => new Date(), async () => run(command, await FilePipelineStore.open(dir)));
}

async function run(command: string, store: FilePipelineStore): Promise<void> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  if (command === "import-lines") {
    const result = importLinesCsv(readFileSync(path.resolve(arg("file")), "utf8"), { attestation: attestation(), now: nowDate, allowBackfill: process.argv.includes("--allow-backfill") });
    let inserted = 0;
    for (const snapshot of result.snapshots) if ((await store.insertSnapshot(snapshot)) === "inserted") inserted += 1;
    // Only games not already known: re-importing lines must never reset a game that is already postponed or final.
    const known = new Set((await store.listGames()).map((g) => g.canonicalGameKey));
    for (const game of gamesFromSnapshots(result.snapshots, now)) if (!known.has(game.canonicalGameKey)) await store.upsertGame(game);
    console.log(`batch ${result.batchId}: ${result.snapshots.length} valid line(s), ${inserted} new, ${result.duplicateRows} duplicate row(s), ${result.rejected.length} rejected`);
    printRejected(result.rejected);
  } else if (command === "import-results") {
    const result = importResultsCsv(readFileSync(path.resolve(arg("file")), "utf8"), { attestation: attestation() });
    let inserted = 0;
    for (const draft of result.drafts) if ((await recordResultDraft(store, draft, now)).outcome === "inserted") inserted += 1;
    console.log(`batch ${result.batchId}: ${result.drafts.length} valid row(s), ${inserted} new revision(s), ${result.rejected.length} rejected`);
    printRejected(result.rejected);
  } else if (command === "settle") {
    const { evaluationsInserted } = await settleStoredResults(store, now);
    console.log(`${evaluationsInserted} new evaluation revision(s)`);
  } else if (command === "report") {
    const snapshots = await store.listSnapshots();
    const evaluated = joinEvaluations(snapshots, await store.listEvaluations());
    const counts = { over: 0, under: 0, push: 0, void: 0, pending: 0 };
    for (const { evaluation } of evaluated) counts[evaluation.settlement] += 1;
    console.log(`snapshots ${snapshots.length} | results ${(await store.listResults()).length} | evaluated ${evaluated.length} (${JSON.stringify(counts)}) | awaiting a result ${snapshots.length - evaluated.length}`);
    const records = overUnderRecords(evaluated, "market");
    console.log(`authentic lines: ${evaluated.length - records.excludedNotAuthentic} (excluded: ${records.excludedNotAuthentic}); over/under by market:`);
    for (const [market, record] of Object.entries(records.groups)) console.log(`  ${market}: over ${record.over}, under ${record.under}, push ${record.push}, void ${record.void}, pending ${record.pending}, over rate ${record.overRate === null ? "-" : record.overRate.toFixed(3)}`);
    const errors = projectionErrors(evaluated);
    console.log(`projection error (projection - actual): pts n=${errors.byMarket.pts.n}, reb n=${errors.byMarket.reb.n}, ast n=${errors.byMarket.ast.n}, minutes n=${errors.minutes.n} (manual lines carry no JKB projection)`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

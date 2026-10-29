/**
 * Publish the owner's private NBA board to the hosted store behind /nba/props. One manual run, one row replaced.
 *
 *   npx tsx scripts/nba-private-snapshot-publish.ts [--board=data/nba/props-v1/private-preview-board.json]            # dry run
 *   JKB_NBA_HOSTED_PUBLISH_APPROVED=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/nba-private-snapshot-publish.ts --write                                                       # uploads
 *
 * The dry run (default) reads the local file only and prints the hosting decision: which sources are cleared, which tier
 * results, and how many entries would leave this computer. --write additionally needs the approval variable and the
 * service-role credentials in the environment; it makes exactly one request to the owner's database and never calls a
 * sportsbook or stats provider. It prints counts and source ids, never board content or credentials. No schedule runs it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planPublish } from "../src/lib/nba/props/hosted/publishPlan";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string): string | undefined => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<number> {
  const boardPath = path.resolve(root, arg("board") ?? "data/nba/props-v1/private-preview-board.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(boardPath, "utf8"));
  } catch {
    console.error(`Cannot read a JSON board at ${boardPath}`);
    return 1;
  }
  const plan = planPublish(raw, new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  for (const verdict of plan.decision?.verdicts ?? []) {
    console.log(`${verdict.hostable ? "CLEARED " : "BLOCKED "} ${verdict.role} source ${verdict.sourceId}: ${verdict.why} (uses: ${verdict.permittedUses.join(", ") || "none"})`);
  }
  if (!plan.ok || !plan.envelope) {
    console.error(`Nothing would be published: ${plan.problem}`);
    return 2;
  }
  console.log(`Tier ${plan.envelope.tier}: ${plan.decision?.reason}`);
  console.log(`Entries ${plan.counts.entriesIn} -> ${plan.counts.entriesOut}, DvP rows ${plan.counts.dvpRowsOut}, ${plan.counts.envelopeBytes} bytes`);
  if (!process.argv.includes("--write")) {
    console.log("Dry run: nothing was uploaded. Add --write (with the approval variable and credentials) to publish.");
    return 0;
  }
  if (process.env.JKB_NBA_HOSTED_PUBLISH_APPROVED !== "1") {
    console.error("Refusing to upload: set JKB_NBA_HOSTED_PUBLISH_APPROVED=1 to confirm the owner approved this publish.");
    return 3;
  }
  // Imported late so a dry run never loads the credential-reading module.
  const { createSupabaseSnapshotStore } = await import("../api/_lib/nbaPrivate/snapshotStore");
  await createSupabaseSnapshotStore().write(plan.envelope);
  console.log("Uploaded 1 snapshot row.");
  return 0;
}

main().then((code) => process.exit(code), (error: unknown) => {
  console.error(error instanceof Error ? error.message : "publish failed");
  process.exit(1);
});

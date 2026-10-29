/**
 * Publish the owner's private NBA board to the hosted store behind /nba/props. One manual run, one row replaced.
 *
 *   npm run nba:publish-snapshot                                   # dry run of data/nba/props-v1/private-preview-board.json
 *   npm run nba:publish-snapshot -- --board=<file>                 # dry run of another file
 *   npx tsx --env-file=.env.nba-publish.local scripts/nba-private-snapshot-publish.ts --write   # uploads
 *
 * The credentials live in .env.nba-publish.local (ignored by Git through the *.local rule): SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY and JKB_NBA_HOSTED_PUBLISH_APPROVED=1.
 *
 * The dry run (default) reads the local file only and prints the hosting decision: which sources are cleared, which tier
 * results, how many entries would leave this computer, and the same staleness warnings the page shows. --write additionally
 * needs the approval variable and the service-role credentials; it replaces the one snapshot row, reads it back and checks it,
 * and never calls a sportsbook or stats provider. It prints counts and source ids, never board content or credentials.
 * No schedule runs it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveableEnvelope } from "../src/lib/nba/props/hosted/redact";
import { planPublish } from "../src/lib/nba/props/hosted/publishPlan";
import { LINES_STALE_AFTER_HOURS, SNAPSHOT_STALE_AFTER_HOURS, snapshotFreshness } from "../src/lib/nba/props/hostedClient";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string): string | undefined => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const MS_PER_HOUR = 3_600_000;

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

  const freshness = snapshotFreshness(plan.envelope.board, plan.envelope.publishedAtUtc, Date.now());
  const builtHoursAgo = (Date.now() - Date.parse(plan.envelope.board.generatedAtUtc)) / MS_PER_HOUR;
  console.log(`Board built ${plan.envelope.board.generatedAtUtc} (${builtHoursAgo.toFixed(1)} h ago); statistics retrieved ${freshness.statisticsRetrievedUtc ?? "unknown"}; newest sportsbook line ${freshness.newestLineCaptureUtc ?? "none"}`);
  if (builtHoursAgo > SNAPSHOT_STALE_AFTER_HOURS) console.warn(`WARNING: the local board was built more than ${SNAPSHOT_STALE_AFTER_HOURS} hours ago; rebuild it (npx tsx scripts/nba-props-v1-build.ts --private-preview) before publishing.`);
  if (freshness.lineAgeHours !== null && freshness.lineAgeHours > LINES_STALE_AFTER_HOURS) console.warn(`WARNING: the newest sportsbook line was captured ${freshness.lineAgeHours.toFixed(1)} h ago, so the page will flag this snapshot as stale.`);

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
  const store = createSupabaseSnapshotStore();
  await store.write(plan.envelope);
  const stored = serveableEnvelope(await store.read());
  if (!stored.ok || stored.envelope.tier !== plan.envelope.tier || stored.envelope.publishedAtUtc !== plan.envelope.publishedAtUtc || stored.envelope.board.entries.length !== plan.counts.entriesOut) {
    console.error("Read-back check FAILED: the stored snapshot does not match what was uploaded.");
    return 4;
  }
  console.log(`Uploaded and verified 1 snapshot row (${stored.envelope.tier}, ${stored.envelope.board.entries.length} entries, published ${stored.envelope.publishedAtUtc}).`);
  return 0;
}

main().then((code) => process.exit(code), (error: unknown) => {
  console.error(error instanceof Error ? error.message : "publish failed");
  process.exit(1);
});

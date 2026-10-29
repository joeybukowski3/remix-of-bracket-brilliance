/** Prepared only. A separate approval and rights decision are required before execution. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_ACCOUNTS } from "../src/lib/api-quota/accounts";
import { QuotaManager } from "../src/lib/api-quota/manager";
import { FileUsageStore } from "../src/lib/api-quota/store";
import { nbaAllowance } from "../src/lib/nba/props/pipeline/allowance";
import { quotaRequestGate } from "../src/lib/nba/props/pipeline/budget";
import { ODDS_SOURCE_LICENSES } from "../src/lib/nba/props/pipeline/oddsSources";
import { createTheOddsApiNbaProvider } from "../src/lib/nba/props/pipeline/theOddsApiNba";
import { oneCreditNbaProbe } from "../src/lib/nba/props/pipeline/theOddsApiNbaProbe";
import { assertCaptureDirWritable, fileLineCaptureSink } from "../src/lib/nba/props/pipeline/lineCapture";
import { fileProbeClaim } from "../src/lib/nba/props/pipeline/probeClaim";
import { accountWithOddsApproval, activationDir, assertInPregameWindow, ODDS_ACCOUNT_ID, PROBE_SCOPE, readOddsApproval, recordCurrentOddsUsage } from "../src/lib/nba/props/pipeline/oddsActivation";

async function main(): Promise<void> {
  if (!process.argv.includes("--execute-one-credit")) throw new Error("probe is inert; a separate approved execution must use --execute-one-credit");
  const eventArg = process.argv.find((arg) => arg.startsWith("--event-id="));
  const eventId = eventArg?.slice("--event-id=".length) ?? "";
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(eventId)) throw new Error("one valid NBA event id is required");
  if (!ODDS_SOURCE_LICENSES["the-odds-api"].permittedUses.includes("private-research")) throw new Error("NBA Odds API license gate remains closed");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = activationDir(root);
  const now = new Date();
  // Everything below runs before the approval is read or claimed and before any credit is reserved: a request that could not be
  // used (wrong time, no credential) or whose response could not be stored must not be made at all.
  const tipoffUtc = process.argv.find((arg) => arg.startsWith("--tipoff-utc="))?.slice("--tipoff-utc=".length) ?? "";
  const minutesToTipoff = assertInPregameWindow(tipoffUtc, now);
  if (!process.env.THE_ODDS_API_KEY?.trim()) throw new Error("THE_ODDS_API_KEY is not set in this shell; nothing was claimed or requested");
  const capturesDir = path.join(root, "data", "nba", "odds-captures");
  assertCaptureDirWritable(capturesDir);
  console.error(JSON.stringify({ preflight: "passed", eventId, tipoffUtc, minutesToTipoff: Math.round(minutesToTipoff), captureDestination: path.relative(root, capturesDir) }));
  const approval = readOddsApproval(path.join(dir, "one-credit-approval.json"), PROBE_SCOPE, now);
  const accounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, approval);
  const account = accounts.find((item) => item.accountId === ODDS_ACCOUNT_ID)!;
  const manager = new QuotaManager({ accounts, store: new FileUsageStore(dir) });
  await recordCurrentOddsUsage(manager, account, path.join(dir, "current-usage.json"), now);
  const gate = quotaRequestGate(manager, ODDS_ACCOUNT_ID, "one-credit-probe", nbaAllowance(now));
  const provider = createTheOddsApiNbaProvider({ apiKey: process.env.THE_ODDS_API_KEY });
  const result = await oneCreditNbaProbe({ eventId, gate, provider, claim: fileProbeClaim(path.join(dir, "claims")), approvalId: approval.id, captureSink: fileLineCaptureSink(capturesDir) })();
  if (result.status === "error") throw new Error(result.message);
  console.log(JSON.stringify({ eventId, market: "player_points", regions: "us", requests: 1, creditsCharged: result.creditsCharged, lines: result.lines.length, unmatched: result.unmatched ?? [], capture: result.capture ?? null }));
  // The credit is spent either way; a missing capture must not look like success.
  if (result.capture?.status !== "stored" && result.capture?.status !== "duplicate") throw new Error(`line-level capture was NOT persisted: ${result.capture?.status === "failed" ? result.capture.message : "no capture outcome"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "NBA probe failed");
  process.exitCode = 1;
});

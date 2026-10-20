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
import { fileProbeClaim } from "../src/lib/nba/props/pipeline/probeClaim";

const ACCOUNT = "the-odds-api:unverified-pool";
const SCOPE = "NBA one-event player_points one-credit probe";

async function main(): Promise<void> {
  if (!process.argv.includes("--execute-one-credit")) throw new Error("probe is inert; a separate approved execution must use --execute-one-credit");
  const eventArg = process.argv.find((arg) => arg.startsWith("--event-id="));
  const eventId = eventArg?.slice("--event-id=".length) ?? "";
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(eventId)) throw new Error("one valid NBA event id is required");
  const account = PROVIDER_ACCOUNTS.find((a) => a.accountId === ACCOUNT);
  if (!account || account.liveApproval?.scope !== SCOPE || account.liveApproval.maxUnits !== 1 || account.nonessentialBlockedReason || account.planStatus === "unknown") throw new Error("one-credit NBA approval and verified account are not recorded");
  if (!ODDS_SOURCE_LICENSES["the-odds-api"].permittedUses.includes("private-research")) throw new Error("NBA Odds API license gate remains closed");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manager = new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store: new FileUsageStore(path.join(root, "data", "nba", "quota-probe")) });
  const gate = quotaRequestGate(manager, ACCOUNT, "one-credit-probe", nbaAllowance(new Date()));
  const provider = createTheOddsApiNbaProvider({ apiKey: process.env.THE_ODDS_API_KEY });
  const result = await oneCreditNbaProbe({ eventId, gate, provider, claim: fileProbeClaim(path.join(root, "data", "nba", "quota-probe", "claims")), approvalId: account.liveApproval.id })();
  if (result.status === "error") throw new Error(result.message);
  console.log(JSON.stringify({ eventId, market: "player_points", regions: "us", requests: 1, creditsCharged: result.creditsCharged, lines: result.lines.length, unmatched: result.unmatched ?? [] }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "NBA probe failed");
  process.exitCode = 1;
});

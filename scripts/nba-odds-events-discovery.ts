/** Separate, explicitly approved, one-attempt zero-market NBA /events discovery. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_ACCOUNTS } from "../src/lib/api-quota/accounts";
import { QuotaManager } from "../src/lib/api-quota/manager";
import { FileUsageStore } from "../src/lib/api-quota/store";
import { nbaAllowance } from "../src/lib/nba/props/pipeline/allowance";
import { quotaRequestGate } from "../src/lib/nba/props/pipeline/budget";
import { ODDS_SOURCE_LICENSES } from "../src/lib/nba/props/pipeline/oddsSources";
import { fileProbeClaim } from "../src/lib/nba/props/pipeline/probeClaim";
import { discoverNbaEventsOnce } from "../src/lib/nba/props/pipeline/theOddsApiNbaEvents";

async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv[2] !== "--discover-once") throw new Error("NBA discovery is inert without --discover-once");
  const account = PROVIDER_ACCOUNTS.find((item) => item.accountId === "the-odds-api:unverified-pool");
  if (!account || account.liveApproval?.scope !== "NBA events discovery one request" || account.liveApproval.maxUnits !== 0 || account.nonessentialBlockedReason || account.planStatus === "unknown") throw new Error("NBA discovery approval and verified account are not recorded");
  if (!ODDS_SOURCE_LICENSES["the-odds-api"].permittedUses.includes("private-research")) throw new Error("NBA Odds API license gate remains closed");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.join(root, "data", "nba", "quota-probe");
  const manager = new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store: new FileUsageStore(dir) });
  const result = await discoverNbaEventsOnce({ apiKey: process.env.THE_ODDS_API_KEY, approvalId: account.liveApproval.id, gate: quotaRequestGate(manager, account.accountId, "events-discovery", nbaAllowance(new Date())), claim: fileProbeClaim(path.join(dir, "claims")) });
  console.log(JSON.stringify(result));
}

main().catch(() => { console.error("NBA discovery blocked or failed; no event odds were requested."); process.exitCode = 1; });

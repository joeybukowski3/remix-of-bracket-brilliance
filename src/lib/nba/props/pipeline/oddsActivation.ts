/** Local activation inputs. Neither approval nor dashboard evidence belongs in source control. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ProviderAccountConfig, LiveApproval } from "../../../api-quota/types";
import type { QuotaManager } from "../../../api-quota/manager";
import { parsePendingProviderEvidence, verifiedEvidenceSnapshot } from "./providerEvidence";

export const ODDS_ACCOUNT_ID = "the-odds-api:unverified-pool";
export const PROBE_SCOPE = "NBA one-event player_points one-credit probe";
export const DISCOVERY_SCOPE = "NBA events discovery one request";
export const activationDir = (root: string) => path.join(root, "data", "nba", "quota-probe");

const approvalSchema = z.object({
  id: z.string().regex(/^nba-odds-[a-z0-9-]{8,64}$/),
  approvedBy: z.string().trim().min(1).max(80),
  approvedOn: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  scope: z.enum([PROBE_SCOPE, DISCOVERY_SCOPE]),
  maxUnits: z.union([z.literal(0), z.literal(1)]),
}).strict();

export function readOddsApproval(file: string, scope: typeof PROBE_SCOPE | typeof DISCOVERY_SCOPE, now: Date): LiveApproval {
  const approval = approvalSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const approved = Date.parse(approval.approvedOn);
  const expires = Date.parse(approval.expiresAt);
  if (approval.scope !== scope || approval.maxUnits !== (scope === PROBE_SCOPE ? 1 : 0)) throw new Error("NBA approval scope or cost does not match this request");
  if (approved > now.getTime() || expires <= now.getTime() || expires - approved > 24 * 3_600_000) throw new Error("NBA approval is expired, future-dated or too long-lived");
  return approval;
}

export function accountWithOddsApproval(accounts: readonly ProviderAccountConfig[], approval: LiveApproval): ProviderAccountConfig[] {
  const account = accounts.find((item) => item.accountId === ODDS_ACCOUNT_ID);
  if (!account || account.liveApproval !== null || account.nonessentialBlockedReason || account.planStatus === "unknown") throw new Error("NBA shared account is not activation-ready");
  return accounts.map((item) => item.accountId === ODDS_ACCOUNT_ID ? { ...item, liveApproval: approval } : item);
}

export async function recordCurrentOddsUsage(manager: QuotaManager, account: ProviderAccountConfig, file: string, now: Date): Promise<void> {
  const evidence = parsePendingProviderEvidence(JSON.parse(readFileSync(file, "utf8")), now);
  if (evidence.limit !== 500) throw new Error("NBA usage reading must match the 500-credit Starter account");
  await manager.recordProviderUsage(account.accountId, [verifiedEvidenceSnapshot(account, evidence)]);
}

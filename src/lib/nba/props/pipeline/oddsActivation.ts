/** Local activation inputs. Neither approval nor dashboard evidence belongs in source control. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ProviderAccountConfig, LiveApproval } from "../../../api-quota/types";
import type { QuotaManager } from "../../../api-quota/manager";
import { CAPTURE_BOUNDS } from "./contracts";
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

const FULL_INSTANT = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i;

/** The line is stamped when the response arrives, a little after this check, so the check stops short of the 45-minute floor. */
const WINDOW_FLOOR_MARGIN_MINUTES = 2;

/**
 * Throws, before any credit is spent, unless `now` is 45 (plus a 2-minute margin) to 240 minutes before tipoff. A line captured outside that window is
 * stored in the ledger but can never become a pregame snapshot, so the board would show none of it. Returns the minutes to tipoff.
 */
export function assertInPregameWindow(tipoffUtc: string, now: Date): number {
  const tipoff = Date.parse(tipoffUtc);
  if (!FULL_INSTANT.test(tipoffUtc) || Number.isNaN(tipoff)) throw new Error(`tipoff must be a full ISO instant with an explicit UTC offset, got "${tipoffUtc}"`);
  const minutes = (tipoff - now.getTime()) / 60_000;
  const opens = new Date(tipoff - CAPTURE_BOUNDS.earliestMinutes * 60_000).toISOString();
  const latest = CAPTURE_BOUNDS.floorMinutes + WINDOW_FLOOR_MARGIN_MINUTES;
  const closes = new Date(tipoff - latest * 60_000).toISOString();
  if (minutes > CAPTURE_BOUNDS.earliestMinutes) throw new Error(`too early: tipoff is ${Math.round(minutes)} minutes away; the capture window runs from ${opens} to ${closes}`);
  if (minutes < latest) throw new Error(`too late: tipoff is ${Math.round(minutes)} minutes away; the capture window ran from ${opens} to ${closes}`);
  return minutes;
}

/**
 * Local-only approval for the API-NBA coverage probe.
 *
 * The approval is a gitignored, vercelignored JSON file, never committed
 * source: the committed registry keeps `liveApproval: null` for every account.
 * The probe CLI reads the file, validates it strictly (fail closed), and
 * injects it into an in-memory copy of the registry for api-sports:nba only.
 *
 * No renewal or extension: maxUnits is capped at 10, expiry is bounded by
 * approvedOn + 14 days (not by "now"), and an approval id is single-use. It is
 * claimed with an exclusive-create marker before the first request, so a
 * crashed, aborted or completed run can never be repeated under the same id,
 * even if its ledger entries are lost.
 */
import { z } from "zod";
import type { LiveApproval, ProviderAccountConfig } from "../../../api-quota/types";
import { API_NBA_PROBE_ACCOUNT_ID, API_NBA_PROBE_APPROVAL_SCOPE, API_NBA_PROBE_MAX_APPROVAL_DAYS, API_NBA_PROBE_MAX_REQUESTS, API_NBA_PROBE_WORKFLOW } from "./apiNbaProbe";

/** Under data/nba/: gitignored, vercelignored, and covered by nba:check-containment. */
export const API_NBA_PROBE_APPROVAL_PATH = "data/nba/approvals/api-nba-probe-approval.json";
export const API_NBA_PROBE_CLAIMS_DIR = "data/nba/approvals/claims";
export const API_NBA_PROBE_APPROVAL_SCHEMA = "nba-api-nba-probe-approval-v1";

const DAY_MS = 86_400_000;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const probeApprovalSchema = z
  .object({
    schemaVersion: z.literal(API_NBA_PROBE_APPROVAL_SCHEMA),
    approvalId: z.string().regex(/^nba-probe-[a-z0-9-]{4,48}$/, "approvalId must match nba-probe-<lowercase id>"),
    accountId: z.literal(API_NBA_PROBE_ACCOUNT_ID),
    consumer: z.literal(API_NBA_PROBE_WORKFLOW),
    scope: z.literal(API_NBA_PROBE_APPROVAL_SCOPE),
    maxUnits: z.number().int().min(1).max(API_NBA_PROBE_MAX_REQUESTS),
    approvedBy: z.string().trim().min(1).max(80),
    approvedAt: z.string().regex(ISO_INSTANT, "approvedAt must be an ISO UTC instant"),
    expiresAt: z.string().regex(ISO_INSTANT, "expiresAt must be an ISO UTC instant"),
  })
  .strict();

export type ProbeApprovalFile = z.infer<typeof probeApprovalSchema>;

/** Strict parse + time checks. Every failure is a reason to refuse; nothing is defaulted. */
export function parseProbeApproval(text: string | null, nowMs: number): { approval: LiveApproval } | { error: string } {
  if (text === null) return { error: `no approval file at ${API_NBA_PROBE_APPROVAL_PATH}` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "approval file is not valid JSON" };
  }
  const parsed = probeApprovalSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: `approval file is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}` };
  }
  const file = parsed.data;
  const approvedMs = Date.parse(file.approvedAt);
  const expiresMs = Date.parse(file.expiresAt);
  if (!Number.isFinite(approvedMs) || !Number.isFinite(expiresMs)) return { error: "approval timestamps are not valid dates" };
  if (approvedMs > nowMs) return { error: "approvedAt is in the future" };
  if (expiresMs <= approvedMs) return { error: "expiresAt must be after approvedAt" };
  if (expiresMs - approvedMs > API_NBA_PROBE_MAX_APPROVAL_DAYS * DAY_MS) return { error: `approval window exceeds ${API_NBA_PROBE_MAX_APPROVAL_DAYS} days from approvedAt` };
  if (expiresMs <= nowMs) return { error: `approval ${file.approvalId} has expired` };
  return {
    approval: {
      id: file.approvalId,
      approvedBy: file.approvedBy,
      approvedOn: file.approvedAt,
      scope: file.scope,
      maxUnits: file.maxUnits,
      expiresAt: file.expiresAt,
    },
  };
}

/** A new approval document. Callers write it with exclusive create (never overwrite). */
export function buildProbeApproval(input: { approvedBy: string; days: number; now: Date; suffix: string }): ProbeApprovalFile {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > API_NBA_PROBE_MAX_APPROVAL_DAYS) {
    throw new Error(`days must be an integer from 1 to ${API_NBA_PROBE_MAX_APPROVAL_DAYS}`);
  }
  const approvedAt = new Date(Math.floor(input.now.getTime() / 1000) * 1000);
  const file: ProbeApprovalFile = {
    schemaVersion: API_NBA_PROBE_APPROVAL_SCHEMA,
    approvalId: `nba-probe-${approvedAt.toISOString().slice(0, 10)}-${input.suffix}`.toLowerCase(),
    accountId: API_NBA_PROBE_ACCOUNT_ID,
    consumer: API_NBA_PROBE_WORKFLOW,
    scope: API_NBA_PROBE_APPROVAL_SCOPE,
    maxUnits: API_NBA_PROBE_MAX_REQUESTS,
    approvedBy: input.approvedBy.trim(),
    approvedAt: approvedAt.toISOString(),
    expiresAt: new Date(approvedAt.getTime() + input.days * DAY_MS).toISOString(),
  };
  return probeApprovalSchema.parse(file);
}

/**
 * In-memory registry copy with the approval on api-sports:nba only. Refuses a
 * registry that already carries a committed approval for that account, so the
 * local file is the single source of authorization.
 */
export function accountsWithProbeApproval(accounts: readonly ProviderAccountConfig[], approval: LiveApproval): ProviderAccountConfig[] {
  const target = accounts.find((a) => a.accountId === API_NBA_PROBE_ACCOUNT_ID);
  if (!target) throw new Error(`registry has no ${API_NBA_PROBE_ACCOUNT_ID} account`);
  if (target.liveApproval !== null) throw new Error(`${API_NBA_PROBE_ACCOUNT_ID} has a committed liveApproval; approvals must come from the local file only`);
  return accounts.map((a) => (a.accountId === API_NBA_PROBE_ACCOUNT_ID ? { ...a, liveApproval: { ...approval } } : a));
}

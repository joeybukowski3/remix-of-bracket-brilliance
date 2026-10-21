/** Dashboard metadata is pending evidence; it never changes account identity or approval. */
import { z } from "zod";
import type { ProviderAccountConfig, ProviderUsageSnapshot } from "../../../api-quota/types";
import { windowBounds } from "../../../api-quota/windows";

const evidenceSchema = z.object({
  plan: z.enum(["Starter", "Free"]),
  limit: z.number().int().positive().max(1_000_000),
  used: z.number().int().min(0).max(1_000_000),
  remaining: z.number().int().min(0).max(1_000_000),
  observedAtUtc: z.string().datetime({ offset: true }),
  resetDateUtc: z.string().datetime({ offset: true }),
}).strict();

export type PendingProviderEvidence = z.infer<typeof evidenceSchema>;

const dateOnlyEvidenceSchema = evidenceSchema.omit({ observedAtUtc: true, resetDateUtc: true }).extend({
  observedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resetDayOfMonth: z.literal(1).optional(),
  resetHourUtc: z.literal(0).optional(),
}).strict();

export type IncompleteProviderEvidence = z.infer<typeof dateOnlyEvidenceSchema> & {
  observedAtUtc: null;
  resetDateUtc: null;
};

/** A date-only dashboard reading is retained as pending metadata, never as a quota snapshot. */
export function parseIncompleteProviderEvidence(input: unknown, now: Date): IncompleteProviderEvidence {
  const parsed = dateOnlyEvidenceSchema.safeParse(input);
  if (!parsed.success) throw new Error("incomplete provider evidence must contain only plan, limit, used, remaining and observedDate");
  const evidence = parsed.data;
  const day = Date.parse(`${evidence.observedDate}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== evidence.observedDate) throw new Error("provider observation date is invalid");
  if (evidence.used + evidence.remaining !== evidence.limit) throw new Error("provider evidence balances contradict the limit");
  if ((evidence.resetDayOfMonth === undefined) !== (evidence.resetHourUtc === undefined)) throw new Error("provider reset schedule is incomplete");
  if (day > now.getTime() || now.getTime() - day > 48 * 3_600_000) throw new Error("provider observation date is stale or from the future");
  return { ...evidence, observedAtUtc: null, resetDateUtc: null };
}

export function parsePendingProviderEvidence(input: unknown, now: Date): PendingProviderEvidence {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) throw new Error("provider evidence must contain only plan, limit, used, remaining, observedAtUtc and resetDateUtc");
  const evidence = parsed.data;
  const observed = Date.parse(evidence.observedAtUtc);
  const reset = Date.parse(evidence.resetDateUtc);
  if (evidence.used + evidence.remaining !== evidence.limit) throw new Error("provider evidence balances contradict the limit");
  if (observed > now.getTime() || now.getTime() - observed > 24 * 3_600_000) throw new Error("provider evidence is stale or from the future");
  if (reset <= observed || reset - observed > 32 * 86_400_000) throw new Error("provider reset date is inconsistent with observation time");
  return { ...evidence, observedAtUtc: new Date(observed).toISOString(), resetDateUtc: new Date(reset).toISOString() };
}

/** Recording to the quota ledger requires configured account limits and matching reset evidence. */
export function verifiedEvidenceSnapshot(account: ProviderAccountConfig, evidence: PendingProviderEvidence): ProviderUsageSnapshot {
  const month = account.windows.find((window) => window.kind === "month");
  const knownSharedPool = account.accountId === "the-odds-api:unverified-pool" && account.identity === "unverified-may-share" && month?.limit === 500;
  if ((!knownSharedPool && account.identity !== "single-key") || account.planStatus === "unknown" || !month || month.limit !== evidence.limit) throw new Error("provider account identity or plan is not verified for this request");
  const reset = windowBounds(month, Date.parse(evidence.observedAtUtc)).endMs;
  if (reset !== Date.parse(evidence.resetDateUtc)) throw new Error("provider reset date disagrees with the configured quota window");
  return { window: "month", observedAt: evidence.observedAtUtc, used: evidence.used, remaining: evidence.remaining, limit: evidence.limit };
}

/**
 * Admission policy: may this consumer spend `estimate` units on this account now?
 * Pure; the manager runs it inside the store's atomic transaction.
 */
import type { AccountUsageState, AlertEvent, AlertRecord, Consumer, CostEstimate, Denial, LiveApproval, ProviderAccountConfig } from "./types";
import { entryUnits, windowUsage, type WindowUsage } from "./windows";

export type Admission = { allowed: true; usage: WindowUsage[] } | Denial;

const deny = (code: Denial["code"], message: string, retryAfterMs?: number): Denial => ({ allowed: false, code, message, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });

/** An unparseable expiry counts as expired. */
export function isApprovalExpired(approval: LiveApproval, nowMs: number): boolean {
  return approval.expiresAt !== null && !(Date.parse(approval.expiresAt) > nowMs);
}

const isBudgetWindow = (usage: WindowUsage) => usage.bounds.kind !== "minute";

/** The window that defines the account's main budget (month, else day). */
export function mainWindow(usages: readonly WindowUsage[]): WindowUsage | null {
  return usages.find((u) => u.bounds.kind === "month") ?? usages.find((u) => u.bounds.kind === "day") ?? null;
}

function checkNonessentialGates(account: ProviderAccountConfig, state: AccountUsageState, estimate: CostEstimate, usages: WindowUsage[], nowMs: number): Denial | null {
  if (account.nonessentialBlockedReason) return deny("BLOCKED_BY_POLICY", account.nonessentialBlockedReason);
  // Gate on configured limits: a header-reported limit must not upgrade an UNKNOWN plan.
  if (account.planStatus === "unknown" || account.windows.length === 0 || account.windows.some((w) => w.kind !== "minute" && w.limit === null)) {
    return deny("UNKNOWN_PLAN", `${account.accountId}: plan or limits are UNKNOWN (${account.planBasis})`);
  }
  const approval = account.liveApproval;
  if (!approval || isApprovalExpired(approval, nowMs)) {
    return deny("NOT_APPROVED", `${account.accountId}: no current user approval for live requests`);
  }
  const approvalSpent = state.entries.filter((e) => e.approvalId === approval.id).reduce((sum, e) => sum + entryUnits(e), 0);
  if (approvalSpent + estimate.units > approval.maxUnits) {
    return deny("APPROVAL_BUDGET_EXHAUSTED", `${account.accountId}: approval ${approval.id} allows ${approval.maxUnits} units; ${approvalSpent} spent`);
  }
  const main = mainWindow(usages);
  if (main && main.providerUsed === null) {
    if (!estimate.isUsageCheck) {
      return deny("UNKNOWN_USAGE", `${account.accountId}: no provider-reported usage in the current ${main.bounds.kind} window; run a usage check first`);
    }
    const checks = state.entries.filter((e) => e.isUsageCheck && e.status !== "released" && Date.parse(e.createdAt) >= main.bounds.startMs).length;
    if (checks >= account.maxUsageChecksPerWindow) {
      return deny("USAGE_CHECK_LIMIT", `${account.accountId}: ${checks} usage checks already made this window without a provider usage report`);
    }
  }
  return null;
}

function capFor(account: ProviderAccountConfig, usage: WindowUsage, consumer: Consumer): number {
  const limit = usage.limit as number;
  if (usage.bounds.kind === "minute") return limit;
  const reserveCap = limit - account.safetyReserve;
  return consumer.priority === "essential" ? reserveCap : Math.min(reserveCap, Math.floor(limit * account.nonessentialMaxRatio));
}

function checkLimits(account: ProviderAccountConfig, consumer: Consumer, estimate: CostEstimate, usages: WindowUsage[], state: AccountUsageState, nowMs: number): Denial | null {
  for (const usage of usages) {
    if (usage.limit === null) continue;
    const cap = capFor(account, usage, consumer);
    if (usage.effectiveUsed + estimate.units <= cap) continue;
    if (usage.bounds.kind === "minute") {
      const oldest = state.entries
        .filter((e) => entryUnits(e) > 0 && Date.parse(e.createdAt) >= usage.bounds.startMs)
        .map((e) => Date.parse(e.createdAt))
        .sort((a, b) => a - b)[0];
      return deny("RATE_LIMIT", `${account.accountId}: per-minute limit ${usage.limit} reached`, oldest === undefined ? 0 : Math.max(1, oldest + 60_000 - nowMs));
    }
    return deny(
      "QUOTA_HARD_STOP",
      `${account.accountId}: ${usage.bounds.kind} window would reach ${usage.effectiveUsed + estimate.units}/${usage.limit} (cap ${cap} for ${consumer.priority})`,
    );
  }
  return null;
}

export function admit(account: ProviderAccountConfig, state: AccountUsageState, consumer: Consumer, estimate: CostEstimate, nowMs: number): Admission {
  if (!Number.isFinite(estimate.units) || estimate.units < 0) return deny("INVALID_ESTIMATE", `estimate must be a finite non-negative number (got ${estimate.units})`);
  const usages = account.windows.map((w) => windowUsage(w, state, nowMs));
  if (consumer.priority === "nonessential") {
    const gate = checkNonessentialGates(account, state, estimate, usages, nowMs);
    if (gate) return gate;
  }
  const limitDenial = checkLimits(account, consumer, estimate, usages, state, nowMs);
  return limitDenial ?? { allowed: true, usage: usages };
}

/** Thresholds newly crossed in day/month windows, not yet recorded in `alerts`. */
export function newAlerts(account: ProviderAccountConfig, state: AccountUsageState, nowMs: number): { events: AlertEvent[]; records: AlertRecord[] } {
  const events: AlertEvent[] = [];
  const records: AlertRecord[] = [];
  const fired = new Set(state.alerts.map((a) => `${a.windowKey}|${a.threshold}`));
  for (const config of account.windows) {
    const usage = windowUsage(config, state, nowMs);
    if (!isBudgetWindow(usage) || usage.limit === null || usage.limit <= 0) continue;
    const ratio = usage.effectiveUsed / usage.limit;
    for (const threshold of account.alertThresholds) {
      if (ratio < threshold || fired.has(`${usage.bounds.key}|${threshold}`)) continue;
      events.push({ accountId: account.accountId, window: usage.bounds.kind, windowKey: usage.bounds.key, threshold, ratio });
      records.push({ windowKey: usage.bounds.key, threshold, ratio, firedAt: new Date(nowMs).toISOString() });
    }
  }
  return { events, records };
}

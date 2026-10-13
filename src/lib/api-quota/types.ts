/**
 * Shared API quota manager contract.
 *
 * Quotas belong to a provider ACCOUNT, never to a script or an environment
 * variable: two env var names may hold the same key, and one key may be read
 * by many workflows. An account whose plan or identity is not verified is
 * reported as UNKNOWN and new nonessential consumers are refused until it is.
 *
 * A 2xx response is never treated as free. A request costs its estimate unless
 * the provider explicitly reports the cost of that call.
 */

export type ProviderId = "api-sports" | "balldontlie" | "the-odds-api" | "parlayapi" | "therundown";

/** What one unit of quota is: an HTTP request, or a provider credit. */
export type BillingUnit = "requests" | "credits";

export type WindowKind = "minute" | "day" | "month";

/** Where a limit comes from. Only `account-verified` is confirmed for our own account. */
export type LimitSource = "account-verified" | "provider-docs" | "repo-evidence" | "unknown";

export interface QuotaWindowConfig {
  kind: WindowKind;
  /** null = UNKNOWN. */
  limit: number | null;
  source: LimitSource;
  /** day windows: hour (UTC) at which the provider resets. */
  resetHourUtc?: number;
  /** month windows: day of month (UTC, 00:00) at which the provider resets. */
  resetDayOfMonth?: number;
  /** Free-text caveat, e.g. "reset day assumed". */
  note?: string;
}

/** verified = confirmed for our account; documented = public plan docs only; unknown = neither. */
export type PlanStatus = "verified" | "documented" | "unknown";

/** single-key = one credential, one account. unverified-may-share = env vars may or may not be one account. */
export type AccountIdentity = "single-key" | "unverified-may-share";

/** essential = an existing production workload; nonessential = new or experimental (all NBA work). */
export type ConsumerPriority = "essential" | "nonessential";

/** An explicit user authorization for live requests, with its own unit budget. */
export interface LiveApproval {
  id: string;
  approvedBy: string;
  approvedOn: string;
  scope: string;
  maxUnits: number;
  /** ISO timestamp; the approval is void at or after it. */
  expiresAt: string | null;
}

export interface ProviderAccountConfig {
  accountId: string;
  provider: ProviderId;
  description: string;
  /** Environment variable NAMES only. Values are never read by the registry or the report. */
  credentialEnvVars: readonly string[];
  /**
   * Set only when the provider has confirmed that this account's quota is
   * separate from other accounts listing the same credential (e.g. per-API
   * quotas on one API-Sports key). Without it, a shared credential name is a
   * registry error unless every account sharing it has planStatus "unknown".
   */
  separateQuotaVerified?: boolean;
  identity: AccountIdentity;
  billingUnit: BillingUnit;
  planStatus: PlanStatus;
  planBasis: string;
  windows: readonly QuotaWindowConfig[];
  /** Units held back from every day/month window for essential consumers. */
  safetyReserve: number;
  /** Nonessential consumers stop at this fraction of a day/month limit. */
  nonessentialMaxRatio: number;
  alertThresholds: readonly number[];
  /** After this, an unsettled reservation still counts at its estimate (the call may have been billed). */
  reservationTtlMs: number;
  /** Requests marked as usage checks (e.g. /status) allowed per main window while usage is UNKNOWN. */
  maxUsageChecksPerWindow: number;
  /** Non-null blocks every nonessential consumer (licence, terms, unverified identity). */
  nonessentialBlockedReason: string | null;
  liveApproval: LiveApproval | null;
  /** Workflows/routes that spend this account outside the manager. Their usage appears only via provider headers. */
  unmanagedConsumers: readonly string[];
}

export interface UsageAttribution {
  sport: string;
  workflow: string;
  endpoint: string;
  runId?: string;
}

export interface Consumer {
  priority: ConsumerPriority;
  attribution: UsageAttribution;
}

export interface CostEstimate {
  units: number;
  basis: string;
  /** A request whose purpose is reading provider-reported usage (allowed while usage is UNKNOWN). */
  isUsageCheck?: boolean;
}

export type ReservationStatus = "reserved" | "settled" | "released";

/** orphaned = a reservation never settled (e.g. the process crashed); charged at its estimate. */
export type RequestOutcome = "pending" | "ok" | "http-error" | "provider-error" | "network-error" | "not-sent" | "orphaned";

export type CostSource = "estimate" | "provider-header" | "not-sent";

export interface LedgerEntry {
  id: string;
  accountId: string;
  createdAt: string;
  settledAt: string | null;
  status: ReservationStatus;
  estimatedUnits: number;
  actualUnits: number | null;
  costSource: CostSource;
  attribution: UsageAttribution;
  priority: ConsumerPriority;
  attempt: number;
  httpStatus: number | null;
  outcome: RequestOutcome;
  /** Short provider error text (never a URL or credential). */
  detail: string | null;
  approvalId: string | null;
  isUsageCheck: boolean;
}

/** Usage as reported by the provider (response headers or a status endpoint). */
export interface ProviderUsageSnapshot {
  window: WindowKind;
  observedAt: string;
  used: number | null;
  remaining: number | null;
  limit: number | null;
}

export interface AlertRecord {
  windowKey: string;
  threshold: number;
  ratio: number;
  firedAt: string;
}

/** Settled entries older than every window, folded into totals so the live state stays small. */
export interface UsageRollup {
  month: string;
  sport: string;
  workflow: string;
  endpoint: string;
  requests: number;
  units: number;
}

export interface AccountUsageState {
  entries: LedgerEntry[];
  snapshots: ProviderUsageSnapshot[];
  alerts: AlertRecord[];
  rollups: UsageRollup[];
}

export const emptyUsageState = (): AccountUsageState => ({ entries: [], snapshots: [], alerts: [], rollups: [] });

export type DenialCode =
  | "UNKNOWN_ACCOUNT"
  | "BLOCKED_BY_POLICY"
  | "UNKNOWN_PLAN"
  | "NOT_APPROVED"
  | "APPROVAL_BUDGET_EXHAUSTED"
  | "UNKNOWN_USAGE"
  | "USAGE_CHECK_LIMIT"
  | "QUOTA_HARD_STOP"
  | "RATE_LIMIT"
  | "INVALID_ESTIMATE";

export interface Denial {
  allowed: false;
  code: DenialCode;
  message: string;
  /** For RATE_LIMIT: earliest time a retry could fit. */
  retryAfterMs?: number;
}

export interface AlertEvent {
  accountId: string;
  window: WindowKind;
  windowKey: string;
  threshold: number;
  ratio: number;
}

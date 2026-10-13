/**
 * Run one HTTP request under the quota manager: reserve, send, reconcile
 * provider headers, settle. Retries are opt-in and each attempt is reserved and
 * charged separately. HTTP 429 is never retried here.
 *
 * Once a request has been sent, nothing after it may throw away the paid
 * response: body-read, header-parse and inspection failures are recorded, and a
 * settle failure is reported as `settleFailed` (the reservation then keeps
 * counting at its estimate) instead of being thrown.
 *
 * Nothing is logged: the URL (which may carry a key in its query string) and
 * headers never leave this function; only the attribution label is recorded.
 */
import type { QuotaManager, SettleInput } from "./manager";
import { HEADER_PARSERS, type HeaderUsage } from "./providers";
import type { AlertEvent, Consumer, CostEstimate, Denial, RequestOutcome } from "./types";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GuardedRequestInput {
  manager: QuotaManager;
  accountId: string;
  consumer: Consumer;
  estimate: CostEstimate;
  url: string;
  init?: RequestInit;
  fetchImpl: FetchLike;
  /** Returns an error description for a 2xx body that is actually a provider error. */
  inspectBody?: (bodyText: string) => string | null;
  maxAttempts?: number;
  retryStatuses?: readonly number[];
  /** Delay before retry n is retryDelayMs * 2^(n-2). */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

interface Common {
  attempts: number;
  unitsCharged: number;
  alerts: AlertEvent[];
  /** A settle call failed; that reservation stays open and counts at its estimate. */
  settleFailed: boolean;
}

export type GuardedResult =
  | ({ kind: "denied"; denial: Denial } & Common)
  | ({ kind: "response"; httpStatus: number; bodyText: string; outcome: RequestOutcome; detail: string | null } & Common)
  | ({ kind: "network-error"; message: string } & Common);

const DEFAULT_RETRY_STATUSES = [502, 503, 504] as const;
const SETTLE_ATTEMPTS = 3;
const errorName = (error: unknown, fallback: string) => (error instanceof Error ? error.name : fallback);

async function settleSafely(input: GuardedRequestInput, reservationId: string, settle: SettleInput): Promise<{ actualUnits: number; alerts: AlertEvent[]; failed: boolean }> {
  for (let attempt = 1; attempt <= SETTLE_ATTEMPTS; attempt += 1) {
    try {
      const settled = await input.manager.settle(input.accountId, reservationId, settle);
      return { ...settled, failed: false };
    } catch {
      // Retry; the store may have lost a compare-and-swap race or hit a transient file error.
    }
  }
  return { actualUnits: input.estimate.units, alerts: [], failed: true };
}

interface ReadResponse {
  bodyText: string;
  usage: HeaderUsage;
  outcome: RequestOutcome;
  detail: string | null;
}

async function readResponse(input: GuardedRequestInput, response: Response, observedAt: string): Promise<ReadResponse> {
  let usage: HeaderUsage = { snapshots: [], lastCallUnits: null };
  try {
    usage = HEADER_PARSERS[input.manager.account(input.accountId).provider](response.headers, observedAt);
  } catch {
    // Missing usage headers only mean the estimate is charged.
  }
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    return { bodyText: "", usage, outcome: "network-error", detail: `body read failed: ${errorName(error, "error")}` };
  }
  if (!response.ok) return { bodyText, usage, outcome: "http-error", detail: `HTTP ${response.status}` };
  let issue: string | null = null;
  try {
    issue = input.inspectBody?.(bodyText) ?? null;
  } catch (error) {
    issue = `body inspection failed: ${errorName(error, "error")}`;
  }
  return { bodyText, usage, outcome: issue ? "provider-error" : "ok", detail: issue };
}

export async function guardedRequest(input: GuardedRequestInput): Promise<GuardedResult> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 1);
  const retryStatuses = new Set(input.retryStatuses ?? DEFAULT_RETRY_STATUSES);
  const retryDelayMs = input.retryDelayMs ?? 1_000;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? (() => new Date());
  const common: Common = { attempts: 0, unitsCharged: 0, alerts: [], settleFailed: false };

  for (let attempt = 1; ; attempt += 1) {
    if (attempt > 1) await sleep(retryDelayMs * 2 ** (attempt - 2));
    const reservation = await input.manager.reserve(input.accountId, input.consumer, input.estimate, attempt);
    if (!reservation.allowed) return { kind: "denied", denial: reservation, ...common };
    common.attempts = attempt;
    common.alerts.push(...reservation.alerts);

    let response: Response;
    try {
      response = await input.fetchImpl(input.url, input.init);
    } catch (error) {
      // The request may have reached the provider: charge the estimate.
      const message = errorName(error, "network error");
      const settled = await settleSafely(input, reservation.reservationId, { httpStatus: null, outcome: "network-error", detail: message });
      common.unitsCharged += settled.actualUnits;
      common.alerts.push(...settled.alerts);
      common.settleFailed ||= settled.failed;
      if (attempt < maxAttempts && !settled.failed) continue;
      return { kind: "network-error", message, ...common };
    }

    const read = await readResponse(input, response, now().toISOString());
    const settled = await settleSafely(input, reservation.reservationId, {
      httpStatus: response.status,
      outcome: read.outcome as SettleInput["outcome"],
      providerReportedUnits: read.usage.lastCallUnits,
      snapshots: read.usage.snapshots,
      detail: read.detail,
    });
    common.unitsCharged += settled.actualUnits;
    common.alerts.push(...settled.alerts);
    common.settleFailed ||= settled.failed;
    const retry = retryStatuses.has(response.status) && response.status !== 429 && attempt < maxAttempts && !settled.failed;
    if (retry) continue;
    return { kind: "response", httpStatus: response.status, bodyText: read.bodyText, outcome: read.outcome, detail: read.detail, ...common };
  }
}

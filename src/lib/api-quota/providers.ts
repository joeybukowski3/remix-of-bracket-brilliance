/**
 * Per-provider cost estimates, response-header usage parsers, and body
 * inspectors. Header names come from each provider's public documentation and,
 * for The Odds API and ParlayAPI, from existing repo code
 * (src/lib/market/providers/theOddsApiClient.ts, scripts/fetch-mlb-odds.mjs).
 */
import type { CostEstimate, ProviderId, ProviderUsageSnapshot } from "./types";

export interface HeaderUsage {
  snapshots: ProviderUsageSnapshot[];
  /** Cost of this call if the provider reports it; otherwise null (the estimate is charged). */
  lastCallUnits: number | null;
}

type HeaderReader = Pick<Headers, "get">;

function num(headers: HeaderReader, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** API-Sports: daily request quota + per-minute rate limit. No per-call cost header. */
export function parseApiSportsHeaders(headers: HeaderReader, observedAt: string): HeaderUsage {
  const snapshots: ProviderUsageSnapshot[] = [];
  const dayLimit = num(headers, "x-ratelimit-requests-limit");
  const dayRemaining = num(headers, "x-ratelimit-requests-remaining");
  if (dayLimit !== null || dayRemaining !== null) {
    snapshots.push({ window: "day", observedAt, used: null, remaining: dayRemaining, limit: dayLimit });
  }
  return { snapshots, lastCallUnits: null };
}

/** The Odds API and ParlayAPI share the x-requests-* monthly header family. */
export function parseRequestsHeaders(headers: HeaderReader, observedAt: string): HeaderUsage {
  const used = num(headers, "x-requests-used");
  const remaining = num(headers, "x-requests-remaining");
  const snapshots: ProviderUsageSnapshot[] =
    used !== null || remaining !== null
      ? [{ window: "month", observedAt, used, remaining, limit: used !== null && remaining !== null ? used + remaining : null }]
      : [];
  return { snapshots, lastCallUnits: num(headers, "x-requests-last") };
}

export const HEADER_PARSERS: Readonly<Record<ProviderId, (headers: HeaderReader, observedAt: string) => HeaderUsage>> = {
  "api-sports": parseApiSportsHeaders,
  "the-odds-api": parseRequestsHeaders,
  parlayapi: parseRequestsHeaders,
  balldontlie: () => ({ snapshots: [], lastCallUnits: null }),
  therundown: () => ({ snapshots: [], lastCallUnits: null }),
};

/**
 * API-Sports reports many failures (plan restrictions, daily limit, bad
 * params) as HTTP 200 with a non-empty `errors` field. Returns a short
 * description, or null when the body has no errors.
 */
export function inspectApiSportsBody(bodyText: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return "body is not JSON";
  }
  const errors = (parsed as { errors?: unknown })?.errors;
  if (errors === undefined || errors === null) return null;
  const messages = Array.isArray(errors) ? errors.map(String) : typeof errors === "object" ? Object.entries(errors as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`) : [String(errors)];
  return messages.length === 0 ? null : messages.join("; ").slice(0, 300);
}

/**
 * API-Sports /status body: `response.requests.{current, limit_day}` and
 * `response.subscription.{plan, active}`. Account name/email fields are ignored.
 */
export function parseApiSportsStatusBody(bodyText: string, observedAt: string): { snapshot: ProviderUsageSnapshot | null; plan: string | null; active: boolean | null } {
  try {
    const response = (JSON.parse(bodyText) as { response?: Record<string, unknown> }).response;
    const requests = response?.requests as { current?: unknown; limit_day?: unknown } | undefined;
    const subscription = response?.subscription as { plan?: unknown; active?: unknown } | undefined;
    const used = typeof requests?.current === "number" ? requests.current : null;
    const limit = typeof requests?.limit_day === "number" ? requests.limit_day : null;
    return {
      snapshot: used === null && limit === null ? null : { window: "day", observedAt, used, remaining: used !== null && limit !== null ? limit - used : null, limit },
      plan: typeof subscription?.plan === "string" ? subscription.plan : null,
      active: typeof subscription?.active === "boolean" ? subscription.active : null,
    };
  } catch {
    return { snapshot: null, plan: null, active: null };
  }
}

export const estimates = {
  /** Every API-Sports call is one request, including /status (whether /status counts is unverified). */
  apiSports(endpoint: string): CostEstimate {
    return { units: 1, basis: `API-Sports: 1 request per call (${endpoint})`, isUsageCheck: endpoint === "/status" };
  },
  balldontlie(endpoint: string): CostEstimate {
    return { units: 1, basis: `BALLDONTLIE: 1 request per call (${endpoint})` };
  },
  /** /v1/sports/{sport}/props: 3 credits per call and per page (parlay-api.com/docs, read 2026-10-13). */
  parlayProps(pages = 1): CostEstimate {
    return { units: 3 * pages, basis: `ParlayAPI props: 3 credits x ${pages} page(s)` };
  },
  /** Live odds: markets x regions (the-odds-api.com docs; theOddsApiClient.ts). */
  theOddsApiOdds(markets: number, regions: number): CostEstimate {
    return { units: markets * regions, basis: `The Odds API: ${markets} market(s) x ${regions} region(s)` };
  },
};

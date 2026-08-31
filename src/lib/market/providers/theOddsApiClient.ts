/**
 * Server-only HTTP client for The Odds API (https://the-odds-api.com), v4.
 *
 * Scope is deliberately narrow: the single league-wide "current odds" endpoint,
 * one request per league snapshot. No event-by-event odds calls — those would
 * multiply the credit cost of the featured markets.
 *
 * Verified against the v4 documentation (https://the-odds-api.com/liveapi/guides/v4/,
 * retrieved 2026-08-31):
 *
 *   GET https://api.the-odds-api.com/v4/sports/{sport}/odds
 *     ?apiKey={key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso
 *
 *   Response: Event[] — each { id, sport_key, sport_title, commence_time,
 *     home_team, away_team, bookmakers[] }; bookmaker { key, title, last_update,
 *     markets[] }; market { key, outcomes[] } (market-level last_update is only
 *     present on the per-event endpoint, not this one); outcome { name, price,
 *     point? }.
 *
 *   Quota response headers:
 *     x-requests-remaining  credits left until monthly reset
 *     x-requests-used       credits used since last reset
 *     x-requests-last       cost of this call (markets x regions)
 *
 *   Cost formula: markets x regions. h2h,spreads,totals x us = 3 credits.
 *
 * SECURITY: the provider contract requires `apiKey` as a query parameter. The
 * key therefore appears in the request URL, but this module never returns,
 * logs, or embeds that URL anywhere. Errors carry a redacted path only.
 */

export const THE_ODDS_API_BASE_URL = "https://api.the-odds-api.com" as const;
export const THE_ODDS_API_PROVIDER = "the-odds-api" as const;

export const THE_ODDS_API_SPORT_KEYS = {
  nfl: "americanfootball_nfl",
  cfb: "americanfootball_ncaaf",
} as const;

export type TheOddsApiLeague = keyof typeof THE_ODDS_API_SPORT_KEYS;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MARKETS = ["h2h", "spreads", "totals"] as const;
const DEFAULT_REGIONS = ["us"] as const;

export type TheOddsApiClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Overridable only for tests; production always uses {@link THE_ODDS_API_BASE_URL}. */
  baseUrl?: string;
};

export type TheOddsApiErrorKind =
  | "missing-api-key"
  | "timeout"
  | "unauthorized"
  | "rate-limited"
  | "http-error"
  | "invalid-json"
  | "network";

export class TheOddsApiError extends Error {
  readonly kind: TheOddsApiErrorKind;
  readonly status: number | null;
  /** Redacted — path and non-secret query keys only, never `apiKey`. */
  readonly path: string;

  constructor(
    kind: TheOddsApiErrorKind,
    message: string,
    options: { status?: number | null; path: string; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "TheOddsApiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.path = options.path;
  }
}

export type TheOddsApiQuota = {
  /** `x-requests-remaining`, or `null` if the header was absent. */
  remaining: number | null;
  /** `x-requests-used`. */
  used: number | null;
  /** `x-requests-last` — the cost of the call that produced this quota. */
  lastCost: number | null;
};

export type TheOddsApiOddsResult = {
  sportKey: string;
  /** Raw provider payload — decoded by {@link ./theOddsApiWire}. */
  events: unknown;
  quota: TheOddsApiQuota;
};

export type GetCurrentOddsParams = {
  league: TheOddsApiLeague;
  regions?: readonly string[];
  markets?: readonly string[];
  oddsFormat?: "american" | "decimal";
};

export interface TheOddsApiClient {
  getCurrentOdds(params: GetCurrentOddsParams): Promise<TheOddsApiOddsResult>;
}

function assertApiKey(apiKey: string): void {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TheOddsApiError(
      "missing-api-key",
      "THE_ODDS_API_KEY is required. Set it in the process environment; no request was made.",
      { path: "(no request)" },
    );
  }
}

function parseQuotaHeader(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function redactedPath(sportKey: string, search: URLSearchParams): string {
  const safe = new URLSearchParams(search);
  safe.delete("apiKey");
  const query = safe.toString();
  return `/v4/sports/${sportKey}/odds${query ? `?${query}` : ""}`;
}

export function createTheOddsApiClient(
  options: TheOddsApiClientOptions,
): TheOddsApiClient {
  assertApiKey(options.apiKey);
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? THE_ODDS_API_BASE_URL;

  async function getCurrentOdds(
    params: GetCurrentOddsParams,
  ): Promise<TheOddsApiOddsResult> {
    const sportKey = THE_ODDS_API_SPORT_KEYS[params.league];
    if (sportKey === undefined) {
      throw new TheOddsApiError("http-error", `Unknown league: ${params.league}`, {
        path: "(no request)",
      });
    }

    const regions = [...(params.regions ?? DEFAULT_REGIONS)];
    const markets = [...(params.markets ?? DEFAULT_MARKETS)];
    const search = new URLSearchParams({
      apiKey,
      regions: regions.join(","),
      markets: markets.join(","),
      oddsFormat: params.oddsFormat ?? "american",
      dateFormat: "iso",
    });
    const path = redactedPath(sportKey, search);
    const url = `${baseUrl}/v4/sports/${sportKey}/odds?${search.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new TheOddsApiError(
          "timeout",
          `The Odds API request timed out after ${timeoutMs}ms: ${path}`,
          { path, cause: error },
        );
      }
      throw new TheOddsApiError("network", `The Odds API request failed: ${path}`, {
        path,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    const quota: TheOddsApiQuota = {
      remaining: parseQuotaHeader(response, "x-requests-remaining"),
      used: parseQuotaHeader(response, "x-requests-used"),
      lastCost: parseQuotaHeader(response, "x-requests-last"),
    };

    if (response.status === 401 || response.status === 403) {
      throw new TheOddsApiError(
        "unauthorized",
        `The Odds API rejected the API key (HTTP ${response.status}) for ${path}.`,
        { status: response.status, path },
      );
    }
    if (response.status === 429) {
      throw new TheOddsApiError(
        "rate-limited",
        `The Odds API rate-limited the request (HTTP 429) for ${path}.`,
        { status: response.status, path },
      );
    }
    if (!response.ok) {
      let bodyHint = "";
      try {
        bodyHint = (await response.text()).slice(0, 300).trim();
      } catch {
        bodyHint = "";
      }
      throw new TheOddsApiError(
        "http-error",
        `The Odds API ${path} responded HTTP ${response.status} ${response.statusText}` +
          (bodyHint ? `: ${bodyHint}` : "."),
        { status: response.status, path },
      );
    }

    let events: unknown;
    try {
      events = await response.json();
    } catch (error) {
      throw new TheOddsApiError(
        "invalid-json",
        `The Odds API ${path} returned a body that is not valid JSON.`,
        { status: response.status, path, cause: error },
      );
    }

    return { sportKey, events, quota };
  }

  return { getCurrentOdds };
}

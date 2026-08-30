/**
 * Server-only SportsDataIO HTTP client for the WU6 betting-splits collector.
 *
 * Scope is deliberately narrow: only the two verified NFL routes the collector
 * needs. The API key is read from the environment by the CLI and passed in here;
 * it travels in the `Ocp-Apim-Subscription-Key` header only, never in a URL and
 * never in a log line or error message.
 *
 * Verified against the machine-readable SportsDataIO OpenAPI description
 * (api-evangelist/sportsdataio, `openapi/sportsdataio-nfl-v3-scores-api-openapi.yml`
 * and `.../sportsdataio-nfl-v3-odds-api-openapi.yml`, retrieved 2026-08-30):
 *
 *   GET /v3/nfl/scores/{format}/ScoresByWeek/{season}/{week}   -> Score[]
 *   GET /v3/nfl/odds/{format}/BettingSplitsByScoreId/{scoreId} -> GameBettingSplit
 *   securityScheme apiKeyHeader: { in: header, name: Ocp-Apim-Subscription-Key }
 *
 * No CFB routes are wired here: the CFB schedule and betting-splits-by-game
 * routes could not be verified from an authoritative machine-readable source and
 * are intentionally not guessed.
 */

export const SPORTSDATAIO_BASE_URL = "https://api.sportsdata.io" as const;
export const SPORTSDATAIO_API_KEY_HEADER = "Ocp-Apim-Subscription-Key" as const;

const DEFAULT_TIMEOUT_MS = 30_000;

/** SportsDataIO season-type suffixes used in the `{season}` path segment. */
export type SportsDataIoSeasonType = "REG" | "PRE" | "POST";

export type SportsDataIoClientOptions = {
  apiKey: string;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. Defaults to 30s. */
  timeoutMs?: number;
  /** Overridable only for tests; production always uses {@link SPORTSDATAIO_BASE_URL}. */
  baseUrl?: string;
};

export type SportsDataIoErrorKind =
  | "missing-api-key"
  | "timeout"
  | "unauthorized"
  | "http-error"
  | "invalid-json"
  | "network";

export class SportsDataIoApiError extends Error {
  readonly kind: SportsDataIoErrorKind;
  readonly status: number | null;
  /** Path only — never includes the API key. */
  readonly path: string;

  constructor(
    kind: SportsDataIoErrorKind,
    message: string,
    options: { status?: number | null; path: string; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SportsDataIoApiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.path = options.path;
  }
}

export interface SportsDataIoClient {
  /**
   * `Score[]` for one NFL week. `seasonType` maps to the SportsDataIO
   * `{season}` suffix (`2026REG`, `2026PRE`, `2026POST`).
   */
  getNflScoresByWeek(
    season: number,
    seasonType: SportsDataIoSeasonType,
    week: number,
  ): Promise<unknown>;

  /** `GameBettingSplit` for one game, addressed by its SportsDataIO ScoreID. */
  getNflBettingSplitsByScoreId(scoreId: string): Promise<unknown>;
}

function assertApiKey(apiKey: string): void {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new SportsDataIoApiError(
      "missing-api-key",
      "SPORTSDATAIO_API_KEY is required. Set it in the process environment; no request was made.",
      { path: "(no request)" },
    );
  }
}

function seasonSegment(season: number, seasonType: SportsDataIoSeasonType): string {
  if (!Number.isInteger(season) || season < 2000) {
    throw new SportsDataIoApiError("http-error", `Invalid season: ${season}.`, {
      path: "(no request)",
    });
  }
  return `${season}${seasonType}`;
}

export function createSportsDataIoClient(
  options: SportsDataIoClientOptions,
): SportsDataIoClient {
  assertApiKey(options.apiKey);
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? SPORTSDATAIO_BASE_URL;

  async function getJson(path: string): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          [SPORTSDATAIO_API_KEY_HEADER]: apiKey,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new SportsDataIoApiError(
          "timeout",
          `SportsDataIO request timed out after ${timeoutMs}ms: ${path}`,
          { path, cause: error },
        );
      }
      throw new SportsDataIoApiError(
        "network",
        `SportsDataIO request failed: ${path}`,
        { path, cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new SportsDataIoApiError(
        "unauthorized",
        `SportsDataIO rejected the API key (HTTP ${response.status}) for ${path}.`,
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
      throw new SportsDataIoApiError(
        "http-error",
        `SportsDataIO ${path} responded HTTP ${response.status} ${response.statusText}` +
          (bodyHint ? `: ${bodyHint}` : "."),
        { status: response.status, path },
      );
    }

    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new SportsDataIoApiError(
        "invalid-json",
        `SportsDataIO ${path} returned a body that is not valid JSON.`,
        { status: response.status, path, cause: error },
      );
    }
  }

  return {
    async getNflScoresByWeek(season, seasonType, week) {
      if (!Number.isInteger(week) || week < 0) {
        throw new SportsDataIoApiError("http-error", `Invalid week: ${week}.`, {
          path: "(no request)",
        });
      }
      const segment = seasonSegment(season, seasonType);
      return getJson(`/v3/nfl/scores/json/ScoresByWeek/${segment}/${week}`);
    },

    async getNflBettingSplitsByScoreId(scoreId) {
      const trimmed = String(scoreId).trim();
      if (trimmed === "") {
        throw new SportsDataIoApiError("http-error", "scoreId is required.", {
          path: "(no request)",
        });
      }
      return getJson(
        `/v3/nfl/odds/json/BettingSplitsByScoreId/${encodeURIComponent(trimmed)}`,
      );
    },
  };
}

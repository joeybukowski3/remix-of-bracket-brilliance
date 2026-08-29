import type {
  BettingLeague,
  BettingMoneylineSplit,
  BettingSpreadSplit,
  BettingTotalSplit,
} from "../bettingSplitsTypes";
import {
  NORMALIZED_PROVIDER_BETTING_SPLITS_SCHEMA_VERSION,
  type NormalizedProviderBettingSplit,
} from "./normalizedProviderBettingSplits";

export const SPORTSDATAIO_PROVIDER = "sportsdataio" as const;

/**
 * Integration-boundary contract pending verification against the live
 * SportsDataIO betting-splits endpoint. No endpoint schema is stored locally.
 *
 * The tagged percentage and spread-line units are intentionally explicit so
 * this offline adapter never guesses how an unverified raw response is encoded.
 * A future network decoder must translate the verified wire response into this
 * narrow shape before calling the normalizer.
 */
export type SportsDataIoBettingSplitRowDto = {
  League: string;
  Season: number;
  Week?: number | null;
  GameId: string | number;
  AwayTeamId?: string | number | null;
  AwayTeamName?: string | null;
  HomeTeamId?: string | number | null;
  HomeTeamName?: string | null;
  KickoffUtc?: string | null;
  Sportsbook?: string | null;
  MarketType: string;
  OutcomeType: string;
  BetPercentage?: number | null;
  MoneyPercentage?: number | null;
  PercentageUnit: "fraction" | "percent";
  /**
   * Required for spread rows. Team-relative lines belong to the named outcome;
   * home-relative lines describe the home spread on both outcome rows.
   */
  SpreadLineConvention?: "team-relative" | "home-relative";
  Line?: number | null;
  Price?: number | null;
  Created?: string | null;
  LastSeen?: string | null;
};

export type SportsDataIoBettingSplitRejectionCode =
  | "UNSUPPORTED_LEAGUE"
  | "UNSUPPORTED_MARKET"
  | "UNKNOWN_OUTCOME"
  | "INVALID_PERCENTAGE"
  | "INVALID_LINE"
  | "INVALID_PRICE"
  | "INVALID_TIMESTAMP"
  | "INVALID_SEASON"
  | "INVALID_WEEK"
  | "INCONSISTENT_TOTAL_LINE"
  | "MISSING_PROVIDER_GAME_ID"
  | "MISSING_REQUIRED_OUTCOME_IDENTITY"
  | "DUPLICATE_CONFLICTING_OUTCOME"
  | "CONFLICTING_EVENT_METADATA";

export type SportsDataIoBettingSplitRejection = {
  code: SportsDataIoBettingSplitRejectionCode;
  message: string;
  inputIndexes: number[];
  providerGameId: string | null;
  market: "spread" | "total" | "moneyline" | null;
};

export type SportsDataIoBettingSplitNormalizationResult = {
  normalized: NormalizedProviderBettingSplit[];
  rejected: SportsDataIoBettingSplitRejection[];
};

export type NormalizeSportsDataIoBettingSplitsOptions = {
  /**
   * Collector time identifying one current-state observation batch. Different
   * observations must be normalized in separate calls. The system clock is never read.
   */
  capturedAt: string;
};

type NormalizedMarket = "spread" | "total" | "moneyline";
type NormalizedOutcome = "home" | "away" | "over" | "under";

type ValidatedRow = {
  inputIndex: number;
  dto: SportsDataIoBettingSplitRowDto;
  league: BettingLeague;
  providerGameId: string;
  sportsbook: string | null;
  market: NormalizedMarket;
  outcome: NormalizedOutcome;
  betPercentage: number | null;
  moneyPercentage: number | null;
  line: number | null;
  price: number | null;
  created: string | null;
  lastSeen: string | null;
};

type Group = {
  rows: ValidatedRow[];
};

const MARKET_MAP: Readonly<Record<string, NormalizedMarket>> = {
  spread: "spread",
  total: "total",
  moneyline: "moneyline",
};

const OUTCOME_MAP: Readonly<Record<string, NormalizedOutcome>> = {
  home: "home",
  away: "away",
  over: "over",
  under: "under",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeLeague(value: string): BettingLeague | null {
  const token = normalizeToken(value);
  if (token === "nfl") return "nfl";
  if (token === "ncaafootball" || token === "ncaaf" || token === "cfb") return "cfb";
  return null;
}

function normalizeMarket(value: string): NormalizedMarket | null {
  return MARKET_MAP[normalizeToken(value)] ?? null;
}

function normalizeOutcome(value: string): NormalizedOutcome | null {
  return OUTCOME_MAP[normalizeToken(value)] ?? null;
}

function normalizeIdentifier(value: string | number | null | undefined): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTimestamp(value: string | null | undefined): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString();
}

function normalizePercentage(
  value: number | null | undefined,
  unit: SportsDataIoBettingSplitRowDto["PercentageUnit"],
): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  const normalized = unit === "fraction" ? value * 100 : value;
  if (normalized < 0 || normalized > 100) return undefined;
  return Number(normalized.toFixed(10));
}

function normalizeFiniteNumber(value: number | null | undefined): number | null | undefined {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeLine(
  dto: SportsDataIoBettingSplitRowDto,
  market: NormalizedMarket | null,
  outcome: NormalizedOutcome | null,
): number | null | undefined {
  const line = normalizeFiniteNumber(dto.Line);
  if (line == null || market !== "spread" || outcome == null) return line;
  if (dto.SpreadLineConvention === "home-relative" && outcome === "away") return -line;
  return line;
}

function rejection(
  code: SportsDataIoBettingSplitRejectionCode,
  message: string,
  inputIndexes: number[],
  providerGameId: string | null,
  market: NormalizedMarket | null,
): SportsDataIoBettingSplitRejection {
  return { code, message, inputIndexes: [...inputIndexes].sort((a, b) => a - b), providerGameId, market };
}

function validateRow(
  dto: SportsDataIoBettingSplitRowDto,
  inputIndex: number,
): { row: ValidatedRow | null; rejected: SportsDataIoBettingSplitRejection[] } {
  const rejected: SportsDataIoBettingSplitRejection[] = [];
  const providerGameId = normalizeIdentifier(dto.GameId);
  const league = normalizeLeague(dto.League);
  const market = normalizeMarket(dto.MarketType);
  const outcome = normalizeOutcome(dto.OutcomeType);

  if (!league) {
    rejected.push(rejection("UNSUPPORTED_LEAGUE", `Unsupported league: ${dto.League}`, [inputIndex], providerGameId, market));
  }
  if (!providerGameId) {
    rejected.push(rejection("MISSING_PROVIDER_GAME_ID", "Provider game ID is required.", [inputIndex], null, market));
  }
  if (!Number.isInteger(dto.Season) || dto.Season < 2000) {
    rejected.push(rejection("INVALID_SEASON", "Season must be an integer of 2000 or later.", [inputIndex], providerGameId, market));
  }
  if (dto.Week != null && (!Number.isInteger(dto.Week) || dto.Week <= 0)) {
    rejected.push(rejection("INVALID_WEEK", "Week must be a positive integer when supplied.", [inputIndex], providerGameId, market));
  }
  if (!market) {
    rejected.push(rejection("UNSUPPORTED_MARKET", `Unsupported market: ${dto.MarketType}`, [inputIndex], providerGameId, null));
  }
  if (!outcome) {
    rejected.push(rejection("UNKNOWN_OUTCOME", `Unknown outcome: ${dto.OutcomeType}`, [inputIndex], providerGameId, market));
  } else if (market === "total" ? outcome !== "over" && outcome !== "under" : outcome !== "home" && outcome !== "away") {
    rejected.push(rejection("MISSING_REQUIRED_OUTCOME_IDENTITY", `Outcome ${dto.OutcomeType} is not valid for ${market}.`, [inputIndex], providerGameId, market));
  }
  if (
    market === "spread"
    && dto.SpreadLineConvention !== "team-relative"
    && dto.SpreadLineConvention !== "home-relative"
  ) {
    rejected.push(rejection("INVALID_LINE", "Spread rows must explicitly identify their line convention.", [inputIndex], providerGameId, market));
  }

  const betPercentage = normalizePercentage(dto.BetPercentage, dto.PercentageUnit);
  const moneyPercentage = normalizePercentage(dto.MoneyPercentage, dto.PercentageUnit);
  if (betPercentage === undefined || moneyPercentage === undefined) {
    rejected.push(rejection("INVALID_PERCENTAGE", "Percentages must be finite and normalize into the 0-100 range.", [inputIndex], providerGameId, market));
  }

  const line = normalizeLine(dto, market, outcome);
  const price = normalizeFiniteNumber(dto.Price);
  if (line === undefined) {
    rejected.push(rejection("INVALID_LINE", "Line must be finite when supplied.", [inputIndex], providerGameId, market));
  }
  if (price === undefined) {
    rejected.push(rejection("INVALID_PRICE", "Price must be finite when supplied.", [inputIndex], providerGameId, market));
  }

  const created = normalizeTimestamp(dto.Created);
  const lastSeen = normalizeTimestamp(dto.LastSeen);
  const kickoff = normalizeTimestamp(dto.KickoffUtc);
  if (created === undefined || lastSeen === undefined || kickoff === undefined) {
    rejected.push(rejection("INVALID_TIMESTAMP", "Provider timestamps must be valid when supplied.", [inputIndex], providerGameId, market));
  }

  if (rejected.length > 0 || !league || !providerGameId || !market || !outcome || betPercentage === undefined || moneyPercentage === undefined || line === undefined || price === undefined || created === undefined || lastSeen === undefined) {
    return { row: null, rejected };
  }

  return {
    row: {
      inputIndex,
      dto,
      league,
      providerGameId,
      sportsbook: normalizeNullableString(dto.Sportsbook),
      market,
      outcome,
      betPercentage,
      moneyPercentage,
      line,
      price,
      created,
      lastSeen,
    },
    rejected,
  };
}

function sameValue(a: number | null, b: number | null): boolean {
  return Object.is(a, b);
}

function rowsConflict(a: ValidatedRow, b: ValidatedRow): boolean {
  return !sameValue(a.betPercentage, b.betPercentage)
    || !sameValue(a.moneyPercentage, b.moneyPercentage)
    || !sameValue(a.line, b.line)
    || !sameValue(a.price, b.price);
}

function selectMarketRows(
  groupRows: ValidatedRow[],
  market: NormalizedMarket,
  rejected: SportsDataIoBettingSplitRejection[],
): Map<NormalizedOutcome, ValidatedRow> | null {
  const marketRows = groupRows.filter((row) => row.market === market);
  const selected = new Map<NormalizedOutcome, ValidatedRow>();

  for (const row of marketRows) {
    const previous = selected.get(row.outcome);
    if (!previous) {
      selected.set(row.outcome, row);
      continue;
    }
    if (rowsConflict(previous, row)) {
      rejected.push(rejection(
        "DUPLICATE_CONFLICTING_OUTCOME",
        `Conflicting duplicate ${market}/${row.outcome} rows were quarantined.`,
        marketRows.map((candidate) => candidate.inputIndex),
        row.providerGameId,
        market,
      ));
      return null;
    }
  }

  return selected;
}

function buildSpread(rows: Map<NormalizedOutcome, ValidatedRow> | null): BettingSpreadSplit | null {
  if (!rows || rows.size === 0) return null;
  const home = rows.get("home");
  const away = rows.get("away");
  return {
    openingHomeLine: null,
    openingAwayLine: null,
    currentHomeLine: home?.line ?? null,
    currentAwayLine: away?.line ?? null,
    homeBetPct: home?.betPercentage ?? null,
    awayBetPct: away?.betPercentage ?? null,
    homeMoneyPct: home?.moneyPercentage ?? null,
    awayMoneyPct: away?.moneyPercentage ?? null,
  };
}

function buildTotal(
  rows: Map<NormalizedOutcome, ValidatedRow> | null,
  rejected: SportsDataIoBettingSplitRejection[],
): BettingTotalSplit | null {
  if (!rows || rows.size === 0) return null;
  const over = rows.get("over");
  const under = rows.get("under");
  if (over?.line != null && under?.line != null && !sameValue(over.line, under.line)) {
    rejected.push(rejection(
      "INCONSISTENT_TOTAL_LINE",
      "Over and under rows disagree on the current total line.",
      [over.inputIndex, under.inputIndex],
      over.providerGameId,
      "total",
    ));
    return null;
  }
  return {
    openingLine: null,
    currentLine: over?.line ?? under?.line ?? null,
    overBetPct: over?.betPercentage ?? null,
    underBetPct: under?.betPercentage ?? null,
    overMoneyPct: over?.moneyPercentage ?? null,
    underMoneyPct: under?.moneyPercentage ?? null,
  };
}

function buildMoneyline(rows: Map<NormalizedOutcome, ValidatedRow> | null): BettingMoneylineSplit | null {
  if (!rows || rows.size === 0) return null;
  const home = rows.get("home");
  const away = rows.get("away");
  return {
    openingHomePrice: null,
    openingAwayPrice: null,
    currentHomePrice: home?.price ?? null,
    currentAwayPrice: away?.price ?? null,
    homeBetPct: home?.betPercentage ?? null,
    awayBetPct: away?.betPercentage ?? null,
    homeMoneyPct: home?.moneyPercentage ?? null,
    awayMoneyPct: away?.moneyPercentage ?? null,
  };
}

function earliestTimestamp(values: Array<string | null>): string | null {
  const supplied = values.filter((value): value is string => value != null);
  return supplied.length === 0 ? null : supplied.sort()[0];
}

function latestTimestamp(values: Array<string | null>): string | null {
  const supplied = values.filter((value): value is string => value != null);
  return supplied.length === 0 ? null : supplied.sort()[supplied.length - 1];
}

function stableGroupKey(row: ValidatedRow): string {
  return JSON.stringify([row.league, row.providerGameId, row.sportsbook]);
}

function firstSortedValue(values: Array<string | null>): string | null {
  return values.filter((value): value is string => value != null).sort()[0] ?? null;
}

function buildNormalizedGroup(
  group: Group,
  capturedAt: string,
  rejected: SportsDataIoBettingSplitRejection[],
): NormalizedProviderBettingSplit | null {
  const rows = group.rows;
  const first = rows[0];
  const metadata = rows.map((row) => ({
    season: row.dto.Season,
    week: row.dto.Week ?? null,
    awayId: normalizeIdentifier(row.dto.AwayTeamId),
    awayName: normalizeNullableString(row.dto.AwayTeamName),
    homeId: normalizeIdentifier(row.dto.HomeTeamId),
    homeName: normalizeNullableString(row.dto.HomeTeamName),
    kickoff: normalizeTimestamp(row.dto.KickoffUtc) ?? null,
  }));
  const metadataSignatures = new Set(metadata.map((value) => JSON.stringify(value)));
  if (metadataSignatures.size > 1) {
    rejected.push(rejection(
      "CONFLICTING_EVENT_METADATA",
      "Rows for one provider game/source disagree on season, week, team identity, or kickoff.",
      rows.map((row) => row.inputIndex),
      first.providerGameId,
      null,
    ));
    return null;
  }

  const spreadRows = selectMarketRows(rows, "spread", rejected);
  const totalRows = selectMarketRows(rows, "total", rejected);
  const moneylineRows = selectMarketRows(rows, "moneyline", rejected);
  const spread = buildSpread(spreadRows);
  const total = buildTotal(totalRows, rejected);
  const moneyline = buildMoneyline(moneylineRows);
  if (!spread && !total && !moneyline) return null;

  return {
    schemaVersion: NORMALIZED_PROVIDER_BETTING_SPLITS_SCHEMA_VERSION,
    league: first.league,
    season: first.dto.Season,
    week: first.dto.Week ?? null,
    provider: SPORTSDATAIO_PROVIDER,
    providerGameId: first.providerGameId,
    providerAwayTeamId: normalizeIdentifier(first.dto.AwayTeamId),
    providerAwayTeamName: firstSortedValue(rows.map((row) => normalizeNullableString(row.dto.AwayTeamName))),
    providerHomeTeamId: normalizeIdentifier(first.dto.HomeTeamId),
    providerHomeTeamName: firstSortedValue(rows.map((row) => normalizeNullableString(row.dto.HomeTeamName))),
    kickoffUtc: normalizeTimestamp(first.dto.KickoffUtc) ?? null,
    sportsbook: first.sportsbook,
    capturedAt,
    providerCreatedAt: earliestTimestamp(rows.map((row) => row.created)),
    providerLastSeenAt: latestTimestamp(rows.map((row) => row.lastSeen)),
    spread,
    total,
    moneyline,
  };
}

/** Pure/offline normalization. Invalid rows are quarantined rather than thrown. */
export function normalizeSportsDataIoBettingSplits(
  input: readonly SportsDataIoBettingSplitRowDto[],
  options: NormalizeSportsDataIoBettingSplitsOptions,
): SportsDataIoBettingSplitNormalizationResult {
  const rejected: SportsDataIoBettingSplitRejection[] = [];
  const capturedAt = normalizeTimestamp(options.capturedAt);
  if (capturedAt == null) {
    return {
      normalized: [],
      rejected: input.map((row, inputIndex) => rejection(
        "INVALID_TIMESTAMP",
        "capturedAt must be an explicit valid timestamp.",
        [inputIndex],
        normalizeIdentifier(row.GameId),
        normalizeMarket(row.MarketType),
      )),
    };
  }

  const groups = new Map<string, Group>();
  input.forEach((dto, inputIndex) => {
    const validation = validateRow(dto, inputIndex);
    rejected.push(...validation.rejected);
    if (!validation.row) return;
    const key = stableGroupKey(validation.row);
    const group = groups.get(key) ?? { rows: [] };
    group.rows.push(validation.row);
    groups.set(key, group);
  });

  const normalized = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => buildNormalizedGroup(group, capturedAt, rejected))
    .filter((value): value is NormalizedProviderBettingSplit => value != null);

  return { normalized, rejected };
}

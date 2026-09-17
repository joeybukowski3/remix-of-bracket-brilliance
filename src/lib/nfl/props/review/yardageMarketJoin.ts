/**
 * Read-only presentation layer for the NFL Yardage Props Review UI.
 *
 * Joins the current-week yardage projection artifact
 * (`public/data/nfl/{season}/yardage-projections.json`) to market data, in a
 * fixed source priority:
 *
 *   1. sportsbook  -- `public/data/nfl/nfl-yardage-market.json` (canonical,
 *      two-sided ParlayAPI line). ALWAYS wins when present.
 *   2. kalshi      -- `public/data/nfl/nfl-yardage-alt-market.json` (secondary
 *      exchange source). A DERIVED market-implied reference line from a "N+"
 *      threshold ladder -- never a tradable two-sided line, never fabricated
 *      sportsbook juice. Consulted ONLY when the sportsbook layer has no line.
 *   3. unavailable -- neither source has a line.
 *
 * Kalshi/alt data can never overwrite or alter a sportsbook line. Never
 * touches projection models, Matchup Score weights, Phase 11 research logic,
 * or market ingestion -- this module only reads already-generated artifacts
 * and reshapes them for display. The `source` discriminator is carried
 * through so the UI can label which market supplied the shown line, and so a
 * future source can be added without a rewrite.
 *
 * A market line is attached ONLY on an exact `playerId` match within the
 * same market (passing/rushing/receiving joined independently). No
 * name/team/fuzzy matching. `rawDifference` (projection minus line) is
 * research context only -- never an EV/edge/pick.
 */
import type { NflProjectionMarket } from "../types/projectionOutput";
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";

export type NflYardageMarketSource = "sportsbook" | "kalshi";

export type NflYardageMarketLine = {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  opponent: string;
  gameId: string;
  week: number;
  bookmaker: string;
  point: number;
  over: string;
  under: string;
  booksAtPoint: number;
  lastUpdate: string;
};

export type NflYardageMarketArtifact = {
  generatedAt: string;
  schemaVersion: string;
  canonical: {
    passingYards: Record<string, NflYardageMarketLine>;
    rushingYards: Record<string, NflYardageMarketLine>;
    receivingYards: Record<string, NflYardageMarketLine>;
  };
};

export type NflYardageAltReferenceLineMode = "interpolated" | "exact_rung" | "nearest_rung";

export type NflYardageAltLadderRung = {
  ticker: string;
  threshold: number;
  yesBidCents: number | null;
  yesAskCents: number | null;
  lastPriceCents: number | null;
};

export type NflYardageAltMarketLine = {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  opponent: string;
  gameId: string;
  week: number;
  source: "kalshi";
  /** DERIVED market-implied median yardage -- not a tradable contract. */
  referenceLine: number;
  referenceLineMode: NflYardageAltReferenceLineMode;
  interpolationBracket: {
    lowThreshold: number;
    lowYesProbability: number;
    highThreshold: number;
    highYesProbability: number;
  } | null;
  referenceRungUsed: { threshold: number; yesProbability: number } | null;
  nearestContract: {
    ticker: string;
    threshold: number;
    yesBidCents: number | null;
    yesAskCents: number | null;
    yesMidCents: number | null;
    noMidCents: number | null;
    americanFromYesMid: number | null;
  };
  ladder: NflYardageAltLadderRung[];
  externalEventTicker: string;
  externalMarketId: string;
  closeTime: string | null;
  updatedAt: string;
  matchingConfidence: number;
};

export type NflYardageAltMarketArtifact = {
  generatedAt: string;
  schemaVersion: string;
  currentWeek: number;
  canonical: {
    passingYards: Record<string, NflYardageAltMarketLine>;
    rushingYards: Record<string, NflYardageAltMarketLine>;
    receivingYards: Record<string, NflYardageAltMarketLine>;
  };
};

const MARKET_TO_CANONICAL_KEY: Record<NflProjectionMarket, keyof NflYardageMarketArtifact["canonical"]> = {
  passing: "passingYards",
  rushing: "rushingYards",
  receiving: "receivingYards",
};

/** Compact exchange-price view for a Kalshi row -- raw cents kept alongside a display-only American conversion. */
export type NflYardageKalshiExchange = {
  /** Raw YES share price in cents (0-100) for the nearest real contract. */
  yesCents: number | null;
  /** Raw NO share price in cents (0-100). */
  noCents: number | null;
  /** Display-only American-odds conversion of the YES price. NOT sportsbook juice. */
  americanYes: number | null;
  americanNo: number | null;
  /** Threshold of the nearest real tradable Kalshi contract. */
  contractThreshold: number;
};

export type NflYardageReviewMarketInfo =
  | {
      available: true;
      source: "sportsbook";
      line: number;
      book: string;
      overPrice: string;
      underPrice: string;
      /** projectedYards - line. Research context only -- never an edge/EV/pick. */
      rawDifference: number;
      lastUpdate: string;
    }
  | {
      available: true;
      source: "kalshi";
      /** DERIVED market-implied reference line -- see `lineKind`. Not directly bettable. */
      line: number;
      lineKind: "market_implied_reference";
      referenceLineMode: NflYardageAltReferenceLineMode;
      exchange: NflYardageKalshiExchange;
      externalMarketId: string;
      /** projectedYards - referenceLine. Research context only -- never an edge/EV/pick. */
      rawDifference: number;
      lastUpdate: string;
    }
  | { available: false };

/**
 * Exact-identity join, sportsbook first then Kalshi. Missing/unresolved
 * data on both sources always renders as unavailable.
 */
export function joinMarketLine(
  row: Pick<NflCurrentWeekProjectionRow, "playerId" | "market" | "projectedYards">,
  sportsbook: NflYardageMarketArtifact | null,
  alt: NflYardageAltMarketArtifact | null = null,
): NflYardageReviewMarketInfo {
  if (row.projectedYards == null) return { available: false };
  const key = MARKET_TO_CANONICAL_KEY[row.market];

  const sportsbookLine = sportsbook?.canonical[key]?.[row.playerId];
  if (sportsbookLine) {
    return {
      available: true,
      source: "sportsbook",
      line: sportsbookLine.point,
      book: sportsbookLine.bookmaker,
      overPrice: sportsbookLine.over,
      underPrice: sportsbookLine.under,
      rawDifference: row.projectedYards - sportsbookLine.point,
      lastUpdate: sportsbookLine.lastUpdate,
    };
  }

  const altLine = alt?.canonical[key]?.[row.playerId];
  if (altLine) {
    return {
      available: true,
      source: "kalshi",
      line: altLine.referenceLine,
      lineKind: "market_implied_reference",
      referenceLineMode: altLine.referenceLineMode,
      exchange: {
        yesCents: altLine.nearestContract.yesMidCents,
        noCents: altLine.nearestContract.noMidCents,
        americanYes: altLine.nearestContract.americanFromYesMid,
        americanNo:
          altLine.nearestContract.noMidCents == null
            ? null
            : americanFromCents(altLine.nearestContract.noMidCents),
        contractThreshold: altLine.nearestContract.threshold,
      },
      externalMarketId: altLine.externalMarketId,
      rawDifference: row.projectedYards - altLine.referenceLine,
      lastUpdate: altLine.updatedAt,
    };
  }

  return { available: false };
}

/** Cents (0-100) -> American odds, display only. Mirrors the .mjs producer's conversion. */
function americanFromCents(cents: number): number | null {
  const p = cents / 100;
  if (!(p > 0) || !(p < 1)) return null;
  const american = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100;
  return Math.round(american);
}

export type NflMatchupScoreBand = "elite" | "strong" | "average" | "weak" | "poor";

export const MATCHUP_SCORE_BAND_LABEL: Record<NflMatchupScoreBand, string> = {
  elite: "Elite",
  strong: "Strong",
  average: "Average",
  weak: "Weak",
  poor: "Poor",
};

/** Presentation-only bucketing of the existing 0-100 Matchup Score. Never feeds back into the score itself. */
export function matchupScoreBand(score: number | null | undefined): NflMatchupScoreBand | null {
  if (score == null) return null;
  if (score >= 80) return "elite";
  if (score >= 65) return "strong";
  if (score >= 45) return "average";
  if (score >= 25) return "weak";
  return "poor";
}

export type NflYardageReviewRow = {
  row: NflCurrentWeekProjectionRow;
  marketInfo: NflYardageReviewMarketInfo;
  band: NflMatchupScoreBand | null;
};

/** Combines every projection row for one market with its (possibly unavailable) market line. Pure, no filtering/sorting. */
export function buildYardageReviewRows(
  rows: readonly NflCurrentWeekProjectionRow[],
  sportsbook: NflYardageMarketArtifact | null,
  alt: NflYardageAltMarketArtifact | null = null,
): NflYardageReviewRow[] {
  return rows.map((row) => ({
    row,
    marketInfo: joinMarketLine(row, sportsbook, alt),
    band: matchupScoreBand(row.matchupScore?.matchupScore ?? null),
  }));
}

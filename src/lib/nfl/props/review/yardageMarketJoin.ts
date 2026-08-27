/**
 * Read-only presentation layer for the NFL Yardage Props Review UI.
 *
 * Joins the current-week yardage projection artifact
 * (`public/data/nfl/{season}/yardage-projections.json`) to the sportsbook
 * yardage-market artifact (`public/data/nfl/nfl-yardage-market.json`).
 *
 * Never touches projection models, Matchup Score weights, Phase 11 research
 * logic, or market ingestion logic -- this module only reads the two
 * already-generated artifacts and reshapes them for display.
 *
 * A sportsbook line is attached ONLY on an exact `playerId` match within the
 * same market (passing/rushing/receiving are joined independently -- a
 * player's passing line never attaches to their rushing row). No
 * name/team/fuzzy matching. Any player without a matching canonical line is
 * `available: false` -- never inferred, never defaulted to a synthetic line.
 *
 * `rawDifference` (projection minus line) is research context only. It is
 * never labeled EV, edge, confidence, a recommendation, or an Over/Under
 * pick anywhere in this module or its consumers.
 */
import type { NflProjectionMarket } from "../types/projectionOutput";
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";

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

const MARKET_TO_CANONICAL_KEY: Record<NflProjectionMarket, keyof NflYardageMarketArtifact["canonical"]> = {
  passing: "passingYards",
  rushing: "rushingYards",
  receiving: "receivingYards",
};

export type NflYardageReviewMarketInfo =
  | {
      available: true;
      line: number;
      book: string;
      overPrice: string;
      underPrice: string;
      /** projectedYards - line. Research context only -- never an edge/EV/pick. */
      rawDifference: number;
      lastUpdate: string;
    }
  | { available: false };

/** Exact-identity join only. Missing/unresolved data always renders as unavailable. */
export function joinMarketLine(
  row: Pick<NflCurrentWeekProjectionRow, "playerId" | "market" | "projectedYards">,
  market: NflYardageMarketArtifact | null,
): NflYardageReviewMarketInfo {
  if (!market) return { available: false };
  const key = MARKET_TO_CANONICAL_KEY[row.market];
  const line = market.canonical[key]?.[row.playerId];
  if (!line || row.projectedYards == null) return { available: false };
  return {
    available: true,
    line: line.point,
    book: line.bookmaker,
    overPrice: line.over,
    underPrice: line.under,
    rawDifference: row.projectedYards - line.point,
    lastUpdate: line.lastUpdate,
  };
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

/** Combines every projection row for one market with its (possibly unavailable) sportsbook line. Pure, no filtering/sorting. */
export function buildYardageReviewRows(
  rows: readonly NflCurrentWeekProjectionRow[],
  market: NflYardageMarketArtifact | null,
): NflYardageReviewRow[] {
  return rows.map((row) => ({
    row,
    marketInfo: joinMarketLine(row, market),
    band: matchupScoreBand(row.matchupScore?.matchupScore ?? null),
  }));
}

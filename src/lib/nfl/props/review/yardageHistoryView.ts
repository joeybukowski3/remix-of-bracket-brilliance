/**
 * Presentation-only selectors over the Last-10 history artifact
 * (`yardageHistory.ts`). Every comparison here is against TODAY'S current
 * sportsbook line, never the historical Vegas Line for that game -- the
 * historical line is contextual only (per the approved spec). No value
 * here ever feeds back into projectedYards, Matchup Score, or any other
 * model input; this module renders history, it does not analyze it.
 */
import type { NflProjectionMarket } from "../types/projectionOutput";
import type {
  NflYardagePlayerHistoryGame,
  NflYardageOpponentHistoryGame,
  NflYardageHistoryArtifact,
} from "../types/yardageHistory";
import { playerHistoryKey, opponentHistoryKey } from "../types/yardageHistory";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";

export function resolvePositionSlice(market: NflProjectionMarket, playerPosition: string): string {
  if (market === "passing") return "QB";
  if (market === "rushing") return playerPosition === "RB" ? "RB" : "ALL";
  return playerPosition;
}

export function lookupPlayerHistory(
  artifact: NflYardageHistoryArtifact | null,
  playerId: string,
  market: NflProjectionMarket,
) {
  if (!artifact) return null;
  return artifact.players[playerHistoryKey(playerId, market)] ?? null;
}

export function lookupOpponentHistory(
  artifact: NflYardageHistoryArtifact | null,
  opponentAbbr: string,
  market: NflProjectionMarket,
  playerPosition: string,
) {
  if (!artifact) return null;
  const position = resolvePositionSlice(market, playerPosition);
  return artifact.teamDefense[opponentHistoryKey(opponentAbbr, market, position)] ?? null;
}

export type NflYardageOverUnderResult = "over" | "under" | "push" | "neutral";

/** Compares one historical actual-yards value against TODAY's current line -- never the historical Vegas Line for that game. */
export function classifyVsCurrentLine(actualYards: number, currentLine: number | null): NflYardageOverUnderResult {
  if (currentLine == null || !Number.isFinite(currentLine)) return "neutral";
  if (actualYards > currentLine) return "over";
  if (actualYards < currentLine) return "under";
  return "push";
}

export type NflYardageLast10Summary = {
  currentLine: number | null;
  over: number;
  under: number;
  push: number;
  sampleSize: number;
  avg: number | null;
  median: number | null;
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function summarize(values: readonly number[], currentLine: number | null): NflYardageLast10Summary {
  let over = 0;
  let under = 0;
  let push = 0;
  for (const value of values) {
    const result = classifyVsCurrentLine(value, currentLine);
    if (result === "over") over += 1;
    else if (result === "under") under += 1;
    else if (result === "push") push += 1;
  }
  return {
    currentLine,
    over,
    under,
    push,
    sampleSize: values.length,
    avg: values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null,
    median: median(values),
  };
}

/** Player Last-10 summary strip: actual yards over/under TODAY's line. */
export function buildPlayerLast10Summary(
  games: readonly NflYardagePlayerHistoryGame[],
  currentLine: number | null,
): NflYardageLast10Summary {
  return summarize(games.map((g) => g.actualYards), currentLine);
}

/** Opponent Last-10 summary strip: yards allowed over/under TODAY's (selected player's) line. */
export function buildOpponentLast10Summary(
  games: readonly NflYardageOpponentHistoryGame[],
  currentLine: number | null,
): NflYardageLast10Summary {
  return summarize(games.map((g) => g.yardsAllowed), currentLine);
}

/** Ordinal rank display ("12th"), shared with the matchup analyzer's rank formatting. */
export function formatRank(rank: number | null): string {
  return formatRankOrdinal(rank) ?? "N/A";
}

export function formatHomeAway(homeAway: "home" | "away" | null): string {
  if (homeAway === "home") return "Home";
  if (homeAway === "away") return "Away";
  return "N/A";
}

export function formatOpponentDisplay(opponentAbbr: string | null, homeAway: "home" | "away" | null): string {
  if (!opponentAbbr) return "N/A";
  const abbr = opponentAbbr.toUpperCase();
  return homeAway === "away" ? `@ ${abbr}` : `vs ${abbr}`;
}

export function formatGameScore(score: { result: "W" | "L" | "T" | null; teamScore: number | null; oppScore: number | null } | null): string {
  if (!score || score.result == null || score.teamScore == null || score.oppScore == null) return "N/A";
  return `${score.result} ${score.teamScore}–${score.oppScore}`;
}

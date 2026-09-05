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

/**
 * Opponent (team-defense) Last-10 table only. `game.homeAway` there is the
 * DEFENSE team's own home/away status for that historical game (see
 * `buildGameLookup` in scripts/lib/nfl-yardage-history-core.mjs, which keys
 * the lookup by the defense team, not the visiting offense) -- so the
 * OPPOSING offense's own field status is the inverse: the defense hosting
 * ("home") means the visiting offense played "@" the defense; the defense
 * traveling ("away") means the offense hosted the defense ("vs"). Returns
 * null -- never a fabricated guess -- when the historical record has no
 * homeAway for that game.
 */
export function formatOpposingOffenseContext(defenseHomeAway: "home" | "away" | null, defenseAbbr: string): string | null {
  if (defenseHomeAway == null) return null;
  const abbr = defenseAbbr.toUpperCase();
  return defenseHomeAway === "home" ? `@ ${abbr}` : `vs ${abbr}`;
}

export function formatGameScore(score: { result: "W" | "L" | "T" | null; teamScore: number | null; oppScore: number | null } | null): string {
  if (!score || score.result == null || score.teamScore == null || score.oppScore == null) return "N/A";
  return `${score.result} ${score.teamScore}–${score.oppScore}`;
}

/**
 * Actual yards minus a comparison average (Opp Yds Allow Avg for the player
 * table's VS OPP AVG, or the opposing player's entering YPG for the opponent
 * table's VS QB/RB/WR/TE AVG). Works even when TODAY's current sportsbook
 * line is unavailable -- this comparison never depends on the current line.
 */
export function computeVsAverageDiff(actualValue: number, comparisonAvg: number | null): number | null {
  if (comparisonAvg == null || !Number.isFinite(comparisonAvg)) return null;
  return actualValue - comparisonAvg;
}

/** positive -> "over" (green), negative -> "under" (red), zero -> "push" (neutral styling), missing -> "neutral". */
export function classifyVsAverageDiff(diff: number | null): NflYardageOverUnderResult {
  if (diff == null || !Number.isFinite(diff)) return "neutral";
  if (diff > 0) return "over";
  if (diff < 0) return "under";
  return "push";
}

export function formatSignedDiff(diff: number | null): string {
  if (diff == null || !Number.isFinite(diff)) return "N/A";
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  return `${sign}${Math.abs(diff).toFixed(1)}`;
}

/** Arithmetic mean over the non-null, finite values only -- nulls are excluded from the denominator, never coerced to zero. */
export function averageExcludingNulls(values: readonly (number | null | undefined)[]): number | null {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((sum, v) => sum + v, 0) / finite.length;
}

export type NflYardagePlayerLast10FooterAverages = {
  oppDefRankAvg: number | null;
  oppYdsAllowAvgAvg: number | null;
  actualYardsAvg: number | null;
  vsOppAvgAvg: number | null;
  /** Keyed by the stat block's own field names (e.g. "completions", "attempts", "rushAttempts", "recTds"). */
  statAverages: Record<string, number | null>;
  vegasLineAvg: number | null;
  sampleSize: number;
};

/** Last-10 footer averages for the Player table. Excludes nulls from every denominator; never fabricates zero. */
export function buildPlayerLast10FooterAverages(
  games: readonly NflYardagePlayerHistoryGame[],
): NflYardagePlayerLast10FooterAverages {
  const statKeys = games.length > 0 ? Object.keys(games[0].stat) : [];
  const statAverages: Record<string, number | null> = {};
  for (const key of statKeys) {
    statAverages[key] = averageExcludingNulls(games.map((g) => (g.stat as unknown as Record<string, number>)[key]));
  }
  return {
    oppDefRankAvg: averageExcludingNulls(games.map((g) => g.oppDefRank)),
    oppYdsAllowAvgAvg: averageExcludingNulls(games.map((g) => g.oppYdsAllowAvg)),
    actualYardsAvg: averageExcludingNulls(games.map((g) => g.actualYards)),
    vsOppAvgAvg: averageExcludingNulls(games.map((g) => computeVsAverageDiff(g.actualYards, g.oppYdsAllowAvg))),
    statAverages,
    vegasLineAvg: averageExcludingNulls(games.map((g) => g.vegasLine)),
    sampleSize: games.length,
  };
}

export type NflYardageOpponentLast10FooterAverages = {
  oppOffRankAvg: number | null;
  oppPlayerYpgAvg: number | null;
  yardsAllowedAvg: number | null;
  vsPlayerAvgAvg: number | null;
  statAverages: Record<string, number | null>;
  vegasLineAvg: number | null;
  sampleSize: number;
};

/** Last-10 footer averages for the Opponent (defense) table. Excludes nulls from every denominator; never fabricates zero. */
export function buildOpponentLast10FooterAverages(
  games: readonly NflYardageOpponentHistoryGame[],
): NflYardageOpponentLast10FooterAverages {
  const statKeys = games.length > 0 ? Object.keys(games[0].stat) : [];
  const statAverages: Record<string, number | null> = {};
  for (const key of statKeys) {
    statAverages[key] = averageExcludingNulls(games.map((g) => (g.stat as unknown as Record<string, number>)[key]));
  }
  return {
    oppOffRankAvg: averageExcludingNulls(games.map((g) => g.oppOffRank)),
    oppPlayerYpgAvg: averageExcludingNulls(games.map((g) => g.oppPlayerYpg)),
    yardsAllowedAvg: averageExcludingNulls(games.map((g) => g.yardsAllowed)),
    vsPlayerAvgAvg: averageExcludingNulls(games.map((g) => computeVsAverageDiff(g.yardsAllowed, g.oppPlayerYpg))),
    statAverages,
    vegasLineAvg: averageExcludingNulls(games.map((g) => g.vegasLine)),
    sampleSize: games.length,
  };
}

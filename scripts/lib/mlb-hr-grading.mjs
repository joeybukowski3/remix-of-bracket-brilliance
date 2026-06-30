/**
 * mlb-hr-grading.mjs
 *
 * Pure grading logic for HR predictions, modeled after the resolution
 * pattern in grade-polymarket-results.mjs but adapted to player-level
 * box-score data.
 *
 * Result statuses:
 *   pending       - game has not started / not yet final
 *   hit           - player recorded >=1 HR
 *   miss          - player played and recorded 0 HR
 *   did_not_play  - player did not appear in the box score (scratch, etc.) — NOT a loss
 *   postponed     - game was postponed
 *   cancelled     - game was cancelled
 *   unresolved    - game is final but the player's box-score line could not be found
 */

export const RESULT_STATUSES = ["pending", "hit", "miss", "did_not_play", "postponed", "cancelled", "unresolved"];

export function classifyGameState(game) {
  const abstract = game?.status?.abstractGameState ?? "";
  const detail = game?.status?.detailedState ?? "";
  if (detail === "Postponed") return "postponed";
  if (detail === "Cancelled") return "cancelled";
  if (abstract === "Final") return "final";
  if (abstract === "Live") return "in_progress";
  return "scheduled";
}

export function findPlayerBattingLine(boxscoreTeam, playerId) {
  if (!boxscoreTeam?.players) return null;
  const entry = boxscoreTeam.players[`ID${playerId}`];
  if (!entry) return null;
  const stat = entry.stats?.batting;
  if (!stat) return null;
  return { stat, gameStatus: entry.gameStatus };
}

/**
 * @param {object} record       archive record (must have gameId, playerId)
 * @param {object} gameSummary  { gameState, boxscoreTeam }
 * @returns {object}  the result object to merge into record.result
 */
export function gradePrediction(record, gameSummary) {
  const { gameState, boxscoreTeam } = gameSummary;

  if (gameState === "postponed") {
    return { status: "postponed", hrCount: null, plateAppearances: null, gameFinalStatus: "Postponed", gradedAt: new Date().toISOString() };
  }
  if (gameState === "cancelled") {
    return { status: "cancelled", hrCount: null, plateAppearances: null, gameFinalStatus: "Cancelled", gradedAt: new Date().toISOString() };
  }
  if (gameState !== "final") {
    return { status: "pending", hrCount: null, plateAppearances: null, gameFinalStatus: null, gradedAt: null };
  }

  const line = findPlayerBattingLine(boxscoreTeam, record.playerId);

  if (!line) {
    return { status: "unresolved", hrCount: null, plateAppearances: null, gameFinalStatus: "Final", gradedAt: new Date().toISOString() };
  }

  const plateAppearances = line.stat.plateAppearances ?? line.stat.atBats ?? 0;

  if (plateAppearances === 0 && (line.stat.atBats ?? 0) === 0) {
    return { status: "did_not_play", hrCount: 0, plateAppearances: 0, gameFinalStatus: "Final", gradedAt: new Date().toISOString() };
  }

  const hrCount = line.stat.homeRuns ?? 0;
  return {
    status: hrCount > 0 ? "hit" : "miss",
    hrCount,
    plateAppearances,
    gameFinalStatus: "Final",
    gradedAt: new Date().toISOString(),
  };
}

export function isGradeable(record) {
  return record?.result?.status === "pending";
}

export function isRegradeIdempotent(record, gameSummary) {
  if (record.result.status === "pending") return true;
  const fresh = gradePrediction({ ...record, result: { status: "pending" } }, gameSummary);
  return fresh.status === record.result.status && fresh.hrCount === record.result.hrCount;
}

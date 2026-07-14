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
 *   suspended     - game was suspended and remains retryable
 *   unresolved_retryable - temporary API/identity/box-score resolution problem
 *   unresolved_terminal  - documented permanent inconsistency
 */

export const RESULT_STATUSES = [
  "pending",
  "hit",
  "miss",
  "did_not_play",
  "postponed",
  "cancelled",
  "suspended",
  "unresolved_retryable",
  "unresolved_terminal",
];

export function classifyGameState(game) {
  const abstract = game?.status?.abstractGameState ?? "";
  const detail = game?.status?.detailedState ?? "";
  if (detail === "Postponed") return "postponed";
  if (detail === "Cancelled") return "cancelled";
  if (abstract === "Final") return "final";
  if (/suspend/i.test(detail)) return "suspended";
  if (abstract === "Live") return "in_progress";
  return "scheduled";
}

export function findPlayerBattingLine(battingLines, playerId) {
  const players = battingLines?.players ?? battingLines;
  if (!players || typeof players !== "object") return null;
  const entry = players[`ID${playerId}`];
  if (!entry) return null;
  const stat = entry.stats?.batting;
  if (!stat) return null;
  return { stat, gameStatus: entry.gameStatus };
}

export function buildCompleteGameSummary(game, boxscore = null) {
  const gameId = game?.gamePk ?? null;
  return {
    gameId,
    gameState: classifyGameState(game),
    detailedState: game?.status?.detailedState ?? null,
    officialGameDate: game?.officialDate ?? null,
    gameStartTime: game?.gameDate ?? null,
    doubleHeader: game?.doubleHeader ?? null,
    gameNumber: game?.gameNumber ?? null,
    homeTeamId: game?.teams?.home?.team?.id ?? boxscore?.teams?.home?.team?.id ?? null,
    awayTeamId: game?.teams?.away?.team?.id ?? boxscore?.teams?.away?.team?.id ?? null,
    homeBattingLines: boxscore?.teams?.home?.players ?? null,
    awayBattingLines: boxscore?.teams?.away?.players ?? null,
    resolutionError: null,
  };
}

function selectBattingLines(record, gameSummary) {
  if (record.teamId != null) {
    if (Number(record.teamId) === Number(gameSummary.homeTeamId)) {
      return { battingLines: gameSummary.homeBattingLines, side: "home", reason: null };
    }
    if (Number(record.teamId) === Number(gameSummary.awayTeamId)) {
      return { battingLines: gameSummary.awayBattingLines, side: "away", reason: null };
    }
    return { battingLines: null, side: null, reason: "team_id_not_in_game" };
  }

  const homeLine = findPlayerBattingLine(gameSummary.homeBattingLines, record.playerId);
  const awayLine = findPlayerBattingLine(gameSummary.awayBattingLines, record.playerId);
  if (homeLine && !awayLine) return { battingLines: gameSummary.homeBattingLines, side: "home", reason: null };
  if (awayLine && !homeLine) return { battingLines: gameSummary.awayBattingLines, side: "away", reason: null };
  if (homeLine && awayLine) return { battingLines: null, side: null, reason: "player_id_present_on_both_teams" };
  return { battingLines: null, side: null, reason: "legacy_team_id_missing_player_absent" };
}

function result(record, status, fields = {}, now = () => new Date()) {
  return {
    status,
    hrCount: fields.hrCount ?? null,
    plateAppearances: fields.plateAppearances ?? null,
    gameFinalStatus: fields.gameFinalStatus ?? null,
    gradedAt: fields.gradedAt === null ? null : fields.gradedAt ?? now().toISOString(),
    resolutionReason: fields.resolutionReason ?? null,
    attemptCount: status === "pending"
      ? record.result?.attemptCount ?? 0
      : (record.result?.attemptCount ?? 0) + 1,
  };
}

/**
 * @param {object} record       archive record (must have gameId, playerId)
 * @param {object} gameSummary  complete home/away game summary
 * @param {{now?: () => Date}} [options]
 * @returns {object}  the result object to merge into record.result
 */
export function gradePrediction(record, gameSummary, { now = () => new Date() } = {}) {
  const summary = gameSummary?.boxscoreTeam
    ? {
        ...gameSummary,
        homeTeamId: record.teamId ?? 1,
        awayTeamId: -1,
        homeBattingLines: gameSummary.boxscoreTeam.players ?? {},
        awayBattingLines: {},
      }
    : gameSummary;
  const { gameState } = summary;

  if (summary?.resolutionError) {
    return result(record, "unresolved_retryable", {
      gameFinalStatus: summary.detailedState ?? null,
      resolutionReason: summary.resolutionError,
    }, now);
  }

  if (gameState === "postponed") {
    return result(record, "postponed", { gameFinalStatus: "Postponed" }, now);
  }
  if (gameState === "cancelled") {
    return result(record, "cancelled", { gameFinalStatus: "Cancelled" }, now);
  }
  if (gameState === "suspended") {
    return result(record, "suspended", {
      gameFinalStatus: summary.detailedState ?? "Suspended",
      resolutionReason: "game_suspended_not_final",
    }, now);
  }
  if (gameState !== "final") {
    return result(record, "pending", { gradedAt: null }, now);
  }

  if (!summary.homeBattingLines || !summary.awayBattingLines) {
    return result(record, "unresolved_retryable", {
      gameFinalStatus: "Final",
      resolutionReason: "final_boxscore_missing_batting_lines",
    }, now);
  }

  const selected = selectBattingLines(record, summary);
  if (selected.reason === "team_id_not_in_game" || selected.reason === "player_id_present_on_both_teams") {
    return result(record, "unresolved_retryable", {
      gameFinalStatus: "Final",
      resolutionReason: selected.reason,
    }, now);
  }

  const line = findPlayerBattingLine(selected.battingLines, record.playerId);

  if (!line && selected.reason === "legacy_team_id_missing_player_absent") {
    return result(record, "unresolved_retryable", {
      gameFinalStatus: "Final",
      resolutionReason: "legacy_team_id_missing_player_absent",
    }, now);
  }

  if (!line) {
    return result(record, "did_not_play", {
      hrCount: 0,
      plateAppearances: 0,
      gameFinalStatus: "Final",
      resolutionReason: "player_absent_from_team_final_batting_lines",
    }, now);
  }

  const plateAppearances = line.stat.plateAppearances ?? line.stat.atBats ?? 0;

  if (plateAppearances === 0 && (line.stat.atBats ?? 0) === 0) {
    return result(record, "did_not_play", { hrCount: 0, plateAppearances: 0, gameFinalStatus: "Final" }, now);
  }

  const hrCount = line.stat.homeRuns ?? 0;
  return result(record, hrCount > 0 ? "hit" : "miss", {
    hrCount,
    plateAppearances,
    gameFinalStatus: "Final",
  }, now);
}

export function isGradeable(record, { regradeUnresolved = false, repairTerminal = false } = {}) {
  const status = record?.result?.status;
  if (repairTerminal) return true;
  if (status === "pending" || status === "suspended" || status === "unresolved_retryable") return true;
  return regradeUnresolved && status === "unresolved";
}

export function isRegradeIdempotent(record, gameSummary) {
  if (isGradeable(record, { regradeUnresolved: true })) return true;
  const fresh = gradePrediction({ ...record, result: { status: "pending" } }, gameSummary);
  return fresh.status === record.result.status && fresh.hrCount === record.result.hrCount;
}

/**
 * mlb-hr-archive.mjs
 *
 * Durable, append-only archive of daily HR predictions, modeled after the
 * existing Polymarket grading/history pattern (grade-polymarket-results.mjs
 * -> public/data/polymarket/history.json), adapted for player-level HR
 * predictions.
 *
 * Dedup key: date|playerId|gameId|modelVersion
 *
 * Behavior:
 *  - New prediction for a key not yet present -> appended
 *  - Same-day rerun for an existing pregame (result.status === "pending")
 *    record -> the record is UPDATED in place (score/odds refreshed) while
 *    the original firstGeneratedAt timestamp is preserved in a runHistory array
 *  - Once a record has been graded (result.status !== "pending"), it is
 *    NEVER overwritten by a fresh generation run
 */

import { assessPredictionTiming, serializePhase2Shadow } from "./mlb-hr-tracking-integrity.mjs";

export function buildArchiveKey(record) {
  return `${record.date}|${record.playerId}|${record.gameId}|${record.modelVersion}`;
}

/**
 * @param {object} params
 * @param {object} params.player
 * @param {string} params.date
 * @param {string} params.generatedAt
 * @param {string} params.modelVersion
 * @param {object} params.confidence
 * @param {object} [params.candidate]
 * @returns {object} archive record
 */
export function buildArchiveRecord({ player, date, generatedAt, modelVersion, confidence, candidate }) {
  const gameStartTime = player.gameStartTime ?? null;
  return {
    date,
    generatedAt,
    modelVersion,
    playerId: player.playerId ?? null,
    playerName: player.player,
    teamId: player.teamId ?? null,
    team: player.team,
    opponentId: player.opponentId ?? null,
    opponent: player.opponent,
    opposingPitcherId: player.opposingPitcherId ?? null,
    opposingPitcherName: player.opposingPitcher,
    lineupStatus: player.lineupStatus ?? "unknown",
    battingOrder: player.battingOrder ?? null,
    gameId: player.gameId ?? null,
    officialGameDate: player.officialGameDate ?? date,
    gameStartTime,
    gameNumber: player.gameNumber ?? null,
    doubleHeader: player.doubleHeader ?? null,

    hrQualityScore: player.hrScore,
    hrRank: player.hrScoreRank,

    componentInputs: {
      barrelRate: player.barrelRate,
      hardHitRate: player.hardHitRate,
      xba: player.xba,
      whiffRate: player.whiffRate,
      iso: player.iso,
      exitVelo: player.exitVelo,
      pullRate: player.pullRate,
      last7HR: player.last7HR,
      last30HR: player.last30HR,
      parkFactor: player.parkFactor,
      weatherBoost: player.weatherBoost,
      pitcherHrVulnerability: player.opposingPitcherHrVs,
      pitcherXera: player.pitcherXera,
      pitcherRegressionScore: player.pitcherRegressionScore,
      pitcherFlyBallRate: player.pitcherFlyBallRate,
    },

    hrOddsYes: player.hrOddsYes ?? null,
    hrLine: player.hrLine ?? null,
    hrOddsBook: player.hrOddsBook ?? null,
    marketImpliedProbability: player.hrImplied ?? null,
    oddsCapturedAt: player.hrOddsCapturedAt ?? null,
    oddsSourceSlateDate: player.hrOddsSlateDate ?? null,
    oddsMarket: player.hrOddsYes != null ? "player_home_runs" : null,

    candidateHrQualityScore: candidate?.candidateHrQualityScore ?? null,
    candidateRank: candidate?.candidateRank ?? null,
    candidateModelVersion: candidate?.candidateModelVersion ?? null,

    phase2Shadow: serializePhase2Shadow(player),

    dataCompletenessPercent: confidence?.dataCompletenessPercent ?? null,
    confidenceLevel: confidence?.confidenceLevel ?? null,
    confidenceReasons: confidence?.confidenceReasons ?? [],
    explanation: player.explanation ?? null,
    starterConfirmationStatus: player.starterConfirmed ? "confirmed" : "probable",
    lineupCapturedAt: generatedAt,
    timing: assessPredictionTiming(generatedAt, gameStartTime),

    result: {
      status: "pending",
      hrCount: null,
      plateAppearances: null,
      gameFinalStatus: null,
      gradedAt: null,
      resolutionReason: null,
      attemptCount: 0,
    },

    firstGeneratedAt: generatedAt,
    runHistory: [generatedAt],
  };
}

/**
 * @param {object[]} existingRecords
 * @param {object} newRecord
 * @returns {{ records: object[], action: "appended"|"updated"|"skipped_graded"|"preserved_pregame" }}
 */
export function upsertArchiveRecord(existingRecords, newRecord) {
  const key = buildArchiveKey(newRecord);
  const idx = existingRecords.findIndex((r) => buildArchiveKey(r) === key);

  if (idx === -1) {
    return { records: [...existingRecords, newRecord], action: "appended" };
  }

  const existing = existingRecords[idx];

  if (existing.result?.status && existing.result.status !== "pending") {
    return { records: existingRecords, action: "skipped_graded" };
  }

  if (existing.timing?.eligibleForEvaluation === true && newRecord.timing?.timingStatus === "post_start") {
    const records = [...existingRecords];
    records[idx] = {
      ...existing,
      runHistory: [...(existing.runHistory ?? []), newRecord.generatedAt],
      excludedPredictionRuns: [
        ...(existing.excludedPredictionRuns ?? []),
        {
          generatedAt: newRecord.generatedAt,
          timingStatus: newRecord.timing.timingStatus,
          exclusionReason: newRecord.timing.exclusionReason,
        },
      ],
    };
    return { records, action: "preserved_pregame" };
  }

  const updated = {
    ...newRecord,
    firstGeneratedAt: existing.firstGeneratedAt ?? newRecord.firstGeneratedAt,
    runHistory: [...(existing.runHistory ?? []), newRecord.generatedAt],
    result: existing.result,
  };

  const records = [...existingRecords];
  records[idx] = updated;
  return { records, action: "updated" };
}

/**
 * @returns {{ records: object[], appended: number, updated: number, skippedGraded: number, preservedPregame: number }}
 */
export function mergeArchiveBatch(existingRecords, newRecords) {
  let records = existingRecords;
  let appended = 0, updated = 0, skippedGraded = 0, preservedPregame = 0;
  for (const rec of newRecords) {
    const result = upsertArchiveRecord(records, rec);
    records = result.records;
    if (result.action === "appended") appended++;
    else if (result.action === "updated") updated++;
    else if (result.action === "preserved_pregame") preservedPregame++;
    else skippedGraded++;
  }
  return { records, appended, updated, skippedGraded, preservedPregame };
}

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
  return {
    date,
    generatedAt,
    modelVersion,
    playerId: player.playerId ?? null,
    playerName: player.player,
    team: player.team,
    opponent: player.opponent,
    opposingPitcherId: player.opposingPitcherId ?? null,
    opposingPitcherName: player.opposingPitcher,
    lineupStatus: player.lineupStatus ?? "unknown",
    battingOrder: player.battingOrder ?? null,
    gameId: player.gameId ?? null,

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
    },

    hrOddsYes: player.hrOddsYes ?? null,
    hrOddsBook: player.hrOddsBook ?? null,
    marketImpliedProbability: player.hrImplied ?? null,

    candidateHrQualityScore: candidate?.candidateHrQualityScore ?? null,
    candidateRank: candidate?.candidateRank ?? null,
    candidateModelVersion: candidate?.candidateModelVersion ?? null,

    dataCompletenessPercent: confidence?.dataCompletenessPercent ?? null,
    confidenceLevel: confidence?.confidenceLevel ?? null,
    confidenceReasons: confidence?.confidenceReasons ?? [],
    explanation: player.explanation ?? null,
    starterConfirmationStatus: player.starterConfirmed ? "confirmed" : "probable",

    result: {
      status: "pending",
      hrCount: null,
      plateAppearances: null,
      gameFinalStatus: null,
      gradedAt: null,
    },

    firstGeneratedAt: generatedAt,
    runHistory: [generatedAt],
  };
}

/**
 * @param {object[]} existingRecords
 * @param {object} newRecord
 * @returns {{ records: object[], action: "appended"|"updated"|"skipped_graded" }}
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
 * @returns {{ records: object[], appended: number, updated: number, skippedGraded: number }}
 */
export function mergeArchiveBatch(existingRecords, newRecords) {
  let records = existingRecords;
  let appended = 0, updated = 0, skippedGraded = 0;
  for (const rec of newRecords) {
    const result = upsertArchiveRecord(records, rec);
    records = result.records;
    if (result.action === "appended") appended++;
    else if (result.action === "updated") updated++;
    else skippedGraded++;
  }
  return { records, appended, updated, skippedGraded };
}

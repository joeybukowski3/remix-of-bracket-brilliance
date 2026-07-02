/**
 * mlb-ml-archive.mjs
 *
 * Durable, append-only archive of daily Moneyline predictions, mirroring
 * scripts/lib/mlb-hr-archive.mjs's structure and upsert/merge behavior.
 *
 * Dedup key: date|gameId|modelVersion
 *
 * Behavior:
 *  - New prediction for a key not yet present -> appended
 *  - Same-day rerun for an existing pregame (result.status === "pending")
 *    record -> the record is UPDATED in place while the original
 *    firstGeneratedAt timestamp is preserved in a runHistory array
 *  - Once a record has been graded (result.status !== "pending"), it is
 *    NEVER overwritten by a fresh generation run
 */

export function buildArchiveKey(record) {
  return `${record.date}|${record.gameId}|${record.modelVersion}`;
}

/**
 * @param {object} params
 * @param {object} params.pick        one entry from ml-picks-raw.json's picks[]
 * @param {string} params.date
 * @param {string} params.generatedAt
 * @param {string} params.modelVersion
 * @returns {object} archive record
 */
export function buildArchiveRecord({ pick, date, generatedAt, modelVersion }) {
  return {
    date,
    generatedAt,
    modelVersion,
    gameId: pick.gameId ?? null,
    gameKey: pick.gameKey,

    pick: pick.pick,
    pickAbbr: pick.pickAbbr,
    confidence: pick.confidence,
    differential: pick.differential,
    topFactor: pick.topFactor ?? null,
    factors: pick.factors ?? [],

    // priceAtPick / polymarketAtPick: captured ONLY at first archiving of
    // this key (see upsertArchiveRecord) -- the price when we FIRST made
    // this pick. Never overwritten by same-day reruns.
    priceAtPick: pick.priceAtPick ?? null,
    polymarketAtPick: pick.polymarketAtPick ?? null,

    // latestPriceSeen / latestPolymarketSeen: refreshed on EVERY same-day
    // rerun. At grading time, latestPriceSeen becomes the sportsbook
    // "closing line" PROXY (see mlb-ml-grading.mjs) -- the last sportsbook
    // price observed before first pitch, not a continuous closing-line
    // feed. Polymarket CLV instead uses the exact snapshot time-series
    // (see grading), so latestPolymarketSeen is kept only for visibility/
    // debugging, not as the CLV source.
    latestPriceSeen: pick.priceAtPick ?? null,
    latestPolymarketSeen: pick.polymarketAtPick ?? null,

    result: {
      status: "pending",
      actualWinnerAbbr: null,
      finalScore: null,
      gameFinalStatus: null,
      closingLine: null,
      clv: null,
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

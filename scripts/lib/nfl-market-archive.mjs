/**
 * Time-varying archive of canonical NFL yardage-market observations
 * (Phase 10B). Every distinct (market, player, book) line/price change is
 * preserved as its own record for future line-movement / CLV analysis
 * (Phase 11) -- successive refreshes must never collapse into one row.
 *
 * The archive file itself is append-only JSONL, one observation per line,
 * written chronologically. This module only decides WHICH new observations
 * are worth appending (something changed) and reconstructs the
 * "last known observation per line" state by replaying the file.
 */

export function archiveKey(observation) {
  return `${observation.canonicalMarket}|${observation.playerId}|${observation.bookmaker}`;
}

/** Replays already-parsed archive records into a map of the last observation per (market, player, book). Append-only + chronological means the last record read for a key IS the current state. */
export function loadLastObservations(archiveRecords) {
  const lastByKey = new Map();
  for (const record of Array.isArray(archiveRecords) ? archiveRecords : []) {
    lastByKey.set(archiveKey(record), record);
  }
  return lastByKey;
}

function linesChanged(prev, next) {
  if (!prev) return true;
  return prev.point !== next.point || prev.overPrice !== next.overPrice || prev.underPrice !== next.underPrice;
}

/**
 * @param {object[]} currentObservations  This refresh's canonical selections, normalized to archive-record shape.
 * @param {Map<string, object>} lastByKey  From `loadLastObservations` of the existing archive.
 * @returns {object[]} Only the observations whose point/price actually moved (or are new).
 */
export function selectNewArchiveObservations(currentObservations, lastByKey) {
  const toAppend = [];
  for (const observation of currentObservations) {
    const prev = lastByKey.get(archiveKey(observation));
    if (linesChanged(prev, observation)) toAppend.push(observation);
  }
  return toAppend;
}

export function parseArchiveJsonl(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function toArchiveJsonlLines(records) {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(ROOT, "public", "data", "mlb", "strikeout-prop-details.json");
const payload = JSON.parse(readFileSync(input, "utf8"));
const details = Array.isArray(payload?.details) ? payload.details : [];

const totals = {
  totalPitcherRecords: details.length,
  startsFound: 0,
  rowsWithHitsAllowed: 0,
  rowsWithPitchCount: 0,
  rowsWithSite: 0,
  completeHomeSeasonSplits: 0,
  completeAwaySeasonSplits: 0,
  pitchersWithFiveHomeStarts: 0,
  pitchersWithFiveAwayStarts: 0,
  unmatchedPitcherIds: 0,
  duplicateGameLogs: 0,
  staleRecords: 0,
  statsApiFailures: 0,
};

const nullCounts = {
  gamePk: 0,
  pitcherId: 0,
  teamId: 0,
  opponentId: 0,
  hitsAllowed: 0,
  pitchCount: 0,
  site: 0,
  outsRecorded: 0,
};
const reasons = {};
function addReason(reason) { reasons[reason] = (reasons[reason] ?? 0) + 1; }

for (const detail of details) {
  const starts = detail.pitcherRecentStarts ?? detail.pitcherLastFiveStarts ?? [];
  totals.startsFound += starts.length;
  totals.rowsWithHitsAllowed += starts.filter((row) => row.hitsAllowed != null).length;
  totals.rowsWithPitchCount += starts.filter((row) => row.pitchCount != null).length;
  totals.rowsWithSite += starts.filter((row) => row.site != null).length;
  totals.duplicateGameLogs += detail.completeness?.duplicateGameLogs ?? 0;
  if (detail.pitcherId == null) totals.unmatchedPitcherIds += 1;
  if (detail.slateDate !== payload.date && detail.gameDate !== payload.date) totals.staleRecords += 1;
  if ((detail.sourceWarnings ?? []).includes("API_REQUEST_FAILED")) totals.statsApiFailures += 1;

  for (const field of ["gamePk", "pitcherId", "teamId", "opponentId"]) if (detail[field] == null) nullCounts[field] += 1;
  for (const row of starts) {
    for (const field of ["hitsAllowed", "pitchCount", "site", "outsRecorded"]) {
      if (row[field] == null) nullCounts[field] += 1;
    }
    if (row.hitsAllowed == null) addReason("source field absent");
    if (row.pitchCount == null) addReason("source field absent");
    if (row.site == null) addReason("missing site");
    if (row.outsRecorded == null) addReason("invalid innings");
  }

  const home = detail.pitcherVenueSplits?.home;
  const away = detail.pitcherVenueSplits?.away;
  if (home?.season?.totalOuts != null && home.season.strikeouts != null && home.season.hitsAllowed != null) totals.completeHomeSeasonSplits += 1;
  if (away?.season?.totalOuts != null && away.season.strikeouts != null && away.season.hitsAllowed != null) totals.completeAwaySeasonSplits += 1;
  if ((home?.lastFiveAtSite?.gamesUsed ?? 0) >= 5) totals.pitchersWithFiveHomeStarts += 1;
  else addReason("insufficient sample");
  if ((away?.lastFiveAtSite?.gamesUsed ?? 0) >= 5) totals.pitchersWithFiveAwayStarts += 1;
  else addReason("insufficient sample");
  for (const warning of detail.sourceWarnings ?? []) addReason(String(warning).toLowerCase().replaceAll("_", " "));
}

console.log(JSON.stringify({ date: payload.date ?? null, generatedAt: payload.generatedAt ?? null, totals, nullCounts, missingDataReasons: reasons }, null, 2));
if (!details.length) process.exitCode = 1;

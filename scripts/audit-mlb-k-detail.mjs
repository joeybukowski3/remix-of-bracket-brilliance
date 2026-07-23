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
  homeSeasonBattersFacedComplete: 0,
  awaySeasonBattersFacedComplete: 0,
  homeRecentBattersFacedComplete: 0,
  awayRecentBattersFacedComplete: 0,
  homeSeasonKRateComplete: 0,
  awaySeasonKRateComplete: 0,
  homeSeasonHitRateComplete: 0,
  awaySeasonHitRateComplete: 0,
  homeRecentKRateComplete: 0,
  awayRecentKRateComplete: 0,
  homeRecentHitRateComplete: 0,
  awayRecentHitRateComplete: 0,
  opponentAvgFooterPopulated: 0,
  unmatchedPitcherIds: 0,
  duplicateGameLogs: 0,
  duplicateRecentStarts: 0,
  sameDayOrFutureStarts: 0,
  staleRecords: 0,
  statsApiFailures: 0,
  recordsWithGameStableKey: 0,
  recordsWithTeamStableKey: 0,
  recordsWithBothStableKeys: 0,
  stableKeyCollisions: 0,
  ambiguousLegacyKeys: 0,
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
const stableKeyCounts = new Map();
const legacyKeyCounts = new Map();

for (const detail of details) {
  const starts = detail.pitcherRecentStarts ?? detail.pitcherLastFiveStarts ?? [];
  totals.startsFound += starts.length;
  totals.rowsWithHitsAllowed += starts.filter((row) => row.hitsAllowed != null).length;
  totals.rowsWithPitchCount += starts.filter((row) => row.pitchCount != null).length;
  totals.rowsWithSite += starts.filter((row) => row.site != null).length;
  totals.duplicateGameLogs += detail.completeness?.duplicateGameLogs ?? 0;
  if (detail.pitcherId == null) totals.unmatchedPitcherIds += 1;
  if (detail.slateDate !== payload.date && detail.gameDate !== payload.date) totals.staleRecords += 1;
  if ((detail.sourceWarnings ?? []).some((warning) => String(warning).includes("API_REQUEST_FAILED"))) totals.statsApiFailures += 1;

  const stableKeys = new Set([
    ...(Array.isArray(detail.stableKeys) ? detail.stableKeys : []),
    detail.stableKey,
  ].filter((key) => typeof key === "string" && key.length > 0));
  const gameStableKey = detail.slateDate && detail.gamePk != null && detail.pitcherId != null
    ? `${detail.slateDate}|${detail.gamePk}|${detail.pitcherId}`
    : null;
  const teamStableKey = detail.slateDate && detail.pitcherId != null && detail.teamId != null && detail.opponentId != null
    ? `${detail.slateDate}|${detail.pitcherId}|${detail.teamId}|${detail.opponentId}`
    : null;
  const hasGameStableKey = gameStableKey != null && stableKeys.has(gameStableKey);
  const hasTeamStableKey = teamStableKey != null && stableKeys.has(teamStableKey);
  if (hasGameStableKey) totals.recordsWithGameStableKey += 1;
  else addReason("missing gamePk stable key");
  if (hasTeamStableKey) totals.recordsWithTeamStableKey += 1;
  else addReason("missing team/opponent stable key");
  if (hasGameStableKey && hasTeamStableKey) totals.recordsWithBothStableKeys += 1;
  for (const key of stableKeys) stableKeyCounts.set(key, (stableKeyCounts.get(key) ?? 0) + 1);
  const legacyKey = detail.legacyKey ?? detail.key;
  if (legacyKey) legacyKeyCounts.set(legacyKey, (legacyKeyCounts.get(legacyKey) ?? 0) + 1);

  for (const field of ["gamePk", "pitcherId", "teamId", "opponentId"]) if (detail[field] == null) nullCounts[field] += 1;
  const recentKeys = new Set();
  for (const row of starts) {
    for (const field of ["hitsAllowed", "pitchCount", "site", "outsRecorded"]) {
      if (row[field] == null) nullCounts[field] += 1;
    }
    if (row.hitsAllowed == null) addReason("hitsAllowed: source field absent");
    if (row.pitchCount == null) addReason("pitchCount: numberOfPitches/pitchesThrown absent");
    if (row.site == null) addReason("site: isHome absent");
    if (row.outsRecorded == null) addReason("outsRecorded: inningsPitched invalid");
    if (row.date && payload.date && row.date >= payload.date) totals.sameDayOrFutureStarts += 1;
    const recentKey = row.gamePk != null ? String(row.gamePk) : `${row.date}|${row.opponentId ?? row.opponent}|${row.site}`;
    if (recentKeys.has(recentKey)) totals.duplicateRecentStarts += 1;
    recentKeys.add(recentKey);
  }

  const home = detail.pitcherVenueSplits?.home;
  const away = detail.pitcherVenueSplits?.away;
  const homeSeasonGames = home?.season?.gamesUsed ?? 0;
  const awaySeasonGames = away?.season?.gamesUsed ?? 0;
  const homeRecentGames = home?.lastFiveAtSite?.gamesUsed ?? 0;
  const awayRecentGames = away?.lastFiveAtSite?.gamesUsed ?? 0;
  if (home?.season?.totalOuts != null && home.season.strikeouts != null && home.season.hitsAllowed != null) totals.completeHomeSeasonSplits += 1;
  else if (homeSeasonGames === 0) addReason("home split: no starts");
  else addReason("home split: incomplete source totals");
  if (away?.season?.totalOuts != null && away.season.strikeouts != null && away.season.hitsAllowed != null) totals.completeAwaySeasonSplits += 1;
  else if (awaySeasonGames === 0) addReason("away split: no starts");
  else addReason("away split: incomplete source totals");
  if ((home?.lastFiveAtSite?.gamesUsed ?? 0) >= 5) totals.pitchersWithFiveHomeStarts += 1;
  else if (homeSeasonGames > 0) addReason("home split: fewer than five starts");
  if ((away?.lastFiveAtSite?.gamesUsed ?? 0) >= 5) totals.pitchersWithFiveAwayStarts += 1;
  else if (awaySeasonGames > 0) addReason("away split: fewer than five starts");

  // Batters-faced and K%/Hit% completeness -- a zero-start sample (no starts at that site yet) is a
  // legitimate empty sample, not missing source data, so it is only flagged when starts exist.
  if (home?.season?.battersFaced != null) totals.homeSeasonBattersFacedComplete += 1;
  else if (homeSeasonGames > 0) addReason("home season BF: source field absent");
  if (away?.season?.battersFaced != null) totals.awaySeasonBattersFacedComplete += 1;
  else if (awaySeasonGames > 0) addReason("away season BF: source field absent");
  if (home?.lastFiveAtSite?.battersFaced != null) totals.homeRecentBattersFacedComplete += 1;
  else if (homeRecentGames > 0) addReason("home recent BF: source field absent");
  if (away?.lastFiveAtSite?.battersFaced != null) totals.awayRecentBattersFacedComplete += 1;
  else if (awayRecentGames > 0) addReason("away recent BF: source field absent");

  if (home?.season?.strikeoutRate != null) totals.homeSeasonKRateComplete += 1;
  else if (homeSeasonGames > 0) addReason("home season K%: batters faced unavailable");
  if (away?.season?.strikeoutRate != null) totals.awaySeasonKRateComplete += 1;
  else if (awaySeasonGames > 0) addReason("away season K%: batters faced unavailable");
  if (home?.season?.hitRate != null) totals.homeSeasonHitRateComplete += 1;
  else if (homeSeasonGames > 0) addReason("home season Hit%: batters faced unavailable");
  if (away?.season?.hitRate != null) totals.awaySeasonHitRateComplete += 1;
  else if (awaySeasonGames > 0) addReason("away season Hit%: batters faced unavailable");

  if (home?.lastFiveAtSite?.strikeoutRate != null) totals.homeRecentKRateComplete += 1;
  else if (homeRecentGames > 0) addReason("home recent K%: batters faced unavailable");
  if (away?.lastFiveAtSite?.strikeoutRate != null) totals.awayRecentKRateComplete += 1;
  else if (awayRecentGames > 0) addReason("away recent K%: batters faced unavailable");
  if (home?.lastFiveAtSite?.hitRate != null) totals.homeRecentHitRateComplete += 1;
  else if (homeRecentGames > 0) addReason("home recent Hit%: batters faced unavailable");
  if (away?.lastFiveAtSite?.hitRate != null) totals.awayRecentHitRateComplete += 1;
  else if (awayRecentGames > 0) addReason("away recent Hit%: batters faced unavailable");

  const opponentSummary = detail.opponentLastFiveVsStartersSummary;
  const opponentGamesUsed = opponentSummary?.gamesUsed ?? 0;
  if (opponentGamesUsed > 0 && opponentSummary?.totalOpposingStarterOuts != null && opponentSummary?.averageOpposingStarterStrikeouts != null) {
    totals.opponentAvgFooterPopulated += 1;
  } else if (opponentGamesUsed > 0) {
    addReason("opponent AVG footer: incomplete canonical summary");
  }

  for (const warning of detail.sourceWarnings ?? []) addReason(String(warning).toLowerCase().replaceAll("_", " "));
}

totals.stableKeyCollisions = Array.from(stableKeyCounts.values()).filter((count) => count > 1).length;
totals.ambiguousLegacyKeys = Array.from(legacyKeyCounts.values()).filter((count) => count > 1).length;
const passed = details.length > 0
  && totals.staleRecords === 0
  && totals.statsApiFailures === 0
  && totals.sameDayOrFutureStarts === 0
  && totals.duplicateRecentStarts === 0
  && totals.stableKeyCollisions === 0
  && totals.recordsWithBothStableKeys === details.length;

console.log(JSON.stringify({ passed, date: payload.date ?? null, generatedAt: payload.generatedAt ?? null, totals, nullCounts, missingDataReasons: reasons }, null, 2));
if (!passed) process.exitCode = 1;

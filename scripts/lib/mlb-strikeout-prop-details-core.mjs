import { mlbInningsToOuts, outsToMlbInnings } from "./mlb-baseball-innings.mjs";
import { summarizeOpponentLastFiveVsStarters } from "./mlb-k-recent-averages.mjs";

function normalizeKeySegment(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildStrikeoutPropDetailKey({ pitcher, team, opponent, gameDate }) {
  return [pitcher, team, opponent, gameDate].map(normalizeKeySegment).join("|");
}

function stableId(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildStrikeoutPropStableKeys({ slateDate, gamePk, pitcherId, teamId, opponentId }) {
  const keys = [];
  const normalizedGamePk = stableId(gamePk);
  const normalizedPitcherId = stableId(pitcherId);
  const normalizedTeamId = stableId(teamId);
  const normalizedOpponentId = stableId(opponentId);
  if (slateDate && normalizedGamePk != null && normalizedPitcherId != null) {
    keys.push(`${slateDate}|${normalizedGamePk}|${normalizedPitcherId}`);
  }
  if (slateDate && normalizedPitcherId != null && normalizedTeamId != null && normalizedOpponentId != null) {
    keys.push(`${slateDate}|${normalizedPitcherId}|${normalizedTeamId}|${normalizedOpponentId}`);
  }
  return keys;
}

export function buildStrikeoutPropStableKey(identifiers) {
  return buildStrikeoutPropStableKeys(identifiers)[0] ?? null;
}

function finite(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value) {
  const parsed = finite(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function inningsString(value) {
  if (value == null || value === "") return null;
  const text = String(value);
  return mlbInningsToOuts(text) == null ? null : text;
}

/** Preserve the compact main-branch fallback shape for legacy callers/artifacts. */
export function buildPitcherLastFiveStarts(starts) {
  return (starts ?? []).map((start) => ({
    date: start?.date ?? null,
    opponent: start?.opponentAbbr ?? null,
    inningsPitched: start?.inningsPitched == null || start.inningsPitched === "" ? null : String(start.inningsPitched),
    strikeouts: finite(start?.strikeouts),
  }));
}

function sumNullable(rows, key) {
  const values = rows.map((row) => finite(row?.[key])).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function ratePerNine(total, totalOuts) {
  return total == null || totalOuts == null || totalOuts <= 0 ? null : (total * 27) / totalOuts;
}

export function normalizePitcherStart(start) {
  const inningsPitched = inningsString(start?.inningsPitched);
  const outsRecorded = integer(start?.outsRecorded ?? mlbInningsToOuts(inningsPitched));
  const isHome = typeof start?.isHome === "boolean" ? start.isHome : null;
  return {
    gamePk: integer(start?.gamePk),
    season: integer(start?.season),
    date: typeof start?.date === "string" ? start.date.slice(0, 10) : null,
    opponentId: integer(start?.opponentId),
    opponentAbbr: typeof start?.opponentAbbr === "string" ? start.opponentAbbr : null,
    opponent: typeof start?.opponentAbbr === "string" ? start.opponentAbbr : null,
    isHome,
    site: isHome === true ? "home" : isHome === false ? "away" : null,
    inningsPitched,
    outsRecorded,
    strikeouts: integer(start?.strikeouts),
    hitsAllowed: integer(start?.hitsAllowed),
    pitchCount: integer(start?.pitchCount),
    battersFaced: integer(start?.battersFaced),
    gamesStarted: integer(start?.gamesStarted),
  };
}

export function dedupePitcherStarts(starts, pitcherId = null) {
  const seen = new Set();
  const duplicateKeys = [];
  const rows = [];
  for (const raw of starts ?? []) {
    const row = normalizePitcherStart(raw);
    const key = row.gamePk != null ? `${row.gamePk}|${pitcherId ?? "unknown"}` : `${row.date}|${row.opponentId ?? row.opponentAbbr}|${row.site}`;
    if (seen.has(key)) {
      duplicateKeys.push(key);
      continue;
    }
    seen.add(key);
    rows.push(row);
  }
  return { rows, duplicateKeys };
}

export function buildPitcherLastFiveSummary(starts) {
  const rows = (starts ?? []).slice(0, 5).map(normalizePitcherStart);
  const validOutsRows = rows.filter((row) => row.outsRecorded != null && row.outsRecorded > 0);
  const totalOuts = validOutsRows.length ? validOutsRows.reduce((sum, row) => sum + row.outsRecorded, 0) : null;
  const totalStrikeouts = sumNullable(rows, "strikeouts");
  const totalHitsAllowed = sumNullable(rows, "hitsAllowed");
  const pitchCounts = rows.map((row) => row.pitchCount).filter((value) => value != null);
  return {
    gamesUsed: rows.length,
    totalOuts,
    averageInningsOuts: totalOuts == null || rows.length === 0 ? null : totalOuts / rows.length,
    totalStrikeouts,
    averageStrikeouts: totalStrikeouts == null || rows.length === 0 ? null : totalStrikeouts / rows.length,
    totalHitsAllowed,
    hitsPerNine: ratePerNine(totalHitsAllowed, totalOuts),
    strikeoutsPerNine: ratePerNine(totalStrikeouts, totalOuts),
    averagePitchCount: pitchCounts.length ? pitchCounts.reduce((sum, value) => sum + value, 0) / pitchCounts.length : null,
  };
}

/** Rate (0-100) from batters faced: only rows with both a valid BF and a valid numerator count, so a missing metric on one row doesn't skew the denominator for another. */
function rateFromBattersFaced(rows, numeratorKey) {
  const eligible = rows.filter((row) => row.battersFaced != null && row.battersFaced > 0 && row[numeratorKey] != null);
  if (!eligible.length) return null;
  const totalNumerator = eligible.reduce((sum, row) => sum + row[numeratorKey], 0);
  const totalBattersFaced = eligible.reduce((sum, row) => sum + row.battersFaced, 0);
  return totalBattersFaced > 0 ? (totalNumerator / totalBattersFaced) * 100 : null;
}

function buildVenueTotals(rows) {
  const totalOuts = sumNullable(rows, "outsRecorded");
  const battersFacedRows = rows.filter((row) => row.battersFaced != null);
  return {
    gamesUsed: rows.length,
    totalOuts,
    inningsPitched: totalOuts == null ? null : outsToMlbInnings(totalOuts),
    strikeouts: sumNullable(rows, "strikeouts"),
    hitsAllowed: sumNullable(rows, "hitsAllowed"),
    battersFaced: battersFacedRows.length ? battersFacedRows.reduce((sum, row) => sum + row.battersFaced, 0) : null,
    strikeoutRate: rateFromBattersFaced(rows, "strikeouts"),
    hitRate: rateFromBattersFaced(rows, "hitsAllowed"),
  };
}

export function buildPitcherVenueSplit(site, currentSeasonStarts) {
  const rows = (currentSeasonStarts ?? []).map(normalizePitcherStart).filter((row) => row.site === site);
  return {
    site,
    season: buildVenueTotals(rows),
    lastFiveAtSite: buildVenueTotals(rows.slice(0, 5)),
  };
}

export function buildPitcherDetails(starts, { pitcherId = null, season = null } = {}) {
  const { rows, duplicateKeys } = dedupePitcherStarts(starts, pitcherId);
  const currentSeasonStarts = rows
    .filter((row) => season == null || row.season == null || row.season === season)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const recentStarts = currentSeasonStarts.slice(0, 5);
  const warnings = [];
  if (duplicateKeys.length) warnings.push("DUPLICATE_GAME_LOG");
  if (!currentSeasonStarts.length) warnings.push("NO_MATCHING_GAME_LOG");
  if (currentSeasonStarts.some((row) => row.outsRecorded == null)) warnings.push("INVALID_INNINGS");
  if (currentSeasonStarts.some((row) => row.site == null)) warnings.push("MISSING_SITE");
  return {
    recentStarts,
    recentSummary: buildPitcherLastFiveSummary(recentStarts),
    venueSplits: {
      home: buildPitcherVenueSplit("home", currentSeasonStarts),
      away: buildPitcherVenueSplit("away", currentSeasonStarts),
    },
    diagnostics: {
      recentStartsRequested: 5,
      recentStartsFound: recentStarts.length,
      rowsWithHitsAllowed: recentStarts.filter((row) => row.hitsAllowed != null).length,
      rowsWithPitchCount: recentStarts.filter((row) => row.pitchCount != null).length,
      rowsWithSite: recentStarts.filter((row) => row.site != null).length,
      homeSeasonGames: currentSeasonStarts.filter((row) => row.site === "home").length,
      awaySeasonGames: currentSeasonStarts.filter((row) => row.site === "away").length,
      homeLastFiveGames: Math.min(5, currentSeasonStarts.filter((row) => row.site === "home").length),
      awayLastFiveGames: Math.min(5, currentSeasonStarts.filter((row) => row.site === "away").length),
      duplicateGameLogs: duplicateKeys.length,
      warnings,
    },
  };
}

export function buildOpponentLastFiveGames(games) {
  return (games ?? []).map((game) => ({
    date: game?.date ?? null,
    opponent: game?.opponent ?? null,
    opposingStartingPitcher: game?.opposingStartingPitcher ?? null,
    opposingStarterInningsPitched: game?.opposingStarterInningsPitched == null ? null : String(game.opposingStarterInningsPitched),
    opposingStarterStrikeouts: finite(game?.opposingStarterStrikeouts),
    teamTotalStrikeouts: finite(game?.teamTotalStrikeouts),
  }));
}

export function buildStrikeoutPropDetail({
  pitcher,
  team,
  opponent,
  gameDate,
  slateDate = gameDate,
  gamePk = null,
  pitcherId = null,
  teamId = null,
  opponentId = null,
  pitcherStarts = [],
  pitcherLastFiveStarts = [],
  opponentLastFiveGames,
  sourceWarnings = [],
  generatedAt,
  source,
}) {
  const pitcherDetails = buildPitcherDetails(pitcherStarts.length ? pitcherStarts : pitcherLastFiveStarts, {
    pitcherId,
    season: Number(String(slateDate).slice(0, 4)),
  });
  const legacyKey = buildStrikeoutPropDetailKey({ pitcher, team, opponent, gameDate: slateDate });
  const stableKeys = buildStrikeoutPropStableKeys({ slateDate, gamePk, pitcherId, teamId, opponentId });
  const normalizedOpponentLastFiveGames = buildOpponentLastFiveGames(opponentLastFiveGames);
  return {
    key: legacyKey,
    legacyKey,
    stableKey: stableKeys[0] ?? null,
    stableKeys,
    slateDate: slateDate ?? null,
    gamePk: integer(gamePk),
    pitcherId: integer(pitcherId),
    teamId: integer(teamId),
    opponentId: integer(opponentId),
    pitcher,
    team,
    opponent,
    gameDate: slateDate ?? null,
    pitcherLastFiveStarts: pitcherDetails.recentStarts,
    pitcherRecentStarts: pitcherDetails.recentStarts,
    pitcherLastFiveSummary: pitcherDetails.recentSummary,
    pitcherVenueSplits: pitcherDetails.venueSplits,
    opponentLastFiveGames: normalizedOpponentLastFiveGames,
    opponentLastFiveVsStartersSummary: summarizeOpponentLastFiveVsStarters(normalizedOpponentLastFiveGames),
    sourceWarnings: [...sourceWarnings, ...pitcherDetails.diagnostics.warnings],
    completeness: pitcherDetails.diagnostics,
    generatedAt,
    source,
  };
}

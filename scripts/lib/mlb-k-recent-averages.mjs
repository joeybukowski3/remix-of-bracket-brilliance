import { mlbInningsToOuts, outsToDecimalInnings } from "./mlb-baseball-innings.mjs";

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number == null || number < 0 ? null : number;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function divide(top, bottom) {
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom > 0 ? top / bottom : null;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

export function summarizePitcherLastFiveStarts(starts = []) {
  const rows = (starts ?? []).map((start, index) => {
    const outs = mlbInningsToOuts(start?.inningsPitched);
    const strikeouts = nonNegativeNumber(start?.strikeouts);
    const battersFaced = nonNegativeNumber(start?.battersFaced);
    const pitchCount = nonNegativeNumber(start?.pitchCount ?? start?.pitches);
    const valid = outs != null && outs > 0 && strikeouts != null;

    return {
      index,
      date: start?.date ?? null,
      opponent: start?.opponent ?? start?.opponentAbbr ?? null,
      outs,
      innings: outsToDecimalInnings(outs),
      strikeouts,
      battersFaced,
      pitchCount,
      valid,
    };
  });
  const validRows = rows.filter((row) => row.valid);
  const totalOuts = validRows.reduce((sum, row) => sum + row.outs, 0);
  const totalStrikeouts = validRows.reduce((sum, row) => sum + row.strikeouts, 0);
  const bfRows = validRows.filter((row) => row.battersFaced != null);
  const pitchRows = validRows.filter((row) => row.pitchCount != null);
  const totalBf = bfRows.reduce((sum, row) => sum + row.battersFaced, 0);

  return {
    gamesAvailable: rows.length,
    gamesUsed: validRows.length,
    sampleCounts: {
      innings: validRows.length,
      strikeouts: validRows.length,
      battersFaced: bfRows.length,
      pitchCount: pitchRows.length,
    },
    totalOuts: validRows.length ? totalOuts : null,
    averageInnings: validRows.length ? outsToDecimalInnings(totalOuts) / validRows.length : null,
    averageStrikeouts: validRows.length ? totalStrikeouts / validRows.length : null,
    recentK9: totalOuts > 0 ? (totalStrikeouts / outsToDecimalInnings(totalOuts)) * 9 : null,
    recentKRate: totalBf > 0 ? totalStrikeouts / totalBf : null,
    averageBattersFaced: average(bfRows.map((row) => row.battersFaced)),
    averagePitchCount: average(pitchRows.map((row) => row.pitchCount)),
    rows,
  };
}

export function summarizeOpponentLastFiveVsStarters(games = []) {
  const rows = (games ?? []).map((game, index) => {
    const opposingStarterOuts = mlbInningsToOuts(game?.opposingStarterInningsPitched);
    const opposingStarterStrikeouts = nonNegativeNumber(game?.opposingStarterStrikeouts);
    const teamStrikeouts = nonNegativeNumber(game?.teamTotalStrikeouts);
    const plateAppearances = nonNegativeNumber(game?.teamPlateAppearances);
    const whiffRate = nonNegativeNumber(game?.teamWhiffRate ?? game?.whiffRate);
    const valid = opposingStarterOuts != null && opposingStarterOuts > 0 && opposingStarterStrikeouts != null;

    return {
      index,
      date: game?.date ?? null,
      opponent: game?.opponent ?? null,
      opposingStartingPitcher: game?.opposingStartingPitcher ?? null,
      opposingStarterOuts,
      opposingStarterInnings: outsToDecimalInnings(opposingStarterOuts),
      opposingStarterStrikeouts,
      teamStrikeouts,
      plateAppearances,
      whiffRate,
      valid,
    };
  });
  const validRows = rows.filter((row) => row.valid);
  const totalOuts = validRows.reduce((sum, row) => sum + row.opposingStarterOuts, 0);
  const totalStarterKs = validRows.reduce((sum, row) => sum + row.opposingStarterStrikeouts, 0);
  const teamStrikeoutRows = validRows.filter((row) => row.teamStrikeouts != null);
  const paRows = validRows.filter((row) => row.teamStrikeouts != null && row.plateAppearances != null);
  const whiffRows = validRows.filter((row) => row.whiffRate != null);
  const totalTeamKs = teamStrikeoutRows.reduce((sum, row) => sum + row.teamStrikeouts, 0);
  const totalPa = paRows.reduce((sum, row) => sum + row.plateAppearances, 0);

  return {
    gamesAvailable: rows.length,
    gamesUsed: validRows.length,
    sampleCounts: {
      opposingStarterInnings: validRows.length,
      opposingStarterStrikeouts: validRows.length,
      teamStrikeouts: teamStrikeoutRows.length,
      plateAppearances: paRows.length,
      whiffRate: whiffRows.length,
    },
    averageOpposingStarterInnings: validRows.length ? outsToDecimalInnings(totalOuts) / validRows.length : null,
    averageOpposingStarterStrikeouts: validRows.length ? totalStarterKs / validRows.length : null,
    averageTeamStrikeouts: average(teamStrikeoutRows.map((row) => row.teamStrikeouts)),
    recentTeamKRate: divide(totalTeamKs, totalPa),
    recentWhiffRate: average(whiffRows.map((row) => row.whiffRate)),
    rows,
  };
}

export function sanitizeRecentSummary(summary) {
  return JSON.parse(JSON.stringify(summary, (_key, value) => finiteOrNull(value) ?? value));
}

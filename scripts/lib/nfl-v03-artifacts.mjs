/**
 * Pure Stage-1 artifact composition for nfl-power-v0.3.0.
 *
 * Callers provide checked-in schedules, results, weekly source text, and any
 * previously published owner-maintained entries. This module performs no file
 * access and never mutates supplied inputs.
 */

import {
  aggregateAdvancedTeamMetrics,
  computeAdvancedTeamMetricsForTeamWeeks,
  parseAdvancedTeamStatRows,
} from "./nfl-advanced-stats.mjs";
import {
  NFL_POWER_V03_FORMULA_WEIGHTS,
  NFL_POWER_V03_MODEL_VERSION,
  NFL_POWER_V03_POOLED_DIVISOR,
  NFL_POWER_V03_TRAJECTORY,
  NFL_POWER_V03_TRAJECTORY_THRESHOLDS,
  adjustDefensiveEpaPerPlay,
  adjustOffensiveEpaPerPlay,
  adjustPointDifferentialPerGame,
  calculateComposite,
  calculateTrajectoryTerm,
  clampTrajectoryDelta,
  classifyTrajectoryWithScheduleContext,
  getScheduleContextModifiers,
  invertDefensiveValue,
  leagueMeanAndStandardDeviation,
  rankRatings,
  shrinkTrajectoryDelta,
  stableZScore,
  toPublicRating,
} from "./nfl-power-v03-metrics.mjs";
import {
  NFL_V03_WINDOW_ORDERING_METHOD,
  buildFlaggedGameViews,
  buildTeamFinalEightWindows,
  calculateActiveAdjustmentTotal,
  findWeek18AnomalyCandidates,
  isAdjustmentActive,
  validateContextFlags,
  validateManualAdjustments,
} from "./nfl-v03-window-engine.mjs";
import { toNflJsonFileString } from "./nfl-data-meta.mjs";

export const NFL_V03_ARTIFACT_SCHEMA_VERSION = "nfl-v0.2";
export const NFL_V03_VALIDATION_STATUS = "stage-1";
export const NFL_V03_SOURCE_SEASONS = Object.freeze([2022, 2023, 2024, 2025]);
export const NFL_V03_PERFORMANCE_SEASONS = Object.freeze([2022, 2023, 2024, 2025, 2026]);
export const NFL_V03_PRESEASON_SEASONS = Object.freeze([2023, 2024, 2025, 2026]);
export const NFL_V03_METRIC_KEYS = Object.freeze([
  "offEpaPerPlay",
  "defEpaPerPlay",
  "netEpaPerPlay",
  "pointDiffPerGame",
]);
export const NFL_V03_ADJUSTMENT_METHODS = Object.freeze({
  margin: "game-level one-pass residual",
  epa: "opponent-mean one-pass",
});

const SOURCE_LABEL =
  "checked-in NFL results and immutable nflverse stats_team weekly cache, regular season only";
const FORBIDDEN_ARTIFACT_LANGUAGE =
  /\b(betting|odds?|moneyline|spread|markets?|picks?|probabilit(?:y|ies)|edge)\b/i;
const PYTHAGOREAN_EXPONENT = 2.37;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, digits = 6) =>
  isFiniteNumber(value) ? Number(value.toFixed(digits)) : value;
const clone = (value) => JSON.parse(JSON.stringify(value));

function requireIsoTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`generatedAt must be a valid ISO timestamp, got ${value}`);
  }
  return value;
}

function canonicalTeams(teamsJson) {
  const teams = teamsJson?.teams;
  if (!Array.isArray(teams) || teams.length !== 32) {
    throw new Error("teams.json is malformed: expected 32 canonical teams");
  }
  const ids = new Set();
  const abbrs = new Set();
  for (const team of teams) {
    for (const field of ["id", "slug", "abbr", "name", "nflverseAbbr"]) {
      if (typeof team?.[field] !== "string" || team[field].trim() === "") {
        throw new Error(`teams.json has a team with invalid ${field}`);
      }
    }
    if (ids.has(team.id)) throw new Error(`Duplicate canonical team id ${team.id}`);
    if (abbrs.has(team.abbr)) throw new Error(`Duplicate canonical team abbreviation ${team.abbr}`);
    ids.add(team.id);
    abbrs.add(team.abbr);
  }
  return teams.map((team) => ({ ...team }));
}

function metadata({ season, generatedAt, artifact, notes = [], knownLimitations = [] }) {
  return {
    schemaVersion: NFL_V03_ARTIFACT_SCHEMA_VERSION,
    modelVersion: NFL_POWER_V03_MODEL_VERSION,
    validationStatus: NFL_V03_VALIDATION_STATUS,
    generatedAt: requireIsoTimestamp(generatedAt),
    season,
    source: SOURCE_LABEL,
    notes: [`Internal Stage-1 ${artifact} artifact.`, ...notes],
    knownLimitations: [...knownLimitations],
    formulaWeights: { ...NFL_POWER_V03_FORMULA_WEIGHTS },
    frozenPublicScaleDivisor: NFL_POWER_V03_POOLED_DIVISOR,
    trajectory: {
      statement: "lambda = 0",
      lambda: NFL_POWER_V03_TRAJECTORY.lambda,
      shrinkageK: NFL_POWER_V03_TRAJECTORY.shrinkageK,
      cap: NFL_POWER_V03_TRAJECTORY.cap,
    },
  };
}

function metricValue(raw, adjusted, zScore) {
  const missing = !isFiniteNumber(raw) || !isFiniteNumber(adjusted) || !isFiniteNumber(zScore);
  return {
    raw: missing ? null : round(raw),
    adjusted: missing ? null : round(adjusted),
    zScore: missing ? null : round(zScore),
    rank: null,
    missing,
  };
}

function missingMetrics() {
  return Object.fromEntries(
    NFL_V03_METRIC_KEYS.map((key) => [key, metricValue(null, null, null)])
  );
}

function completedRegularResults(results, teamAbbrs, season) {
  if (!Array.isArray(results)) throw new Error(`${season} results must be an array`);
  const seen = new Set();
  return results
    .filter((result) => result?.seasonType === "REG" && result.final === true)
    .map((result) => {
      if (result.season !== season) {
        throw new Error(`Result ${result.gameId} has season ${result.season}, expected ${season}`);
      }
      if (typeof result.gameId !== "string" || result.gameId === "") {
        throw new Error(`${season} result requires gameId`);
      }
      if (seen.has(result.gameId)) throw new Error(`Duplicate result ${result.gameId}`);
      seen.add(result.gameId);
      if (!teamAbbrs.has(result.homeAbbr)) {
        throw new Error(`Unknown team abbreviation "${result.homeAbbr}" in result ${result.gameId}`);
      }
      if (!teamAbbrs.has(result.awayAbbr)) {
        throw new Error(`Unknown team abbreviation "${result.awayAbbr}" in result ${result.gameId}`);
      }
      if (!Number.isInteger(result.homeScore) || !Number.isInteger(result.awayScore)) {
        throw new Error(`Result ${result.gameId} requires integer scores`);
      }
      return { ...result };
    });
}

function joinCompletedGames(games, results, teamAbbrs, season) {
  if (!Array.isArray(games)) throw new Error(`${season} games must be an array`);
  const scheduleById = new Map();
  for (const game of games) {
    if (!game || typeof game.gameId !== "string" || game.gameId === "") {
      throw new Error(`${season} schedule game requires gameId`);
    }
    if (scheduleById.has(game.gameId)) throw new Error(`Duplicate schedule game ${game.gameId}`);
    scheduleById.set(game.gameId, game);
  }
  return completedRegularResults(results, teamAbbrs, season).map((result) => {
    const game = scheduleById.get(result.gameId);
    if (!game) throw new Error(`Missing schedule row for completed result ${result.gameId}`);
    if (!teamAbbrs.has(game.homeAbbr) || !teamAbbrs.has(game.awayAbbr)) {
      throw new Error(`Unknown schedule abbreviation in game ${game.gameId}`);
    }
    if (game.homeAbbr !== result.homeAbbr || game.awayAbbr !== result.awayAbbr) {
      throw new Error(`Schedule/result team mismatch for ${game.gameId}`);
    }
    return { ...game, ...result, status: "final", final: true };
  });
}

function marginForTeam(game, abbr) {
  if (game.homeAbbr === abbr) return game.homeScore - game.awayScore;
  if (game.awayAbbr === abbr) return game.awayScore - game.homeScore;
  throw new Error(`${abbr} is not in game ${game.gameId}`);
}

function opponentForTeam(game, abbr) {
  if (game.homeAbbr === abbr) return game.awayAbbr;
  if (game.awayAbbr === abbr) return game.homeAbbr;
  throw new Error(`${abbr} is not in game ${game.gameId}`);
}

function recordRows(teams, completedGames, season) {
  const rows = new Map(
    teams.map((team) => [
      team.abbr,
      {
        teamId: team.id,
        slug: team.slug,
        abbr: team.abbr,
        name: team.name,
        season,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ])
  );
  for (const game of completedGames) {
    const home = rows.get(game.homeAbbr);
    const away = rows.get(game.awayAbbr);
    home.gamesPlayed += 1;
    away.gamesPlayed += 1;
    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;
    if (game.homeScore === game.awayScore) {
      home.ties += 1;
      away.ties += 1;
    } else if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }
  return rows;
}

function pythagoreanExpectedWins(row) {
  if (row.gamesPlayed === 0 || row.pointsFor + row.pointsAgainst === 0) return null;
  const forPower = row.pointsFor ** PYTHAGOREAN_EXPONENT;
  const againstPower = row.pointsAgainst ** PYTHAGOREAN_EXPONENT;
  return round(row.gamesPlayed * (forPower / (forPower + againstPower)), 3);
}

function distribution(rows, getter) {
  const values = rows.map(getter);
  if (values.some((value) => !isFiniteNumber(value))) return null;
  return leagueMeanAndStandardDeviation(values);
}

function rankMetricCollections(rows, key, getter = (row) => row.metrics) {
  const ordered = rows
    .filter((row) => isFiniteNumber(getter(row)?.[key]?.zScore))
    .slice()
    .sort(
      (a, b) =>
        getter(b)[key].zScore - getter(a)[key].zScore || a.abbr.localeCompare(b.abbr)
    );
  const ranks = new Map(ordered.map((row, index) => [row.abbr, index + 1]));
  for (const row of rows) getter(row)[key].rank = ranks.get(row.abbr) ?? null;
}

function calculateRawComposite(raw, stats) {
  return calculateComposite({
    offensiveZ: stableZScore(raw.offEpaPerPlay, stats.offEpaPerPlay),
    defensiveZ: stableZScore(invertDefensiveValue(raw.defEpaPerPlay), stats.defEpaPerPlay),
    pointDifferentialZ: stableZScore(raw.pointDiffPerGame, stats.pointDiffPerGame),
  });
}

function buildFullSeason({ season, teams, games, results, weeklyCsvText, generatedAt }) {
  const teamAbbrs = new Set(teams.map((team) => team.abbr));
  const completedGames = joinCompletedGames(games, results, teamAbbrs, season);
  const commonMeta = metadata({
    season,
    generatedAt,
    artifact: "full-season team metrics",
    notes: [
      "Only completed regular-season games and REG weekly rows are included.",
      "Win percentage is display-only and is not scored.",
      `Pythagorean expected wins use exponent ${PYTHAGOREAN_EXPONENT}.`,
    ],
    knownLimitations:
      season === 2026
        ? ["No completed 2026 results or weekly source rows are available; team metrics are empty."]
        : season === 2022
          ? ["The cancelled 2022 Week 17 BUF-CIN game is absent from the upstream results."]
          : [],
  });
  if (completedGames.length === 0) {
    if (weeklyCsvText) {
      throw new Error(`${season} has weekly source text but no completed regular-season results`);
    }
    return {
      artifact: {
        _meta: commonMeta,
        adjustmentMethods: { ...NFL_V03_ADJUSTMENT_METHODS },
        metricKeys: [...NFL_V03_METRIC_KEYS],
        teams: [],
      },
      internal: { completedGames, teams: [], fullDistributions: null },
    };
  }
  if (typeof weeklyCsvText !== "string" || weeklyCsvText.length === 0) {
    throw new Error(`${season} completed results require a committed weekly source CSV`);
  }

  const parsedRows = parseAdvancedTeamStatRows(weeklyCsvText, { teams }, {
    season,
    seasonType: "REG",
  });
  const advanced = aggregateAdvancedTeamMetrics(parsedRows, {
    season,
    teamsJson: { teams },
    seasonType: "REG",
  });
  if (advanced.size !== 32) throw new Error(`${season} weekly source did not aggregate to 32 teams`);

  const records = recordRows(teams, completedGames, season);
  const rawRows = teams.map((team) => {
    const record = records.get(team.abbr);
    const advancedRow = advanced.get(team.abbr);
    if (!advancedRow) throw new Error(`${season} weekly source missing ${team.abbr}`);
    if (advancedRow.gamesRepresented !== record.gamesPlayed) {
      throw new Error(
        `${season} ${team.abbr} weekly games ${advancedRow.gamesRepresented} do not match completed results ${record.gamesPlayed}`
      );
    }
    return {
      ...record,
      advanced: advancedRow,
      raw: {
        offEpaPerPlay: advancedRow.offensiveEpaPerPlay,
        defEpaPerPlay: advancedRow.defensiveEpaPerPlay,
        netEpaPerPlay: advancedRow.netEpaPerPlay,
        pointDiffPerGame:
          record.gamesPlayed === 0
            ? null
            : (record.pointsFor - record.pointsAgainst) / record.gamesPlayed,
      },
    };
  });
  const rawByAbbr = new Map(rawRows.map((row) => [row.abbr, row]));
  const leagueDefensiveMean =
    rawRows.reduce((sum, row) => sum + row.raw.defEpaPerPlay, 0) / rawRows.length;
  const leagueOffensiveMean =
    rawRows.reduce((sum, row) => sum + row.raw.offEpaPerPlay, 0) / rawRows.length;
  const leagueMarginMean =
    rawRows.reduce((sum, row) => sum + row.raw.pointDiffPerGame, 0) / rawRows.length;

  for (const row of rawRows) {
    const teamGames = completedGames.filter(
      (game) => game.homeAbbr === row.abbr || game.awayAbbr === row.abbr
    );
    const opponents = teamGames.map((game) => rawByAbbr.get(opponentForTeam(game, row.abbr)));
    row.adjusted = {
      offEpaPerPlay: adjustOffensiveEpaPerPlay(
        row.raw.offEpaPerPlay,
        opponents.map((opponent) => opponent.raw.defEpaPerPlay),
        leagueDefensiveMean
      ),
      defEpaPerPlay: adjustDefensiveEpaPerPlay(
        row.raw.defEpaPerPlay,
        opponents.map((opponent) => opponent.raw.offEpaPerPlay),
        leagueOffensiveMean
      ),
      pointDiffPerGame: adjustPointDifferentialPerGame(
        teamGames.map((game) => ({
          pointDifferential: marginForTeam(game, row.abbr),
          opponentPointDifferentialPerGame:
            rawByAbbr.get(opponentForTeam(game, row.abbr)).raw.pointDiffPerGame,
        })),
        leagueMarginMean
      ),
    };
    row.adjusted.netEpaPerPlay =
      row.adjusted.offEpaPerPlay - row.adjusted.defEpaPerPlay;
  }

  const fullDistributions = {
    raw: {
      offEpaPerPlay: distribution(rawRows, (row) => row.raw.offEpaPerPlay),
      defEpaPerPlay: distribution(rawRows, (row) => invertDefensiveValue(row.raw.defEpaPerPlay)),
      netEpaPerPlay: distribution(rawRows, (row) => row.raw.netEpaPerPlay),
      pointDiffPerGame: distribution(rawRows, (row) => row.raw.pointDiffPerGame),
    },
    adjusted: {
      offEpaPerPlay: distribution(rawRows, (row) => row.adjusted.offEpaPerPlay),
      defEpaPerPlay: distribution(
        rawRows,
        (row) => invertDefensiveValue(row.adjusted.defEpaPerPlay)
      ),
      netEpaPerPlay: distribution(rawRows, (row) => row.adjusted.netEpaPerPlay),
      pointDiffPerGame: distribution(rawRows, (row) => row.adjusted.pointDiffPerGame),
    },
  };

  const outputTeams = rawRows.map((row) => {
    const expectedWins = pythagoreanExpectedWins(row);
    const metrics = {
      offEpaPerPlay: metricValue(
        row.raw.offEpaPerPlay,
        row.adjusted.offEpaPerPlay,
        stableZScore(row.adjusted.offEpaPerPlay, fullDistributions.adjusted.offEpaPerPlay)
      ),
      defEpaPerPlay: metricValue(
        row.raw.defEpaPerPlay,
        row.adjusted.defEpaPerPlay,
        stableZScore(
          invertDefensiveValue(row.adjusted.defEpaPerPlay),
          fullDistributions.adjusted.defEpaPerPlay
        )
      ),
      netEpaPerPlay: metricValue(
        row.raw.netEpaPerPlay,
        row.adjusted.netEpaPerPlay,
        stableZScore(row.adjusted.netEpaPerPlay, fullDistributions.adjusted.netEpaPerPlay)
      ),
      pointDiffPerGame: metricValue(
        row.raw.pointDiffPerGame,
        row.adjusted.pointDiffPerGame,
        stableZScore(
          row.adjusted.pointDiffPerGame,
          fullDistributions.adjusted.pointDiffPerGame
        )
      ),
    };
    const adjustedComposite = calculateComposite({
      offensiveZ: metrics.offEpaPerPlay.zScore,
      defensiveZ: metrics.defEpaPerPlay.zScore,
      pointDifferentialZ: metrics.pointDiffPerGame.zScore,
    });
    const rawComposite = calculateRawComposite(row.raw, fullDistributions.raw);
    return {
      teamId: row.teamId,
      slug: row.slug,
      abbr: row.abbr,
      name: row.name,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      winPercentage: round((row.wins + 0.5 * row.ties) / row.gamesPlayed),
      winPercentageScored: false,
      metrics,
      passingEpaPerPlay: row.advanced.passingEpaPerPlay,
      rushingEpaPerPlay: row.advanced.rushingEpaPerPlay,
      pythagoreanExpectedWins: expectedWins,
      expectedWinsDelta: round(row.wins + 0.5 * row.ties - expectedWins, 3),
      adjustedComposite: round(adjustedComposite),
      rawComposite: round(rawComposite),
    };
  });
  for (const key of NFL_V03_METRIC_KEYS) rankMetricCollections(outputTeams, key);

  return {
    artifact: {
      _meta: commonMeta,
      adjustmentMethods: { ...NFL_V03_ADJUSTMENT_METHODS },
      metricKeys: [...NFL_V03_METRIC_KEYS],
      teams: outputTeams,
    },
    internal: {
      completedGames,
      teams: outputTeams,
      rawRows,
      rawByAbbr,
      fullDistributions,
      leagueMeans: {
        offensiveEpaPerPlay: leagueOffensiveMean,
        defensiveEpaPerPlay: leagueDefensiveMean,
        pointDifferentialPerGame: leagueMarginMean,
      },
      weeklyCsvText,
    },
  };
}

function metricsForGames({ season, team, selectedGames, fullInternal, teamsJson }) {
  if (selectedGames.length === 0) return { metrics: missingMetrics(), rawComposite: null, adjustedComposite: null };
  const keys = selectedGames.map((game) => ({ season, week: game.week, team }));
  const advanced = computeAdvancedTeamMetricsForTeamWeeks(
    fullInternal.weeklyCsvText,
    season,
    teamsJson,
    keys
  ).get(team);
  if (!advanced) throw new Error(`${season} final window did not aggregate ${team}`);
  if (advanced.gamesRepresented !== selectedGames.length) {
    throw new Error(`${season} ${team} selected EPA rows do not match its window size`);
  }
  const opponents = selectedGames.map((game) =>
    fullInternal.rawByAbbr.get(opponentForTeam(game, team))
  );
  const raw = {
    offEpaPerPlay: advanced.offensiveEpaPerPlay,
    defEpaPerPlay: advanced.defensiveEpaPerPlay,
    netEpaPerPlay: advanced.netEpaPerPlay,
    pointDiffPerGame:
      selectedGames.reduce((sum, game) => sum + marginForTeam(game, team), 0) /
      selectedGames.length,
  };
  const adjusted = {
    offEpaPerPlay: adjustOffensiveEpaPerPlay(
      raw.offEpaPerPlay,
      opponents.map((opponent) => opponent.raw.defEpaPerPlay),
      fullInternal.leagueMeans.defensiveEpaPerPlay
    ),
    defEpaPerPlay: adjustDefensiveEpaPerPlay(
      raw.defEpaPerPlay,
      opponents.map((opponent) => opponent.raw.offEpaPerPlay),
      fullInternal.leagueMeans.offensiveEpaPerPlay
    ),
    pointDiffPerGame: adjustPointDifferentialPerGame(
      selectedGames.map((game) => ({
        pointDifferential: marginForTeam(game, team),
        opponentPointDifferentialPerGame:
          fullInternal.rawByAbbr.get(opponentForTeam(game, team)).raw.pointDiffPerGame,
      })),
      fullInternal.leagueMeans.pointDifferentialPerGame
    ),
  };
  adjusted.netEpaPerPlay = adjusted.offEpaPerPlay - adjusted.defEpaPerPlay;
  const metrics = {
    offEpaPerPlay: metricValue(
      raw.offEpaPerPlay,
      adjusted.offEpaPerPlay,
      stableZScore(adjusted.offEpaPerPlay, fullInternal.fullDistributions.adjusted.offEpaPerPlay)
    ),
    defEpaPerPlay: metricValue(
      raw.defEpaPerPlay,
      adjusted.defEpaPerPlay,
      stableZScore(
        invertDefensiveValue(adjusted.defEpaPerPlay),
        fullInternal.fullDistributions.adjusted.defEpaPerPlay
      )
    ),
    netEpaPerPlay: metricValue(
      raw.netEpaPerPlay,
      adjusted.netEpaPerPlay,
      stableZScore(adjusted.netEpaPerPlay, fullInternal.fullDistributions.adjusted.netEpaPerPlay)
    ),
    pointDiffPerGame: metricValue(
      raw.pointDiffPerGame,
      adjusted.pointDiffPerGame,
      stableZScore(
        adjusted.pointDiffPerGame,
        fullInternal.fullDistributions.adjusted.pointDiffPerGame
      )
    ),
  };
  return {
    metrics,
    rawComposite: calculateRawComposite(raw, fullInternal.fullDistributions.raw),
    adjustedComposite: calculateComposite({
      offensiveZ: metrics.offEpaPerPlay.zScore,
      defensiveZ: metrics.defEpaPerPlay.zScore,
      pointDifferentialZ: metrics.pointDiffPerGame.zScore,
    }),
  };
}

function screenFlags({ season, completedGames, teamsJson }) {
  const gameById = new Map(completedGames.map((game) => [game.gameId, game]));
  return findWeek18AnomalyCandidates(completedGames, teamsJson).map((candidate) => {
    const game = gameById.get(candidate.gameId);
    return {
      gameId: candidate.gameId,
      team: candidate.team,
      flag: "week18-anomaly",
      origin: "screen",
      source: `public/data/nfl/${season}/results.json`,
      enteredBy: "nfl-v03-week18-screen",
      date: game.dateUtc.slice(0, 10),
      note: `Week 18 margin screen: actual ${round(candidate.actualMargin, 3)}, prior mean ${round(candidate.priorMeanMargin, 3)}, prior standard deviation ${round(candidate.priorStandardDeviation, 3)}, threshold 2.`,
    };
  });
}

function mergeContextFlags(existingEntries, generatedEntries, teamsJson) {
  const existing = validateContextFlags(existingEntries ?? [], teamsJson);
  if (!existing.valid) throw new Error(`Malformed context-flags artifact: ${existing.errors.join("; ")}`);
  const keys = new Set(
    existing.normalizedEntries.map(
      (entry) => `${entry.gameId}|${entry.team}|${entry.flag}|${entry.origin}`
    )
  );
  const merged = existing.normalizedEntries.map((entry) => ({ ...entry }));
  for (const entry of generatedEntries) {
    const key = `${entry.gameId}|${entry.team}|${entry.flag}|${entry.origin}`;
    if (!keys.has(key)) {
      merged.push(entry);
      keys.add(key);
    }
  }
  const validated = validateContextFlags(merged, teamsJson);
  if (!validated.valid) throw new Error(`Generated context flags are invalid: ${validated.errors.join("; ")}`);
  return validated.normalizedEntries;
}

function buildContextArtifact({ season, completedGames, teamsJson, existingEntries, generatedAt }) {
  const flags = mergeContextFlags(
    existingEntries,
    screenFlags({ season, completedGames, teamsJson }),
    teamsJson
  );
  return {
    _meta: metadata({
      season,
      generatedAt,
      artifact: "context flags",
      notes: [
        "Screen entries are review candidates and never exclude games.",
        "Only confirmed manual entries can affect the alternate final-eight view.",
      ],
      knownLimitations:
        season === 2026
          ? ["No completed 2026 results are available, so no screen entries exist."]
          : [],
    }),
    flags,
  };
}

function buildFinalEight({ season, teams, full, contextArtifact, generatedAt }) {
  const meta = metadata({
    season,
    generatedAt,
    artifact: "final-eight team metrics",
    notes: [
      `Windows use ${NFL_V03_WINDOW_ORDERING_METHOD}.`,
      "Playoffs are excluded; Week 18 is included when it is among the last eight completed games.",
      "Window z-scores use the full-season league distributions.",
      "L8 opponent strength is the mean full-season adjusted composite of the selected opponents.",
      "The alternate flagged view never replaces canonical metrics.",
    ],
    knownLimitations:
      season === 2026
        ? ["No completed 2026 results or weekly source rows are available; team metrics are empty."]
        : [],
  });
  if (full.internal.teams.length === 0) {
    return {
      _meta: meta,
      adjustmentMethods: { ...NFL_V03_ADJUSTMENT_METHODS },
      metricKeys: [...NFL_V03_METRIC_KEYS],
      teams: [],
    };
  }
  const teamsJson = { teams };
  const windows = buildTeamFinalEightWindows(full.internal.completedGames, teamsJson);
  const fullByAbbr = new Map(full.artifact.teams.map((team) => [team.abbr, team]));
  const rows = windows.map((window) => {
    const fullTeam = fullByAbbr.get(window.team);
    const flags = contextArtifact.flags.filter((flag) => flag.team === window.team);
    const views = buildFlaggedGameViews(window.windowGames, flags);
    const canonical = metricsForGames({
      season,
      team: window.team,
      selectedGames: views.coreWindowGames,
      fullInternal: full.internal,
      teamsJson,
    });
    const alternate = metricsForGames({
      season,
      team: window.team,
      selectedGames: views.alternateGames,
      fullInternal: full.internal,
      teamsJson,
    });
    const rawDelta = canonical.rawComposite - fullTeam.rawComposite;
    const adjustedDelta = canonical.adjustedComposite - fullTeam.adjustedComposite;
    const trajectoryShrunk = shrinkTrajectoryDelta(
      canonical.adjustedComposite,
      fullTeam.adjustedComposite,
      window.windowSize
    );
    const trajectoryClamped = clampTrajectoryDelta(trajectoryShrunk);
    const opponents = window.windowGames.map((game) =>
      fullByAbbr.get(opponentForTeam(game, window.team)).adjustedComposite
    );
    const l8OpponentStrength =
      opponents.reduce((sum, value) => sum + value, 0) / opponents.length;
    return {
      teamId: fullTeam.teamId,
      slug: fullTeam.slug,
      abbr: fullTeam.abbr,
      name: fullTeam.name,
      windowGames: window.windowGames.map((game) => game.gameId),
      windowSize: window.windowSize,
      shortWindow: window.shortWindow,
      l8OpponentStrength: round(l8OpponentStrength),
      contextFlags: flags.map((flag) => ({ ...flag })),
      canonicalMetricsLabel: "canonical",
      metrics: canonical.metrics,
      metricsExFlaggedLabel: "alternateExcludingConfirmedManualFlags",
      metricsExFlagged: alternate.metrics,
      alternateExcludedGameIds:
        views.alternateExcludingConfirmedFlags.excludedGameIds.slice(),
      rawComposite: round(canonical.rawComposite),
      adjustedComposite: round(canonical.adjustedComposite),
      rawDelta: round(rawDelta),
      adjustedDelta: round(adjustedDelta),
      rawVsAdjGap: round(rawDelta - adjustedDelta),
      trajectoryRaw: round(adjustedDelta),
      trajectoryShrunk: round(trajectoryShrunk),
      trajectoryClamped: round(trajectoryClamped),
      trajectoryLabel: classifyTrajectoryWithScheduleContext(rawDelta, adjustedDelta),
      modifiers: getScheduleContextModifiers(rawDelta, adjustedDelta),
      triggers: {
        rawDelta: round(rawDelta),
        adjustedDelta: round(adjustedDelta),
        lateRiser: NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateRiser,
        lateDecline: NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateDecline,
        scheduleInflatedAdjustedMaximum:
          NFL_POWER_V03_TRAJECTORY_THRESHOLDS.scheduleInflatedAdjustedMaximum,
        scheduleMaskedAdjustedMinimum:
          NFL_POWER_V03_TRAJECTORY_THRESHOLDS.scheduleMaskedAdjustedMinimum,
        scheduleModifierGap: NFL_POWER_V03_TRAJECTORY_THRESHOLDS.scheduleModifierGap,
      },
    };
  });
  for (const key of NFL_V03_METRIC_KEYS) {
    rankMetricCollections(rows, key, (row) => row.metrics);
    rankMetricCollections(rows, key, (row) => row.metricsExFlagged);
  }
  return {
    _meta: meta,
    adjustmentMethods: { ...NFL_V03_ADJUSTMENT_METHODS },
    metricKeys: [...NFL_V03_METRIC_KEYS],
    teams: rows.sort((a, b) => a.abbr.localeCompare(b.abbr)),
  };
}

function validateExistingManualArtifact(existing, targetSeason) {
  if (existing == null) return [];
  if (!existing || typeof existing !== "object" || !Array.isArray(existing.entries)) {
    throw new Error(`Malformed ${targetSeason} manual-adjustments artifact`);
  }
  return existing.entries;
}

function buildManualArtifact({ targetSeason, teamsJson, existing, generatedAt }) {
  const entries = validateExistingManualArtifact(existing, targetSeason);
  const validated = validateManualAdjustments(entries, { canonicalTeams: teamsJson });
  if (!validated.valid) {
    throw new Error(`Malformed ${targetSeason} manual adjustments: ${validated.errors.join("; ")}`);
  }
  return {
    _meta: metadata({
      season: targetSeason,
      generatedAt,
      artifact: "manual adjustments",
      notes: ["Owner-maintained entries are validated but never invented by the generator."],
      knownLimitations:
        validated.normalizedEntries.length === 0
          ? ["No owner-maintained entries are present."]
          : [],
    }),
    entries: validated.normalizedEntries,
  };
}

function movementFromPrior(row, prior) {
  if (!prior) return { rankChange: null, ratingChange: null };
  const unchanged =
    prior.rank === row.rank &&
    prior.publicRating === row.publicRating &&
    prior.internalZ === row.internalZ;
  if (unchanged) {
    return {
      rankChange: prior.rankChange ?? null,
      ratingChange: prior.ratingChange ?? null,
    };
  }
  return {
    rankChange:
      Number.isInteger(prior.rank) && Number.isInteger(row.rank) ? prior.rank - row.rank : null,
    ratingChange:
      isFiniteNumber(prior.publicRating) && isFiniteNumber(row.publicRating)
        ? round(row.publicRating - prior.publicRating)
        : null,
  };
}

function priorRatings(existing, targetSeason) {
  if (existing == null) return new Map();
  if (!existing || typeof existing !== "object" || !Array.isArray(existing.ratings)) {
    throw new Error(`Malformed ${targetSeason} preseason-power-ratings artifact`);
  }
  const map = new Map();
  for (const row of existing.ratings) {
    if (!row || typeof row.abbr !== "string" || map.has(row.abbr)) {
      throw new Error(`Malformed ${targetSeason} stored prior publication`);
    }
    map.set(row.abbr, row);
  }
  return map;
}

function buildPreseason({
  sourceSeason,
  targetSeason,
  fullArtifact,
  finalArtifact,
  manualArtifact,
  priorArtifact,
  teamsJson,
  generatedAt,
}) {
  const finalByAbbr = new Map(finalArtifact.teams.map((row) => [row.abbr, row]));
  const validated = validateManualAdjustments(manualArtifact.entries, {
    canonicalTeams: teamsJson,
  });
  if (!validated.valid) throw new Error(`Invalid ${targetSeason} manual adjustments`);
  const draft = fullArtifact.teams.map((full) => {
    const final = finalByAbbr.get(full.abbr);
    if (!final) throw new Error(`${sourceSeason} final-eight artifact missing ${full.abbr}`);
    const activeEntries = manualArtifact.entries.filter(
      (entry) => entry.team === full.abbr && isAdjustmentActive(entry)
    );
    const adjustmentTotal = calculateActiveAdjustmentTotal(full.abbr, manualArtifact.entries);
    const trajectoryTerm = calculateTrajectoryTerm(final.trajectoryClamped);
    const internalZ = full.adjustedComposite + trajectoryTerm + adjustmentTotal;
    const publicRating = toPublicRating(internalZ);
    return {
      teamId: full.teamId,
      slug: full.slug,
      abbr: full.abbr,
      name: full.name,
      historical: {
        fullSeasonComposite: full.adjustedComposite,
        l8AdjustedComposite: final.adjustedComposite,
        trajectoryRaw: final.trajectoryRaw,
        trajectoryShrunk: final.trajectoryShrunk,
        trajectoryClamped: final.trajectoryClamped,
        lambda: NFL_POWER_V03_TRAJECTORY.lambda,
        k: NFL_POWER_V03_TRAJECTORY.shrinkageK,
        cap: NFL_POWER_V03_TRAJECTORY.cap,
      },
      manualAdjustments: activeEntries.map((entry) => ({
        component: entry.component,
        date: entry.date,
        sourceRef: entry.sourceRef,
      })),
      internalZ: round(internalZ),
      publicRating: round(publicRating),
      offenseRating: round(toPublicRating(full.metrics.offEpaPerPlay.zScore)),
      defenseRating: round(toPublicRating(full.metrics.defEpaPerPlay.zScore)),
      compositeZ: round(internalZ),
      uncertainty: {
        band: final.shortWindow || activeEntries.length > 0 ? "elevated" : "standard",
        inputs: {
          sourceSeason,
          fullSeasonGames: full.gamesPlayed,
          finalWindowGames: final.windowSize,
          shortWindow: final.shortWindow,
          activeManualEntryCount: activeEntries.length,
        },
      },
    };
  });
  const ranked = rankRatings(draft).map(({ compositeZ: _compositeZ, ...row }) => row);
  const priorByAbbr = priorRatings(priorArtifact, targetSeason);
  const ratings = ranked.map((row) => ({
    ...row,
    ...movementFromPrior(row, priorByAbbr.get(row.abbr)),
  }));
  return {
    _meta: metadata({
      season: targetSeason,
      generatedAt,
      artifact: "preseason power ratings",
      notes: [
        `Historical inputs come from the completed ${sourceSeason} regular season.`,
        "The public scale is fixed at 50 + 15 × (composite / 0.733), capped to [1, 99].",
        "Offense and defense subratings use the same fixed transform.",
        "Movement compares only with a stored prior publication; identical reruns preserve stored movement.",
      ],
      knownLimitations: ["Trajectory is published for review but does not affect launch scoring because lambda = 0."],
    }),
    sourceSeason,
    ratings,
  };
}

function pathFor(season, filename) {
  return `${season}/${filename}`;
}

function existingEntries(existingArtifacts, path, collectionKey) {
  const artifact = existingArtifacts?.[path];
  if (artifact == null) return [];
  if (!artifact || typeof artifact !== "object" || !Array.isArray(artifact[collectionKey])) {
    throw new Error(`Malformed existing artifact ${path}`);
  }
  return artifact[collectionKey];
}

/** Build every Phase 4 artifact deterministically from supplied in-memory inputs. */
export function buildNflV03ArtifactSet({
  teamsJson,
  seasonInputs,
  existingArtifacts = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const teams = canonicalTeams(teamsJson);
  requireIsoTimestamp(generatedAt);
  if (!seasonInputs || typeof seasonInputs !== "object") {
    throw new Error("seasonInputs are required");
  }
  const artifacts = {};
  const fullBySeason = new Map();
  const finalBySeason = new Map();

  for (const season of NFL_V03_PERFORMANCE_SEASONS) {
    const input = seasonInputs[season];
    if (!input || !Array.isArray(input.games) || !Array.isArray(input.results)) {
      throw new Error(`Missing games/results input for ${season}`);
    }
    const full = buildFullSeason({
      season,
      teams,
      games: input.games,
      results: input.results,
      weeklyCsvText: input.weeklyCsvText ?? null,
      generatedAt,
    });
    fullBySeason.set(season, full);
    artifacts[pathFor(season, "full-season-team-metrics.json")] = full.artifact;

    const context = buildContextArtifact({
      season,
      completedGames: full.internal.completedGames,
      teamsJson: { teams },
      existingEntries: existingEntries(
        existingArtifacts,
        pathFor(season, "context-flags.json"),
        "flags"
      ),
      generatedAt,
    });
    artifacts[pathFor(season, "context-flags.json")] = context;

    const final = buildFinalEight({ season, teams, full, contextArtifact: context, generatedAt });
    finalBySeason.set(season, final);
    artifacts[pathFor(season, "final-eight-team-metrics.json")] = final;
  }

  for (const sourceSeason of NFL_V03_SOURCE_SEASONS) {
    const targetSeason = sourceSeason + 1;
    const manualPath = pathFor(targetSeason, "manual-adjustments.json");
    const manual = buildManualArtifact({
      targetSeason,
      teamsJson: { teams },
      existing: existingArtifacts?.[manualPath] ?? null,
      generatedAt,
    });
    artifacts[manualPath] = manual;
    const preseasonPath = pathFor(targetSeason, "preseason-power-ratings.json");
    artifacts[preseasonPath] = buildPreseason({
      sourceSeason,
      targetSeason,
      fullArtifact: fullBySeason.get(sourceSeason).artifact,
      finalArtifact: finalBySeason.get(sourceSeason),
      manualArtifact: manual,
      priorArtifact: existingArtifacts?.[preseasonPath] ?? null,
      teamsJson: { teams },
      generatedAt,
    });
  }

  const sorted = Object.fromEntries(
    Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b))
  );
  validateNflV03ArtifactSet(sorted, { teamsJson: { teams } });
  return sorted;
}

function assertFinite(value, path = "artifact") {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path} contains a non-finite number`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFinite(entry, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) assertFinite(entry, `${path}.${key}`);
  }
}

function validateMeta(meta, season, path) {
  if (!meta || typeof meta !== "object") throw new Error(`${path} is missing _meta`);
  if (meta.schemaVersion !== NFL_V03_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`${path} has invalid schemaVersion`);
  }
  if (meta.modelVersion !== NFL_POWER_V03_MODEL_VERSION) {
    throw new Error(`${path} has invalid modelVersion`);
  }
  if (meta.validationStatus !== NFL_V03_VALIDATION_STATUS) {
    throw new Error(`${path} has invalid validationStatus`);
  }
  if (meta.season !== season || Number.isNaN(Date.parse(meta.generatedAt))) {
    throw new Error(`${path} has invalid season or generatedAt`);
  }
  if (!Array.isArray(meta.notes) || !Array.isArray(meta.knownLimitations)) {
    throw new Error(`${path} has malformed metadata notes`);
  }
  if (meta.frozenPublicScaleDivisor !== NFL_POWER_V03_POOLED_DIVISOR) {
    throw new Error(`${path} has invalid frozen divisor`);
  }
  if (meta.trajectory?.lambda !== 0 || meta.trajectory?.statement !== "lambda = 0") {
    throw new Error(`${path} has invalid trajectory metadata`);
  }
  const weightTotal = Object.values(meta.formulaWeights ?? {}).reduce(
    (sum, value) => sum + value,
    0
  );
  if (Math.abs(weightTotal - 1) > Number.EPSILON * 10) {
    throw new Error(`${path} formula weights do not sum to 1`);
  }
}

function validateMetrics(metrics, path) {
  if (!metrics || typeof metrics !== "object") throw new Error(`${path} metrics are missing`);
  if (JSON.stringify(Object.keys(metrics)) !== JSON.stringify(NFL_V03_METRIC_KEYS)) {
    throw new Error(`${path} has an invalid metric-key set`);
  }
  for (const key of NFL_V03_METRIC_KEYS) {
    const metric = metrics[key];
    if (!metric || typeof metric.missing !== "boolean") {
      throw new Error(`${path}.${key} is malformed`);
    }
    if (metric.missing) {
      if ([metric.raw, metric.adjusted, metric.zScore, metric.rank].some((value) => value !== null)) {
        throw new Error(`${path}.${key} has inconsistent missing values`);
      }
    } else if (
      !isFiniteNumber(metric.raw) ||
      !isFiniteNumber(metric.adjusted) ||
      !isFiniteNumber(metric.zScore) ||
      !Number.isInteger(metric.rank)
    ) {
      throw new Error(`${path}.${key} has invalid values`);
    }
  }
}

/** Hard-fail validation for a complete generated artifact set. */
export function validateNflV03ArtifactSet(artifacts, { teamsJson } = {}) {
  const teams = canonicalTeams(teamsJson);
  const teamAbbrs = new Set(teams.map((team) => team.abbr));
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) {
    throw new Error("artifacts must be an object keyed by relative path");
  }
  const expectedPaths = [
    ...NFL_V03_PERFORMANCE_SEASONS.flatMap((season) => [
      pathFor(season, "full-season-team-metrics.json"),
      pathFor(season, "final-eight-team-metrics.json"),
      pathFor(season, "context-flags.json"),
    ]),
    ...NFL_V03_PRESEASON_SEASONS.flatMap((season) => [
      pathFor(season, "preseason-power-ratings.json"),
      pathFor(season, "manual-adjustments.json"),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const actualPaths = Object.keys(artifacts).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("Artifact path set is incomplete or contains unexpected files");
  }

  for (const [path, artifact] of Object.entries(artifacts)) {
    const season = Number(path.split("/")[0]);
    validateMeta(artifact?._meta, season, path);
    assertFinite(artifact, path);
    if (FORBIDDEN_ARTIFACT_LANGUAGE.test(JSON.stringify(artifact))) {
      throw new Error(`${path} contains forbidden language`);
    }
    if (path.endsWith("full-season-team-metrics.json")) {
      if (!Array.isArray(artifact.teams)) throw new Error(`${path} is missing teams`);
      if (JSON.stringify(artifact.metricKeys) !== JSON.stringify(NFL_V03_METRIC_KEYS)) {
        throw new Error(`${path} has invalid metricKeys`);
      }
      for (const row of artifact.teams) {
        if (!teamAbbrs.has(row.abbr)) throw new Error(`${path} has unknown team ${row.abbr}`);
        if (row.winPercentageScored !== false) throw new Error(`${path} scores win percentage`);
        validateMetrics(row.metrics, `${path}:${row.abbr}`);
      }
    } else if (path.endsWith("final-eight-team-metrics.json")) {
      if (!Array.isArray(artifact.teams)) throw new Error(`${path} is missing teams`);
      if (JSON.stringify(artifact.metricKeys) !== JSON.stringify(NFL_V03_METRIC_KEYS)) {
        throw new Error(`${path} has invalid metricKeys`);
      }
      for (const row of artifact.teams) {
        if (!teamAbbrs.has(row.abbr)) throw new Error(`${path} has unknown team ${row.abbr}`);
        if (!Array.isArray(row.windowGames) || row.windowGames.length !== row.windowSize) {
          throw new Error(`${path}:${row.abbr} has malformed window games`);
        }
        if (row.windowSize > 8 || row.shortWindow !== (row.windowSize < 8)) {
          throw new Error(`${path}:${row.abbr} has invalid window size`);
        }
        validateMetrics(row.metrics, `${path}:${row.abbr}:canonical`);
        validateMetrics(row.metricsExFlagged, `${path}:${row.abbr}:alternate`);
      }
    } else if (path.endsWith("context-flags.json")) {
      const result = validateContextFlags(artifact.flags, teamsJson);
      if (!result.valid) throw new Error(`${path} has invalid flags: ${result.errors.join("; ")}`);
    } else if (path.endsWith("manual-adjustments.json")) {
      const result = validateManualAdjustments(artifact.entries, { canonicalTeams: teamsJson });
      if (!result.valid) {
        throw new Error(`${path} has invalid manual entries: ${result.errors.join("; ")}`);
      }
    } else if (path.endsWith("preseason-power-ratings.json")) {
      if (!Array.isArray(artifact.ratings)) throw new Error(`${path} is missing ratings`);
      for (const row of artifact.ratings) {
        if (!teamAbbrs.has(row.abbr)) throw new Error(`${path} has unknown team ${row.abbr}`);
        for (const field of ["publicRating", "offenseRating", "defenseRating"]) {
          if (!isFiniteNumber(row[field]) || row[field] < 1 || row[field] > 99) {
            throw new Error(`${path}:${row.abbr} has invalid ${field}`);
          }
        }
      }
    }
  }
  for (const season of NFL_V03_PERFORMANCE_SEASONS) {
    const full = artifacts[pathFor(season, "full-season-team-metrics.json")];
    const final = artifacts[pathFor(season, "final-eight-team-metrics.json")];
    if (JSON.stringify(full.metricKeys) !== JSON.stringify(final.metricKeys)) {
      throw new Error(`${season} full/final metric keys differ`);
    }
  }
  if (
    artifacts[pathFor(2026, "full-season-team-metrics.json")].teams.length !== 0 ||
    artifacts[pathFor(2026, "final-eight-team-metrics.json")].teams.length !== 0
  ) {
    throw new Error("2026 performance artifacts must not contain invented team metrics");
  }
  return true;
}

export function serializeNflV03Artifact(payload) {
  return toNflJsonFileString(payload);
}

export function stripGeneratedAt(artifacts) {
  const copy = clone(artifacts);
  for (const artifact of Object.values(copy)) delete artifact._meta.generatedAt;
  return copy;
}

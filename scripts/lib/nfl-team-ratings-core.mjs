/**
 * Core logic for NFL team stats + power ratings (PR-4 v0.1, upgraded to
 * v0.2 in PR-8).
 *
 * Inputs:
 *  - repo data: public/data/nfl/teams.json + <season>/results.json (PR-2)
 *  - free nflverse team-week stats (see nfl-advanced-stats.mjs) for EPA,
 *    yards/play and turnover metrics. No API keys, no betting columns.
 *
 * Model: nfl-power-v0.2 — experimental, NOT validated, not betting guidance.
 * Formula tiers (highest available wins, per season):
 *  - v0.2-epa:      35% point diff/gm + 20% off EPA/play + 20% def EPA/play
 *                   (inverted) + 15% schedule adjustment + 10% win%
 *  - v0.2-schedule: 50% point diff/gm + 20% PPG + 15% schedule adjustment
 *                   + 15% win%   (advanced source unavailable)
 *  - v0.1-fallback: 60% point diff/gm + 25% PPG + 15% win%
 *                   (schedule adjustment also unavailable)
 * Every component is min-max normalized to 0-100 within the season and
 * defensive components are inverted so better defense raises the rating.
 *
 * Schedule adjustment (one-pass, no circularity): a team's scheduleStrength
 * is the average of its opponents' raw point differential per game across
 * its regular-season games (opponents counted once per meeting), then
 * min-max normalized within the season. Derived from final scores only —
 * never from spreads, moneylines or any market data.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildNflMeta, toNflJsonFileString } from "./nfl-data-meta.mjs";
import { NFL_TEAM_STATS_SOURCE_LABEL, nflTeamStatsUrl } from "./nfl-advanced-stats.mjs";

export const MODEL_VERSION = "nfl-power-v0.2";
export const TEAM_STATS_SOURCE_LABEL =
  "derived from public/data/nfl/<season>/results.json (nflverse pipeline) + nflverse stats_team weekly release, regular season only";
export const DEFAULT_START_SEASON = 2022;
export const DEFAULT_END_SEASON = 2026;

export const FORMULA_TIERS = {
  "v0.2-epa": {
    pointDifferentialPerGame: 0.35,
    offensiveEpaPerPlay: 0.2,
    defensiveEpaPerPlay: 0.2,
    scheduleAdjustment: 0.15,
    winPercentage: 0.1,
  },
  "v0.2-schedule": {
    pointDifferentialPerGame: 0.5,
    pointsPerGame: 0.2,
    scheduleAdjustment: 0.15,
    winPercentage: 0.15,
  },
  "v0.1-fallback": {
    pointDifferentialPerGame: 0.6,
    pointsPerGame: 0.25,
    winPercentage: 0.15,
  },
};

/** Success rates need full play-by-play (too heavy for CI) — stay null. */
const UNAVAILABLE_METRICS = ["offensiveSuccessRate", "defensiveSuccessRate"];
const ADVANCED_METRIC_KEYS = [
  "offensiveEpaPerPlay",
  "defensiveEpaPerPlay",
  "yardsPerPlay",
  "yardsAllowedPerPlay",
  "offensivePlays",
  "defensivePlays",
  "turnovers",
  "takeaways",
  "turnoverDifferential",
];

const round = (value, digits = 3) => Number(value.toFixed(digits));

function loadCanonicalTeams(teamsJson) {
  const teams = teamsJson?.teams;
  if (!Array.isArray(teams) || teams.length !== 32) {
    throw new Error("teams.json is malformed: expected 32 canonical teams");
  }
  return teams;
}

/**
 * Compute season-level team stats from final regular-season results, merged
 * with advanced metrics when available (advancedByAbbr may be null).
 * Hard-fails on unknown team abbreviations.
 */
export function computeTeamStats(results, teamsJson, season, advancedByAbbr = null) {
  const teams = loadCanonicalTeams(teamsJson);
  const rows = new Map(
    teams.map((team) => [
      team.abbr,
      {
        teamId: team.id,
        slug: team.slug,
        abbr: team.abbr,
        nflverseAbbr: team.nflverseAbbr,
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

  for (const result of results) {
    if (result.seasonType !== "REG" || result.final !== true) continue;
    const home = rows.get(result.homeAbbr);
    const away = rows.get(result.awayAbbr);
    if (!home) throw new Error(`Unknown team abbreviation "${result.homeAbbr}" in result ${result.gameId}`);
    if (!away) throw new Error(`Unknown team abbreviation "${result.awayAbbr}" in result ${result.gameId}`);
    if (!Number.isInteger(result.homeScore) || !Number.isInteger(result.awayScore)) {
      throw new Error(`Non-integer score in result ${result.gameId}`);
    }

    home.gamesPlayed += 1;
    away.gamesPlayed += 1;
    home.pointsFor += result.homeScore;
    home.pointsAgainst += result.awayScore;
    away.pointsFor += result.awayScore;
    away.pointsAgainst += result.homeScore;

    if (result.homeScore === result.awayScore) {
      home.ties += 1;
      away.ties += 1;
    } else if (result.homeScore > result.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }

  const stats = [...rows.values()].map((row) => {
    const played = row.gamesPlayed;
    const derived =
      played > 0
        ? {
            pointDifferential: row.pointsFor - row.pointsAgainst,
            pointsPerGame: round(row.pointsFor / played),
            pointsAllowedPerGame: round(row.pointsAgainst / played),
            winPercentage: round((row.wins + 0.5 * row.ties) / played),
          }
        : {
            pointDifferential: 0,
            pointsPerGame: null,
            pointsAllowedPerGame: null,
            winPercentage: null,
          };
    const advanced = Object.fromEntries(ADVANCED_METRIC_KEYS.map((key) => [key, advancedByAbbr?.get(row.abbr)?.[key] ?? null]));
    const unavailable = Object.fromEntries(UNAVAILABLE_METRICS.map((key) => [key, null]));
    return {
      ...row,
      ...derived,
      ...advanced,
      ...unavailable,
      scheduleStrength: null, // filled by applyScheduleStrength
      scheduleAdjustment: null,
    };
  });

  stats.sort((a, b) => a.abbr.localeCompare(b.abbr));
  applyScheduleStrength(stats, results);
  return stats;
}

/**
 * One-pass schedule strength: average opponents' raw point differential per
 * game across each team's REG games, then min-max normalize to 0-100.
 * Uses final scores only — no market data. Mutates the stats rows.
 */
export function applyScheduleStrength(stats, results) {
  const byAbbr = new Map(stats.map((row) => [row.abbr, row]));
  const opponents = new Map(); // abbr -> opponent abbrs (one per meeting)
  for (const result of results) {
    if (result.seasonType !== "REG" || result.final !== true) continue;
    if (!byAbbr.has(result.homeAbbr) || !byAbbr.has(result.awayAbbr)) continue;
    (opponents.get(result.homeAbbr) ?? opponents.set(result.homeAbbr, []).get(result.homeAbbr)).push(result.awayAbbr);
    (opponents.get(result.awayAbbr) ?? opponents.set(result.awayAbbr, []).get(result.awayAbbr)).push(result.homeAbbr);
  }

  const raw = new Map();
  for (const [abbr, opps] of opponents) {
    const diffs = opps.map((opp) => {
      const row = byAbbr.get(opp);
      return row.gamesPlayed > 0 ? row.pointDifferential / row.gamesPlayed : 0;
    });
    raw.set(abbr, round(diffs.reduce((sum, d) => sum + d, 0) / diffs.length));
  }
  if (raw.size === 0) return;

  const values = [...raw.values()];
  const min = Math.min(...values);
  const max = Math.max(...values);
  for (const row of stats) {
    if (!raw.has(row.abbr)) continue;
    row.scheduleStrength = raw.get(row.abbr);
    row.scheduleAdjustment = max === min ? 50 : round(((raw.get(row.abbr) - min) / (max - min)) * 100, 2);
  }
}

/** Min-max normalize values to a 0-100 scale within the season. */
function normalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50);
  return values.map((value) => round(((value - min) / (max - min)) * 100, 2));
}

function pickTier(playable) {
  const hasAdvanced = playable.every(
    (t) => t.offensiveEpaPerPlay != null && t.defensiveEpaPerPlay != null
  );
  const hasSchedule = playable.every((t) => t.scheduleAdjustment != null);
  if (hasAdvanced && hasSchedule) return "v0.2-epa";
  if (hasSchedule) return "v0.2-schedule";
  return "v0.1-fallback";
}

/**
 * Compute nfl-power-v0.2 ratings. Tier depends on data availability (see
 * module docs). Returns [] when no team has completed a game.
 */
export function computePowerRatings(teamStats, season) {
  const playable = teamStats.filter((team) => team.gamesPlayed > 0);
  if (playable.length === 0) {
    // Document the formula that will apply once games exist.
    return { ratings: [], tier: "v0.2-epa", weights: FORMULA_TIERS["v0.2-epa"] };
  }

  const tier = pickTier(playable);
  const weights = FORMULA_TIERS[tier];

  const series = {
    pointDifferentialPerGame: playable.map((t) => t.pointDifferential / t.gamesPlayed),
    pointsPerGame: playable.map((t) => t.pointsPerGame),
    winPercentage: playable.map((t) => t.winPercentage),
    offensiveEpaPerPlay: playable.map((t) => t.offensiveEpaPerPlay ?? 0),
    defensiveEpaPerPlay: playable.map((t) => t.defensiveEpaPerPlay ?? 0),
    scheduleAdjustment: playable.map((t) => t.scheduleAdjustment ?? 50),
    pointsAllowedPerGame: playable.map((t) => t.pointsAllowedPerGame),
  };
  const norm = {
    pointDifferentialPerGame: normalize(series.pointDifferentialPerGame),
    pointsPerGame: normalize(series.pointsPerGame),
    winPercentage: normalize(series.winPercentage),
    offensiveEpaPerPlay: normalize(series.offensiveEpaPerPlay),
    // Defense: lower EPA allowed is better, so invert after normalizing.
    defensiveEpaPerPlay: normalize(series.defensiveEpaPerPlay).map((v) => round(100 - v, 2)),
    scheduleAdjustment: series.scheduleAdjustment.map((v) => round(v, 2)), // already 0-100
    pointsAllowedPerGameInverted: normalize(series.pointsAllowedPerGame).map((v) => round(100 - v, 2)),
  };

  const ratings = playable.map((team, i) => {
    const components = {};
    let rating = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const normalized = norm[key][i];
      components[key] = { raw: round(series[key][i]), normalized, weight };
      rating += weight * normalized;
    }
    // Informational context (weight 0): points allowed, inverted.
    components.pointsAllowedPerGame = {
      raw: series.pointsAllowedPerGame[i],
      normalizedInverted: norm.pointsAllowedPerGameInverted[i],
      weight: 0,
    };

    const usesEpa = tier === "v0.2-epa";
    return {
      teamId: team.teamId,
      slug: team.slug,
      abbr: team.abbr,
      name: team.name,
      season,
      rating: round(rating, 2),
      rank: 0,
      offenseRating: usesEpa ? norm.offensiveEpaPerPlay[i] : norm.pointsPerGame[i],
      defenseRating: usesEpa ? norm.defensiveEpaPerPlay[i] : norm.pointsAllowedPerGameInverted[i],
      scheduleAdjustment: tier === "v0.1-fallback" ? null : norm.scheduleAdjustment[i],
      components,
      modelVersion: MODEL_VERSION,
      notes: `Experimental ${tier} rating; not validated.`,
    };
  });

  ratings.sort(
    (a, b) =>
      b.rating - a.rating ||
      b.components.pointDifferentialPerGame.raw - a.components.pointDifferentialPerGame.raw ||
      (b.components.winPercentage.raw ?? 0) - (a.components.winPercentage.raw ?? 0) ||
      a.abbr.localeCompare(b.abbr)
  );
  ratings.forEach((row, index) => {
    row.rank = index + 1;
  });
  return { ratings, tier, weights };
}

/** v0.1 ranks recomputed from the same stats, for sanity comparison only. */
export function computeV01Ranks(teamStats) {
  const playable = teamStats.filter((team) => team.gamesPlayed > 0);
  if (playable.length === 0) return new Map();
  const w = FORMULA_TIERS["v0.1-fallback"];
  const normDiff = normalize(playable.map((t) => t.pointDifferential / t.gamesPlayed));
  const normPpg = normalize(playable.map((t) => t.pointsPerGame));
  const normWin = normalize(playable.map((t) => t.winPercentage));
  const scored = playable.map((team, i) => ({
    abbr: team.abbr,
    score: w.pointDifferentialPerGame * normDiff[i] + w.pointsPerGame * normPpg[i] + w.winPercentage * normWin[i],
  }));
  scored.sort((a, b) => b.score - a.score || a.abbr.localeCompare(b.abbr));
  return new Map(scored.map((row, index) => [row.abbr, index + 1]));
}

function fileNotes({ season, tier, weights, ratingsCount, teamCount, advancedAvailable }) {
  const notes = [
    "Stats and ratings derive from final regular-season results only; postseason games are excluded.",
    `Sources: repo results.json (PR-2 nflverse pipeline) + ${NFL_TEAM_STATS_SOURCE_LABEL} (${nflTeamStatsUrl(season)}).`,
    advancedAvailable
      ? "Advanced metrics (EPA/play, yards/play, turnovers) computed from the nflverse stats_team weekly file; defensive values derived from opponents' offensive production."
      : "Advanced metrics unavailable for this season (source file missing or no games played); EPA/yards/turnover fields are null.",
    "Success rates require full play-by-play (too heavy for the default workflow) and remain null.",
    `Rating formula (${MODEL_VERSION}, tier ${tier}): ${Object.entries(weights)
      .map(([key, weight]) => `${Math.round(weight * 100)}% ${key}`)
      .join(" + ")}, each min-max normalized to 0-100 within the season.`,
    "Defensive components are inverted so better defense increases the rating.",
    "Schedule adjustment: one-pass average of opponents' raw point differential per game (final scores only — no spreads, moneylines or market data), normalized 0-100 within the season.",
    "Experimental model output for internal review only; not validated and not betting guidance.",
    "No betting-line columns are read anywhere in this pipeline.",
  ];
  if (season === 2022) {
    notes.push(
      "2022: the cancelled Week 17 BUF-CIN game is absent upstream, so Buffalo and Cincinnati have 16-game regular seasons."
    );
  }
  if (ratingsCount === 0) {
    notes.push(
      `No final ${season} games exist yet, so performance stats are zero/null placeholders and ratings are unavailable (empty). Nothing is seeded or invented.`
    );
  } else if (ratingsCount < teamCount) {
    notes.push(
      `${teamCount - ratingsCount} teams have not completed a game yet this season and are unrated; ranks cover the ${ratingsCount} rated teams.`
    );
  }
  return notes;
}

/** Build a per-season sanity report (model-quality review only). */
export function buildSanityReport(ratings, teamStats, results, season) {
  if (ratings.length === 0) return { season, available: false };
  const byAbbr = new Map(ratings.map((row) => [row.abbr, row]));

  const playoffAbbrs = new Set();
  let sbGame = null;
  for (const result of results) {
    if (result.seasonType === "REG") continue;
    playoffAbbrs.add(result.homeAbbr);
    playoffAbbrs.add(result.awayAbbr);
    if (result.seasonType === "SB") sbGame = result;
  }

  const winPctRanked = [...teamStats]
    .filter((t) => t.gamesPlayed > 0)
    .sort((a, b) => (b.winPercentage ?? 0) - (a.winPercentage ?? 0) || a.abbr.localeCompare(b.abbr));
  const winPctRank = new Map(winPctRanked.map((row, index) => [row.abbr, index + 1]));
  const disagreements = ratings
    .map((row) => ({
      abbr: row.abbr,
      name: row.name,
      ratingRank: row.rank,
      recordRank: winPctRank.get(row.abbr),
      gap: Math.abs(row.rank - winPctRank.get(row.abbr)),
    }))
    .sort((a, b) => b.gap - a.gap || a.abbr.localeCompare(b.abbr))
    .slice(0, 3);

  const v01Ranks = computeV01Ranks(teamStats);
  const deltas = ratings
    .map((row) => ({
      abbr: row.abbr,
      name: row.name,
      v02Rank: row.rank,
      v01Rank: v01Ranks.get(row.abbr),
      delta: (v01Ranks.get(row.abbr) ?? row.rank) - row.rank, // + = riser under v0.2
    }))
    .sort((a, b) => b.delta - a.delta || a.abbr.localeCompare(b.abbr));

  const bySchedule = [...teamStats]
    .filter((t) => t.scheduleStrength != null)
    .sort((a, b) => b.scheduleStrength - a.scheduleStrength || a.abbr.localeCompare(b.abbr));

  return {
    season,
    available: true,
    top10: ratings.slice(0, 10).map((r) => ({ rank: r.rank, abbr: r.abbr, name: r.name, rating: r.rating })),
    bottom10: ratings.slice(-10).map((r) => ({ rank: r.rank, abbr: r.abbr, name: r.name, rating: r.rating })),
    superBowl: sbGame
      ? {
          winner: sbGame.winner,
          teams: [sbGame.homeAbbr, sbGame.awayAbbr].map((abbr) => ({
            abbr,
            rank: byAbbr.get(abbr)?.rank ?? null,
          })),
        }
      : null,
    playoffTeamCount: playoffAbbrs.size,
    playoffTeamsInTop12: [...playoffAbbrs].filter((abbr) => (byAbbr.get(abbr)?.rank ?? 99) <= 12).length,
    biggestDisagreements: disagreements,
    risers: deltas.slice(0, 3),
    fallers: deltas.slice(-3).reverse(),
    hardestSchedules: bySchedule.slice(0, 5).map((t) => ({ abbr: t.abbr, name: t.name, scheduleStrength: t.scheduleStrength })),
    easiestSchedules: bySchedule.slice(-5).reverse().map((t) => ({ abbr: t.abbr, name: t.name, scheduleStrength: t.scheduleStrength })),
  };
}

export function printSanityReport(report, log = console.log) {
  if (!report.available) {
    log(`\n=== ${report.season}: no completed games — sanity check skipped ===`);
    return;
  }
  log(`\n=== ${report.season} sanity check (model-quality review only) ===`);
  log("Top 10 by v0.2 rating:");
  for (const row of report.top10) log(`  ${String(row.rank).padStart(2)}. ${row.name} (${row.abbr}) ${row.rating}`);
  log("Bottom 10 by v0.2 rating:");
  for (const row of report.bottom10) log(`  ${String(row.rank).padStart(2)}. ${row.name} (${row.abbr}) ${row.rating}`);
  log("Biggest risers vs v0.1:");
  for (const row of report.risers) log(`  ${row.name}: v0.1 #${row.v01Rank} -> v0.2 #${row.v02Rank} (${row.delta >= 0 ? "+" : ""}${row.delta})`);
  log("Biggest fallers vs v0.1:");
  for (const row of report.fallers) log(`  ${row.name}: v0.1 #${row.v01Rank} -> v0.2 #${row.v02Rank} (${row.delta >= 0 ? "+" : ""}${row.delta})`);
  if (report.superBowl) {
    const [a, b] = report.superBowl.teams;
    log(`Super Bowl teams: ${a.abbr} ranked #${a.rank}, ${b.abbr} ranked #${b.rank} (winner: ${report.superBowl.winner})`);
  }
  log(`Playoff teams inside top 12: ${report.playoffTeamsInTop12} of ${report.playoffTeamCount}`);
  log("Hardest schedules (avg opponent point diff/gm):");
  for (const row of report.hardestSchedules) log(`  ${row.name}: ${row.scheduleStrength}`);
  log("Easiest schedules:");
  for (const row of report.easiestSchedules) log(`  ${row.name}: ${row.scheduleStrength}`);
  log("Biggest rating-vs-record disagreements:");
  for (const row of report.biggestDisagreements) {
    log(`  ${row.name}: rating rank #${row.ratingRank} vs record rank #${row.recordRank} (gap ${row.gap})`);
  }
}

/**
 * Run the stats+ratings pipeline for the requested seasons.
 *
 * @param {object} options
 * @param {string} options.inputDir - Dir holding teams.json and <season>/results.json.
 * @param {string} options.outputDir
 * @param {number[]} options.seasons
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.sanity]
 * @param {(season: number) => Promise<Map<string, object> | null>} [options.loadAdvanced]
 *   Returns per-team advanced metrics (or null when unavailable). Defaults to none.
 * @param {(msg: string) => void} [options.log]
 */
export async function runRatingsPipeline({
  inputDir,
  outputDir,
  seasons,
  dryRun = false,
  sanity = false,
  loadAdvanced = async () => null,
  log = () => {},
}) {
  const teamsJson = JSON.parse(readFileSync(join(inputDir, "teams.json"), "utf-8"));
  const summaries = [];

  for (const season of seasons) {
    const resultsPath = join(inputDir, String(season), "results.json");
    const results = JSON.parse(readFileSync(resultsPath, "utf-8")).results;
    if (!Array.isArray(results)) throw new Error(`${resultsPath} is malformed: missing results array`);

    const advancedByAbbr = await loadAdvanced(season);
    const teamStats = computeTeamStats(results, teamsJson, season, advancedByAbbr);
    const { ratings, tier, weights } = computePowerRatings(teamStats, season);
    const advancedAvailable = advancedByAbbr != null;
    const notes = fileNotes({
      season,
      tier,
      weights,
      ratingsCount: ratings.length,
      teamCount: teamStats.length,
      advancedAvailable,
    });
    const model = {
      modelVersion: MODEL_VERSION,
      formula: tier,
      weights,
      sources: [
        "public/data/nfl/<season>/results.json (repo, PR-2 pipeline)",
        `${NFL_TEAM_STATS_SOURCE_LABEL}: ${nflTeamStatsUrl(season)}`,
      ],
      advancedMetricsAvailable: advancedAvailable,
      scheduleAdjustmentMethod:
        "one-pass average of opponents' point differential per game (final scores only), min-max normalized 0-100 within season",
    };

    const statsPayload = {
      _meta: buildNflMeta({ source: TEAM_STATS_SOURCE_LABEL, season, notes }),
      model,
      teamStats,
    };
    const ratingsPayload = {
      _meta: buildNflMeta({ source: TEAM_STATS_SOURCE_LABEL, season, modelVersion: MODEL_VERSION, notes }),
      model,
      weights,
      ratings,
    };

    const written = [];
    if (!dryRun) {
      const seasonDir = join(outputDir, String(season));
      mkdirSync(seasonDir, { recursive: true });
      const statsPath = join(seasonDir, "team-stats.json");
      const ratingsPath = join(seasonDir, "power-ratings.json");
      writeFileSync(statsPath, toNflJsonFileString(statsPayload));
      writeFileSync(ratingsPath, toNflJsonFileString(ratingsPayload));
      written.push(statsPath, ratingsPath);
    }

    const ratedNote = ratings.length === 0 ? "no completed games, ratings empty" : `${ratings.length} teams rated (${tier})`;
    log(
      `[nfl:team-ratings] season ${season}: ${teamStats.length} team stat rows, ${ratedNote}${dryRun ? " (dry-run, not written)" : ""}`
    );
    if (sanity) printSanityReport(buildSanityReport(ratings, teamStats, results, season), log);

    summaries.push({ season, teamCount: teamStats.length, ratedCount: ratings.length, tier, written });
  }
  return summaries;
}

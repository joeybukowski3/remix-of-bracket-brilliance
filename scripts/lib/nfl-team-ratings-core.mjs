/**
 * Core logic for NFL team stats + power ratings (PR-4).
 *
 * Inputs are repo data only: public/data/nfl/teams.json and the generated
 * public/data/nfl/<season>/results.json from the PR-2 pipeline. No network,
 * no API keys, no betting columns.
 *
 * Model: nfl-power-v0.1 — experimental, points-based, NOT validated.
 * Advanced efficiency metrics (EPA, success rate, yards) require heavier
 * nflverse play-by-play/team-week downloads and are intentionally deferred;
 * they are emitted as null so the schema is stable for a future v0.2.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildNflMeta, toNflJsonFileString } from "./nfl-data-meta.mjs";

export const MODEL_VERSION = "nfl-power-v0.1";
export const TEAM_STATS_SOURCE_LABEL =
  "derived from public/data/nfl/<season>/results.json (nflverse pipeline, regular season only)";
export const DEFAULT_START_SEASON = 2022;
export const DEFAULT_END_SEASON = 2026;

/** Fallback formula weights (advanced efficiency metrics unavailable in v0.1). */
export const RATING_WEIGHTS = {
  pointDifferentialPerGame: 0.6,
  pointsPerGame: 0.25,
  winPercentage: 0.15,
};

/** Advanced metrics deferred to a future version — emitted as null. */
const UNAVAILABLE_ADVANCED_METRICS = [
  "yardsPerGame",
  "yardsAllowedPerGame",
  "offensivePlays",
  "defensivePlays",
  "turnovers",
  "takeaways",
  "turnoverDifferential",
  "offensiveEpaPerPlay",
  "defensiveEpaPerPlay",
  "offensiveSuccessRate",
  "defensiveSuccessRate",
  "passRate",
  "rushRate",
  "playsPerGame",
  "explosivePlayRate",
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
 * Compute season-level team stats from final regular-season results.
 * Hard-fails on result rows referencing unknown team abbreviations.
 */
export function computeTeamStats(results, teamsJson, season) {
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
    const advanced = Object.fromEntries(UNAVAILABLE_ADVANCED_METRICS.map((key) => [key, null]));
    return { ...row, ...derived, ...advanced };
  });

  stats.sort((a, b) => a.abbr.localeCompare(b.abbr));
  return stats;
}

/** Min-max normalize values to a 0-100 scale within the season. */
function normalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50);
  return values.map((value) => round(((value - min) / (max - min)) * 100, 2));
}

/**
 * Compute nfl-power-v0.1 ratings from season team stats.
 * Fallback formula (no advanced efficiency metrics in v0.1):
 *   60% point differential per game + 25% points per game + 15% win%.
 * Defense is expressed via points allowed inverted (lower PA/G = higher
 * defenseRating) so better defense increases rating context.
 * Returns [] when no team has completed a game (e.g. 2026 preseason).
 */
export function computePowerRatings(teamStats, season) {
  // Teams with zero completed games (preseason, or a partially ingested
  // week 1) are simply unrated; ranks cover rated teams only.
  const playable = teamStats.filter((team) => team.gamesPlayed > 0);
  if (playable.length === 0) return [];

  const diffPerGame = playable.map((t) => t.pointDifferential / t.gamesPlayed);
  const ppg = playable.map((t) => t.pointsPerGame);
  const papg = playable.map((t) => t.pointsAllowedPerGame);
  const winPct = playable.map((t) => t.winPercentage);

  const normDiff = normalize(diffPerGame);
  const normPpg = normalize(ppg);
  const normPapgInverted = normalize(papg).map((value) => round(100 - value, 2));
  const normWinPct = normalize(winPct);

  const ratings = playable.map((team, i) => {
    const rating = round(
      RATING_WEIGHTS.pointDifferentialPerGame * normDiff[i] +
        RATING_WEIGHTS.pointsPerGame * normPpg[i] +
        RATING_WEIGHTS.winPercentage * normWinPct[i],
      2
    );
    return {
      teamId: team.teamId,
      slug: team.slug,
      abbr: team.abbr,
      name: team.name,
      season,
      rating,
      rank: 0, // assigned after sorting
      offenseRating: normPpg[i],
      defenseRating: normPapgInverted[i],
      scheduleAdjustment: null,
      components: {
        pointDifferentialPerGame: {
          raw: round(diffPerGame[i]),
          normalized: normDiff[i],
          weight: RATING_WEIGHTS.pointDifferentialPerGame,
        },
        pointsPerGame: {
          raw: ppg[i],
          normalized: normPpg[i],
          weight: RATING_WEIGHTS.pointsPerGame,
        },
        winPercentage: {
          raw: winPct[i],
          normalized: normWinPct[i],
          weight: RATING_WEIGHTS.winPercentage,
        },
        pointsAllowedPerGame: {
          raw: papg[i],
          normalizedInverted: normPapgInverted[i],
          weight: 0,
        },
      },
      modelVersion: MODEL_VERSION,
      notes: "Experimental points-based rating (fallback formula); not validated.",
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
  return ratings;
}

function fileNotes(season, ratingsCount, teamCount) {
  const notes = [
    "Stats and ratings derive from final regular-season results only; postseason games are excluded.",
    "Advanced efficiency metrics (yards, turnovers, EPA, success rate, pace) are null: they require heavier nflverse play-by-play/team-week downloads and are deferred to a future model version.",
    `Rating formula (${MODEL_VERSION}, fallback tier): 60% point differential per game + 25% points per game + 15% win percentage, each min-max normalized to 0-100 within the season.`,
    "Defense context uses points allowed per game inverted, so better defense scores higher.",
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

/**
 * Build a per-season sanity report (model-quality review only).
 * Uses postseason rows in results.json to identify playoff/SB teams.
 */
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

  const winPctRanked = [...teamStats].sort(
    (a, b) => (b.winPercentage ?? 0) - (a.winPercentage ?? 0) || a.abbr.localeCompare(b.abbr)
  );
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
  };
}

export function printSanityReport(report, log = console.log) {
  if (!report.available) {
    log(`\n=== ${report.season}: no completed games — sanity check skipped ===`);
    return;
  }
  log(`\n=== ${report.season} sanity check (model-quality review only) ===`);
  log("Top 10 by rating:");
  for (const row of report.top10) log(`  ${String(row.rank).padStart(2)}. ${row.name} (${row.abbr}) ${row.rating}`);
  log("Bottom 10 by rating:");
  for (const row of report.bottom10) log(`  ${String(row.rank).padStart(2)}. ${row.name} (${row.abbr}) ${row.rating}`);
  if (report.superBowl) {
    const [a, b] = report.superBowl.teams;
    log(`Super Bowl teams: ${a.abbr} ranked #${a.rank}, ${b.abbr} ranked #${b.rank} (winner: ${report.superBowl.winner})`);
  }
  log(`Playoff teams inside top 12: ${report.playoffTeamsInTop12} of ${report.playoffTeamCount}`);
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
 * @param {string} options.outputDir - Dir receiving <season>/team-stats.json + power-ratings.json.
 * @param {number[]} options.seasons
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.sanity]
 * @param {(msg: string) => void} [options.log]
 */
export function runRatingsPipeline({ inputDir, outputDir, seasons, dryRun = false, sanity = false, log = () => {} }) {
  const teamsJson = JSON.parse(readFileSync(join(inputDir, "teams.json"), "utf-8"));
  const summaries = [];

  for (const season of seasons) {
    const resultsPath = join(inputDir, String(season), "results.json");
    const results = JSON.parse(readFileSync(resultsPath, "utf-8")).results;
    if (!Array.isArray(results)) throw new Error(`${resultsPath} is malformed: missing results array`);

    const teamStats = computeTeamStats(results, teamsJson, season);
    const ratings = computePowerRatings(teamStats, season);
    const notes = fileNotes(season, ratings.length, teamStats.length);

    const statsPayload = {
      _meta: buildNflMeta({ source: TEAM_STATS_SOURCE_LABEL, season, notes }),
      teamStats,
    };
    const ratingsPayload = {
      _meta: buildNflMeta({ source: TEAM_STATS_SOURCE_LABEL, season, modelVersion: MODEL_VERSION, notes }),
      weights: RATING_WEIGHTS,
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

    const ratedNote = ratings.length === 0 ? "no completed games, ratings empty" : `${ratings.length} teams rated`;
    log(
      `[nfl:team-ratings] season ${season}: ${teamStats.length} team stat rows, ${ratedNote}${dryRun ? " (dry-run, not written)" : ""}`
    );
    if (sanity) printSanityReport(buildSanityReport(ratings, teamStats, results, season), log);

    summaries.push({ season, teamCount: teamStats.length, ratedCount: ratings.length, written });
  }
  return summaries;
}

/**
 * Generate NFL Situational Trends Study v1 artifacts.
 *
 * The standard study uses one local nflverse games.csv snapshot for 2011-2025.
 * With no --input, a committed 2025-only offline fixture remains available for
 * smoke testing; every narrative and classification still derives from the
 * seasons actually loaded.
 *
 * Full-history rerun:
 *   node scripts/research/generate-nfl-situational-trends-v1.mjs \
 *     --input=C:/path/to/nflverse-games.csv --start-season=2011 --end-season=2025
 *
 * The input must be one nflverse/nfldata games.csv snapshot. Sources are never
 * blended. This script performs local reads and writes only.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { etToUtcIso, parseCsv } from "../lib/nfl-schedules-results-core.mjs";
import {
  DEFINITION_VERSION,
  FIXED_ERA_WINDOWS,
  RECENT_MATERIAL_DIFFERENCE,
  REPORTING_WINDOWS,
  STUDY_VERSION,
  TREND_DEFINITIONS,
  atsCoverMargin,
  blowoutThresholds,
  buildReportingWindows,
  calculateRestDays,
  evaluateTeamRows,
  gradeTeamAts,
  isByeGap,
  isDivisionalMatchup,
  isLesserFavorite,
  isMajorOpponent,
  isPrimeTimeKickoff,
  isWestToEastEarly,
  qualifiesLetdown,
  qualifiesLookAhead,
  qualifiesSandwich,
  roadSequenceAt,
  summarizeStability,
  summarizeRows,
  teamRelativeSpread,
  teamTimeZone,
} from "../lib/nfl-situational-trends-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEAMS_PATH = join(ROOT, "public", "data", "nfl", "teams.json");
const BENCHMARK_PATH = join(ROOT, "data", "nfl", "benchmark", "market_lines_2025.csv");
const TEAM_GAMES_PATH = join(ROOT, "data", "nfl", "research", "situational-trend-team-games-v1.jsonl");
const PUBLIC_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-v1.json");
const DOC_PATH = join(ROOT, "docs", "research", "nfl-situational-trends-v1.md");

const SOURCE_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
const TEAM_ALIASES = { OAK: "lv", SD: "lac", STL: "lar", LA: "lar", LAR: "lar", WAS: "wsh", WSH: "wsh", JAC: "jax" };
const VARIANTS = {
  "consecutive-road": ["road-game-2", "road-game-3-plus"],
  "divisional-underdog": ["divisional-dog-home", "divisional-dog-road"],
  "after-blowout-win": ["after-win-14-plus", "after-win-17-plus", "after-win-20-plus"],
  "after-blowout-loss": ["after-loss-14-plus", "after-loss-17-plus", "after-loss-20-plus"],
};

const PUBLISHED_RESEARCH = {
  "classic-sandwich": [{
    title: "Lightweight scan: no reproducible broad NFL ATS study located",
    url: null,
    commonDefinition: "Inferior or lower-profile opponent between two stronger/high-profile opponents.",
    claimedRecord: null,
    samplePeriod: null,
    caveat: "Most examples were narrative picks or proprietary query results without stable broad definitions.",
  }],
  "look-ahead": [{
    title: "Lightweight scan: no reproducible broad NFL ATS study located",
    url: null,
    commonDefinition: "Lesser opponent immediately before a more important opponent.",
    claimedRecord: null,
    samplePeriod: null,
    caveat: "Search results commonly concerned advance/look-ahead market lines, not the situational angle.",
  }],
  letdown: [{
    title: "NFL News: Mythbusters - NFL Edition (VegasInsider)",
    url: "https://www.vegasinsider.com/nfl/story.cfm/story/1931638/",
    commonDefinition: "Team performance in the game after an upset win.",
    claimedRecord: "1068-1110-57 ATS (49.0%); prior win as >3-point underdog: 574-611-28 ATS (48.4%).",
    samplePeriod: "29-year database; exact endpoints not stated in the accessible summary.",
    caveat: "Third-party SDQL database and a narrower upset-only definition than this study's v1 composite proxy.",
  }],
  "short-rest-disadvantage": [{
    title: "Thursday Night Football NFL Betting Trends (FanDuel Research)",
    url: "https://www.fanduel.com/research/thursday-night-football-nfl-betting-trends-historical-spread-over-under-analysis",
    commonDefinition: "Thursday games used as the common short-rest proxy.",
    claimedRecord: "Thursday home teams covered 45.7% in the cited table.",
    samplePeriod: "2019-2024 regular seasons.",
    caveat: "Home/road TNF split, not a direct rest-differential design; both teams may have equal short rest.",
  }],
  "rest-advantage": [{
    title: "Bye-bye, bye advantage: estimating the competitive impact of rest differential in the NFL",
    url: "https://www.frontiersin.org/journals/behavioral-economics/articles/10.3389/frbhe.2024.1479832/full",
    commonDefinition: "Game-level rest differential, including bye and mini-bye advantages.",
    claimedRecord: "No significant modern competitive edge; the paper reports a pre-2011 bye advantage of about +2.2 points that was mitigated after 2011.",
    samplePeriod: "2002-2010 versus 2011-2023.",
    caveat: "Causal/model-based point effect, not a simple ATS system record.",
  }],
  "post-bye": [{
    title: "Bye-bye, bye advantage: estimating the competitive impact of rest differential in the NFL",
    url: "https://www.frontiersin.org/journals/behavioral-economics/articles/10.3389/frbhe.2024.1479832/full",
    commonDefinition: "Team with the bye/rest edge in its next game.",
    claimedRecord: "Pre-2011 advantage about +2.2 points per game; no significant evidence of a modern edge after the 2011 CBA change.",
    samplePeriod: "2002-2010 versus 2011-2023.",
    caveat: "Measures adjusted competitive effect and market pricing, not the exact v1 missing-week rule.",
  }],
  "pre-bye": [{
    title: "Lightweight scan: no reproducible broad NFL ATS study located",
    url: null,
    commonDefinition: "Final game before a scheduled bye.",
    claimedRecord: null,
    samplePeriod: null,
    caveat: "Published material found was team-specific or anecdotal.",
  }],
  "consecutive-road": [{
    title: "Lightweight scan: no reproducible broad NFL ATS study located",
    url: null,
    commonDefinition: "Second or later game in an uninterrupted road sequence.",
    claimedRecord: null,
    samplePeriod: null,
    caveat: "Search results did not provide a stable, broad NFL ATS benchmark with disclosed sample rules.",
  }],
  "west-to-east-early": [
    {
      title: "Do Early Games Hurt West Coast NFL Teams? (Brown Sports Analytics GISP)",
      url: "https://sportsanalyticsgisp.wordpress.com/2017/10/13/do-early-games-hurt-west-coast-nfl-teams/",
      commonDefinition: "West Coast teams playing 1 p.m. Eastern road games.",
      claimedRecord: "Reported tests found no significant additional performance reduction from a 1 p.m. kickoff.",
      samplePeriod: "Not stated in the accessible summary.",
      caveat: "Performance analysis; source and exact ATS grading require review.",
    },
    {
      title: "NFL Playoff Betting Tip: West Coast Teams Traveling East (Action Network)",
      url: "https://www.actionnetwork.com/nfl/nfl-betting-tip-west-coast-teams-traveling-east-spread-performance",
      commonDefinition: "West Coast road teams against East Coast teams.",
      claimedRecord: "115-111-7 ATS (50.9%) in the cited broad travel sample.",
      samplePeriod: "Exact endpoints not stated in the accessible summary.",
      caveat: "Broader than early kickoffs and article cautions that recent outperformance may regress.",
    },
  ],
  "divisional-underdog": [{
    title: "The Performance of Betting Lines for Predicting the Outcome of NFL Games",
    url: "https://arxiv.org/abs/1211.4000",
    commonDefinition: "Underdog ATS performance; the paper reports home underdogs but does not isolate divisional games.",
    claimedRecord: "Home underdogs covered 53.5% in the paper's sample.",
    samplePeriod: "2002-2011, 2,560 regular- and postseason games.",
    caveat: "Adjacent benchmark only; not evidence for the divisional-underdog subset.",
  }],
  "after-blowout-win": [{
    title: "Lightweight scan: no reproducible broad next-game NFL ATS study located",
    url: null,
    commonDefinition: "Team's next game after a large-margin victory, commonly 20+ points.",
    claimedRecord: null,
    samplePeriod: null,
    caveat: "Available results focused on season-level regression or memorable teams, not the next-game broad angle.",
  }],
  "after-blowout-loss": [{
    title: "NFL Betting Tip: Find Value With Teams off Blowout Losses (Action Network)",
    url: "https://www.actionnetwork.com/nfl/nfl-betting-tip-system-value-blowout-losses",
    commonDefinition: "Bet the team in its next game after losing by at least 20 points.",
    claimedRecord: "429-365-18 ATS (54.0%).",
    samplePeriod: "Since 2003 through the article's publication window.",
    caveat: "Third-party database; source line policy and exact endpoint are not disclosed in the accessible summary.",
  }],
};

function parseArgs(argv) {
  const args = { input: null, startSeason: null, endSeason: null, generatedAt: null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--input=")) args.input = resolve(raw.slice(8));
    else if (raw.startsWith("--start-season=")) args.startSeason = Number(raw.slice(15));
    else if (raw.startsWith("--end-season=")) args.endSeason = Number(raw.slice(13));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function canonicalTeam(code, teamByNflverse, teamByAbbr) {
  const upper = String(code ?? "").trim().toUpperCase();
  const alias = TEAM_ALIASES[upper];
  const team = alias ? teamByAbbr.get(alias) : teamByNflverse.get(upper);
  if (!team) throw new Error(`Unknown NFL team code: ${code}`);
  return team;
}

function optionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeFullCsv(csvText, teams) {
  const rows = parseCsv(csvText);
  const required = ["game_id", "season", "game_type", "week", "gameday", "gametime", "away_team", "home_team", "away_score", "home_score", "location", "spread_line"];
  if (!rows.length || required.some((column) => !(column in rows[0]))) {
    throw new Error(`Full nflverse input is missing required columns: ${required.join(", ")}`);
  }
  const teamByNflverse = new Map(teams.map((team) => [team.nflverseAbbr, team]));
  const teamByAbbr = new Map(teams.map((team) => [team.abbr, team]));
  return rows.map((row) => {
    const home = canonicalTeam(row.home_team, teamByNflverse, teamByAbbr);
    const away = canonicalTeam(row.away_team, teamByNflverse, teamByAbbr);
    return {
      gameId: row.game_id,
      season: Number(row.season),
      week: Number(row.week),
      seasonType: row.game_type,
      kickoffUtc: etToUtcIso(row.gameday, row.gametime),
      homeAbbr: home.abbr,
      awayAbbr: away.abbr,
      homeSourceAbbr: row.home_team,
      awaySourceAbbr: row.away_team,
      homeScore: optionalNumber(row.home_score),
      awayScore: optionalNumber(row.away_score),
      neutralSite: row.location === "Neutral",
      spreadLine: optionalNumber(row.spread_line),
      totalLine: optionalNumber(row.total_line),
      sourceHomeRest: optionalNumber(row.home_rest),
      sourceAwayRest: optionalNumber(row.away_rest),
    };
  });
}

function loadOffline2025() {
  const inputTexts = {};
  const games = [];
  for (const season of [2024, 2025]) {
    const gamesPath = join(ROOT, "public", "data", "nfl", String(season), "games.json");
    const resultsPath = join(ROOT, "public", "data", "nfl", String(season), "results.json");
    const gamesText = readFileSync(gamesPath, "utf8");
    const resultsText = readFileSync(resultsPath, "utf8");
    inputTexts[gamesPath] = gamesText;
    inputTexts[resultsPath] = resultsText;
    const gameRows = JSON.parse(gamesText).games;
    const resultById = new Map(JSON.parse(resultsText).results.map((result) => [result.gameId, result]));
    for (const game of gameRows) {
      const result = resultById.get(game.gameId);
      games.push({
        gameId: game.gameId,
        season: game.season,
        week: game.week,
        seasonType: game.seasonType,
        kickoffUtc: game.dateUtc,
        homeAbbr: game.homeAbbr,
        awayAbbr: game.awayAbbr,
        homeSourceAbbr: game.homeAbbr.toUpperCase(),
        awaySourceAbbr: game.awayAbbr.toUpperCase(),
        homeScore: result?.homeScore ?? null,
        awayScore: result?.awayScore ?? null,
        neutralSite: game.neutralSite === true,
        spreadLine: null,
        totalLine: null,
        sourceHomeRest: null,
        sourceAwayRest: null,
      });
    }
  }
  const benchmarkText = readFileSync(BENCHMARK_PATH, "utf8");
  inputTexts[BENCHMARK_PATH] = benchmarkText;
  const marketRows = parseCsv(benchmarkText.split(/\r?\n/).filter((line) => !line.trimStart().startsWith("#")).join("\n"));
  const marketById = new Map(marketRows.map((row) => [row.game_id, Number(row.spread_line)]));
  for (const game of games) if (marketById.has(game.gameId)) game.spreadLine = marketById.get(game.gameId);
  return { games, inputTexts };
}

function gameSide(game, team) {
  const isHome = game.homeAbbr === team;
  if (!isHome && game.awayAbbr !== team) throw new Error(`Team ${team} is not in ${game.gameId}`);
  return {
    team,
    opponent: isHome ? game.awayAbbr : game.homeAbbr,
    teamSourceAbbr: isHome ? game.homeSourceAbbr : game.awaySourceAbbr,
    opponentSourceAbbr: isHome ? game.awaySourceAbbr : game.homeSourceAbbr,
    venue: game.neutralSite ? "neutral" : isHome ? "home" : "away",
    teamScore: isHome ? game.homeScore : game.awayScore,
    opponentScore: isHome ? game.awayScore : game.homeScore,
    pointMargin: isHome ? game.homeScore - game.awayScore : game.awayScore - game.homeScore,
    teamSpread: teamRelativeSpread(game.spreadLine, isHome),
    sourceRestDays: isHome ? game.sourceHomeRest : game.sourceAwayRest,
  };
}

function buildTeamRows(games, teams, studySeasons) {
  const divisionByTeam = new Map(teams.map((team) => [team.abbr, team.division]));
  const priorPlayoffBySeason = new Map(studySeasons.map((season) => [season, new Set(
    games.filter((game) => game.season === season - 1 && game.seasonType !== "REG")
      .flatMap((game) => [game.homeAbbr, game.awayAbbr])
  )]));
  const targetGames = games.filter((game) => studySeasons.includes(game.season) && game.seasonType === "REG" &&
    game.kickoffUtc && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore));
  const baseRows = [];
  for (const team of teams.map((value) => value.abbr)) {
    const log = targetGames.filter((game) => game.homeAbbr === team || game.awayAbbr === team)
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId));
    for (let index = 0; index < log.length; index += 1) {
      const game = log[index];
      const previousGame = index > 0 && log[index - 1].season === game.season ? log[index - 1] : null;
      const nextGame = index + 1 < log.length && log[index + 1].season === game.season ? log[index + 1] : null;
      const side = gameSide(game, team);
      const previousSide = previousGame ? gameSide(previousGame, team) : null;
      const nextSide = nextGame ? gameSide(nextGame, team) : null;
      const division = divisionByTeam.get(team);
      const opponentDivision = divisionByTeam.get(side.opponent);
      baseRows.push({
        schemaVersion: "nfl-situational-trend-team-game-v1",
        rowId: `${game.gameId}:${team}`,
        gameId: game.gameId,
        season: game.season,
        week: game.week,
        kickoffUtc: game.kickoffUtc,
        team,
        opponent: side.opponent,
        teamSourceAbbr: side.teamSourceAbbr,
        opponentSourceAbbr: side.opponentSourceAbbr,
        venue: side.venue,
        teamScore: side.teamScore,
        opponentScore: side.opponentScore,
        pointMargin: side.pointMargin,
        suResult: side.pointMargin > 0 ? "W" : side.pointMargin < 0 ? "L" : "T",
        spreadLineHomeMargin: game.spreadLine,
        teamSpread: side.teamSpread,
        closingTotal: game.totalLine,
        atsCoverMargin: atsCoverMargin(side.pointMargin, side.teamSpread),
        atsResult: gradeTeamAts(side.pointMargin, side.teamSpread),
        division,
        opponentDivision,
        divisional: isDivisionalMatchup(division, opponentDivision),
        teamTimeZone: teamTimeZone(team, game.season),
        opponentTimeZone: teamTimeZone(side.opponent, game.season),
        sourceRestDays: side.sourceRestDays,
        restDays: previousGame ? calculateRestDays(previousGame.kickoffUtc, game.kickoffUtc) : null,
        previousGame: previousGame ? {
          gameId: previousGame.gameId,
          week: previousGame.week,
          kickoffUtc: previousGame.kickoffUtc,
          opponent: previousSide.opponent,
          pointMargin: previousSide.pointMargin,
          teamSpread: previousSide.teamSpread,
          divisional: isDivisionalMatchup(division, divisionByTeam.get(previousSide.opponent)),
          primeTime: isPrimeTimeKickoff(previousGame.kickoffUtc),
        } : null,
        nextGame: nextGame ? {
          gameId: nextGame.gameId,
          week: nextGame.week,
          kickoffUtc: nextGame.kickoffUtc,
          opponent: nextSide.opponent,
          divisional: isDivisionalMatchup(division, divisionByTeam.get(nextSide.opponent)),
        } : null,
        postBye: isByeGap(previousGame, game),
        preBye: isByeGap(game, nextGame),
        roadSequence: roadSequenceAt(log.map((item) => ({ venue: gameSide(item, team).venue })), index),
        trendIds: [],
        trendVariantIds: [],
      });
    }
  }

  const byRowId = new Map(baseRows.map((row) => [row.rowId, row]));
  for (const row of baseRows) {
    const opponentRow = byRowId.get(`${row.gameId}:${row.opponent}`);
    row.opponentRestDays = opponentRow?.restDays ?? null;
    row.restDifferential = Number.isFinite(row.restDays) && Number.isFinite(row.opponentRestDays)
      ? row.restDays - row.opponentRestDays : null;
    row.restSourceDifference = Number.isFinite(row.sourceRestDays) && Number.isFinite(row.restDays)
      ? row.restDays - row.sourceRestDays : null;
    const playoffTeams = priorPlayoffBySeason.get(row.season);
    const currentMajor = isMajorOpponent({ divisional: row.divisional, opponent: row.opponent, priorSeasonPlayoffTeams: playoffTeams });
    const previousMajor = row.previousGame ? isMajorOpponent({
      divisional: row.previousGame.divisional,
      opponent: row.previousGame.opponent,
      priorSeasonPlayoffTeams: playoffTeams,
    }) : false;
    const nextMajor = row.nextGame ? isMajorOpponent({
      divisional: row.nextGame.divisional,
      opponent: row.nextGame.opponent,
      priorSeasonPlayoffTeams: playoffTeams,
    }) : false;
    const lesserFavorite = isLesserFavorite({ majorOpponent: currentMajor, teamSpread: row.teamSpread });
    const previousUpsetWin = row.previousGame?.pointMargin > 0 && row.previousGame.teamSpread >= 3;
    const previousSignificantWin = qualifiesLetdown({
      previousPointMargin: row.previousGame?.pointMargin,
      previousTeamSpread: row.previousGame?.teamSpread,
      previousMajorOpponent: previousMajor,
      previousPrimeTime: row.previousGame?.primeTime,
    });
    const blowout = blowoutThresholds(row.previousGame?.pointMargin);
    const trendIds = [];
    const variants = [];
    if (qualifiesSandwich({ lesserFavorite, previousMajorOpponent: previousMajor, nextMajorOpponent: nextMajor })) trendIds.push("classic-sandwich");
    if (qualifiesLookAhead({ lesserFavorite, nextMajorOpponent: nextMajor })) trendIds.push("look-ahead");
    if (previousSignificantWin) trendIds.push("letdown");
    if (row.restDays <= 6 && row.restDifferential <= -1) trendIds.push("short-rest-disadvantage");
    if (row.restDifferential >= 3) trendIds.push("rest-advantage");
    if (row.postBye) trendIds.push("post-bye");
    if (row.preBye) trendIds.push("pre-bye");
    if (row.roadSequence >= 2) {
      trendIds.push("consecutive-road");
      variants.push(row.roadSequence === 2 ? "road-game-2" : "road-game-3-plus");
    }
    if (isWestToEastEarly(row)) trendIds.push("west-to-east-early");
    if (row.divisional && row.teamSpread > 0) {
      trendIds.push("divisional-underdog");
      if (row.venue === "home") variants.push("divisional-dog-home");
      if (row.venue === "away") variants.push("divisional-dog-road");
    }
    if (blowout.win14) {
      trendIds.push("after-blowout-win");
      variants.push("after-win-14-plus");
      if (blowout.win17) variants.push("after-win-17-plus");
      if (blowout.win20) variants.push("after-win-20-plus");
    }
    if (blowout.loss14) {
      trendIds.push("after-blowout-loss");
      variants.push("after-loss-14-plus");
      if (blowout.loss17) variants.push("after-loss-17-plus");
      if (blowout.loss20) variants.push("after-loss-20-plus");
    }
    row.qualifierInputs = {
      currentMajorOpponent: currentMajor,
      previousMajorOpponent: previousMajor,
      nextMajorOpponent: nextMajor,
      lesserFavorite,
      previousUpsetWin,
      previousSignificantWin,
      westToEastEarly: isWestToEastEarly(row),
      ...blowout,
    };
    row.trendIds = trendIds;
    row.trendVariantIds = variants;
  }
  return baseRows.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));
}

function addVariants(results, teamRows, studySeasons) {
  return results.map((result) => ({
    ...result,
    variants: (VARIANTS[result.id] ?? []).map((variantId) => {
      const rows = teamRows.filter((row) => row.trendVariantIds.includes(variantId));
      const reportingWindows = buildReportingWindows(rows);
      return {
        id: variantId,
        metrics: reportingWindows.fullHistory.metrics,
        reportingWindows,
        stability: summarizeStability(rows),
        seasonSplits: studySeasons.map((season) => ({ season, ...summarizeRows(rows.filter((row) => row.season === season)) })),
      };
    }),
    publishedResearch: PUBLISHED_RESEARCH[result.id],
  }));
}

function pct(value) {
  return value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function record(metrics, prefix) {
  return prefix === "ATS"
    ? `${metrics.atsWins}-${metrics.atsLosses}-${metrics.atsPushes}`
    : `${metrics.suWins}-${metrics.suLosses}-${metrics.suTies}`;
}

function number(value) {
  return value == null ? "N/A" : value.toFixed(2).replace(/\.00$/, "");
}

function rangeLabel(window) {
  return `${window.label} (${window.startSeason}-${window.endSeason})`;
}

function metricTableRows(reportingWindows) {
  return [reportingWindows.fullHistory, reportingWindows.recentForm].map((window) => {
    const metrics = window.metrics;
    return `| ${rangeLabel(window)} | ${metrics.qualifyingTeamGames} | ${record(metrics, "ATS")} | ${pct(metrics.atsWinPct)} | ${pct(metrics.atsRoiAtMinus110)} | ${record(metrics, "SU")} | ${pct(metrics.suWinPct)} | ${number(metrics.averageTeamSpread)} | ${number(metrics.averageAtsCoverMargin)} | ${pct(metrics.atsWilson95.low)}-${pct(metrics.atsWilson95.high)} |`;
  });
}

function markdown(artifact) {
  const fullWindow = artifact.reportingWindows.fullHistory;
  const recentWindow = artifact.reportingWindows.recentForm;
  const generatedLine = artifact.generatedAt ? [`Generated: ${artifact.generatedAt}`, ""] : [];
  const lines = [
    "# NFL Situational Trends Study v1",
    "",
    ...generatedLine,
    "> Research artifact only. These are descriptive historical associations, not picks, calibrated probabilities, or proof of predictive value.",
    "",
    "## Dataset and grading",
    "",
    `This run covers **${artifact.dataset.seasons[0]}-${artifact.dataset.seasons.at(-1)}** (${artifact.dataset.regularSeasonGames} regular-season games; ${artifact.dataset.teamGames} team-games; ${artifact.dataset.gamesWithSpread}/${artifact.dataset.regularSeasonGames} games with spreads). It uses one source policy: ${artifact.dataset.marketSource}.`,
    "",
    `Standard comparison windows are fixed before results are reviewed: **${rangeLabel(fullWindow)}** and **${rangeLabel(recentWindow)}**. The historical stability split is fixed at **${FIXED_ERA_WINDOWS.olderEra.startSeason}-${FIXED_ERA_WINDOWS.olderEra.endSeason}** versus **${FIXED_ERA_WINDOWS.newerEra.startSeason}-${FIXED_ERA_WINDOWS.newerEra.endSeason}**. A recent ATS-rate change of at least ${(RECENT_MATERIAL_DIFFERENCE * 100).toFixed(0)} percentage points is labeled material; neither boundary is optimized from results.`,
    "",
    "The source spread is a home-margin number: positive means the home team was favored. Team-relative conventional spread is its inverse for the home team and unchanged for the away team. ATS cover margin is `team scoring margin + team-relative spread`; positive is a win, negative a loss, and zero a push. Pushes are excluded from ATS percentage and -110 ROI.",
    "",
    `Full-sample team-game baseline: ${record(artifact.baseline, "ATS")} ATS (${pct(artifact.baseline.atsWinPct)}), ${record(artifact.baseline, "SU")} SU (${pct(artifact.baseline.suWinPct)}). Mirrored team-game rows make the ATS baseline approximately 50% by construction.`,
    "",
    "## Comparison summary",
    "",
    "Every approved trend remains visible because it is a common/classic football betting angle. Evidence labels describe the historical record; they do not decide whether an angle belongs in the reference library.",
    "",
    "| Trend | Angle status | Full ATS | Recent ATS | Full ROI | Recent ROI | Historical evidence | Recent evidence |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
  ];
  for (const trend of artifact.trends) {
    const full = trend.reportingWindows.fullHistory.metrics;
    const recent = trend.reportingWindows.recentForm.metrics;
    lines.push(`| ${trend.name} | ${trend.commonAngleStatus} | ${record(full, "ATS")} (${pct(full.atsWinPct)}) | ${record(recent, "ATS")} (${pct(recent.atsWinPct)}) | ${pct(full.atsRoiAtMinus110)} | ${pct(recent.atsRoiAtMinus110)} | ${trend.historicalEvidenceStrength} (${trend.confidence}) | ${trend.recentEvidenceStrength} |`);
  }
  lines.push("", "## Trend-by-trend window detail", "");
  artifact.trends.forEach((trend, index) => {
    lines.push(
      `### ${index + 1}. ${trend.name}`,
      "",
      `**Angle:** ${trend.commonAngleStatus}  `,
      `**Historical evidence:** ${trend.historicalEvidenceStrength} (${trend.confidence})  `,
      `**Recent evidence:** ${trend.recentEvidenceStrength}`,
      "",
      trend.explanation,
      "",
      "| Window | Team-games | ATS W-L-P | ATS % | ROI (-110) | SU W-L-T | SU % | Avg spread | Avg cover margin | 95% CI |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...metricTableRows(trend.reportingWindows),
      ""
    );
  });
  lines.push("## Stability analysis", "", `The fixed era split is ${FIXED_ERA_WINDOWS.olderEra.startSeason}-${FIXED_ERA_WINDOWS.olderEra.endSeason} versus ${FIXED_ERA_WINDOWS.newerEra.startSeason}-${FIXED_ERA_WINDOWS.newerEra.endSeason}. “Direction reversal” means the era ATS rates fall on opposite sides of 50%; “recent differs” uses the fixed ${(RECENT_MATERIAL_DIFFERENCE * 100).toFixed(0)}-percentage-point threshold.`, "", "| Trend | Older-era ATS % | Newer-era ATS % | Both > break-even | Both < break-even | Direction reverses | Recent differs | Recent change |", "| --- | ---: | ---: | --- | --- | --- | --- | --- |");
  for (const trend of artifact.trends) {
    const s = trend.stability;
    lines.push(`| ${trend.name} | ${pct(s.olderEra.metrics.atsWinPct)} | ${pct(s.newerEra.metrics.atsWinPct)} | ${s.comparison.bothErasAboveBreakEven ? "Yes" : "No"} | ${s.comparison.bothErasBelowBreakEven ? "Yes" : "No"} | ${s.comparison.directionReverses ? "Yes" : "No"} | ${s.comparison.recentMateriallyDiffersFromFullHistory ? "Yes" : "No"} | ${s.comparison.recentChange} |`);
  }
  lines.push("", "## Exact v1 definitions", "");
  artifact.trends.forEach((trend, index) => lines.push(`${index + 1}. **${trend.name}:** ${trend.rule}`));
  lines.push("", "A **major opponent** is either a divisional opponent or a team that reached the prior season's playoffs. A **lesser opponent** in the two schedule-spot proxies is non-major and the studied team must be a closing favorite of at least six points. These deliberately sparse proxies can be revised from preserved raw components without changing ATS grading.", "", "## Predefined variants", "");
  for (const trend of artifact.trends.filter((item) => item.variants.length)) {
    lines.push(`### ${trend.name}`, "");
    for (const variant of trend.variants) {
      lines.push(`#### ${variant.id}`, "", "| Window | Team-games | ATS W-L-P | ATS % | ROI (-110) | SU W-L-T | SU % | Avg spread | Avg cover margin | 95% CI |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", ...metricTableRows(variant.reportingWindows), "");
    }
    lines.push("");
  }
  lines.push("## Lightweight published-research benchmarks", "");
  for (const trend of artifact.trends) {
    lines.push(`### ${trend.name}`, "");
    for (const source of trend.publishedResearch) {
      const title = source.url ? `[${source.title}](${source.url})` : source.title;
      lines.push(`- ${title}. Definition: ${source.commonDefinition} Claim: ${source.claimedRecord ?? "No stable broad record captured."} Period: ${source.samplePeriod ?? "Not stated."} Caveat: ${source.caveat}`);
    }
    lines.push("");
  }
  lines.push(
    "## Stability and interpretation",
    "",
    `Every trend includes the fixed full-history and recent windows plus the deterministic ${FIXED_ERA_WINDOWS.olderEra.startSeason}-${FIXED_ERA_WINDOWS.olderEra.endSeason} / ${FIXED_ERA_WINDOWS.newerEra.startSeason}-${FIXED_ERA_WINDOWS.newerEra.endSeason} era split. Season-level rows remain in the JSON for every qualifier.`,
    "",
    "The evidence classifier requires at least 100 ATS decisions and five observed seasons before moving beyond `INSUFFICIENT DATA`. `HISTORICALLY MEANINGFUL` additionally requires at least 200 decisions, eight seasons, a 95% interval beyond the relevant 52.38% -110 profitability boundary (directly or as a fade), the same direction in both fixed eras, and no material recent reversal. `CONTEXT-DEPENDENT` captures meaningful magnitudes or changes that lack that stability. `LITTLE/NO EVIDENCE` means the common angle remains documented but its broad ATS history is neutral.",
    "",
    "## Data-quality limitations",
    "",
    ...artifact.limitations.map((limitation) => `- ${limitation}`),
    "",
    "## Reproduction and future weekly use",
    "",
    "Run `npm run nfl:situational-trends -- --input=data/external/nflverse/games.csv --start-season=2011 --end-season=2025` with one local full nflverse snapshot. The no-input mode is only a committed 2025 smoke-test fixture. The JSONL retains schedule neighbors, margins, spreads, rest, divisions, zones, and qualifier inputs. Current-game qualification can therefore call the same deterministic rules while historical performance remains a separate artifact.",
    "",
    "No production prediction, power-rating, matchup, total, prop, archive, outcome resolver, or grading file is read as a model input or modified by this study.",
    ""
  );
  return lines.join("\n");
}

function validate(teamRows, games, studySeasons) {
  const targetGames = games.filter((game) => studySeasons.includes(game.season) && game.seasonType === "REG" && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore));
  if (teamRows.length !== targetGames.length * 2) throw new Error("Expected exactly two team rows per completed regular-season game.");
  const byGame = new Map();
  for (const row of teamRows) {
    const rows = byGame.get(row.gameId) ?? [];
    rows.push(row);
    byGame.set(row.gameId, rows);
  }
  const allowedTrendIds = new Set(TREND_DEFINITIONS.map((definition) => definition.id));
  for (const [gameId, rows] of byGame) {
    if (rows.length !== 2) throw new Error(`${gameId} does not have two team rows.`);
    if (rows[0].pointMargin !== -rows[1].pointMargin) throw new Error(`${gameId} point margins are not reciprocal.`);
    if (rows[0].atsCoverMargin != null && rows[0].atsCoverMargin !== -rows[1].atsCoverMargin) throw new Error(`${gameId} ATS margins are not reciprocal.`);
    const atsPair = rows.map((row) => row.atsResult).sort().join("");
    if (atsPair !== "LW" && atsPair !== "PP") throw new Error(`${gameId} has invalid reciprocal ATS grades: ${atsPair}.`);
    for (const row of rows) {
      if (row.trendIds.some((id) => !allowedTrendIds.has(id))) throw new Error(`${row.rowId} has an unknown trend ID.`);
      if (row.trendIds.includes("classic-sandwich") && !row.trendIds.includes("look-ahead")) throw new Error(`${row.rowId} sandwich must also satisfy look-ahead.`);
    }
  }
  const variantCount = (id) => teamRows.filter((row) => row.trendVariantIds.includes(id)).length;
  if (!(variantCount("after-win-14-plus") >= variantCount("after-win-17-plus") && variantCount("after-win-17-plus") >= variantCount("after-win-20-plus"))) {
    throw new Error("Blowout-win threshold cohorts are not nested.");
  }
  if (!(variantCount("after-loss-14-plus") >= variantCount("after-loss-17-plus") && variantCount("after-loss-17-plus") >= variantCount("after-loss-20-plus"))) {
    throw new Error("Blowout-loss threshold cohorts are not nested.");
  }
  return {
    reciprocalGameChecks: byGame.size,
    allowedTrendIdChecks: teamRows.length,
    sandwichSubsetCheck: true,
    nestedBlowoutThresholdCheck: true,
    spotChecks: [
      "2025_01_DAL_PHI", "2025_01_KC_LAC", "2025_02_WSH_GB", "2025_07_TB_DET",
      "2025_10_LV_DEN", "2025_13_GB_DET", "2025_17_BAL_GB", "2025_18_CLE_CIN",
    ].filter((gameId) => byGame.has(gameId)).map((gameId) => ({
      gameId,
      rows: byGame.get(gameId).map((row) => ({ team: row.team, score: `${row.teamScore}-${row.opponentScore}`, spread: row.teamSpread, ats: row.atsResult, rest: row.restDays, trends: row.trendIds })),
    })),
  };
}

function write(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, "utf8");
}

function windowMetadata(window, studySeasons) {
  const expectedSeasons = Array.from({ length: window.endSeason - window.startSeason + 1 }, (_, index) => window.startSeason + index);
  const observedSeasons = expectedSeasons.filter((season) => studySeasons.includes(season));
  return {
    ...window,
    expectedSeasons,
    observedSeasons,
    complete: observedSeasons.length === expectedSeasons.length,
  };
}

function validateReportArtifact(artifact) {
  if (artifact.trends.length !== TREND_DEFINITIONS.length) throw new Error(`Expected all ${TREND_DEFINITIONS.length} approved trends in the report.`);
  const trendIds = artifact.trends.map((trend) => trend.id);
  if (new Set(trendIds).size !== trendIds.length) throw new Error("Report contains duplicate trend IDs.");
  const requiredMetricFields = [
    "qualifyingTeamGames", "atsWins", "atsLosses", "atsPushes", "atsWinPct", "atsRoiAtMinus110",
    "suWins", "suLosses", "suTies", "suWinPct", "averageTeamSpread", "averageAtsCoverMargin", "atsWilson95",
  ];
  const assertWindows = (owner, label) => {
    for (const windowKey of ["fullHistory", "recentForm"]) {
      const metrics = owner.reportingWindows?.[windowKey]?.metrics;
      if (!metrics || requiredMetricFields.some((field) => !(field in metrics))) {
        throw new Error(`${label} is missing required ${windowKey} metrics.`);
      }
    }
  };
  for (const trend of artifact.trends) {
    assertWindows(trend, trend.id);
    for (const variant of trend.variants) assertWindows(variant, `${trend.id}/${variant.id}`);
  }
  const actualVariants = Object.fromEntries(artifact.trends.map((trend) => [trend.id, trend.variants.map((variant) => variant.id)]));
  for (const [trendId, expected] of Object.entries(VARIANTS)) {
    if (JSON.stringify(actualVariants[trendId]) !== JSON.stringify(expected)) throw new Error(`${trendId} predefined variants changed or were suppressed.`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const teamsText = readFileSync(TEAMS_PATH, "utf8");
  const teams = JSON.parse(teamsText).teams;
  let games;
  let inputTexts;
  let studySeasons;
  let sourceMode;
  if (args.input) {
    if (!existsSync(args.input)) throw new Error(`Input file not found: ${args.input}`);
    const csvText = readFileSync(args.input, "utf8");
    games = normalizeFullCsv(csvText, teams);
    inputTexts = { [args.input]: csvText, [TEAMS_PATH]: teamsText };
    const start = args.startSeason ?? 2011;
    const end = args.endSeason ?? 2025;
    studySeasons = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    sourceMode = "full-nflverse-snapshot";
  } else {
    const offline = loadOffline2025();
    games = offline.games;
    inputTexts = { ...offline.inputTexts, [TEAMS_PATH]: teamsText };
    studySeasons = [2025];
    sourceMode = "committed-2025-offline-join";
  }
  const regularSeasonGames = games.filter((game) => studySeasons.includes(game.season) && game.seasonType === "REG" && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore));
  const spreadGames = regularSeasonGames.filter((game) => Number.isFinite(game.spreadLine));
  if (!regularSeasonGames.length) throw new Error("No completed regular-season games in requested sample.");
  if (spreadGames.length / regularSeasonGames.length < 0.95) throw new Error(`Spread coverage ${(spreadGames.length / regularSeasonGames.length * 100).toFixed(1)}% is below the 95% integrity gate.`);
  const teamRows = buildTeamRows(games, teams, studySeasons);
  const qa = validate(teamRows, games, studySeasons);
  const generatedAt = args.generatedAt ?? null;
  const baselineReportingWindows = buildReportingWindows(teamRows);
  const artifact = {
    schemaVersion: "nfl-situational-trends-study-v1",
    reportSchemaVersion: "nfl-situational-trends-report-v2",
    studyVersion: STUDY_VERSION,
    definitionVersion: DEFINITION_VERSION,
    generatedAt,
    researchLayers: {
      historicalTrendDefinitions: "trends[].id, name, rule, definitionVersion, and publishedResearch",
      historicalTrendPerformance: "trends[].reportingWindows, seasonSplits, stability, variants, classification, confidence, and evidence strength",
      currentGameQualification: {
        implementation: "scripts/lib/nfl-situational-trends-core.mjs plus the composition in scripts/research/generate-nfl-situational-trends-v1.mjs",
        requiredPregameInputs: [
          "current game teams, divisions, kickoff, venue, and team-relative spread",
          "immediately previous game kickoff, opponent, closing spread, final margin, and kickoff time",
          "next scheduled same-season opponent and week",
          "prior-season playoff participants",
          "team season-aware home time zone",
        ],
        note: "Historical performance is never recomputed by a current-week consumer; consumers apply the versioned rule to current inputs and join the published historical result by trend ID.",
      },
    },
    dataset: {
      sourceMode,
      seasons: studySeasons,
      regularSeasonGames: regularSeasonGames.length,
      teamGames: teamRows.length,
      gamesWithSpread: spreadGames.length,
      spreadCoveragePct: Math.round(spreadGames.length / regularSeasonGames.length * 10_000) / 10_000,
      gamesWithTotal: regularSeasonGames.filter((game) => Number.isFinite(game.totalLine)).length,
      marketSource: "nflverse / nfldata single settled historical market line; unnamed book, no row timestamp, not independently verified as closing",
      inputFiles: Object.entries(inputTexts).map(([path, text]) => ({ path: path.replace(`${ROOT}\\`, "").replaceAll("\\", "/"), sha256: sha256(text), bytes: Buffer.byteLength(text) })),
    },
    reportingWindows: {
      fullHistory: windowMetadata(REPORTING_WINDOWS.fullHistory, studySeasons),
      recentForm: windowMetadata(REPORTING_WINDOWS.recentForm, studySeasons),
    },
    stabilityPolicy: {
      olderEra: windowMetadata(FIXED_ERA_WINDOWS.olderEra, studySeasons),
      newerEra: windowMetadata(FIXED_ERA_WINDOWS.newerEra, studySeasons),
      splitSelection: "Fixed midpoint split of the predefined 2011-2025 window; not optimized from results.",
      directionReversalBoundary: 0.5,
      recentMaterialDifferenceThreshold: RECENT_MATERIAL_DIFFERENCE,
    },
    atsGrading: {
      sourceConvention: "spread_line is expected home margin: positive means home favored",
      teamConvention: "teamSpread is conventional team-relative spread: favorite negative, underdog positive",
      formula: "atsCoverMargin = teamPointMargin + teamSpread",
      pushes: "reported separately; excluded from ATS win percentage and -110 ROI denominator",
      roi: "(ATS wins * 100 - ATS losses * 110) / ((ATS wins + ATS losses) * 110)",
    },
    majorOpponentDefinition: "Divisional opponent OR prior-season playoff participant.",
    baseline: baselineReportingWindows.fullHistory.metrics,
    baselineReportingWindows,
    trends: addVariants(evaluateTeamRows(teamRows), teamRows, studySeasons),
    qa,
    limitations: [
      sourceMode === "committed-2025-offline-join" ? "Only 2025 has complete committed game-level spread coverage; all trend conclusions are provisional and generally insufficient." : null,
      "The nflverse/nfldata line is a single unnamed-book settled historical market line with no observation timestamp; it is not asserted to be a verified close or consensus.",
      sourceMode === "committed-2025-offline-join" ? "The offline 2025 smoke-test fixture omits closing totals, moneylines, and provider rest fields; totals remain null and rest is calculated from schedule dates." : null,
      "Major/marquee uses only divisional status and prior-season playoff participation; non-divisional rivalries and media prominence are not modeled.",
      "Prime-time is a kickoff-at-or-after-8:00-p.m.-Eastern proxy.",
      "West-to-East travel is intentionally narrow and does not estimate flight distance, arrival timing, or international travel.",
      "The 2020 season can contain postponement-driven schedule anomalies in a full-history rerun; the missing-week plus date-gap bye rule reduces but cannot eliminate them.",
      "Current team divisions are applied to relocated franchise aliases; divisions are stable over the recommended 2011-2025 window, while time zones are season-aware for the Rams' St. Louis years.",
      "Multiple team-game observations from the same NFL game are not independent; confidence intervals are simple binomial context, not clustered causal estimates.",
    ].filter(Boolean),
  };
  validateReportArtifact(artifact);
  write(TEAM_GAMES_PATH, `${teamRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  write(PUBLIC_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  write(DOC_PATH, markdown(artifact));
  console.log(`Generated ${artifact.trends.length} trends from ${regularSeasonGames.length} games (${studySeasons.join(", ")}).`);
  console.log(`Spread coverage: ${spreadGames.length}/${regularSeasonGames.length}; team rows: ${teamRows.length}.`);
  console.log(`Wrote ${TEAM_GAMES_PATH}`);
  console.log(`Wrote ${PUBLIC_PATH}`);
  console.log(`Wrote ${DOC_PATH}`);
}

main();

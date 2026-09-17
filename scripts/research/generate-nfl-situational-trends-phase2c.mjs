/**
 * Generate NFL Situational Trends Study v1, Phase 2C — Early Season Study.
 *
 * This local-only generator reuses the locked Phase 1 team-game artifact and
 * joins the same nflverse games.csv snapshot by team/season for prior-season
 * regular-season win-loss records and prior-season playoff participation. It
 * never rewrites a Phase 1, Phase 2, or Phase 2B artifact or definition, and
 * it never feeds a production model.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../lib/nfl-schedules-results-core.mjs";
import { FIXED_ERA_WINDOWS, REPORTING_WINDOWS } from "../lib/nfl-situational-trends-core.mjs";
import {
  favoriteSpreadBand,
  underdogSpreadBand,
} from "../lib/nfl-situational-trends-phase2b-core.mjs";
import {
  PHASE2C_DEFINITION_VERSION,
  PHASE2C_SCHEMA_VERSION,
  PHASE2C_STUDY_VERSION,
  PHASE2C_TREND_IDS,
  articleRelevanceFor,
  buildPhase2cVariant,
  currentRoleVariantId,
  currentVenueVariantId,
  doubleDigitClassification,
  doubleDigitMarginBand,
  isWeek1FavoriteAtsLoss,
  isWeek1FavoriteLostOutright,
  isWeek1UnderdogWonOutright,
  marginAtLeast,
  marketRole,
  priorSeasonPlayoffStatus,
  priorSeasonRecordRole,
} from "../lib/nfl-situational-trends-phase2c-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PHASE1_REPORT_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-v1.json");
const PHASE2_REPORT_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-phase2.json");
const PHASE2B_REPORT_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-phase2b.json");
const TEAM_GAMES_PATH = join(ROOT, "data", "nfl", "research", "situational-trend-team-games-v1.jsonl");
const TEAMS_PATH = join(ROOT, "public", "data", "nfl", "teams.json");
const DEFAULT_SOURCE_PATH = join(ROOT, "data", "external", "nflverse", "games.csv");
const PUBLIC_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-phase2c.json");
const DOC_PATH = join(ROOT, "docs", "research", "nfl-situational-trends-phase2c.md");

const TEAM_ALIASES = { OAK: "lv", SD: "lac", STL: "lar", LA: "lar", LAR: "lar", WAS: "wsh", WSH: "wsh", JAC: "jax" };

const LOCKED_BASELINE = {
  seasons: Array.from({ length: 15 }, (_, index) => 2011 + index),
  regularSeasonGames: 3919,
  teamGames: 7838,
  phase1StudyVersion: "nfl-situational-trends-v1",
  phase2StudyVersion: "nfl-situational-trends-phase2-v1",
  phase2bStudyVersion: "nfl-situational-trends-phase2b-v1",
};

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function parseArgs(argv) {
  const args = { input: DEFAULT_SOURCE_PATH, generatedAt: null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--input=")) args.input = resolve(raw.slice(8));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function relativePath(path) {
  return path.replace(`${ROOT}\\`, "").replaceAll("\\", "/");
}

function inputIdentity(path, text) {
  return { path: relativePath(path), sha256: sha256(text), bytes: Buffer.byteLength(text) };
}

function canonicalAbbr(code, teamByNflverse, teamByAbbr) {
  const upper = String(code ?? "").trim().toUpperCase();
  const alias = TEAM_ALIASES[upper];
  const team = alias ? teamByAbbr.get(alias) : teamByNflverse.get(upper);
  return team?.abbr ?? null;
}

/**
 * Builds, from the same locked nflverse snapshot, a per (season, team) index
 * of the team's prior-season (season-1) regular-season win-loss record and
 * prior-season playoff participation. Both are computed the same
 * deterministic way Phase 1 already uses for its major-opponent qualifier.
 */
function priorSeasonIndex(csvText, teams, studySeasons) {
  const rows = parseCsv(csvText);
  const required = ["game_id", "season", "game_type", "home_team", "away_team", "home_score", "away_score"];
  if (!rows.length || required.some((field) => !(field in rows[0]))) {
    throw new Error(`nflverse source is missing required Phase 2C columns: ${required.join(", ")}`);
  }
  const teamByNflverse = new Map(teams.map((team) => [team.nflverseAbbr, team]));
  const teamByAbbr = new Map(teams.map((team) => [team.abbr, team]));
  const games = rows.map((row) => ({
    season: Number(row.season),
    seasonType: row.game_type,
    home: canonicalAbbr(row.home_team, teamByNflverse, teamByAbbr),
    away: canonicalAbbr(row.away_team, teamByNflverse, teamByAbbr),
    homeScore: row.home_score === "" ? null : Number(row.home_score),
    awayScore: row.away_score === "" ? null : Number(row.away_score),
  })).filter((game) => game.home && game.away);

  const index = new Map();
  for (const season of studySeasons) {
    const priorSeason = season - 1;
    const priorRegGames = games.filter((game) => game.season === priorSeason && game.seasonType === "REG" &&
      Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore));
    const priorPlayoffTeams = new Set(
      games.filter((game) => game.season === priorSeason && game.seasonType !== "REG")
        .flatMap((game) => [game.home, game.away])
    );
    const recordByTeam = new Map();
    const bump = (team, key) => recordByTeam.set(team, { ...(recordByTeam.get(team) ?? { wins: 0, losses: 0, ties: 0 }), [key]: (recordByTeam.get(team)?.[key] ?? 0) + 1 });
    for (const game of priorRegGames) {
      if (game.homeScore > game.awayScore) { bump(game.home, "wins"); bump(game.away, "losses"); }
      else if (game.homeScore < game.awayScore) { bump(game.away, "wins"); bump(game.home, "losses"); }
      else { bump(game.home, "ties"); bump(game.away, "ties"); }
    }
    const known = priorRegGames.length > 0;
    for (const team of teams.map((value) => value.abbr)) {
      index.set(`${season}:${team}`, {
        record: known ? (recordByTeam.get(team) ?? { wins: 0, losses: 0, ties: 0 }) : null,
        madePlayoffs: known ? priorPlayoffTeams.has(team) : null,
      });
    }
  }
  return index;
}

function readTeamGameRows() {
  const text = readFileSync(TEAM_GAMES_PATH, "utf8");
  return { text, rows: text.trim().split(/\r?\n/).map((line) => JSON.parse(line)) };
}

/** Attaches Phase 2C prior-season and Week 1 -> Week 2 bounce-back context. */
function annotateRows(rawRows, priorIndex) {
  const rowById = new Map(rawRows.map((row) => [row.rowId, row]));
  const week1SuByTeamSeason = new Map();
  for (const row of rawRows) {
    if (row.week === 1) week1SuByTeamSeason.set(`${row.season}:${row.team}`, row.suResult ?? null);
  }
  return rawRows.map((row) => {
    const priorSeason = priorIndex.get(`${row.season}:${row.team}`) ?? null;
    const previousRow = row.week === 2 && row.previousGame?.week === 1 ? rowById.get(`${row.previousGame.gameId}:${row.team}`) : null;
    const opponentWeek1SuResult = row.week === 2 ? week1SuByTeamSeason.get(`${row.season}:${row.opponent}`) ?? null : null;
    return {
      ...row,
      currentRoleVariant: currentRoleVariantId(row.teamSpread),
      currentVenueVariant: currentVenueVariantId(row.venue),
      teamPriorSeasonRecord: priorSeason?.record ?? null,
      teamPriorSeasonRecordRole: priorSeasonRecordRole(priorSeason?.record),
      teamPriorSeasonPlayoffStatus: priorSeasonPlayoffStatus(priorSeason?.madePlayoffs ?? null),
      previousTeamSpread: previousRow?.teamSpread ?? null,
      previousAtsResult: previousRow?.atsResult ?? null,
      previousSuResult: previousRow?.suResult ?? null,
      previousPointMargin: previousRow?.pointMargin ?? null,
      week1StartRecord: row.week === 2 ? (previousRow?.suResult === "W" ? "1-0" : previousRow?.suResult === "L" ? "0-1" : null) : null,
      opponentWeek1SuResult,
      opponentWeek1StartRecord: opponentWeek1SuResult === "W" ? "1-0" : opponentWeek1SuResult === "L" ? "0-1" : null,
    };
  });
}

function variant(id, label, definition, matches, overlapPolicy = "predefined; may overlap sibling variants") {
  return { id, label, definition, matches, overlapPolicy };
}

const overall = (definition) => variant("overall", "Overall", definition, () => true, "base qualifier");
const currentRoleVariants = [
  variant("current-favorite", "Current favorite", "Current team-relative spread is below zero", (row) => row.currentRoleVariant === "current-favorite"),
  variant("current-underdog", "Current underdog", "Current team-relative spread is above zero", (row) => row.currentRoleVariant === "current-underdog"),
];
const currentVenueVariants = [
  variant("current-home", "Current game: home", "Current venue is non-neutral home", (row) => row.currentVenueVariant === "current-home"),
  variant("current-road", "Current game: road", "Current venue is non-neutral road", (row) => row.currentVenueVariant === "current-road"),
];

function week1TrendDefinitions() {
  return [
    {
      id: "week1-home-favorites", label: "Week 1 home favorites", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team is playing at home and its team-relative market spread is below zero.",
      base: (row) => row.week === 1 && row.venue === "home" && marketRole(row.teamSpread) === "favorite",
      variants: [overall("All Week 1 home favorites"),
        variant("favorite-0.5-to-3", "-0.5 to -3", "Team-relative spread is -0.5 through -3", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("favorite-3.5-to-6.5", "-3.5 to -6.5", "Team-relative spread is -3.5 through -6.5", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("favorite-7-plus", "-7 or more", "Team-relative spread is -7 or shorter", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-7-plus", "mutually exclusive spread-band siblings")],
    },
    {
      id: "week1-home-underdogs", label: "Week 1 home underdogs", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team is playing at home and its team-relative market spread is above zero.",
      base: (row) => row.week === 1 && row.venue === "home" && marketRole(row.teamSpread) === "underdog",
      variants: [overall("All Week 1 home underdogs"),
        variant("dog-0.5-to-3", "+0.5 to +3", "Team-relative spread is +0.5 through +3", (row) => underdogSpreadBand(row.teamSpread) === "underdog-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("dog-3.5-to-6.5", "+3.5 to +6.5", "Team-relative spread is +3.5 through +6.5", (row) => underdogSpreadBand(row.teamSpread) === "underdog-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("dog-7-plus", "+7 or more", "Team-relative spread is at least +7", (row) => underdogSpreadBand(row.teamSpread) === "underdog-7-plus", "mutually exclusive spread-band siblings")],
    },
    {
      id: "week1-road-favorites", label: "Week 1 road favorites", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team is playing on the road and its team-relative market spread is below zero.",
      base: (row) => row.week === 1 && row.venue === "away" && marketRole(row.teamSpread) === "favorite",
      variants: [overall("All Week 1 road favorites"),
        variant("favorite-0.5-to-3", "-0.5 to -3", "Team-relative spread is -0.5 through -3", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("favorite-3.5-to-6.5", "-3.5 to -6.5", "Team-relative spread is -3.5 through -6.5", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("favorite-7-plus", "-7 or more", "Team-relative spread is -7 or shorter", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-7-plus", "mutually exclusive spread-band siblings")],
    },
    {
      id: "week1-road-underdogs", label: "Week 1 road underdogs", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team is playing on the road and its team-relative market spread is above zero.",
      base: (row) => row.week === 1 && row.venue === "away" && marketRole(row.teamSpread) === "underdog",
      variants: [overall("All Week 1 road underdogs"),
        variant("dog-0.5-to-3", "+0.5 to +3", "Team-relative spread is +0.5 through +3", (row) => underdogSpreadBand(row.teamSpread) === "underdog-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("dog-3.5-to-6.5", "+3.5 to +6.5", "Team-relative spread is +3.5 through +6.5", (row) => underdogSpreadBand(row.teamSpread) === "underdog-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("dog-7-plus", "+7 or more", "Team-relative spread is at least +7", (row) => underdogSpreadBand(row.teamSpread) === "underdog-7-plus", "mutually exclusive spread-band siblings")],
    },
    {
      id: "week1-divisional-home-favorites", label: "Week 1 divisional home favorites", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 divisional matchup, team is at home and is the team-relative favorite.",
      base: (row) => row.week === 1 && row.divisional && row.venue === "home" && marketRole(row.teamSpread) === "favorite",
      variants: [overall("All Week 1 divisional home favorites")],
    },
    {
      id: "week1-divisional-home-underdogs", label: "Week 1 divisional home underdogs", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 divisional matchup, team is at home and is the team-relative underdog.",
      base: (row) => row.week === 1 && row.divisional && row.venue === "home" && marketRole(row.teamSpread) === "underdog",
      variants: [overall("All Week 1 divisional home underdogs")],
    },
    {
      id: "week1-favorites-by-spread-band", label: "Week 1 favorites by spread band", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team-relative market spread is below zero, any venue.",
      base: (row) => row.week === 1 && marketRole(row.teamSpread) === "favorite",
      variants: [overall("All Week 1 favorites"), ...currentVenueVariants,
        variant("favorite-0.5-to-3", "-0.5 to -3", "Team-relative spread is -0.5 through -3", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("favorite-3.5-to-6.5", "-3.5 to -6.5", "Team-relative spread is -3.5 through -6.5", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("favorite-7-plus", "-7 or more", "Team-relative spread is -7 or shorter", (row) => favoriteSpreadBand(row.teamSpread) === "favorite-7-plus", "mutually exclusive spread-band siblings")],
    },
    {
      id: "week1-underdogs-by-spread-band", label: "Week 1 underdogs by spread band", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team-relative market spread is above zero, any venue.",
      base: (row) => row.week === 1 && marketRole(row.teamSpread) === "underdog",
      variants: [overall("All Week 1 underdogs"), ...currentVenueVariants,
        variant("dog-0.5-to-3", "+0.5 to +3", "Team-relative spread is +0.5 through +3", (row) => underdogSpreadBand(row.teamSpread) === "underdog-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("dog-3.5-to-6.5", "+3.5 to +6.5", "Team-relative spread is +3.5 through +6.5", (row) => underdogSpreadBand(row.teamSpread) === "underdog-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("dog-7-plus", "+7 or more", "Team-relative spread is at least +7", (row) => underdogSpreadBand(row.teamSpread) === "underdog-7-plus", "mutually exclusive spread-band siblings")],
    },
    {
      id: "week1-double-digit-favorites", label: "Week 1 double-digit favorites", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team-relative market spread is less than or equal to -10.",
      base: (row) => row.week === 1 && doubleDigitClassification(row.teamSpread) === "favorite",
      variants: [overall("All Week 1 favorites of at least 10 points"), ...currentVenueVariants,
        variant("margin-10-to-13.5", "Favorite margin 10 to 13.5", "Absolute favorite spread is 10 through 13.5", (row) => doubleDigitMarginBand(row.teamSpread) === "10-to-13.5", "mutually exclusive margin-band siblings"),
        variant("margin-14-plus", "Favorite margin 14+", "Absolute favorite spread is at least 14", (row) => doubleDigitMarginBand(row.teamSpread) === "14-plus", "mutually exclusive margin-band siblings")],
    },
    {
      id: "week1-double-digit-underdogs", label: "Week 1 double-digit underdogs", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team-relative market spread is greater than or equal to +10.",
      base: (row) => row.week === 1 && doubleDigitClassification(row.teamSpread) === "underdog",
      variants: [overall("All Week 1 underdogs of at least 10 points"), ...currentVenueVariants,
        variant("margin-10-to-13.5", "Underdog margin +10 to +13.5", "Underdog spread is +10 through +13.5", (row) => doubleDigitMarginBand(row.teamSpread) === "10-to-13.5", "mutually exclusive margin-band siblings"),
        variant("margin-14-plus", "Underdog margin +14 or more", "Underdog spread is at least +14", (row) => doubleDigitMarginBand(row.teamSpread) === "14-plus", "mutually exclusive margin-band siblings")],
    },
    {
      id: "week1-prior-season-playoff-team", label: "Week 1: prior-season playoff team", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team appeared in a postseason game in the immediately prior season.",
      base: (row) => row.week === 1 && row.teamPriorSeasonPlayoffStatus === "playoff",
      variants: [overall("All Week 1 prior-season playoff teams"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week1-prior-season-non-playoff-team", label: "Week 1: prior-season non-playoff team", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team did not appear in a postseason game in the immediately prior season.",
      base: (row) => row.week === 1 && row.teamPriorSeasonPlayoffStatus === "non-playoff",
      variants: [overall("All Week 1 prior-season non-playoff teams"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week1-prior-season-winning-vs-losing", label: "Week 1: prior-season winning vs. losing team", parentCategory: "Early Season – Week 1",
      exactDefinition: "Week 1 team's immediately prior regular season is deterministically known and not an exact .500 record.",
      base: (row) => row.week === 1 && row.teamPriorSeasonRecordRole != null,
      variants: [overall("All Week 1 teams with a known non-.500 prior-season record"),
        variant("winning-team", "Prior-season winning team", "Prior regular-season record had more wins than losses", (row) => row.teamPriorSeasonRecordRole === "winning"),
        variant("losing-team", "Prior-season losing team", "Prior regular-season record had more losses than wins", (row) => row.teamPriorSeasonRecordRole === "losing")],
    },
  ];
}

function week2TrendDefinitions() {
  const gated = (predicate) => (row) => row.week === 2 && row.previousGame?.week === 1 && predicate(row);
  return [
    {
      id: "week2-after-0-1-start", label: "Week 2 after an 0-1 start", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team's Week 1 straight-up result was a loss.",
      base: gated((row) => row.previousSuResult === "L"),
      variants: [overall("All Week 2 games after an 0-1 start"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-1-0-start", label: "Week 2 after a 1-0 start", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team's Week 1 straight-up result was a win.",
      base: gated((row) => row.previousSuResult === "W"),
      variants: [overall("All Week 2 games after a 1-0 start"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-ats-loss", label: "Week 2 after a Week 1 ATS loss", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team's Week 1 ATS grade was a loss.",
      base: gated((row) => row.previousAtsResult === "L"),
      variants: [overall("All Week 2 games after a Week 1 ATS loss"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-ats-win", label: "Week 2 after a Week 1 ATS win", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team's Week 1 ATS grade was a win.",
      base: gated((row) => row.previousAtsResult === "W"),
      variants: [overall("All Week 2 games after a Week 1 ATS win"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-favorite-failed-to-cover", label: "Week 2 after a Week 1 favorite failed to cover", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team was the Week 1 team-relative favorite and its Week 1 ATS grade was a loss.",
      base: gated((row) => isWeek1FavoriteAtsLoss({ previousTeamSpread: row.previousTeamSpread, previousAtsResult: row.previousAtsResult })),
      variants: [overall("All Week 2 games after a Week 1 favorite failed to cover"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-home-favorite-after-week1-ats-loss", label: "Week 2 home team after an ATS loss as a Week 1 favorite", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team is home in Week 2, was the Week 1 team-relative favorite, and its Week 1 ATS grade was a loss.",
      base: gated((row) => row.venue === "home" && isWeek1FavoriteAtsLoss({ previousTeamSpread: row.previousTeamSpread, previousAtsResult: row.previousAtsResult })),
      variants: [overall("All qualifying Week 2 home teams"), ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-favorite-lost-outright", label: "Week 2 after a Week 1 favorite lost outright", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team was the Week 1 team-relative favorite and lost Week 1 straight up.",
      base: gated((row) => isWeek1FavoriteLostOutright({ previousTeamSpread: row.previousTeamSpread, previousPointMargin: row.previousPointMargin })),
      variants: [overall("All Week 2 games after a Week 1 favorite lost outright"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-underdog-won-outright", label: "Week 2 after a Week 1 underdog won outright", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team was the Week 1 team-relative underdog and won Week 1 straight up.",
      base: gated((row) => isWeek1UnderdogWonOutright({ previousTeamSpread: row.previousTeamSpread, previousPointMargin: row.previousPointMargin })),
      variants: [overall("All Week 2 games after a Week 1 underdog won outright"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-win-10-plus", label: "Week 2 after a Week 1 win by 10+", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team won Week 1 straight up by at least 10 points.",
      base: gated((row) => row.previousSuResult === "W" && marginAtLeast(row.previousPointMargin, 10)),
      variants: [overall("All Week 2 games after a Week 1 win of at least 10"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-loss-10-plus", label: "Week 2 after a Week 1 loss by 10+", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team lost Week 1 straight up by at least 10 points.",
      base: gated((row) => row.previousSuResult === "L" && marginAtLeast(row.previousPointMargin, 10)),
      variants: [overall("All Week 2 games after a Week 1 loss of at least 10"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-win-14-plus", label: "Week 2 after a Week 1 win by 14+", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team won Week 1 straight up by at least 14 points.",
      base: gated((row) => row.previousSuResult === "W" && marginAtLeast(row.previousPointMargin, 14)),
      variants: [overall("All Week 2 games after a Week 1 win of at least 14"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-after-week1-loss-14-plus", label: "Week 2 after a Week 1 loss by 14+", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team lost Week 1 straight up by at least 14 points.",
      base: gated((row) => row.previousSuResult === "L" && marginAtLeast(row.previousPointMargin, 14)),
      variants: [overall("All Week 2 games after a Week 1 loss of at least 14"), ...currentVenueVariants, ...currentRoleVariants],
    },
    {
      id: "week2-0-1-favorite", label: "Week 2 0-1 favorite", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team started 0-1 and is the Week 2 team-relative favorite.",
      base: gated((row) => row.previousSuResult === "L" && row.currentRoleVariant === "current-favorite"),
      variants: [overall("All Week 2 0-1 favorites"), ...currentVenueVariants],
    },
    {
      id: "week2-0-1-underdog", label: "Week 2 0-1 underdog", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team started 0-1 and is the Week 2 team-relative underdog.",
      base: gated((row) => row.previousSuResult === "L" && row.currentRoleVariant === "current-underdog"),
      variants: [overall("All Week 2 0-1 underdogs"), ...currentVenueVariants],
    },
    {
      id: "week2-1-0-favorite", label: "Week 2 1-0 favorite", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team started 1-0 and is the Week 2 team-relative favorite.",
      base: gated((row) => row.previousSuResult === "W" && row.currentRoleVariant === "current-favorite"),
      variants: [overall("All Week 2 1-0 favorites"), ...currentVenueVariants],
    },
    {
      id: "week2-1-0-underdog", label: "Week 2 1-0 underdog", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team started 1-0 and is the Week 2 team-relative underdog.",
      base: gated((row) => row.previousSuResult === "W" && row.currentRoleVariant === "current-underdog"),
      variants: [overall("All Week 2 1-0 underdogs"), ...currentVenueVariants],
    },
    {
      id: "week2-0-1-vs-1-0-opponent", label: "Week 2: 0-1 team facing a 1-0 team", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team started 0-1 and its Week 2 opponent started 1-0.",
      base: gated((row) => row.previousSuResult === "L" && row.opponentWeek1SuResult === "W"),
      variants: [overall("All Week 2 0-1-vs-1-0 matchups"), ...currentVenueVariants],
    },
    {
      id: "week2-1-0-vs-0-1-opponent", label: "Week 2: 1-0 team facing an 0-1 team", parentCategory: "Early Season – Week 2",
      exactDefinition: "Team started 1-0 and its Week 2 opponent started 0-1.",
      base: gated((row) => row.previousSuResult === "W" && row.opponentWeek1SuResult === "L"),
      variants: [overall("All Week 2 1-0-vs-0-1 matchups"), ...currentVenueVariants],
    },
  ];
}

function trendDefinitions() {
  return [...week1TrendDefinitions(), ...week2TrendDefinitions()];
}

function buildTrends(rows) {
  return trendDefinitions().map((definition) => {
    const qualifyingRows = rows.filter(definition.base);
    const variants = definition.variants.map((item) => buildPhase2cVariant({
      trendId: definition.id,
      id: item.id,
      label: item.label,
      definition: item.definition,
      rows: qualifyingRows.filter(item.matches),
      overlapPolicy: item.overlapPolicy,
    }));
    const base = variants[0];
    return {
      id: definition.id,
      label: definition.label,
      exactDefinition: definition.exactDefinition,
      definitionVersion: PHASE2C_DEFINITION_VERSION,
      parentCategory: definition.parentCategory,
      commonAngleStatus: "EARLY-SEASON ANGLE",
      variants,
      fullHistoryMetrics: base.fullHistoryMetrics,
      recentFormMetrics: base.recentFormMetrics,
      eraMetrics: base.eraMetrics,
      evidenceClassification: base.evidenceClassification,
      confidence: base.confidence,
      recentEvidenceClassification: base.recentEvidenceClassification,
      stabilityFlags: base.stabilityFlags,
      articleRelevanceNote: articleRelevanceFor(base),
    };
  });
}

function pct(value) {
  return value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function num(value) {
  return value == null ? "N/A" : Number(value).toFixed(2).replace(/\.00$/, "");
}

function record(metrics, ats = true) {
  return ats ? `${metrics.atsWins}-${metrics.atsLosses}-${metrics.atsPushes}` : `${metrics.suWins}-${metrics.suLosses}-${metrics.suTies}`;
}

function periodRows(variant) {
  return [
    ["Full 2011-2025", variant.fullHistoryMetrics],
    ["Recent 2021-2025", variant.recentFormMetrics],
    ["Older 2011-2018", variant.eraMetrics.olderEra],
    ["Newer 2019-2025", variant.eraMetrics.newerEra],
  ].map(([period, metrics]) => `| ${variant.label} | ${period} | ${metrics.qualifyingTeamGames} (${metrics.sampleSizeLabel}) | ${record(metrics)} | ${pct(metrics.atsWinPct)} | ${pct(metrics.atsRoiAtMinus110)} | ${record(metrics, false)} | ${pct(metrics.suWinPct)} | ${num(metrics.averageTeamSpread)} | ${num(metrics.averageAtsCoverMargin)} | ${pct(metrics.atsWilson95.low)}-${pct(metrics.atsWilson95.high)} |`);
}

function markdown(artifact) {
  const lines = [
    "# NFL Situational Trends Study v1 — Phase 2C Early Season Study",
    "",
    ...(artifact.generatedAt ? [`Generated: ${artifact.generatedAt}`, ""] : []),
    "> Descriptive historical research only. These records are not picks, causal estimates, calibrated probabilities, or a betting system.",
    "",
    "## Methodology",
    "",
    `Phase 2C adds ${artifact.trends.length} predeclared Week 1 / Week 2 early-season angle families over the locked Phase 1 dataset, restricted to Week 1 and Week 2 team-games: **${artifact.dataset.regularSeasonGames.toLocaleString()} regular-season games / ${artifact.dataset.teamGames.toLocaleString()} team-games, 2011-2025**. FULL HISTORY is 2011-2025, RECENT FORM is 2021-2025, and the fixed era split is 2011-2018 versus 2019-2025. No threshold, subgroup, season, or combination was selected from results; Week 1/2 sample sizes are treated conservatively and a high raw ATS% alone never implies a noteworthy label.`,
    "",
    "Team-relative spreads, ATS grades, SU grades, -110 ROI, Wilson 95% intervals, window assignment, and sample labels are inherited unchanged from Phase 1/2B. Pushes are excluded from ATS percentage, ROI, and Wilson intervals. Sample labels remain VERY SMALL (<50), LIMITED (50-99), MODERATE (100-199), and LARGER (200+).",
    "",
    "Prior-season playoff participation and prior-season regular-season win-loss record are computed from the same locked nflverse snapshot: a team made the prior-season playoffs if it appears in a non-REG game in season-1, and its prior-season record is tallied from season-1 REG games with final scores. A record with an equal win-loss count is never classified as winning or losing.",
    "",
    "## All results",
    "",
    "| Trend | Full ATS | Full ATS % | Full ROI | Recent ATS | Recent ATS % | Recent ROI | Evidence | Confidence | Article relevance |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ...artifact.trends.map((trend) => `| ${trend.label} | ${record(trend.fullHistoryMetrics)} (n=${trend.fullHistoryMetrics.qualifyingTeamGames}) | ${pct(trend.fullHistoryMetrics.atsWinPct)} | ${pct(trend.fullHistoryMetrics.atsRoiAtMinus110)} | ${record(trend.recentFormMetrics)} (n=${trend.recentFormMetrics.qualifyingTeamGames}) | ${pct(trend.recentFormMetrics.atsWinPct)} | ${pct(trend.recentFormMetrics.atsRoiAtMinus110)} | ${trend.evidenceClassification} | ${trend.confidence} | ${trend.articleRelevanceNote} |`),
    "",
  ];
  artifact.trends.forEach((trend, index) => {
    lines.push(`## ${index + 1}. ${trend.label}`, "", `**Definition:** ${trend.exactDefinition}`, "", `**Broad interpretation:** ${trend.articleRelevanceNote}`, "", "| Variant | Evidence | Confidence | Older direction | Newer direction | Recent vs full | Recent change |", "| --- | --- | --- | --- | --- | ---: | --- |");
    for (const variant of trend.variants) {
      lines.push(`| ${variant.label} | ${variant.evidenceClassification} | ${variant.confidence} | ${variant.stabilityFlags.olderEraDirection} | ${variant.stabilityFlags.newerEraDirection} | ${pct(variant.stabilityFlags.recentVsFullHistoryAtsPctDelta)} | ${variant.stabilityFlags.recentChange} |`);
    }
    lines.push("", "| Variant | Period | n (label) | ATS W-L-P | ATS % | ROI (-110) | SU W-L-T | SU % | Avg spread | Avg cover | 95% CI |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const variant of trend.variants) lines.push(...periodRows(variant));
    lines.push("");
  });
  lines.push(
    "## Reproduction and guardrails", "",
    "1. Rebuild Phase 1: `npm run nfl:situational-trends -- --input=data/external/nflverse/games.csv --start-season=2011 --end-season=2025`.",
    "2. Rebuild Phase 2: `npm run nfl:situational-trends:phase2`.",
    "3. Rebuild Phase 2B: `npm run nfl:situational-trends:phase2b`.",
    "4. Build Phase 2C: `npm run nfl:situational-trends:phase2c`.",
    "5. Run `npm run nfl:situational-trends:phase2c:test`.",
    "",
    `Input hashes: Phase 1 report \`${artifact.inputs.phase1Report.sha256}\`; Phase 2B report \`${artifact.inputs.phase2bReport.sha256}\`; Phase 1 team-games \`${artifact.inputs.phase1TeamGames.sha256}\`; nflverse games \`${artifact.inputs.nflverseGames.sha256}\`.`,
    "",
    "Phase 2C does not alter Phase 1/2/2B definitions or artifacts and does not feed any production NFL model, projection, UI, grading, matchup, total, prop, archive, outcome resolver, or performance system.",
    ""
  );
  return lines.join("\n");
}

function validateArtifact(artifact) {
  if (JSON.stringify(artifact.trends.map((trend) => trend.id)) !== JSON.stringify(PHASE2C_TREND_IDS)) throw new Error("Phase 2C must preserve all trend IDs in declared order.");
  const requiredMetrics = ["qualifyingTeamGames", "atsWins", "atsLosses", "atsPushes", "atsWinPct", "atsRoiAtMinus110", "suWins", "suLosses", "suTies", "suWinPct", "averageTeamSpread", "averageAtsCoverMargin", "atsWilson95", "sampleSizeLabel"];
  for (const trend of artifact.trends) {
    if (!trend.variants.length || trend.variants[0].id !== "overall") throw new Error(`${trend.id} is missing its overall variant.`);
    if (new Set(trend.variants.map((item) => item.id)).size !== trend.variants.length) throw new Error(`${trend.id} has duplicate variant IDs.`);
    for (const item of trend.variants) {
      for (const metrics of [item.fullHistoryMetrics, item.recentFormMetrics, item.eraMetrics.olderEra, item.eraMetrics.newerEra]) {
        if (requiredMetrics.some((field) => !(field in metrics))) throw new Error(`${trend.id}/${item.id} is missing required metrics.`);
      }
      if (!["HISTORICALLY MEANINGFUL", "CONTEXT-DEPENDENT", "LITTLE/NO EVIDENCE", "INSUFFICIENT DATA"].includes(item.evidenceClassification)) throw new Error(`${trend.id}/${item.id} has an invalid evidence classification.`);
      if (!["High", "Moderate", "Low"].includes(item.confidence)) throw new Error(`${trend.id}/${item.id} has an invalid confidence label.`);
    }
  }
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.input)) throw new Error(`Required nflverse input not found: ${args.input}`);
  const phase1Text = readFileSync(PHASE1_REPORT_PATH, "utf8");
  const phase2Text = readFileSync(PHASE2_REPORT_PATH, "utf8");
  const phase2bText = readFileSync(PHASE2B_REPORT_PATH, "utf8");
  const { text: teamGamesText, rows: rawRows } = readTeamGameRows();
  const sourceText = readFileSync(args.input, "utf8");
  const teamsArtifact = JSON.parse(readFileSync(TEAMS_PATH, "utf8"));
  const phase1 = JSON.parse(phase1Text);
  const phase2 = JSON.parse(phase2Text);
  const phase2b = JSON.parse(phase2bText);

  if (phase1.studyVersion !== LOCKED_BASELINE.phase1StudyVersion) throw new Error("Phase 1 study version differs from the locked baseline.");
  if (phase2.studyVersion !== LOCKED_BASELINE.phase2StudyVersion) throw new Error("Phase 2 study version differs from the locked baseline.");
  if (phase2b.studyVersion !== LOCKED_BASELINE.phase2bStudyVersion) throw new Error("Phase 2B study version differs from the locked baseline.");
  if (phase1.dataset.regularSeasonGames !== LOCKED_BASELINE.regularSeasonGames || phase1.dataset.teamGames !== LOCKED_BASELINE.teamGames || rawRows.length !== LOCKED_BASELINE.teamGames) {
    throw new Error("Phase 1 counts differ from the locked baseline.");
  }
  const sourceInput = phase1.dataset.inputFiles.find((input) => input.path === "data/external/nflverse/games.csv");
  if (!sourceInput || sourceInput.sha256 !== sha256(sourceText) || sourceInput.bytes !== Buffer.byteLength(sourceText)) {
    throw new Error("Phase 2C nflverse input is not the exact snapshot recorded by Phase 1.");
  }

  const priorIndex = priorSeasonIndex(sourceText, teamsArtifact.teams, LOCKED_BASELINE.seasons);
  const week1And2Rows = rawRows.filter((row) => row.week === 1 || row.week === 2);
  const annotated = annotateRows(week1And2Rows, priorIndex);
  const trends = buildTrends(annotated);

  const artifact = {
    schemaVersion: PHASE2C_SCHEMA_VERSION,
    studyVersion: PHASE2C_STUDY_VERSION,
    definitionVersion: PHASE2C_DEFINITION_VERSION,
    generatedAt: args.generatedAt,
    generatedBy: "scripts/research/generate-nfl-situational-trends-phase2c.mjs",
    phaseBaselines: {
      phase1: { locked: true, studyVersion: phase1.studyVersion, definitionVersion: phase1.definitionVersion, artifact: "public/data/nfl/research/situational-trends-v1.json" },
      phase2: { locked: true, studyVersion: phase2.studyVersion, schemaVersion: phase2.schemaVersion, artifact: "public/data/nfl/research/situational-trends-phase2.json" },
      phase2b: { locked: true, studyVersion: phase2b.studyVersion, schemaVersion: phase2b.schemaVersion, artifact: "public/data/nfl/research/situational-trends-phase2b.json" },
      preservationPolicy: "Phase 2C reads and hashes Phase 1/2/2B artifacts; it never writes their report, documentation, or team-game files.",
    },
    dataset: {
      seasons: LOCKED_BASELINE.seasons,
      regularSeasonGames: phase1.dataset.regularSeasonGames,
      teamGames: phase1.dataset.teamGames,
      week1TeamGames: week1And2Rows.filter((row) => row.week === 1).length,
      week2TeamGames: week1And2Rows.filter((row) => row.week === 2).length,
      gamesWithSpread: phase1.dataset.gamesWithSpread,
      spreadCoveragePct: phase1.dataset.spreadCoveragePct,
      marketSource: phase1.dataset.marketSource,
    },
    windows: { fullHistory: REPORTING_WINDOWS.fullHistory, recentForm: REPORTING_WINDOWS.recentForm, olderEra: FIXED_ERA_WINDOWS.olderEra, newerEra: FIXED_ERA_WINDOWS.newerEra },
    methodology: {
      selectionPolicy: "Exactly the user-predeclared Week 1 / Week 2 early-season angle families and only their requested variants; no optimized cutoff, recursive combination, team exclusion, or arbitrary window.",
      week1Scope: "Week 1 team-games from the locked Phase 1 chronology; no previous-game context exists in Week 1.",
      week2Scope: "Week 2 team-games whose immediately previous same-season game is Week 1; a Week 2 row whose previous game is not Week 1 (never occurs in the locked dataset) is excluded rather than assumed.",
      priorSeason: "Prior-season playoff participation and regular-season win-loss record are computed from the same locked nflverse snapshot Phase 1 hashes; ties never resolve to a winning or losing classification.",
      atsAndSu: "Inherited from locked Phase 1 team-relative spread and grading fields.",
      uncertainty: "95% Wilson interval over ATS decisions; pushes excluded; descriptive and unclustered.",
      roi: "Standard -110 ROI over ATS decisions; pushes excluded.",
      evidence: "Inherited Phase 1 evidence classifier using full history, recent form, fixed eras, Wilson interval, ROI/effect context, and minimum sample/season gates; Week 1/2 sample sizes are treated conservatively.",
    },
    inputs: {
      phase1Report: inputIdentity(PHASE1_REPORT_PATH, phase1Text),
      phase2Report: inputIdentity(PHASE2_REPORT_PATH, phase2Text),
      phase2bReport: inputIdentity(PHASE2B_REPORT_PATH, phase2bText),
      phase1TeamGames: inputIdentity(TEAM_GAMES_PATH, teamGamesText),
      nflverseGames: inputIdentity(args.input, sourceText),
    },
    trends,
    limitations: [
      "The nflverse/nfldata spread remains a single unnamed, untimestamped settled historical line and is not independently verified as closing consensus.",
      "Week 1 and Week 2 sample sizes are inherently small relative to the full-season study; a high raw ATS% in an early-season subgroup is treated conservatively rather than promoted as noteworthy.",
      "Team-game observations from the same game and repeated teams/seasons are dependent; Wilson intervals are unclustered descriptive context.",
      "Prior-season playoff/record context uses the same regular-season nflverse snapshot; expansion-era or relocated franchises are matched via the same alias table Phase 1 uses.",
      "Evidence classifications are broad reference labels, not multiple-testing-adjusted claims or permission to promote an angle into a model.",
    ],
  };
  validateArtifact(artifact);
  write(PUBLIC_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  write(DOC_PATH, markdown(artifact));
  console.log(`Generated ${trends.length} Phase 2C trends from ${artifact.dataset.week1TeamGames} Week 1 and ${artifact.dataset.week2TeamGames} Week 2 team-games.`);
  console.log(`Wrote ${relativePath(PUBLIC_PATH)}`);
  console.log(`Wrote ${relativePath(DOC_PATH)}`);
}

main();

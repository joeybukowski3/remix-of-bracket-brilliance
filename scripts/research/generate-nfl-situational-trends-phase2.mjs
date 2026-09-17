/**
 * Generate the targeted Phase 2 robustness layer for NFL Situational Trends v1.
 *
 * This script reads only the locked Phase 1 report/team-game artifacts and the
 * canonical team table. It performs local reads and writes only.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPORTING_WINDOWS, FIXED_ERA_WINDOWS } from "../lib/nfl-situational-trends-core.mjs";
import {
  DOG_SPREAD_BUCKETS,
  PHASE2_SCHEMA_VERSION,
  PHASE2_STUDY_VERSION,
  SPREAD_BUCKETS,
  attachDivisionalMeetingOrder,
  attachPregameQuality,
  buildSplitRecord,
  currentRestDaysBucket,
  greatCircleMiles,
  marketRole,
  restAdvantageSource,
  restDifferentialBucket,
  restStructureFlags,
  shortRestCadence,
  spreadBucket,
  travelDistanceBucket,
} from "../lib/nfl-situational-trends-phase2-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PHASE1_REPORT_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-v1.json");
const TEAM_GAMES_PATH = join(ROOT, "data", "nfl", "research", "situational-trend-team-games-v1.jsonl");
const TEAMS_PATH = join(ROOT, "public", "data", "nfl", "teams.json");
const PUBLIC_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-phase2.json");
const DOC_PATH = join(ROOT, "docs", "research", "nfl-situational-trends-phase2.md");

const LOCKED_BASELINE = {
  seasons: Array.from({ length: 15 }, (_, index) => 2011 + index),
  regularSeasonGames: 3919,
  teamGames: 7838,
  gamesWithSpread: 3919,
  studyVersion: "nfl-situational-trends-v1",
  definitionVersion: "nfl-situational-trend-definitions-v1",
  trends: {
    "pre-bye": { full: [251, 218, 11, 480], recent: [93, 67, 2, 162] },
    "west-to-east-early": { full: [97, 74, 4, 175], recent: [37, 26, 0, 63] },
    "divisional-underdog": { full: [721, 683, 36, 1440], recent: [250, 221, 9, 480] },
    "short-rest-disadvantage": { full: [248, 253, 9, 510], recent: [97, 89, 1, 187] },
    "rest-advantage": { full: [421, 422, 19, 862], recent: [148, 138, 7, 293] },
    "post-bye": { full: [228, 238, 14, 480], recent: [75, 81, 6, 162] },
  },
};

const QUALITY_BUCKETS = [
  { id: "winning-record", label: "Winning pregame record", definition: "Current-season pregame win percentage above .500" },
  { id: "even-record", label: ".500 pregame record", definition: "Current-season pregame win percentage exactly .500" },
  { id: "losing-record", label: "Losing pregame record", definition: "Current-season pregame win percentage below .500" },
  { id: "no-prior-games", label: "No prior games", definition: "No completed current-season game before kickoff" },
];

const LOCATION_BUCKETS = [
  { id: "home", label: "Home", definition: "Non-neutral home team" },
  { id: "away", label: "Away", definition: "Non-neutral road team" },
  { id: "neutral", label: "Neutral", definition: "Neutral-site team-game" },
];

const MARKET_ROLE_BUCKETS = [
  { id: "favorite", label: "Favorite", definition: "Team-relative spread below zero" },
  { id: "underdog", label: "Underdog", definition: "Team-relative spread above zero" },
  { id: "pickem", label: "Pick'em", definition: "Team-relative spread equals zero" },
];

const REST_DAY_BUCKETS = [
  { id: "short-6-or-fewer", label: "Short rest (6 or fewer)", definition: "At most 6 Eastern calendar days since prior game" },
  { id: "normal-7", label: "Normal rest (7)", definition: "Exactly 7 Eastern calendar days since prior game" },
  { id: "extended-8-to-9", label: "Extended rest (8-9)", definition: "8-9 Eastern calendar days since prior game" },
  { id: "bye-range-10-to-17", label: "Bye-range rest (10-17)", definition: "10-17 Eastern calendar days since prior game" },
  { id: "very-extended-18-plus", label: "Very extended rest (18+)", definition: "At least 18 Eastern calendar days since prior game" },
  { id: "no-prior-game", label: "No prior game", definition: "Season opener / no same-season prior game" },
];

const PREVIOUS_RESULT_BUCKETS = [
  { id: "win", label: "Coming off win", definition: "Previous same-season game was a straight-up win" },
  { id: "loss", label: "Coming off loss", definition: "Previous same-season game was a straight-up loss" },
  { id: "tie", label: "Coming off tie", definition: "Previous same-season game was a straight-up tie" },
  { id: "no-prior-game", label: "No prior game", definition: "No previous same-season game" },
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function parseArgs(argv) {
  const args = { generatedAt: null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function metricTuple(metrics) {
  return [metrics.atsWins, metrics.atsLosses, metrics.atsPushes, metrics.qualifyingTeamGames];
}

function validateLockedBaseline(phase1, rows) {
  if (phase1.studyVersion !== LOCKED_BASELINE.studyVersion || phase1.definitionVersion !== LOCKED_BASELINE.definitionVersion) {
    throw new Error("Phase 1 study or definition version differs from the locked baseline.");
  }
  for (const field of ["regularSeasonGames", "teamGames", "gamesWithSpread"]) {
    if (phase1.dataset[field] !== LOCKED_BASELINE[field]) throw new Error(`Phase 1 ${field} differs from the locked baseline.`);
  }
  if (JSON.stringify(phase1.dataset.seasons) !== JSON.stringify(LOCKED_BASELINE.seasons)) throw new Error("Phase 1 seasons differ from the locked baseline.");
  if (rows.length !== LOCKED_BASELINE.teamGames || new Set(rows.map((row) => row.gameId)).size !== LOCKED_BASELINE.regularSeasonGames) {
    throw new Error("Phase 1 team-game rows differ from the locked baseline counts.");
  }
  for (const [trendId, expected] of Object.entries(LOCKED_BASELINE.trends)) {
    const trend = phase1.trends.find((item) => item.id === trendId);
    if (!trend) throw new Error(`Locked Phase 1 trend is missing: ${trendId}`);
    if (JSON.stringify(metricTuple(trend.reportingWindows.fullHistory.metrics)) !== JSON.stringify(expected.full) ||
        JSON.stringify(metricTuple(trend.reportingWindows.recentForm.metrics)) !== JSON.stringify(expected.recent)) {
      throw new Error(`Locked Phase 1 metrics changed for ${trendId}.`);
    }
  }
}

function historicalTeamCoordinates(team, season, teamByAbbr) {
  if (team === "lv" && season <= 2019) return { latitude: 37.7516, longitude: -122.2005, provenance: "Oakland Coliseum relocation override" };
  if (team === "lac" && season <= 2016) return { latitude: 32.7832, longitude: -117.1225, provenance: "San Diego stadium relocation override" };
  const canonical = teamByAbbr.get(team);
  return canonical ? { latitude: canonical.latitude, longitude: canonical.longitude, provenance: "canonical team home stadium" } : null;
}

function annotateRows(rows, teams) {
  const teamByAbbr = new Map(teams.map((team) => [team.abbr, team]));
  return attachDivisionalMeetingOrder(attachPregameQuality(rows)).map((row) => {
    const westToEast = row.trendIds.includes("west-to-east-early");
    const origin = westToEast ? historicalTeamCoordinates(row.team, row.season, teamByAbbr) : null;
    const destination = westToEast ? historicalTeamCoordinates(row.opponent, row.season, teamByAbbr) : null;
    const travelMiles = westToEast ? greatCircleMiles(origin, destination) : null;
    return {
      ...row,
      marketRole: marketRole(row.teamSpread),
      spreadBucket: spreadBucket(row.teamSpread),
      teamQualityBucket: row.teamPregameQuality.bucket,
      opponentQualityBucket: row.opponentPregameQuality?.bucket ?? "no-prior-games",
      restStructureFlags: restStructureFlags(row),
      restDifferentialBucket: restDifferentialBucket(row.restDifferential),
      currentRestDaysBucket: currentRestDaysBucket(row.restDays),
      previousResultBucket: !row.previousGame ? "no-prior-game" : row.previousGame.pointMargin > 0 ? "win" : row.previousGame.pointMargin < 0 ? "loss" : "tie",
      divisionalMeetingBucket: row.divisionalMeetingNumber === 1 ? "first-meeting" : row.divisionalMeetingNumber === 2 ? "second-meeting" : row.divisionalMeetingNumber > 2 ? "third-plus-meeting" : "unavailable",
      travelMiles,
      travelDistanceBucket: travelDistanceBucket(travelMiles),
    };
  });
}

function phase1Definition(phase1, trendId) {
  const trend = phase1.trends.find((item) => item.id === trendId);
  if (!trend) throw new Error(`Missing Phase 1 definition: ${trendId}`);
  return trend;
}

function makeFamily({ id, label, definition, trendId, parentRule, sourceRows, buckets, accessor, overlapPolicy = "mutually exclusive siblings", allowPartial = false }) {
  const splits = buckets.map((bucket) => buildSplitRecord({
    trendId,
    parentRule,
    splitId: `${id}/${bucket.id}`,
    splitLabel: bucket.label,
    splitDefinition: bucket.definition,
    rows: sourceRows.filter((row) => accessor(row, bucket)),
    overlapPolicy,
  }));
  const fullAssignments = splits.reduce((sum, split) => sum + split.fullHistoryMetrics.qualifyingTeamGames, 0);
  const fullSourceRows = sourceRows.filter((row) => row.season >= 2011 && row.season <= 2025).length;
  if (overlapPolicy === "mutually exclusive siblings" && !allowPartial && fullAssignments !== fullSourceRows) {
    throw new Error(`${id} does not partition its source rows (${fullAssignments}/${fullSourceRows}).`);
  }
  return { id, label, definition, overlapPolicy, sourceTeamGames: fullSourceRows, splits };
}

function overallFamily(trendId, parentRule, rows, id = "overall") {
  return makeFamily({
    id,
    label: "Overall qualifier",
    definition: parentRule,
    trendId,
    parentRule,
    sourceRows: rows,
    buckets: [{ id: "all", label: "All qualifiers", definition: parentRule }],
    accessor: () => true,
  });
}

function locationFamily(trendId, parentRule, rows) {
  return makeFamily({ id: "location", label: "Home / away", definition: "Phase 1 venue classification", trendId, parentRule, sourceRows: rows, buckets: LOCATION_BUCKETS, accessor: (row, bucket) => row.venue === bucket.id });
}

function marketRoleFamily(trendId, parentRule, rows) {
  return makeFamily({ id: "market-role", label: "Favorite / underdog / pick'em", definition: "Market role from team-relative settled spread", trendId, parentRule, sourceRows: rows, buckets: MARKET_ROLE_BUCKETS, accessor: (row, bucket) => row.marketRole === bucket.id });
}

function spreadFamily(trendId, parentRule, rows, buckets = SPREAD_BUCKETS) {
  return makeFamily({ id: "spread-bucket", label: "Fixed spread buckets", definition: "Predefined conventional half-point-aligned spread ranges", trendId, parentRule, sourceRows: rows, buckets, accessor: (row, bucket) => row.spreadBucket === bucket.id });
}

function qualityFamily(trendId, parentRule, rows, side) {
  const isTeam = side === "team";
  return makeFamily({
    id: `${side}-quality`,
    label: `${isTeam ? "Studied team" : "Opponent"} pregame quality`,
    definition: "Current-season record using only games completed before the qualifying kickoff; ties count as one-half win",
    trendId,
    parentRule,
    sourceRows: rows,
    buckets: QUALITY_BUCKETS,
    accessor: (row, bucket) => (isTeam ? row.teamQualityBucket : row.opponentQualityBucket) === bucket.id,
  });
}

function seasonFamily(trendId, parentRule, rows, id = "season") {
  const buckets = LOCKED_BASELINE.seasons.map((season) => ({ id: String(season), label: String(season), definition: `Season ${season} only` }));
  return makeFamily({ id, label: "Season-by-season", definition: "Fixed NFL season", trendId, parentRule, sourceRows: rows, buckets, accessor: (row, bucket) => row.season === Number(bucket.id) });
}

function buildPreByeArea(phase1, rows) {
  const parent = phase1Definition(phase1, "pre-bye");
  const selected = rows.filter((row) => row.trendIds.includes("pre-bye"));
  return {
    id: "pre-bye-robustness",
    title: "Pre-bye robustness",
    parentTrendIds: ["pre-bye"],
    parentPhase1Definitions: [{ trendId: parent.id, definitionVersion: parent.definitionVersion, rule: parent.rule }],
    conclusionLabel: "SUBGROUP-DEPENDENT",
    conclusion: "The newer-era and recent gains are spread across four of five recent seasons and both winning- and losing-record teams, but are concentrated by market role and venue: favorites/home teams strengthened sharply while away teams and underdogs remained near 50% ATS.",
    findings: [
      "Full history is 251-218-11 ATS (53.5%, +2.2% ROI); recent form is 93-67-2 (58.1%, +11.0%). The fixed eras move from 49.6% to 57.9% ATS.",
      "Home pre-bye teams were 57.4% ATS full history and 66.2% recent; away teams were 48.6% and 50.0%.",
      "Favorites were 57.6% ATS full history and 67.9% recent; underdogs were 49.4% and 48.1%. The favorite/underdog split is the clearest concentration.",
      "Winning-record teams were stronger over full history, but recent results were also positive for losing-record teams (56.0%); this is not only a strong-team cohort.",
      "Four of five recent seasons exceeded 50% ATS, led by 2022 (24-9-1); 2021 was 16-16. Recent strength is not a single-season result, though every season is a very small sample.",
    ],
    articleValue: "The useful story is not a generic pre-bye rule: it is a neutral older era followed by broad recent-season improvement that is nevertheless concentrated among home favorites.",
    splitFamilies: [
      overallFamily(parent.id, parent.rule, selected),
      locationFamily(parent.id, parent.rule, selected),
      marketRoleFamily(parent.id, parent.rule, selected),
      spreadFamily(parent.id, parent.rule, selected),
      qualityFamily(parent.id, parent.rule, selected, "team"),
      qualityFamily(parent.id, parent.rule, selected, "opponent"),
      seasonFamily(parent.id, parent.rule, selected),
    ],
  };
}

function buildWestToEastArea(phase1, rows) {
  const parent = phase1Definition(phase1, "west-to-east-early");
  const selected = rows.filter((row) => row.trendIds.includes(parent.id));
  const franchises = ["lac", "lar", "lv", "sea", "sf"].map((team) => ({ id: team, label: team.toUpperCase(), definition: `Pacific-origin franchise = ${team}` }));
  const distances = [
    { id: "under-2000", label: "Under 2,000 miles", definition: "Great-circle stadium distance below 2,000 miles" },
    { id: "2000-to-2499", label: "2,000-2,499 miles", definition: "Great-circle stadium distance from 2,000 through 2,499.9 miles" },
    { id: "2500-plus", label: "2,500+ miles", definition: "Great-circle stadium distance at least 2,500 miles" },
  ];
  return {
    id: "west-to-east-early-robustness",
    title: "West-to-East early robustness",
    parentTrendIds: [parent.id],
    parentPhase1Definitions: [{ trendId: parent.id, definitionVersion: parent.definitionVersion, rule: parent.rule }],
    conclusionLabel: "BROADLY SUPPORTED",
    conclusion: "The positive direction appears in both eras, for favorites and underdogs, in four of five Pacific-origin franchises, and across most seasons. It is not dominated by one or two teams, but the full sample is only moderate and large underdogs are a clear exception.",
    findings: [
      "The 175-game cohort was 56.7% ATS (+8.3% ROI), with 53.8% in 2011-2018 and 59.1% in 2019-2025; recent form was 58.7% over 63 games.",
      "Favorites (58.2%) and underdogs (55.4%) both pointed positive over full history, so market role alone does not explain the aggregate.",
      "LAC, LAR, SEA, and SF each exceeded 57% ATS; LV/Oakland was the exception at 45.5%. Seattle was strongest, but removing the idea of a single-franchise driver is supported by the other positive clubs.",
      "The +7-or-more underdog bucket was 45.2% ATS, unlike the smaller dog buckets. Every spread bucket is small or very small, so this exception is contextual rather than a new filter.",
      "Ten seasons were above 50%, two were exactly 50%, and three were below. Four of five recent seasons were above 50%; 2025 was 8-8.",
      "Coarse distance buckets all pointed above 50%, offering no evidence that one distance band creates the aggregate; the outer buckets are very small.",
    ],
    articleValue: "The narrow qualifier runs opposite the familiar fatigue narrative. Its broad distribution is notable, but the moderate total sample and unclustered uncertainty keep the conclusion descriptive.",
    splitFamilies: [
      overallFamily(parent.id, parent.rule, selected),
      marketRoleFamily(parent.id, parent.rule, selected),
      spreadFamily(parent.id, parent.rule, selected),
      qualityFamily(parent.id, parent.rule, selected, "team"),
      qualityFamily(parent.id, parent.rule, selected, "opponent"),
      makeFamily({ id: "franchise", label: "Pacific-origin franchise", definition: "Season-aware Phase 1 Pacific-origin teams", trendId: parent.id, parentRule: parent.rule, sourceRows: selected, buckets: franchises, accessor: (row, bucket) => row.team === bucket.id }),
      makeFamily({ id: "travel-distance", label: "Coarse travel distance", definition: "Great-circle distance between season-aware origin and Eastern opponent home stadium; no route or arrival model", trendId: parent.id, parentRule: parent.rule, sourceRows: selected, buckets: distances, accessor: (row, bucket) => row.travelDistanceBucket === bucket.id }),
      seasonFamily(parent.id, parent.rule, selected),
    ],
  };
}

function buildDivisionalDogArea(phase1, rows) {
  const parent = phase1Definition(phase1, "divisional-underdog");
  const selected = rows.filter((row) => row.trendIds.includes(parent.id));
  const meetings = [
    { id: "first-meeting", label: "First meeting", definition: "First regular-season head-to-head game by kickoff and game ID in the same season" },
    { id: "second-meeting", label: "Second meeting", definition: "Second regular-season head-to-head game by kickoff and game ID in the same season" },
    { id: "third-plus-meeting", label: "Third or later meeting", definition: "Third or later regular-season head-to-head game in the same season" },
  ];
  const divisions = [...new Set(selected.map((row) => row.division))].sort().map((division) => ({ id: division.toLowerCase().replaceAll(" ", "-"), label: division, definition: `Studied underdog belongs to ${division}`, value: division }));
  return {
    id: "divisional-underdog-robustness",
    title: "Divisional underdog robustness",
    parentTrendIds: [parent.id],
    parentPhase1Definitions: [{ trendId: parent.id, definitionVersion: parent.definitionVersion, rule: parent.rule }],
    conclusionLabel: "WEAK / NO BROAD EDGE",
    conclusion: "The 1,440-game full-history result is below -110 break-even. Recent improvement is concentrated in smaller dogs, road teams, and selected divisions; second meetings do not outperform first meetings.",
    findings: [
      "Full history was 51.3% ATS (-2.0% ROI); recent form improved to 53.1% (+1.3%), while eras moved from 49.4% to 53.6%.",
      "Road dogs were modestly better than home dogs (52.3% versus 50.2% full history; 54.3% versus 51.3% recent), but the full-history road result was still essentially break-even before vig.",
      "First meetings outperformed second meetings (52.1% versus 50.6% full history; 54.2% versus 51.9% recent). The data does not support greater second-meeting familiarity value.",
      "Small dogs were 52.9% full history and 56.6% recent; dogs of +7 or more were 49.2% and 49.3%. Recent improvement is not broad across dog size.",
      "Division results ranged from 45.1% to 55.6% full history and from 42.4% to 64.4% recent, showing substantial composition heterogeneity rather than one league-wide divisional effect.",
    ],
    articleValue: "The familiar divisional-dog story is worth retaining mainly as a reference angle: second meetings were not better, and the broad historical sample did not beat -110 break-even.",
    splitFamilies: [
      overallFamily(parent.id, parent.rule, selected),
      locationFamily(parent.id, parent.rule, selected),
      makeFamily({ id: "meeting-order", label: "Same-season meeting order", definition: "Deterministic same-season head-to-head chronology", trendId: parent.id, parentRule: parent.rule, sourceRows: selected, buckets: meetings, accessor: (row, bucket) => row.divisionalMeetingBucket === bucket.id }),
      spreadFamily(parent.id, parent.rule, selected, DOG_SPREAD_BUCKETS),
      makeFamily({ id: "division", label: "Studied team's division", definition: "Canonical NFL division of the underdog", trendId: parent.id, parentRule: parent.rule, sourceRows: selected, buckets: divisions, accessor: (row, bucket) => row.division === bucket.value }),
      seasonFamily(parent.id, parent.rule, selected),
    ],
  };
}

function buildRestArea(phase1, rows) {
  const shortParent = phase1Definition(phase1, "short-rest-disadvantage");
  const advantageParent = phase1Definition(phase1, "rest-advantage");
  const shortRows = rows.filter((row) => row.trendIds.includes(shortParent.id));
  const advantageRows = rows.filter((row) => row.trendIds.includes(advantageParent.id));
  const eligible = rows.filter((row) => Number.isFinite(row.restDifferential));
  const differentialBuckets = [
    { id: "meaningful-disadvantage", label: "Meaningful disadvantage", definition: "Rest differential <= -3 days" },
    { id: "small-disadvantage", label: "Small disadvantage", definition: "Rest differential -1 or -2 days" },
    { id: "equal-rest", label: "Equal rest", definition: "Rest differential = 0 days" },
    { id: "small-advantage", label: "Small advantage", definition: "Rest differential +1 or +2 days" },
    { id: "meaningful-advantage", label: "Meaningful advantage", definition: "Rest differential >= +3 days" },
  ];
  const nestedFlags = [
    { id: "thursday-after-sunday", label: "Thursday after Sunday", definition: "Studied team plays Thursday after a Sunday game (4 calendar days)", flag: "thursdayAfterSunday" },
    { id: "monday-to-sunday", label: "Monday-to-Sunday", definition: "Studied team plays Sunday after a Monday game (6 calendar days)", flag: "mondayToSunday" },
    { id: "normal-rest-opponent-extra", label: "Normal rest vs opponent extra", definition: "Studied team has 7 days; opponent has at least 8", flag: "normalRestOpponentExtra" },
    { id: "post-bye-rest-edge", label: "Post-bye rest edge", definition: "Phase 1 post-bye qualifier with rest differential >= +3", flag: "postByeRestEdge" },
    { id: "mini-bye-rest-edge", label: "Thursday mini-bye rest edge", definition: "Previous game Thursday, 9-11 days to current game, rest differential >= +3", flag: "miniByeRestEdge" },
    { id: "equal-rest", label: "Both teams equally rested", definition: "Rest differential equals zero", flag: "equalRest" },
    { id: "meaningful-disadvantage", label: "Meaningful asymmetric disadvantage", definition: "Rest differential <= -3", flag: "meaningfulRestDisadvantage" },
    { id: "meaningful-advantage", label: "Meaningful asymmetric advantage", definition: "Rest differential >= +3", flag: "meaningfulRestAdvantage" },
  ];
  const shortCadences = [
    { id: "thursday-after-sunday", label: "Thursday after Sunday", definition: "Thursday game after Sunday (4 days)" },
    { id: "monday-to-sunday", label: "Monday-to-Sunday", definition: "Sunday game after Monday (6 days)" },
    { id: "other-short-turnaround", label: "Other short turnaround", definition: "Other Phase 1 short-rest disadvantage structure" },
  ];
  const advantageSources = [
    { id: "post-bye-edge", label: "Post-bye edge", definition: "Phase 1 post-bye qualifier with >=3-day rest edge" },
    { id: "mini-bye-edge", label: "Thursday mini-bye edge", definition: "Previous game Thursday, 9-11 days to current, >=3-day edge" },
    { id: "other-rest-edge", label: "Other rest edge", definition: "Other Phase 1 >=3-day rest advantage" },
  ];
  return {
    id: "rest-structure-robustness",
    title: "Rest disadvantage / rest advantage robustness",
    parentTrendIds: [shortParent.id, advantageParent.id],
    parentPhase1Definitions: [shortParent, advantageParent].map((parent) => ({ trendId: parent.id, definitionVersion: parent.definitionVersion, rule: parent.rule })),
    conclusionLabel: "WEAK / NO BROAD EDGE",
    conclusion: "Neither generic rest advantage nor disadvantage shows a broad edge. Thursday short weeks are usually equal-rest games, Phase 1 short-rest disadvantage is overwhelmingly Monday-to-Sunday, and the only recent positive structure—mini-bye rest edge—remains negative after vig over full history.",
    findings: [
      "Short-rest disadvantage was 49.5% ATS full history and 52.1% recent; rest advantage was 49.9% and 51.7%. Neither clears -110 break-even in either standard window.",
      "Only one Phase 1 short-rest-disadvantage row was Thursday-after-Sunday, because ordinary Thursday games give both teams the same short week. Monday-to-Sunday supplied 469 of 510 rows and improved from 45.8% in the older era to 52.7% in the newer era.",
      "Post-bye rest edges were 48.9% ATS full history and 47.6% recent. Mini-bye rest edges were 51.0% full history and 54.5% recent, an era-dependent movement but not a full-history edge.",
      "Normal-rest teams facing an opponent with extra rest were 51.6% ATS over 723 games, still below -110 break-even and stable by era.",
      "Meaningful advantage/disadvantage bands are paired sides of the same games and remain approximately mirror images. Equal-rest team-games are exactly 50% by construction, so those cohorts are context rather than independent betting samples.",
    ],
    articleValue: "The strongest article point is definitional: Thursday football is usually shared short rest, while true asymmetric rest structures show little broad ATS edge.",
    splitFamilies: [
      overallFamily(shortParent.id, shortParent.rule, shortRows, "short-rest-overall"),
      makeFamily({ id: "short-rest-cadence", label: "Short-rest disadvantage cadence", definition: "Mutually exclusive schedule cadence within the Phase 1 short-rest disadvantage cohort", trendId: shortParent.id, parentRule: shortParent.rule, sourceRows: shortRows, buckets: shortCadences, accessor: (row, bucket) => shortRestCadence(row) === bucket.id }),
      overallFamily(advantageParent.id, advantageParent.rule, advantageRows, "rest-advantage-overall"),
      makeFamily({ id: "rest-advantage-source", label: "Rest-advantage source", definition: "Mutually exclusive priority: post-bye edge, then mini-bye edge, then other", trendId: advantageParent.id, parentRule: advantageParent.rule, sourceRows: advantageRows, buckets: advantageSources, accessor: (row, bucket) => restAdvantageSource(row) === bucket.id }),
      makeFamily({ id: "rest-differential", label: "Rest differential bands", definition: "Mutually exclusive fixed rest-differential bands over all team-games with both teams' rest known", trendId: "rest-context", parentRule: "All non-opener team-games with calculable rest for both teams", sourceRows: eligible, buckets: differentialBuckets, accessor: (row, bucket) => row.restDifferentialBucket === bucket.id }),
      makeFamily({ id: "schedule-structure", label: "Recognizable schedule structures", definition: "Nested, non-exclusive schedule flags; rows can appear in multiple siblings", trendId: "rest-context", parentRule: "All non-opener team-games with calculable rest for both teams", sourceRows: eligible, buckets: nestedFlags, accessor: (row, bucket) => row.restStructureFlags[bucket.flag] === true, overlapPolicy: "nested/non-exclusive flags", allowPartial: true }),
    ],
  };
}

function comparisonFamily({ id, label, definition, rowsByQualifier, buckets, accessor, parentRule }) {
  const sourceRows = Object.values(rowsByQualifier).flat();
  const expandedBuckets = Object.entries(rowsByQualifier).flatMap(([qualifier, qualifierRows]) => buckets.map((bucket) => ({
    ...bucket,
    id: `${qualifier}/${bucket.id}`,
    label: `${qualifier === "pre-bye" ? "Pre-bye" : "Post-bye"}: ${bucket.label}`,
    qualifierRows,
    originalId: bucket.id,
  })));
  return makeFamily({
    id,
    label,
    definition,
    trendId: "pre-bye-vs-post-bye",
    parentRule,
    sourceRows,
    buckets: expandedBuckets,
    accessor: (row, bucket) => bucket.qualifierRows.includes(row) && accessor(row, { ...bucket, id: bucket.originalId }),
  });
}

function buildByeComparisonArea(phase1, rows) {
  const pre = phase1Definition(phase1, "pre-bye");
  const post = phase1Definition(phase1, "post-bye");
  const rowsByQualifier = {
    "pre-bye": rows.filter((row) => row.trendIds.includes("pre-bye")).map((row) => ({ ...row, comparisonQualifier: "pre-bye" })),
    "post-bye": rows.filter((row) => row.trendIds.includes("post-bye")).map((row) => ({ ...row, comparisonQualifier: "post-bye" })),
  };
  const parentRule = `Pre-bye: ${pre.rule} Post-bye: ${post.rule}`;
  const qualifierBuckets = [
    { id: "pre-bye", label: "Pre-bye", definition: pre.rule, rows: rowsByQualifier["pre-bye"] },
    { id: "post-bye", label: "Post-bye", definition: post.rule, rows: rowsByQualifier["post-bye"] },
  ];
  const qualifierFamily = makeFamily({ id: "qualifier", label: "Direct overall comparison", definition: "Locked Phase 1 qualifiers shown side by side", trendId: "pre-bye-vs-post-bye", parentRule, sourceRows: Object.values(rowsByQualifier).flat(), buckets: qualifierBuckets, accessor: (row, bucket) => bucket.rows.includes(row) });
  const seasons = LOCKED_BASELINE.seasons.map((season) => ({ id: String(season), label: String(season), definition: `Season ${season} only` }));
  return {
    id: "pre-bye-vs-post-bye-comparison",
    title: "Pre-bye versus post-bye direct comparison",
    parentTrendIds: [pre.id, post.id],
    parentPhase1Definitions: [pre, post].map((parent) => ({ trendId: parent.id, definitionVersion: parent.definitionVersion, rule: parent.rule })),
    conclusionLabel: "SUBGROUP-DEPENDENT",
    conclusion: "Pre-bye and post-bye samples have similar average team/opponent quality, home share, and broad market-role mix. The ATS gap is concentrated among favorites and home teams, so basic composition does not explain it away, but neither does the comparison establish a causal bye effect.",
    findings: [
      "The cohorts are equal-sized (480 each). Pregame team win percentage averaged 49.5% pre-bye versus 50.1% post-bye; opponent averages were 49.8% versus 49.6%.",
      "Pre-bye teams were slight average underdogs (+0.18) and post-bye teams slight favorites (-0.68). They were favored in 240 versus 264 games and home in 220 versus 226, so broad role/location shares are similar.",
      "Favorite performance diverged sharply: pre-bye favorites were 57.6% ATS full history and 67.9% recent, versus 47.2% and 42.5% for post-bye favorites. Underdogs were much closer (49.4% versus 50.9% full history).",
      "Home teams also diverged (57.4% pre-bye versus 45.2% post-bye full history), while road records were closer and reversed by era.",
      "Pre-bye teams coming off wins were 57.1% ATS (65.3% recent); post-bye teams coming off wins were 49.4% (47.7% recent).",
      "Pre-bye results exceeded 50% in four of five recent seasons; post-bye results varied and fell to 37.5% in 2024. The recent divergence is not caused solely by one pre-bye season.",
      "Rest composition necessarily differs: 358 pre-bye rows had normal seven-day rest, while every post-bye row was in the locked 10-17-day bye range.",
    ],
    articleValue: "The comparison is valuable because simple strength and home/favorite frequency do not account for the gap; the divergence lives mainly inside the home/favorite subgroups and remains non-causal.",
    splitFamilies: [
      qualifierFamily,
      comparisonFamily({ id: "location", label: "Qualifier by home / away", definition: "Venue within each bye qualifier", rowsByQualifier, buckets: LOCATION_BUCKETS, accessor: (row, bucket) => row.venue === bucket.id, parentRule }),
      comparisonFamily({ id: "market-role", label: "Qualifier by market role", definition: "Favorite, underdog, and pick'em within each bye qualifier", rowsByQualifier, buckets: MARKET_ROLE_BUCKETS, accessor: (row, bucket) => row.marketRole === bucket.id, parentRule }),
      comparisonFamily({ id: "team-quality", label: "Qualifier by studied-team quality", definition: "Leakage-safe current-season pregame record within each qualifier", rowsByQualifier, buckets: QUALITY_BUCKETS, accessor: (row, bucket) => row.teamQualityBucket === bucket.id, parentRule }),
      comparisonFamily({ id: "opponent-quality", label: "Qualifier by opponent quality", definition: "Leakage-safe opponent current-season pregame record within each qualifier", rowsByQualifier, buckets: QUALITY_BUCKETS, accessor: (row, bucket) => row.opponentQualityBucket === bucket.id, parentRule }),
      comparisonFamily({ id: "rest-days", label: "Qualifier by current rest structure", definition: "Fixed current-team rest-day buckets within each qualifier", rowsByQualifier, buckets: REST_DAY_BUCKETS, accessor: (row, bucket) => row.currentRestDaysBucket === bucket.id, parentRule }),
      comparisonFamily({ id: "previous-result", label: "Qualifier by previous result", definition: "Immediately prior same-season straight-up result", rowsByQualifier, buckets: PREVIOUS_RESULT_BUCKETS, accessor: (row, bucket) => row.previousResultBucket === bucket.id, parentRule }),
      comparisonFamily({ id: "season", label: "Qualifier by season", definition: "Each fixed season within each qualifier", rowsByQualifier, buckets: seasons, accessor: (row, bucket) => row.season === Number(bucket.id), parentRule }),
    ],
  };
}

function pct(value) {
  return value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function number(value) {
  return value == null ? "N/A" : Number(value).toFixed(2).replace(/\.00$/, "");
}

function record(metrics, type) {
  return type === "ATS" ? `${metrics.atsWins}-${metrics.atsLosses}-${metrics.atsPushes}` : `${metrics.suWins}-${metrics.suLosses}-${metrics.suTies}`;
}

function metricRows(split, seasonOnly = false) {
  const periods = seasonOnly
    ? [["Season", split.fullHistoryMetrics]]
    : [
        ["Full 2011-2025", split.fullHistoryMetrics],
        ["Recent 2021-2025", split.recentFormMetrics],
        ["Older 2011-2018", split.eraMetrics.olderEra],
        ["Newer 2019-2025", split.eraMetrics.newerEra],
      ];
  return periods.map(([period, metrics]) => `| ${split.splitLabel} | ${period} | ${metrics.qualifyingTeamGames} (${metrics.sampleSizeLabel}) | ${record(metrics, "ATS")} | ${pct(metrics.atsWinPct)} | ${pct(metrics.atsRoiAtMinus110)} | ${pct(metrics.atsWilson95.low)}-${pct(metrics.atsWilson95.high)} | ${record(metrics, "SU")} | ${pct(metrics.suWinPct)} | ${number(metrics.averageTeamSpread)} | ${number(metrics.averageAtsCoverMargin)} | ${pct(metrics.averageTeamPregameWinPct)} | ${pct(metrics.averageOpponentPregameWinPct)} |`);
}

function markdown(artifact) {
  const lines = [
    "# NFL Situational Trends Study v1 — Phase 2 robustness",
    "",
    ...(artifact.generatedAt ? [`Generated: ${artifact.generatedAt}`, ""] : []),
    "> Research artifact only. Results are descriptive historical associations, not picks, causal estimates, calibrated probabilities, or a betting system.",
    "",
    "## Scope and methodology",
    "",
    `Phase 2 preserves the locked Phase 1 baseline and studies exactly five areas over **${artifact.dataset.seasons[0]}-${artifact.dataset.seasons.at(-1)}**: pre-bye teams, West-to-East early games, divisional underdogs, recognizable rest structures, and pre-bye versus post-bye composition. The source remains ${artifact.dataset.regularSeasonGames.toLocaleString()} regular-season games / ${artifact.dataset.teamGames.toLocaleString()} team-games with full spread coverage.`,
    "",
    "All cutoffs were fixed before inspecting Phase 2 results. Spread buckets are 7+, 3.5-6.5, 0.5-3, pick'em, and their underdog mirrors. Dog buckets are +0.5 to +3, +3.5 to +6.5, and +7 or more. FULL HISTORY is 2011-2025, RECENT FORM is 2021-2025, and eras are 2011-2018 versus 2019-2025.",
    "",
    "Team and opponent quality use only completed current-season games before kickoff. Win percentage counts a tie as one-half win; pregame point differential is the average margin in those prior games. No end-of-season result enters a pregame classification. Season openers are retained as `No prior games`.",
    "",
    "Rest differential bands are mutually exclusive. Recognizable schedule flags are explicitly nested/non-exclusive: one row may, for example, be both Thursday-after-Sunday and equally rested. Travel distance is coarse great-circle stadium distance, with Oakland (Raiders through 2019) and San Diego (Chargers through 2016) deterministic relocation overrides; it is not a route, arrival, or geospatial performance model.",
    "",
    "Sample labels are descriptive only: **VERY SMALL** n<50, **LIMITED** n=50-99, **MODERATE** n=100-199, and **LARGER** n>=200. Wilson 95% intervals exclude pushes; ATS ROI assumes -110 and also excludes pushes.",
    "",
    "## Executive conclusions",
    "",
    "| Area | Robustness label | Conservative conclusion | Article value |",
    "| --- | --- | --- | --- |",
    ...artifact.areas.map((area) => `| ${area.title} | ${area.conclusionLabel} | ${area.conclusion} | ${area.articleValue} |`),
    "",
  ];
  for (const area of artifact.areas) {
    lines.push(`## ${area.title}`, "", `**Conclusion: ${area.conclusionLabel}.** ${area.conclusion}`, "", `Article value: ${area.articleValue}`, "");
    if (area.findings?.length) lines.push("Key findings:", "", ...area.findings.map((finding) => `- ${finding}`), "");
    for (const family of area.splitFamilies) {
      lines.push(`### ${family.label}`, "", `${family.definition} Overlap policy: **${family.overlapPolicy}**.`, "", "| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
      const seasonOnly = family.id === "season";
      for (const split of family.splits) lines.push(...metricRows(split, seasonOnly));
      lines.push("");
    }
  }
  lines.push("## Cross-area synthesis", "", "### Strongest broad patterns", "", ...artifact.crossAreaSynthesis.strongestBroadPatterns.map((finding) => `- ${finding}`), "", "### Subgroup-dependent findings", "", ...artifact.crossAreaSynthesis.subgroupDependent.map((finding) => `- ${finding}`), "", "### Era-dependent findings", "", ...artifact.crossAreaSynthesis.eraDependent.map((finding) => `- ${finding}`), "", "### Composition assessment", "", ...artifact.crossAreaSynthesis.compositionAssessment.map((finding) => `- ${finding}`), "", "### Phase 3 candidates (not started)", "", ...artifact.crossAreaSynthesis.phase3Candidates.map((finding) => `- ${finding}`), "");
  lines.push(
    "## Interpretation guardrails and Phase 3 candidates",
    "",
    "Phase 2 does not select a profitable combination, optimize a threshold, or promote any result into production. Differences across teams, seasons, market roles, and quality cohorts are composition checks, not causal controls. The simple Wilson intervals are uncertainty context and do not adjust for within-game dependence or the number of displayed predefined splits.",
    "",
    "Potential Phase 3 work, only if separately approved, is limited to prospective or held-out confirmation of the most stable predefined observations, stronger point-in-time strength controls, and clustered/paired uncertainty analysis. No Phase 3 work is started here.",
    "",
    "## Reproduction",
    "",
    "1. Rebuild and verify Phase 1: `npm run nfl:situational-trends -- --input=data/external/nflverse/games.csv --start-season=2011 --end-season=2025`.",
    "2. Build Phase 2 from the locked Phase 1 artifacts: `npm run nfl:situational-trends:phase2`.",
    "3. Run both pure-logic suites: `npm run nfl:situational-trends:test` and `npm run nfl:situational-trends:phase2:test`.",
    "",
    `Phase 2 input hashes: Phase 1 report \`${artifact.inputs.phase1Report.sha256}\`; Phase 1 team-games \`${artifact.inputs.phase1TeamGames.sha256}\`; canonical teams \`${artifact.inputs.teams.sha256}\`.`,
    "",
    "No production NFL model, projection, grading, UI, prediction archive, outcome resolver, or market integration is read as a model input or modified by this study.",
    ""
  );
  return lines.join("\n");
}

function validateArtifact(artifact) {
  if (artifact.areas.length !== 5) throw new Error("Phase 2 must contain exactly five priority areas.");
  const areaIds = artifact.areas.map((area) => area.id);
  if (new Set(areaIds).size !== areaIds.length) throw new Error("Phase 2 contains duplicate area IDs.");
  const requiredMetricFields = ["qualifyingTeamGames", "atsWins", "atsLosses", "atsPushes", "atsWinPct", "atsRoiAtMinus110", "atsWilson95", "suWinPct", "averageTeamSpread", "averageAtsCoverMargin"];
  for (const area of artifact.areas) {
    const splitIds = area.splitFamilies.flatMap((family) => family.splits.map((split) => split.splitId));
    if (new Set(splitIds).size !== splitIds.length) throw new Error(`${area.id} contains duplicate split IDs.`);
    for (const family of area.splitFamilies) {
      for (const split of family.splits) {
        for (const metrics of [split.fullHistoryMetrics, split.recentFormMetrics, split.eraMetrics.olderEra, split.eraMetrics.newerEra]) {
          if (requiredMetricFields.some((field) => !(field in metrics))) throw new Error(`${area.id}/${split.splitId} is missing required metrics.`);
        }
      }
    }
  }
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  const phase1Text = readFileSync(PHASE1_REPORT_PATH, "utf8");
  const teamGamesText = readFileSync(TEAM_GAMES_PATH, "utf8");
  const teamsText = readFileSync(TEAMS_PATH, "utf8");
  const phase1 = JSON.parse(phase1Text);
  const rawRows = teamGamesText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const teams = JSON.parse(teamsText).teams;
  validateLockedBaseline(phase1, rawRows);
  const rows = annotateRows(rawRows, teams);
  const artifact = {
    schemaVersion: PHASE2_SCHEMA_VERSION,
    studyVersion: PHASE2_STUDY_VERSION,
    generatedAt: args.generatedAt,
    phase1Baseline: {
      locked: true,
      studyVersion: phase1.studyVersion,
      definitionVersion: phase1.definitionVersion,
      reportPath: "public/data/nfl/research/situational-trends-v1.json",
      teamGamePath: "data/nfl/research/situational-trend-team-games-v1.jsonl",
      preservationPolicy: "Phase 2 consumes and references Phase 1; it does not redefine or overwrite Phase 1 rows, qualifiers, grading, windows, or interpretations.",
    },
    dataset: {
      seasons: [...phase1.dataset.seasons],
      regularSeasonGames: phase1.dataset.regularSeasonGames,
      teamGames: phase1.dataset.teamGames,
      gamesWithSpread: phase1.dataset.gamesWithSpread,
      spreadCoveragePct: phase1.dataset.spreadCoveragePct,
      marketSource: phase1.dataset.marketSource,
    },
    windows: { fullHistory: REPORTING_WINDOWS.fullHistory, recentForm: REPORTING_WINDOWS.recentForm, olderEra: FIXED_ERA_WINDOWS.olderEra, newerEra: FIXED_ERA_WINDOWS.newerEra },
    methodology: {
      selectionPolicy: "Exactly five user-predefined Phase 2 areas; only first-order football splits; no recursive combinations or optimized cutoffs.",
      teamQuality: "Current-season pregame record and average point differential from strictly earlier completed team-games; ties count as one-half win; no prior-game rows are separate.",
      meetingOrder: "Same-season head-to-head regular-season games ordered by kickoff UTC then game ID.",
      rest: "Eastern-calendar rest days inherited from Phase 1; differential bands are mutually exclusive and recognizable schedule flags are nested/non-exclusive.",
      travel: "Coarse great-circle home-stadium distance with deterministic Oakland/Las Vegas and San Diego/Los Angeles relocation handling; no route or arrival model.",
      sampleSizeLabels: { verySmall: "n < 50", limited: "n 50-99", moderate: "n 100-199", larger: "n 200+" },
      uncertainty: "95% Wilson interval on ATS decisions; pushes excluded. Descriptive only; not multiple-test adjusted or clustered by game.",
    },
    inputs: {
      phase1Report: { path: "public/data/nfl/research/situational-trends-v1.json", sha256: sha256(phase1Text), bytes: Buffer.byteLength(phase1Text) },
      phase1TeamGames: { path: "data/nfl/research/situational-trend-team-games-v1.jsonl", sha256: sha256(teamGamesText), bytes: Buffer.byteLength(teamGamesText) },
      teams: { path: "public/data/nfl/teams.json", sha256: sha256(teamsText), bytes: Buffer.byteLength(teamsText) },
    },
    areas: [
      buildPreByeArea(phase1, rows),
      buildWestToEastArea(phase1, rows),
      buildDivisionalDogArea(phase1, rows),
      buildRestArea(phase1, rows),
      buildByeComparisonArea(phase1, rows),
    ],
    crossAreaSynthesis: {
      strongestBroadPatterns: [
        "West-to-East early performance is the broadest positive descriptive pattern: both eras and both market roles point above 50%, four of five franchises are positive, and no coarse distance bucket creates the result. The total sample remains moderate.",
        "Pre-bye performance is materially stronger in the newer era and in four of five recent seasons, but the magnitude is concentrated among home teams and favorites.",
      ],
      subgroupDependent: [
        "Pre-bye: home/favorite cohorts account for most of the favorable result; away/underdog cohorts remain near 50%.",
        "Divisional underdogs: recent improvement is concentrated among road teams, smaller dogs, and selected divisions.",
        "Pre-bye versus post-bye: the divergence is greatest among favorites, home teams, and teams coming off wins.",
      ],
      eraDependent: [
        "Pre-bye improved from 49.6% ATS in 2011-2018 to 57.9% in 2019-2025.",
        "Divisional underdogs improved from 49.4% to 53.6%, but the gain is not uniform by dog size or division.",
        "Monday-to-Sunday short-rest disadvantage and mini-bye rest edge improved in the newer era without establishing a full-history edge.",
      ],
      compositionAssessment: [
        "West-to-East early is not explained by one or two franchises or by favorite/underdog mix, though Las Vegas/Oakland and large underdogs are exceptions.",
        "Pre-bye and post-bye cohorts have very similar average pregame quality and home/favorite shares; basic composition does not explain their ATS divergence, which is conditional on market role and venue.",
        "Division membership materially changes divisional-underdog results, weakening any league-wide interpretation.",
      ],
      phase3Candidates: [
        "Prospective or untouched-future confirmation of the unchanged overall pre-bye and West-to-East early qualifiers, with the Phase 2 strata monitored rather than optimized.",
        "Paired or cluster-aware uncertainty and a predeclared descriptive adjustment for pregame strength, venue, spread, and season; no recursive filter search.",
        "A timestamped, source-identified market-line study to determine whether the settled historical line result persists at observable pregame prices.",
      ],
    },
    limitations: [
      "The settled nflverse line is unnamed and untimestamped; it is not independently verified as a closing consensus.",
      "Team quality is a simple within-season descriptive proxy and is volatile early in a season; it is not an opponent-adjusted rating.",
      "Travel distance uses stadium-to-stadium great-circle distance and omits route, arrival day, body-clock adaptation, and temporary venues.",
      "Multiple team-game observations and repeated teams/seasons are dependent; Wilson intervals are unclustered descriptive context.",
      "Displayed splits were predefined but numerous; no p-values, best-subgroup selection, or multi-factor combinations are used.",
    ],
  };
  validateArtifact(artifact);
  write(PUBLIC_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  write(DOC_PATH, markdown(artifact));
  console.log(`Generated ${artifact.areas.length} Phase 2 areas from ${artifact.dataset.teamGames} locked Phase 1 team-games.`);
  console.log(`Wrote ${PUBLIC_PATH}`);
  console.log(`Wrote ${DOC_PATH}`);
}

main();

/**
 * Generate NFL Situational Trends Study v1, Phase 2B.
 *
 * This local-only generator joins the locked Phase 1 team-game artifact to the
 * same nflverse games.csv snapshot by game ID for explicit overtime and
 * weekday/kickoff context. It never rewrites Phase 1 or Phase 2 artifacts.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../lib/nfl-schedules-results-core.mjs";
import { FIXED_ERA_WINDOWS, REPORTING_WINDOWS } from "../lib/nfl-situational-trends-core.mjs";
import {
  PHASE2B_DEFINITION_VERSION,
  PHASE2B_SCHEMA_VERSION,
  PHASE2B_STUDY_VERSION,
  PHASE2B_TREND_IDS,
  articleRelevanceFor,
  attachSecondDivisionalMeetingContext,
  buildPhase2bVariant,
  doubleDigitClassification,
  doubleDigitMarginBand,
  favoriteSpreadBand,
  homeUnderdog,
  isMondayNight,
  isOvertimeValue,
  isSundayNight,
  kickoffContext,
  marketRole,
  priorUpsetClassification,
  previousScoreBand,
  roadFavorite,
  underdogSpreadBand,
} from "../lib/nfl-situational-trends-phase2b-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PHASE1_REPORT_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-v1.json");
const PHASE2_REPORT_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-phase2.json");
const TEAM_GAMES_PATH = join(ROOT, "data", "nfl", "research", "situational-trend-team-games-v1.jsonl");
const DEFAULT_SOURCE_PATH = join(ROOT, "data", "external", "nflverse", "games.csv");
const PUBLIC_PATH = join(ROOT, "public", "data", "nfl", "research", "situational-trends-phase2b.json");
const DOC_PATH = join(ROOT, "docs", "research", "nfl-situational-trends-phase2b.md");

const LOCKED_BASELINE = {
  seasons: Array.from({ length: 15 }, (_, index) => 2011 + index),
  regularSeasonGames: 3919,
  teamGames: 7838,
  phase1StudyVersion: "nfl-situational-trends-v1",
  phase2StudyVersion: "nfl-situational-trends-phase2-v1",
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

function sourceGameIndex(csvText) {
  const rows = parseCsv(csvText);
  const required = ["game_id", "season", "game_type", "weekday", "gametime", "overtime"];
  if (!rows.length || required.some((field) => !(field in rows[0]))) {
    throw new Error(`nflverse source is missing required Phase 2B columns: ${required.join(", ")}`);
  }
  const eligible = rows.filter((row) => Number(row.season) >= 2011 && Number(row.season) <= 2025 && row.game_type === "REG");
  const index = new Map();
  for (const row of eligible) {
    if (index.has(row.game_id)) throw new Error(`Duplicate nflverse game ID: ${row.game_id}`);
    if (!["0", "1"].includes(row.overtime)) throw new Error(`${row.game_id} has a non-binary overtime value: ${row.overtime}`);
    index.set(row.game_id, {
      gameId: row.game_id,
      season: Number(row.season),
      weekday: row.weekday,
      gametime: row.gametime,
      overtime: Number(row.overtime),
    });
  }
  return index;
}

function sourceAudit(rawRows, sourceByGame) {
  const uniqueRows = [...new Map(rawRows.map((row) => [row.gameId, row])).values()];
  let weekdayMismatches = 0;
  let kickoffTimeMismatches = 0;
  let overtimeGames = 0;
  for (const row of uniqueRows) {
    const source = sourceByGame.get(row.gameId);
    if (!source) throw new Error(`Phase 1 game is missing from nflverse source: ${row.gameId}`);
    const context = kickoffContext(row.kickoffUtc);
    const expectedWeekday = source.weekday.slice(0, 3);
    const expectedTime = `${String(context?.hour).padStart(2, "0")}:${String(context?.minute).padStart(2, "0")}`;
    if (context?.weekday !== expectedWeekday) weekdayMismatches += 1;
    if (expectedTime !== source.gametime) kickoffTimeMismatches += 1;
    if (isOvertimeValue(source.overtime)) overtimeGames += 1;
  }
  if (uniqueRows.length !== LOCKED_BASELINE.regularSeasonGames) throw new Error("Phase 2B unique-game count differs from the locked baseline.");
  if (weekdayMismatches || kickoffTimeMismatches) {
    throw new Error(`Source schedule audit failed (${weekdayMismatches} weekday; ${kickoffTimeMismatches} kickoff mismatches).`);
  }
  return {
    phase1GamesJoined: uniqueRows.length,
    explicitOvertimeFieldCoverage: uniqueRows.length,
    explicitWeekdayFieldCoverage: uniqueRows.length,
    explicitKickoffTimeFieldCoverage: uniqueRows.length,
    overtimeGames,
    weekdayMismatches,
    kickoffTimeMismatches,
    overtimeDetection: "nflverse overtime == 1; scores are not used to infer overtime",
    mondayNightDetection: "Eastern weekday is Monday and kickoff is at or after 7:00 p.m. ET",
    sundayNightDetection: "Eastern weekday is Sunday and kickoff is at or after 8:00 p.m. ET",
  };
}

function validateBaselines(phase1, phase2, rawRows, sourceText) {
  if (phase1.studyVersion !== LOCKED_BASELINE.phase1StudyVersion) throw new Error("Phase 1 study version differs from the locked baseline.");
  if (phase2.studyVersion !== LOCKED_BASELINE.phase2StudyVersion) throw new Error("Phase 2 study version differs from the locked baseline.");
  if (phase1.dataset.regularSeasonGames !== LOCKED_BASELINE.regularSeasonGames || phase1.dataset.teamGames !== LOCKED_BASELINE.teamGames || rawRows.length !== LOCKED_BASELINE.teamGames) {
    throw new Error("Phase 1 counts differ from the locked baseline.");
  }
  if (JSON.stringify(phase1.dataset.seasons) !== JSON.stringify(LOCKED_BASELINE.seasons)) throw new Error("Phase 1 seasons differ from the locked baseline.");
  const sourceInput = phase1.dataset.inputFiles.find((input) => input.path === "data/external/nflverse/games.csv");
  if (!sourceInput || sourceInput.sha256 !== sha256(sourceText) || sourceInput.bytes !== Buffer.byteLength(sourceText)) {
    throw new Error("Phase 2B nflverse input is not the exact snapshot recorded by Phase 1.");
  }
}

function annotateRows(rawRows, sourceByGame) {
  const rowById = new Map(rawRows.map((row) => [row.rowId, row]));
  return attachSecondDivisionalMeetingContext(rawRows).map((row) => {
    const previousRow = row.previousGame ? rowById.get(`${row.previousGame.gameId}:${row.team}`) : null;
    const previousSource = row.previousGame ? sourceByGame.get(row.previousGame.gameId) : null;
    return {
      ...row,
      currentMarketRole: marketRole(row.teamSpread),
      favoriteSpreadBand: favoriteSpreadBand(row.teamSpread),
      underdogSpreadBand: underdogSpreadBand(row.teamSpread),
      doubleDigitClassification: doubleDigitClassification(row.teamSpread),
      doubleDigitMarginBand: doubleDigitMarginBand(row.teamSpread),
      priorUpsetClassification: priorUpsetClassification(row.previousGame),
      previousOvertime: previousSource ? isOvertimeValue(previousSource.overtime) : false,
      previousMondayNight: row.previousGame ? isMondayNight(row.previousGame.kickoffUtc) : false,
      previousSundayNight: row.previousGame ? isSundayNight(row.previousGame.kickoffUtc) : false,
      previousTeamScore: previousRow?.teamScore ?? null,
      previousOpponentScore: previousRow?.opponentScore ?? null,
      previousSuResult: previousRow?.suResult ?? null,
      previousTeamScoreBand: previousScoreBand(previousRow?.teamScore),
      previousOpponentScoreBand: previousScoreBand(previousRow?.opponentScore),
      opponentHadMoreRest: Number.isFinite(row.restDays) && Number.isFinite(row.opponentRestDays) && row.opponentRestDays > row.restDays,
    };
  });
}

function variant(id, label, definition, matches, overlapPolicy = "predefined; may overlap sibling variants") {
  return { id, label, definition, matches, overlapPolicy };
}

function trendDefinitions() {
  const overall = (definition) => variant("overall", "Overall", definition, () => true, "base qualifier");
  const currentVenue = [
    variant("current-home", "Current game: home", "Current venue is non-neutral home", (row) => row.venue === "home"),
    variant("current-road", "Current game: road", "Current venue is non-neutral road", (row) => row.venue === "away"),
  ];
  const currentRole = [
    variant("current-favorite", "Current favorite", "Current team-relative spread is below zero", (row) => row.currentMarketRole === "favorite"),
    variant("current-underdog", "Current underdog", "Current team-relative spread is above zero", (row) => row.currentMarketRole === "underdog"),
  ];
  const nightVariants = [
    ...currentVenue,
    ...currentRole,
    variant("opponent-more-rest", "Opponent had more rest", "Opponent has more Eastern-calendar rest days before the current game", (row) => row.opponentHadMoreRest),
  ];
  return [
    {
      id: "home-underdogs", label: "Home underdogs", parentCategory: "Current-game market role and venue",
      exactDefinition: "Team is playing at home and its team-relative market spread is greater than 0; pick'em is excluded.",
      base: homeUnderdog,
      variants: [
        overall("All home underdogs"),
        variant("dog-0.5-to-3", "+0.5 to +3", "Team-relative spread is +0.5 through +3", (row) => row.underdogSpreadBand === "underdog-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("dog-3.5-to-6.5", "+3.5 to +6.5", "Team-relative spread is +3.5 through +6.5", (row) => row.underdogSpreadBand === "underdog-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("dog-7-plus", "+7 or more", "Team-relative spread is at least +7", (row) => row.underdogSpreadBand === "underdog-7-plus", "mutually exclusive spread-band siblings"),
      ],
    },
    {
      id: "road-favorites", label: "Road favorites", parentCategory: "Current-game market role and venue",
      exactDefinition: "Team is playing on the road and its team-relative market spread is less than 0; pick'em is excluded.",
      base: roadFavorite,
      variants: [
        overall("All road favorites"),
        variant("favorite-0.5-to-3", "-0.5 to -3", "Team-relative spread is -0.5 through -3", (row) => row.favoriteSpreadBand === "favorite-0.5-to-3", "mutually exclusive spread-band siblings"),
        variant("favorite-3.5-to-6.5", "-3.5 to -6.5", "Team-relative spread is -3.5 through -6.5", (row) => row.favoriteSpreadBand === "favorite-3.5-to-6.5", "mutually exclusive spread-band siblings"),
        variant("favorite-7-plus", "-7 or more", "Team-relative spread is -7 or shorter", (row) => row.favoriteSpreadBand === "favorite-7-plus", "mutually exclusive spread-band siblings"),
      ],
    },
    {
      id: "double-digit-favorites", label: "Double-digit favorites", parentCategory: "Current-game market role",
      exactDefinition: "Team-relative market spread is less than or equal to -10.",
      base: (row) => row.doubleDigitClassification === "favorite",
      variants: [overall("All favorites of at least 10 points"), ...currentVenue,
        variant("margin-10-to-13.5", "Favorite margin 10 to 13.5", "Absolute favorite spread is 10 through 13.5", (row) => row.doubleDigitMarginBand === "10-to-13.5", "mutually exclusive margin-band siblings"),
        variant("margin-14-plus", "Favorite margin 14+", "Absolute favorite spread is at least 14", (row) => row.doubleDigitMarginBand === "14-plus", "mutually exclusive margin-band siblings")],
    },
    {
      id: "double-digit-underdogs", label: "Double-digit underdogs", parentCategory: "Current-game market role",
      exactDefinition: "Team-relative market spread is greater than or equal to +10.",
      base: (row) => row.doubleDigitClassification === "underdog",
      variants: [overall("All underdogs of at least 10 points"), ...currentVenue,
        variant("margin-10-to-13.5", "Underdog margin +10 to +13.5", "Underdog spread is +10 through +13.5", (row) => row.doubleDigitMarginBand === "10-to-13.5", "mutually exclusive margin-band siblings"),
        variant("margin-14-plus", "Underdog margin +14 or more", "Underdog spread is at least +14", (row) => row.doubleDigitMarginBand === "14-plus", "mutually exclusive margin-band siblings")],
    },
    {
      id: "after-outright-upset-win", label: "After an outright upset win", parentCategory: "Immediately previous game",
      exactDefinition: "Team won its immediately previous same-season game straight up after entering that prior game as an underdog.",
      base: (row) => row.priorUpsetClassification === "upset-win",
      variants: [overall("All games after an outright underdog win"),
        variant("prior-dog-0.5-to-3", "Prior underdog +0.5 to +3", "Prior-game team-relative spread was +0.5 through +3", (row) => underdogSpreadBand(row.previousGame?.teamSpread) === "underdog-0.5-to-3", "mutually exclusive prior-spread siblings"),
        variant("prior-dog-3.5-to-6.5", "Prior underdog +3.5 to +6.5", "Prior-game team-relative spread was +3.5 through +6.5", (row) => underdogSpreadBand(row.previousGame?.teamSpread) === "underdog-3.5-to-6.5", "mutually exclusive prior-spread siblings"),
        variant("prior-dog-7-plus", "Prior underdog +7 or more", "Prior-game team-relative spread was at least +7", (row) => underdogSpreadBand(row.previousGame?.teamSpread) === "underdog-7-plus", "mutually exclusive prior-spread siblings")],
    },
    {
      id: "after-outright-upset-loss", label: "After an outright upset loss", parentCategory: "Immediately previous game",
      exactDefinition: "Team lost its immediately previous same-season game straight up after entering that prior game as the favorite.",
      base: (row) => row.priorUpsetClassification === "upset-loss",
      variants: [overall("All games after a favorite lost outright"),
        variant("prior-favorite-0.5-to-3", "Prior favorite -0.5 to -3", "Prior-game team-relative spread was -0.5 through -3", (row) => favoriteSpreadBand(row.previousGame?.teamSpread) === "favorite-0.5-to-3", "mutually exclusive prior-spread siblings"),
        variant("prior-favorite-3.5-to-6.5", "Prior favorite -3.5 to -6.5", "Prior-game team-relative spread was -3.5 through -6.5", (row) => favoriteSpreadBand(row.previousGame?.teamSpread) === "favorite-3.5-to-6.5", "mutually exclusive prior-spread siblings"),
        variant("prior-favorite-7-plus", "Prior favorite -7 or more", "Prior-game team-relative spread was -7 or shorter", (row) => favoriteSpreadBand(row.previousGame?.teamSpread) === "favorite-7-plus", "mutually exclusive prior-spread siblings")],
    },
    {
      id: "coming-off-overtime", label: "Coming off overtime", parentCategory: "Immediately previous game",
      exactDefinition: "The team's immediately previous same-season game has nflverse overtime == 1.",
      base: (row) => row.previousOvertime,
      variants: [overall("All games immediately after overtime"),
        variant("won-previous-ot", "Won previous OT", "Team won the immediately previous overtime game", (row) => row.previousSuResult === "W"),
        variant("lost-previous-ot", "Lost previous OT", "Team lost the immediately previous overtime game", (row) => row.previousSuResult === "L"), ...currentVenue],
    },
    {
      id: "coming-off-monday-night-football", label: "Coming off Monday Night Football", parentCategory: "Immediately previous game",
      exactDefinition: "The immediately previous same-season game kicked off on Monday at or after 7:00 p.m. Eastern.",
      base: (row) => row.previousMondayNight,
      variants: [overall("All games immediately after Monday Night Football"), ...nightVariants],
    },
    {
      id: "coming-off-sunday-night-football", label: "Coming off Sunday Night Football", parentCategory: "Immediately previous game",
      exactDefinition: "The immediately previous same-season game kicked off on Sunday at or after 8:00 p.m. Eastern.",
      base: (row) => row.previousSundayNight,
      variants: [overall("All games immediately after Sunday Night Football"), ...nightVariants],
    },
    {
      id: "second-divisional-meeting", label: "Second divisional meeting", parentCategory: "Same-season divisional chronology",
      exactDefinition: "Current game is the second same-season regular-season meeting between divisional opponents, ordered by kickoff UTC then game ID.",
      base: (row) => row.divisional && row.divisionalMeetingNumber === 2,
      variants: [overall("All second same-season divisional meetings"), ...currentVenue, ...currentRole,
        variant("current-team-won-first", "Current team won first meeting", "Studied team won the first same-season meeting straight up", (row) => row.firstMeetingSuResult === "W"),
        variant("current-underdog-lost-first", "Current underdog lost first meeting", "Studied team is the current underdog and lost the first same-season meeting", (row) => row.currentMarketRole === "underdog" && row.firstMeetingSuResult === "L")],
    },
    {
      id: "after-scoring-40-plus", label: "After scoring 40+ points", parentCategory: "Immediately previous game",
      exactDefinition: "Team scored at least 40 points in its immediately previous same-season game.",
      base: (row) => Number.isFinite(row.previousTeamScore) && row.previousTeamScore >= 40,
      variants: [overall("All games after scoring at least 40"),
        variant("won-previous", "Won previous game", "Team won the game in which it scored 40+", (row) => row.previousSuResult === "W"), ...currentRole, ...currentVenue,
        variant("scored-40-to-49", "Scored 40-49", "Team scored 40 through 49 in its previous game", (row) => row.previousTeamScoreBand === "40-to-49", "mutually exclusive score-band siblings"),
        variant("scored-50-plus", "Scored 50+", "Team scored at least 50 in its previous game", (row) => row.previousTeamScoreBand === "50-plus", "mutually exclusive score-band siblings")],
    },
    {
      id: "after-allowing-40-plus", label: "After allowing 40+ points", parentCategory: "Immediately previous game",
      exactDefinition: "Team allowed at least 40 points in its immediately previous same-season game.",
      base: (row) => Number.isFinite(row.previousOpponentScore) && row.previousOpponentScore >= 40,
      variants: [overall("All games after allowing at least 40"),
        variant("lost-previous", "Lost previous game", "Team lost the game in which it allowed 40+", (row) => row.previousSuResult === "L"), ...currentRole, ...currentVenue,
        variant("allowed-40-to-49", "Allowed 40-49", "Team allowed 40 through 49 in its previous game", (row) => row.previousOpponentScoreBand === "40-to-49", "mutually exclusive score-band siblings"),
        variant("allowed-50-plus", "Allowed 50+", "Team allowed at least 50 in its previous game", (row) => row.previousOpponentScoreBand === "50-plus", "mutually exclusive score-band siblings")],
    },
  ];
}

function buildTrends(rows) {
  return trendDefinitions().map((definition) => {
    const qualifyingRows = rows.filter(definition.base);
    const variants = definition.variants.map((item) => buildPhase2bVariant({
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
      definitionVersion: PHASE2B_DEFINITION_VERSION,
      parentCategory: definition.parentCategory,
      commonAngleStatus: "COMMON/CLASSIC ANGLE",
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

function labelResult(trend) {
  return `${trend.label}: ${record(trend.fullHistoryMetrics)} ATS (${pct(trend.fullHistoryMetrics.atsWinPct)}, ${pct(trend.fullHistoryMetrics.atsRoiAtMinus110)} ROI; n=${trend.fullHistoryMetrics.qualifyingTeamGames}) full history and ${record(trend.recentFormMetrics)} (${pct(trend.recentFormMetrics.atsWinPct)}, ${pct(trend.recentFormMetrics.atsRoiAtMinus110)} ROI; n=${trend.recentFormMetrics.qualifyingTeamGames}) recent.`;
}

function buildSynthesis(trends) {
  const ranked = [...trends].sort((a, b) => Math.abs(b.fullHistoryMetrics.atsWinPct - 0.5) - Math.abs(a.fullHistoryMetrics.atsWinPct - 0.5));
  const changed = trends.filter((trend) => trend.stabilityFlags.recentChange !== "STABLE");
  const reversals = trends.filter((trend) => trend.stabilityFlags.eraDirectionReverses);
  const noEvidence = trends.filter((trend) => trend.evidenceClassification === "LITTLE/NO EVIDENCE");
  const contradictions = trends.filter((trend) => trend.evidenceClassification === "LITTLE/NO EVIDENCE" && trend.fullHistoryMetrics.atsWinPct <= 0.5238);
  const future = trends.filter((trend) => trend.evidenceClassification === "HISTORICALLY MEANINGFUL" || (trend.evidenceClassification === "CONTEXT-DEPENDENT" && (trend.stabilityFlags.eraDirectionReverses || trend.stabilityFlags.recentChange !== "STABLE")));
  const reference = trends.filter((trend) => ["LITTLE/NO EVIDENCE", "INSUFFICIENT DATA"].includes(trend.evidenceClassification));
  const variantDifferences = trends.map((trend) => {
    const eligible = trend.variants.slice(1).filter((item) => item.fullHistoryMetrics.qualifyingTeamGames >= 50 && Number.isFinite(item.fullHistoryMetrics.atsWinPct));
    if (eligible.length < 2) return `${trend.label}: fewer than two predefined variants have at least 50 full-history team-games.`;
    const ordered = [...eligible].sort((a, b) => b.fullHistoryMetrics.atsWinPct - a.fullHistoryMetrics.atsWinPct);
    const high = ordered[0];
    const low = ordered.at(-1);
    return `${trend.label}: ${high.label} was highest at ${pct(high.fullHistoryMetrics.atsWinPct)} ATS (n=${high.fullHistoryMetrics.qualifyingTeamGames}); ${low.label} was lowest at ${pct(low.fullHistoryMetrics.atsWinPct)} (n=${low.fullHistoryMetrics.qualifyingTeamGames}).`;
  });
  return {
    strongestBroadPatterns: ranked.slice(0, 3).map(labelResult),
    classicAnglesWithLittleOrNoEvidence: noEvidence.map((trend) => trend.label),
    recentStrengtheningOrWeakening: changed.map((trend) => `${trend.label}: ${trend.stabilityFlags.recentChange.toLowerCase()} by ${pct(Math.abs(trend.stabilityFlags.recentVsFullHistoryAtsPctDelta))} versus full history.`),
    eraReversals: reversals.map((trend) => `${trend.label}: ${pct(trend.eraMetrics.olderEra.atsWinPct)} older era versus ${pct(trend.eraMetrics.newerEra.atsWinPct)} newer era.`),
    commonNarrativesContradicted: contradictions.map((trend) => `${trend.label} did not establish a broad ATS edge in the fixed full-history and recent windows.`),
    notablePredefinedVariantDifferences: variantDifferences,
    futureStudyCandidates: future.map((trend) => trend.label),
    referenceContextAngles: reference.map((trend) => trend.label),
  };
}

function markdown(artifact) {
  const lines = [
    "# NFL Situational Trends Study v1 — Phase 2B reference expansion",
    "",
    ...(artifact.generatedAt ? [`Generated: ${artifact.generatedAt}`, ""] : []),
    "> Descriptive historical research only. These records are not picks, causal estimates, calibrated probabilities, or a betting system.",
    "",
    "## Methodology",
    "",
    `Phase 2B adds exactly 12 predefined classic/common angle families over the locked Phase 1 dataset: **${artifact.dataset.regularSeasonGames.toLocaleString()} regular-season games / ${artifact.dataset.teamGames.toLocaleString()} team-games, 2011-2025**. FULL HISTORY is 2011-2025, RECENT FORM is 2021-2025, and the fixed era split is 2011-2018 versus 2019-2025. No threshold, subgroup, season, or combination was selected from results.`,
    "",
    "Team-relative spreads, ATS grades, SU grades, -110 ROI, Wilson 95% intervals, window assignment, and sample labels are inherited unchanged from Phase 1/2. Pushes are excluded from ATS percentage, ROI, and Wilson intervals. Sample labels remain VERY SMALL (<50), LIMITED (50-99), MODERATE (100-199), and LARGER (200+).",
    "",
    `Overtime uses the source's explicit binary field (${artifact.sourceAudit.overtimeGames} games); it is never inferred from scores. Monday night is Monday at/after 7:00 p.m. ET and Sunday night is Sunday at/after 8:00 p.m. ET. The audit found ${artifact.sourceAudit.weekdayMismatches} weekday and ${artifact.sourceAudit.kickoffTimeMismatches} kickoff-time mismatches against Phase 1 kickoff UTC. Second divisional meetings reuse same-season kickoff/game-ID chronology.`,
    "",
    "## All 12 broad results",
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
  const synthesisSections = [
    ["Strongest broad patterns", artifact.synthesis.strongestBroadPatterns],
    ["Classic angles with little/no ATS evidence", artifact.synthesis.classicAnglesWithLittleOrNoEvidence],
    ["Recent strengthening/weakening", artifact.synthesis.recentStrengtheningOrWeakening],
    ["Era reversals", artifact.synthesis.eraReversals],
    ["Common narratives contradicted by the data", artifact.synthesis.commonNarrativesContradicted],
    ["Predefined variant differences", artifact.synthesis.notablePredefinedVariantDifferences],
    ["Angles deserving deeper future study", artifact.synthesis.futureStudyCandidates],
    ["Reference/context angles", artifact.synthesis.referenceContextAngles],
  ];
  lines.push("## Cross-trend synthesis", "");
  for (const [heading, items] of synthesisSections) {
    lines.push(`### ${heading}`, "", ...(items.length ? items.map((item) => `- ${item}`) : ["- None under the fixed evidence and stability rules."]), "");
  }
  lines.push(
    "## Reproduction and guardrails", "",
    "1. Rebuild Phase 1: `npm run nfl:situational-trends -- --input=data/external/nflverse/games.csv --start-season=2011 --end-season=2025`.",
    "2. Rebuild Phase 2: `npm run nfl:situational-trends:phase2`.",
    "3. Build Phase 2B: `npm run nfl:situational-trends:phase2b`.",
    "4. Run the three focused suites with `npm run nfl:situational-trends:test`, `npm run nfl:situational-trends:phase2:test`, and `npm run nfl:situational-trends:phase2b:test`.",
    "",
    `Input hashes: Phase 1 report \`${artifact.inputs.phase1Report.sha256}\`; Phase 2 report \`${artifact.inputs.phase2Report.sha256}\`; Phase 1 team-games \`${artifact.inputs.phase1TeamGames.sha256}\`; nflverse games \`${artifact.inputs.nflverseGames.sha256}\`.`,
    "",
    "Phase 2B does not alter Phase 1/2 definitions or artifacts and does not feed any production NFL model, projection, UI, grading, matchup, total, prop, archive, outcome resolver, or performance system.",
    ""
  );
  return lines.join("\n");
}

function validateArtifact(artifact) {
  if (JSON.stringify(artifact.trends.map((trend) => trend.id)) !== JSON.stringify(PHASE2B_TREND_IDS)) throw new Error("Phase 2B must preserve all 12 trend IDs in declared order.");
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
  const teamGamesText = readFileSync(TEAM_GAMES_PATH, "utf8");
  const sourceText = readFileSync(args.input, "utf8");
  const phase1 = JSON.parse(phase1Text);
  const phase2 = JSON.parse(phase2Text);
  const rawRows = teamGamesText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  validateBaselines(phase1, phase2, rawRows, sourceText);
  const sourceByGame = sourceGameIndex(sourceText);
  const audit = sourceAudit(rawRows, sourceByGame);
  const trends = buildTrends(annotateRows(rawRows, sourceByGame));
  const artifact = {
    schemaVersion: PHASE2B_SCHEMA_VERSION,
    studyVersion: PHASE2B_STUDY_VERSION,
    definitionVersion: PHASE2B_DEFINITION_VERSION,
    generatedAt: args.generatedAt,
    generatedBy: "scripts/research/generate-nfl-situational-trends-phase2b.mjs",
    phaseBaselines: {
      phase1: { locked: true, studyVersion: phase1.studyVersion, definitionVersion: phase1.definitionVersion, artifact: "public/data/nfl/research/situational-trends-v1.json" },
      phase2: { locked: true, studyVersion: phase2.studyVersion, schemaVersion: phase2.schemaVersion, artifact: "public/data/nfl/research/situational-trends-phase2.json" },
      preservationPolicy: "Phase 2B reads and hashes Phase 1/2 artifacts; it never writes their report, documentation, or team-game files.",
    },
    dataset: {
      seasons: LOCKED_BASELINE.seasons,
      regularSeasonGames: phase1.dataset.regularSeasonGames,
      teamGames: phase1.dataset.teamGames,
      gamesWithSpread: phase1.dataset.gamesWithSpread,
      spreadCoveragePct: phase1.dataset.spreadCoveragePct,
      marketSource: phase1.dataset.marketSource,
    },
    windows: { fullHistory: REPORTING_WINDOWS.fullHistory, recentForm: REPORTING_WINDOWS.recentForm, olderEra: FIXED_ERA_WINDOWS.olderEra, newerEra: FIXED_ERA_WINDOWS.newerEra },
    methodology: {
      selectionPolicy: "Exactly 12 user-predefined classic/common angle families and only their requested football-relevant variants; no optimized cutoff, recursive combination, team exclusion, or arbitrary window.",
      priorGame: "Immediately previous same-season team-game from the locked Phase 1 chronology.",
      atsAndSu: "Inherited from locked Phase 1 team-relative spread and grading fields.",
      uncertainty: "95% Wilson interval over ATS decisions; pushes excluded; descriptive and unclustered.",
      roi: "Standard -110 ROI over ATS decisions; pushes excluded.",
      evidence: "Inherited Phase 1 evidence classifier using full history, recent form, fixed eras, Wilson interval, ROI/effect context, and minimum sample/season gates.",
      nightGames: { monday: audit.mondayNightDetection, sunday: audit.sundayNightDetection },
      overtime: audit.overtimeDetection,
      secondDivisionalMeeting: "Same-season divisional head-to-head regular-season games ordered by kickoff UTC then game ID.",
    },
    sourceAudit: audit,
    inputs: {
      phase1Report: inputIdentity(PHASE1_REPORT_PATH, phase1Text),
      phase2Report: inputIdentity(PHASE2_REPORT_PATH, phase2Text),
      phase1TeamGames: inputIdentity(TEAM_GAMES_PATH, teamGamesText),
      nflverseGames: inputIdentity(args.input, sourceText),
    },
    trends,
    synthesis: buildSynthesis(trends),
    limitations: [
      "The nflverse/nfldata spread remains a single unnamed, untimestamped settled historical line and is not independently verified as closing consensus.",
      "Team-game observations from the same game and repeated teams/seasons are dependent; Wilson intervals are unclustered descriptive context.",
      "Night-game definitions use deterministic weekday/time thresholds, not broadcast-network branding metadata.",
      "Evidence classifications are broad reference labels, not multiple-testing-adjusted claims or permission to promote an angle into a model.",
    ],
  };
  validateArtifact(artifact);
  write(PUBLIC_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  write(DOC_PATH, markdown(artifact));
  console.log(`Generated ${trends.length} Phase 2B trends from ${artifact.dataset.teamGames} locked team-games.`);
  console.log(`Overtime audit: ${audit.overtimeGames}/${audit.phase1GamesJoined} games; weekday/time mismatches: ${audit.weekdayMismatches}/${audit.kickoffTimeMismatches}.`);
  console.log(`Wrote ${relativePath(PUBLIC_PATH)}`);
  console.log(`Wrote ${relativePath(DOC_PATH)}`);
}

main();

/**
 * Generates the browser-facing 2026 situational-trend matchup scanner.
 *
 * Inputs are committed canonical schedule/results/team/market artifacts plus
 * the locked Phase 1/2/2B research artifacts. No network access is performed.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURRENT_TREND_SCHEMA_VERSION,
  QUALIFICATION_STATUS,
  buildCurrentTrendEvaluations,
} from "./lib/nfl-situational-trend-current-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEASON = 2026;

const PATHS = {
  games: resolve(ROOT, `public/data/nfl/${SEASON}/games.json`),
  results: resolve(ROOT, `public/data/nfl/${SEASON}/results.json`),
  priorGames: resolve(ROOT, `public/data/nfl/${SEASON - 1}/games.json`),
  teams: resolve(ROOT, "public/data/nfl/teams.json"),
  market: resolve(ROOT, "public/data/nfl/matchup-market.json"),
  phase1: resolve(ROOT, "public/data/nfl/research/situational-trends-v1.json"),
  phase2: resolve(ROOT, "public/data/nfl/research/situational-trends-phase2.json"),
  phase2b: resolve(ROOT, "public/data/nfl/research/situational-trends-phase2b.json"),
  output: resolve(ROOT, `public/data/nfl/${SEASON}/situational-trend-matchups.json`),
};

function read(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function metricSubset(metrics) {
  return {
    qualifyingTeamGames: metrics?.qualifyingTeamGames ?? 0,
    atsWins: metrics?.atsWins ?? 0,
    atsLosses: metrics?.atsLosses ?? 0,
    atsPushes: metrics?.atsPushes ?? 0,
    atsWinPct: metrics?.atsWinPct ?? null,
    atsRoiAtMinus110: metrics?.atsRoiAtMinus110 ?? null,
    sampleSizeLabel: metrics?.sampleSizeLabel ?? null,
  };
}

function titleFromId(value) {
  return value
    .split("-")
    .map((part) => (/^\d+$/.test(part) ? part : part === "plus" ? "+" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ")
    .replace(/ \+/g, "+");
}

const PHASE1_CATEGORIES = {
  "classic-sandwich": "Schedule & Rest",
  "look-ahead": "Schedule & Rest",
  letdown: "Previous-Game Result",
  "short-rest-disadvantage": "Schedule & Rest",
  "rest-advantage": "Schedule & Rest",
  "post-bye": "Bye Context",
  "pre-bye": "Bye Context",
  "consecutive-road": "Travel",
  "west-to-east-early": "Travel",
  "divisional-underdog": "Divisional / Familiarity",
  "after-blowout-win": "Previous-Game Result",
  "after-blowout-loss": "Previous-Game Result",
};

const PHASE2B_CATEGORIES = {
  "home-underdogs": "Market Role",
  "road-favorites": "Market Role",
  "double-digit-favorites": "Market Role",
  "double-digit-underdogs": "Market Role",
  "after-outright-upset-win": "Previous-Game Result",
  "after-outright-upset-loss": "Previous-Game Result",
  "coming-off-overtime": "Previous-Game Result",
  "coming-off-monday-night-football": "Prime Time / Scheduling",
  "coming-off-sunday-night-football": "Prime Time / Scheduling",
  "second-divisional-meeting": "Divisional / Familiarity",
  "after-scoring-40-plus": "Scoring / Momentum",
  "after-allowing-40-plus": "Scoring / Momentum",
};

const PREFERRED_PHASE2_AREA = {
  "pre-bye": "pre-bye-robustness",
  "post-bye": "rest-structure-robustness",
  "west-to-east-early": "west-to-east-early-robustness",
  "divisional-underdog": "divisional-underdog-robustness",
  "short-rest-disadvantage": "rest-structure-robustness",
  "rest-advantage": "rest-structure-robustness",
};

const PHASE1_VARIANT_DEFINITIONS = {
  "road-game-2": "The team's second consecutive true road game.",
  "road-game-3-plus": "The team's third or later consecutive true road game.",
  "divisional-dog-home": "Divisional underdog playing at home.",
  "divisional-dog-road": "Divisional underdog playing on the road.",
  "after-win-14-plus": "Previous game was a win by at least 14 points.",
  "after-win-17-plus": "Previous game was a win by at least 17 points.",
  "after-win-20-plus": "Previous game was a win by at least 20 points.",
  "after-loss-14-plus": "Previous game was a loss by at least 14 points.",
  "after-loss-17-plus": "Previous game was a loss by at least 17 points.",
  "after-loss-20-plus": "Previous game was a loss by at least 20 points.",
};

function historicalDirection(classification, full, recent) {
  if (classification === "LITTLE/NO EVIDENCE" || classification === "INSUFFICIENT DATA") return "NO_BROAD_EDGE";
  if (full?.atsWinPct > 0.5 && recent?.atsWinPct > 0.5) return "POSITIVE";
  if (full?.atsWinPct < 0.5 && recent?.atsWinPct < 0.5) return "NEGATIVE";
  return "MIXED";
}

function evidenceTier({ classification, confidence, robustnessLabel }) {
  if (robustnessLabel === "BROADLY SUPPORTED") return "NOTEWORTHY";
  if (robustnessLabel === "SUBGROUP-DEPENDENT" && classification === "CONTEXT-DEPENDENT" && confidence !== "Low") return "NOTEWORTHY";
  if (robustnessLabel === "WEAK / NO BROAD EDGE") return "CLASSIC_ANGLE";
  if (classification === "LITTLE/NO EVIDENCE" || classification === "INSUFFICIENT DATA") return "CLASSIC_ANGLE";
  return "CONTEXTUAL";
}

function normalizeResearch(phase1, phase2, phase2b) {
  const areaById = new Map(phase2.areas.map((area) => [area.id, area]));
  const phase1Rows = phase1.trends.map((trend) => {
    const area = areaById.get(PREFERRED_PHASE2_AREA[trend.id]);
    const full = metricSubset(trend.reportingWindows.fullHistory.metrics);
    const recent = metricSubset(trend.reportingWindows.recentForm.metrics);
    const robustnessLabel = area?.conclusionLabel ?? null;
    const stability = trend.stability?.comparison ?? null;
    const variants = trend.variants.map((variant) => ({
      id: variant.id,
      label: titleFromId(variant.id),
      definition: PHASE1_VARIANT_DEFINITIONS[variant.id] ?? null,
      fullHistory: metricSubset(variant.reportingWindows?.fullHistory?.metrics ?? variant.metrics),
      recentForm: metricSubset(variant.reportingWindows?.recentForm?.metrics),
      classification: trend.classification,
      confidence: trend.confidence,
    }));
    const normalized = {
      id: trend.id,
      name: trend.name,
      definition: trend.rule,
      category: PHASE1_CATEGORIES[trend.id] ?? "Other",
      researchPhase: "PHASE_1",
      classification: trend.classification,
      confidence: trend.confidence,
      recentEvidenceClassification: trend.recentEvidenceStrength,
      fullHistory: full,
      recentForm: recent,
      robustnessLabel,
      robustnessInterpretation: area?.conclusion ?? null,
      articleNote: area?.articleValue ?? trend.explanation,
      stability: stability ? {
        eraDirectionReverses: stability.directionReverses,
        recentMateriallyDiffersFromFullHistory: stability.recentMateriallyDiffersFromFullHistory,
        recentChange: stability.recentChange,
      } : null,
      variants,
    };
    return {
      ...normalized,
      tier: evidenceTier(normalized),
      historicalDirection: historicalDirection(trend.classification, full, recent),
    };
  });

  const phase2bRows = phase2b.trends.map((trend) => {
    const full = metricSubset(trend.fullHistoryMetrics);
    const recent = metricSubset(trend.recentFormMetrics);
    const normalized = {
      id: trend.id,
      name: trend.label,
      definition: trend.exactDefinition,
      category: PHASE2B_CATEGORIES[trend.id] ?? trend.parentCategory ?? "Other",
      researchPhase: "PHASE_2B",
      classification: trend.evidenceClassification,
      confidence: trend.confidence,
      recentEvidenceClassification: trend.recentEvidenceClassification,
      fullHistory: full,
      recentForm: recent,
      robustnessLabel: null,
      robustnessInterpretation: null,
      articleNote: trend.articleRelevanceNote,
      stability: trend.stabilityFlags,
      variants: trend.variants.filter((variant) => variant.id !== "overall").map((variant) => ({
        id: variant.id,
        label: variant.label,
        definition: variant.definition,
        fullHistory: metricSubset(variant.fullHistoryMetrics),
        recentForm: metricSubset(variant.recentFormMetrics),
        classification: variant.evidenceClassification,
        confidence: variant.confidence,
      })),
    };
    return {
      ...normalized,
      tier: evidenceTier(normalized),
      historicalDirection: historicalDirection(trend.evidenceClassification, full, recent),
    };
  });

  return [...phase1Rows, ...phase2bRows];
}

function buildSlug(game, teamByAbbr) {
  const away = teamByAbbr.get(game.awayAbbr)?.slug;
  const home = teamByAbbr.get(game.homeAbbr)?.slug;
  if (!away || !home) return null;
  return `${away}-${game.neutralSite ? "vs" : "at"}-${home}`;
}

function main() {
  const gamesArtifact = read(PATHS.games);
  const resultsArtifact = read(PATHS.results);
  const priorGamesArtifact = read(PATHS.priorGames);
  const teamsArtifact = read(PATHS.teams);
  const marketArtifact = read(PATHS.market);
  const phase1 = read(PATHS.phase1);
  const phase2 = read(PATHS.phase2);
  const phase2b = read(PATHS.phase2b);
  const researchLibrary = normalizeResearch(phase1, phase2, phase2b);
  const researchById = new Map(researchLibrary.map((trend) => [trend.id, trend]));
  const teamByAbbr = new Map(teamsArtifact.teams.map((team) => [team.abbr, team]));
  const evaluations = buildCurrentTrendEvaluations({
    season: SEASON,
    games: gamesArtifact.games,
    results: resultsArtifact.results,
    teams: teamsArtifact.teams,
    priorSeasonGames: priorGamesArtifact.games,
    currentMarket: marketArtifact.currentMarket,
  });
  const evaluationsByGame = new Map();
  for (const evaluation of evaluations) {
    const trend = researchById.get(evaluation.trendId);
    if (!trend) throw new Error(`Missing research metadata for ${evaluation.trendId}.`);
    const knownVariants = new Set(trend.variants.map((variant) => variant.id));
    for (const variantId of evaluation.variantIds) {
      if (!knownVariants.has(variantId)) {
        throw new Error(`Unknown variant ${evaluation.trendId}:${variantId} for ${evaluation.gameId}:${evaluation.team}.`);
      }
    }
    const enriched = {
      ...evaluation,
      tier: trend.tier,
      classification: trend.classification,
      confidence: trend.confidence,
    };
    const rows = evaluationsByGame.get(evaluation.gameId) ?? [];
    rows.push(enriched);
    evaluationsByGame.set(evaluation.gameId, rows);
  }

  const games = gamesArtifact.games
    .filter((game) => game.seasonType === "REG")
    .map((game) => {
      const rows = evaluationsByGame.get(game.gameId) ?? [];
      const awayTeam = teamByAbbr.get(game.awayAbbr);
      const homeTeam = teamByAbbr.get(game.homeAbbr);
      return {
        gameId: game.gameId,
        week: game.week,
        away: game.awayAbbr,
        home: game.homeAbbr,
        awayName: awayTeam?.fullName ?? game.awayTeam,
        homeName: homeTeam?.fullName ?? game.homeTeam,
        gameSlug: buildSlug(game, teamByAbbr),
        kickoff: game.dateUtc,
        status: game.status,
        qualifiers: rows.filter((row) => row.status === QUALIFICATION_STATUS.confirmed),
        pending: rows.filter((row) => ![
          QUALIFICATION_STATUS.confirmed,
          QUALIFICATION_STATUS.notApplicable,
        ].includes(row.status)),
      };
    });

  const artifact = {
    schemaVersion: CURRENT_TREND_SCHEMA_VERSION,
    season: SEASON,
    generatedAt: null,
    asOf: {
      schedule: gamesArtifact._meta?.generatedAt ?? null,
      results: resultsArtifact._meta?.generatedAt ?? null,
      market: marketArtifact._meta?.generatedAt ?? null,
    },
    sources: {
      schedule: `public/data/nfl/${SEASON}/games.json`,
      results: `public/data/nfl/${SEASON}/results.json`,
      teams: "public/data/nfl/teams.json",
      market: "public/data/nfl/matchup-market.json",
      phase1: "public/data/nfl/research/situational-trends-v1.json",
      phase2: "public/data/nfl/research/situational-trends-phase2.json",
      phase2b: "public/data/nfl/research/situational-trends-phase2b.json",
    },
    definitionVersions: {
      phase1: phase1.definitionVersion,
      phase2: phase2.studyVersion,
      phase2b: phase2b.definitionVersion,
    },
    evaluatedTrendIds: researchLibrary.map((trend) => trend.id),
    researchLibrary,
    games,
    limitations: [
      "Historical results are descriptive and do not guarantee future outcomes.",
      "Current market-role qualification uses the source-published line available as of the market artifact timestamp; it may change on refresh.",
      "The public 2026 result artifact does not expose overtime, so coming-off-overtime remains unavailable rather than inferred.",
    ],
  };

  if (researchLibrary.length !== 24) throw new Error(`Expected 24 researched trends, received ${researchLibrary.length}.`);
  if (games.length !== gamesArtifact.games.filter((game) => game.seasonType === "REG").length) throw new Error("Game coverage mismatch.");
  if (evaluations.length !== games.length * researchLibrary.length * 2) throw new Error("Every game must evaluate all 24 trends for both teams.");
  writeFileSync(PATHS.output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${games.length} games and ${researchLibrary.length} research trends to ${PATHS.output}.`);
}

main();

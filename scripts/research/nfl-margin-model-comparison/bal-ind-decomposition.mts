/**
 * RESEARCH-ONLY. Term-by-term decomposition of the 2026 Week 1 BAL @ IND
 * disagreement between Method A (power-rating fair spread) and Method B
 * (projected-score implied margin).
 *
 * Reads only committed artifacts: the archived prediction rows, the fitted-
 * model manifest, the scoring-support cache and the public projection
 * artifacts. Writes nothing outside this research folder.
 *
 * Run: npx tsx scripts/research/nfl-margin-model-comparison/bal-ind-decomposition.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { computeEwmaWindow } from "../../../src/lib/nfl/research/total/ewmaWindow.ts";
import { buildScoringSupportIndex } from "../../../src/lib/nfl/props/totals/totalsFeatures.ts";
import { NFL_TOTAL_OFFENSE_HALF_LIFE_GAMES, NFL_TOTAL_DEFENSE_HALF_LIFE_GAMES, NFL_TOTAL_FEATURE_NAMES } from "../../../src/lib/nfl/props/totals/totalsModelContract.ts";
import { ROOT } from "./reconstructA.mts";
import { loadScoringSupport } from "./reconstructB.mts";

const GAME_ID = "2026_01_BAL_IND";
const CUTOFF = { season: 2026, week: 1 };
const OUT_DIR = join(ROOT, "scripts", "research", "nfl-margin-model-comparison", "out");

const readJson = (p: string): any => JSON.parse(readFileSync(p, "utf-8"));

// --- Method A --------------------------------------------------------------
const projections = readJson(join(ROOT, "public", "data", "nfl", "matchup-projections.json"));
const a = projections.projections[GAME_ID];
const v04 = readJson(join(ROOT, "public", "data", "nfl", "2026", "projected-power-ratings-v04.json"));
const v04ByAbbr = new Map<string, any>(v04.teams.map((t: any) => [t.abbr, t]));

const methodA = {
  homeTeam: a.homeTeam, awayTeam: a.awayTeam,
  homeCurrentOVR: a.homeCurrentOVR, awayCurrentOVR: a.awayCurrentOVR,
  leagueAverageOVR: a.leagueAverageOVR,
  homePowerNumber: a.homePowerNumber, awayPowerNumber: a.awayPowerNumber,
  neutralProjectedMargin: a.neutralProjectedMargin,
  homeFieldAdvantage: a.homeFieldAdvantage,
  projectedHomeMargin: a.projectedHomeMargin,
  formattedJkbSpread: a.formattedJkbSpread,
  // Week 1 has zero completed 2026 games, so Current OVR == the v0.4 preseason
  // rating exactly (currentRatingWeightsFor(0) = 100% preseason).
  ovrProvenance: {
    ind: v04ByAbbr.get("ind"),
    bal: v04ByAbbr.get("bal"),
  },
};

// --- Method B --------------------------------------------------------------
const manifestPath = join(ROOT, "data", "nfl", "predictions", "manifests", "fitted-models", "7e35e3fe3e188932e1b147bd2a639ac5d55fb0a11833f33c91a8012c97ac5602.json");
const manifest = readJson(manifestPath);
const ridge = manifest.fitted_state.ridge;

const archiveLines = readFileSync(join(ROOT, "data", "nfl", "predictions", "2026", "01", "nfl-total-ridge.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
const gameRows = archiveLines.filter((r) => r.game_id === GAME_ID);
// Latest pregame snapshot per team, matching generate-nfl-team-totals-view.mts.
const latestByTeam = new Map<string, any>();
for (const r of gameRows) {
  const prev = latestByTeam.get(r.team);
  if (!prev || Date.parse(r.prediction_timestamp) > Date.parse(prev.prediction_timestamp)) latestByTeam.set(r.team, r);
}

function decomposeSide(row: any) {
  const vector: number[] = row.feature_snapshot.ordered_vector;
  const contributions = vector.map((raw, i) => {
    const z = (raw - ridge.featureMeans[i]) / ridge.featureStds[i];
    return {
      feature: NFL_TOTAL_FEATURE_NAMES[i],
      rawValue: raw,
      trainMean: ridge.featureMeans[i],
      trainStd: ridge.featureStds[i],
      zScore: z,
      coefficient: ridge.coefficients[i],
      pointsContribution: z * ridge.coefficients[i],
    };
  });
  const total = ridge.intercept + contributions.reduce((s, c) => s + c.pointsContribution, 0);
  return {
    team: row.team, homeAway: row.home_away,
    intercept: ridge.intercept,
    contributions,
    reconstructedPoints: total,
    archivedPoints: row.projection.projected_team_points,
    reconstructionError: total - row.projection.projected_team_points,
    history: row.feature_snapshot.values.history,
  };
}

const indSide = decomposeSide(latestByTeam.get("ind"));
const balSide = decomposeSide(latestByTeam.get("bal"));

// Home-field term isolated: the homeIndicator column is the ONLY structural
// home/away term Method B has, and it is a fitted parameter, not a constant.
const hfaIndex = NFL_TOTAL_FEATURE_NAMES.indexOf("homeIndicator");
const methodBHomeFieldPoints = (indSide.contributions[hfaIndex].pointsContribution - balSide.contributions[hfaIndex].pointsContribution);

// Team-strength-only margin (everything except the homeIndicator column).
const strengthOnlyMargin =
  indSide.contributions.filter((_, i) => i !== hfaIndex).reduce((s, c) => s + c.pointsContribution, 0) -
  balSide.contributions.filter((_, i) => i !== hfaIndex).reduce((s, c) => s + c.pointsContribution, 0);

// --- Window composition: what history is Method B actually reading? --------
const rows = loadScoringSupport([2021, 2022, 2023, 2024, 2025]);
const index = buildScoringSupportIndex(rows);
function windowFor(team: string) {
  const offense = computeEwmaWindow(index.byTeam.get(team) ?? [], CUTOFF, NFL_TOTAL_OFFENSE_HALF_LIFE_GAMES);
  const defenseAllowed = computeEwmaWindow(index.byOpponent.get(team) ?? [], CUTOFF, NFL_TOTAL_DEFENSE_HALF_LIFE_GAMES);
  return { team, offense, defenseAllowed };
}

// League context for the two feature values that drive the disagreement.
const teams = [...new Set(rows.map((r) => r.team))].sort();
const leagueOffense = teams.map((t) => ({ team: t, ...windowFor(t).offense })).sort((x, y) => (y.epaPerPlay ?? -9) - (x.epaPerPlay ?? -9));
const leagueDefense = teams.map((t) => ({ team: t, ...windowFor(t).defenseAllowed })).sort((x, y) => (x.epaPerPlay ?? 9) - (y.epaPerPlay ?? 9));

const report = {
  generatedAt: new Date().toISOString(),
  gameId: GAME_ID,
  methodA,
  methodB: {
    modelVersion: manifest.model_version,
    trainingSeasons: manifest.training_seasons,
    trainRowCount: manifest.fitted_state.train_row_count,
    ridgeLambda: manifest.parameters.ridge_lambda,
    ind: indSide,
    bal: balSide,
    impliedHomeMargin: indSide.archivedPoints - balSide.archivedPoints,
    homeFieldPointsInMargin: methodBHomeFieldPoints,
    teamStrengthOnlyMargin: strengthOnlyMargin,
    windows: { ind: windowFor("ind"), bal: windowFor("bal") },
    leagueRanks: {
      indOffenseEpaRank: leagueOffense.findIndex((r) => r.team === "ind") + 1,
      balOffenseEpaRank: leagueOffense.findIndex((r) => r.team === "bal") + 1,
      indDefenseEpaAllowedRank: leagueDefense.findIndex((r) => r.team === "ind") + 1,
      balDefenseEpaAllowedRank: leagueDefense.findIndex((r) => r.team === "bal") + 1,
      note: "rank 1 = best; EWMA windows at the 2026 week-1 cutoff, i.e. 2021-2025 history only",
    },
  },
  disagreement: {
    methodAHomeMargin: a.projectedHomeMargin,
    methodBHomeMargin: indSide.archivedPoints - balSide.archivedPoints,
    gap: a.projectedHomeMargin - (indSide.archivedPoints - balSide.archivedPoints),
    methodANeutralMargin: a.neutralProjectedMargin,
    methodBNeutralMargin: strengthOnlyMargin,
    methodAHomeField: a.homeFieldAdvantage,
    methodBHomeField: methodBHomeFieldPoints,
  },
};

writeFileSync(join(OUT_DIR, "bal-ind-decomposition.json"), JSON.stringify(report, null, 2));

const f = (x: number) => x.toFixed(3);
console.log(`=== ${GAME_ID} ===`);
console.log(`A: IND ${a.homeCurrentOVR} vs BAL ${a.awayCurrentOVR}, lgAvg ${f(a.leagueAverageOVR)} -> neutral ${f(a.neutralProjectedMargin)} + HFA ${f(a.homeFieldAdvantage)} = ${f(a.projectedHomeMargin)} (${a.formattedJkbSpread})`);
console.log(`B: IND ${f(indSide.archivedPoints)} vs BAL ${f(balSide.archivedPoints)} -> home margin ${f(indSide.archivedPoints - balSide.archivedPoints)}`);
console.log(`   B neutral (strength only) ${f(strengthOnlyMargin)} + B home-field ${f(methodBHomeFieldPoints)}`);
console.log(`GAP (A - B) = ${f(report.disagreement.gap)}  of which neutral-strength gap = ${f(a.neutralProjectedMargin - strengthOnlyMargin)}, home-field gap = ${f(a.homeFieldAdvantage - methodBHomeFieldPoints)}`);
for (const side of [indSide, balSide]) {
  console.log(`\n-- ${side.team.toUpperCase()} (${side.homeAway}) intercept ${f(side.intercept)} -> ${f(side.reconstructedPoints)} (archived ${f(side.archivedPoints)}, err ${side.reconstructionError.toExponential(2)})`);
  for (const c of side.contributions) console.log(`   ${c.feature.padEnd(30)} raw=${f(c.rawValue).padStart(7)}  z=${f(c.zScore).padStart(7)}  coef=${f(c.coefficient).padStart(6)}  pts=${f(c.pointsContribution).padStart(7)}`);
}
console.log(`\nEWMA window ranks (1 = best, 2021-2025 history): IND off ${report.methodB.leagueRanks.indOffenseEpaRank}, BAL off ${report.methodB.leagueRanks.balOffenseEpaRank}, IND def-allowed ${report.methodB.leagueRanks.indDefenseEpaAllowedRank}, BAL def-allowed ${report.methodB.leagueRanks.balDefenseEpaAllowedRank}`);
console.log(`\n[research] wrote ${join(OUT_DIR, "bal-ind-decomposition.json")}`);

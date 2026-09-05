/**
 * WU4C Part 5 research: does adding a nonlinear game-flow feature (absolute
 * market spread -- a proxy for expected blowout/game-script intensity that
 * the existing linear `market.spread` term cannot capture on its own) beat
 * the WU4A production ridge on team plays / dropback rate?
 *
 * Same rolling-origin folds as scripts/analysis/nfl-team-opportunity-calibration/evaluate.ts.
 * candidate A = WU4A production ridge (baseline, unchanged).
 * candidate B = baseline features + |market.spread| appended as an 11th ridge feature.
 * candidate C = baseline features + |market.spread| + market.total * isHome interaction.
 *
 * No target-week data enters any fit (features come from buildTeamOpportunityFeatureRow,
 * which is strictly point-in-time -- see that module's header).
 *
 * Usage: npx tsx scripts/analysis/nfl-wu4c-team-opportunity-gameflow/evaluate.ts
 */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../../../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, type NflTeamGameLogEntry } from "../../../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord } from "../../../src/lib/nfl/props/types/teamPregameFeatures";
import { marketKey, type NflHistoricalMarketRow } from "../../../src/lib/nfl/props/qbOpportunityFeatures";
import { buildTeamOpportunityFeatureRow } from "../../../src/lib/nfl/props/teamOpportunityFeatures";
import { coalesceScalar } from "../../../src/lib/nfl/props/teamOpportunityModel";
import type { NflTeamOpportunityFeatureRow, NflTeamOpportunityFeatures } from "../../../src/lib/nfl/props/types/teamOpportunity";
import { fitRidgeModel, scoreRidgeModel } from "../../../src/lib/nfl/props/ridge";
import { parseCsv } from "../../lib/nfl-schedules-results-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PLAY_VOLUME_DIR = join(ROOT, "data", "nfl", "nflverse", "play-volume-team-game");
const SEASONS = [2022, 2023, 2024, 2025] as const;

type CsvRow = Record<string, string>;
const num = (row: CsvRow, f: string) => Number(String(row[f] ?? "").trim());

function loadPlayVolume(): NflTeamGamePlayVolumeRecord[] {
  const manifest = JSON.parse(readFileSync(join(PLAY_VOLUME_DIR, "manifest.json"), "utf8")) as { files: { season: number; filename: string }[] };
  const out: NflTeamGamePlayVolumeRecord[] = [];
  for (const season of SEASONS) {
    const entry = manifest.files.find((f) => f.season === season);
    if (!entry) throw new Error(`no play-volume cache for ${season}`);
    for (const row of parseCsv(readFileSync(join(PLAY_VOLUME_DIR, entry.filename), "utf8")) as CsvRow[]) {
      out.push({
        gameId: String(row.game_id).trim(), season: num(row, "season"), week: num(row, "week"),
        team: String(row.team).trim(), opponent: String(row.opponent).trim(),
        eligiblePlays: num(row, "eligible_plays"), passPlays: num(row, "pass_plays"), rushPlays: num(row, "rush_plays"),
        neutralEligiblePlays: num(row, "neutral_eligible_plays"), neutralPassPlays: num(row, "neutral_pass_plays"),
        passOeSum: num(row, "pass_oe_sum"), passOeCount: num(row, "pass_oe_count"),
      });
    }
  }
  return out;
}

function loadGames(): (NflPropRawGameRecord & { neutralSite?: boolean })[] {
  const games: (NflPropRawGameRecord & { neutralSite?: boolean })[] = [];
  for (const season of SEASONS) {
    const artifact = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", String(season), "games.json"), "utf8")) as { games: (NflPropRawGameRecord & { neutralSite?: boolean })[] };
    games.push(...artifact.games);
  }
  return games;
}

function loadMarket(): Map<string, NflHistoricalMarketRow> {
  const artifact = JSON.parse(readFileSync(join(ROOT, "data", "nfl", "props", "historical-market-context-2022-2025.json"), "utf8")) as { rows: NflHistoricalMarketRow[] };
  return new Map(artifact.rows.map((r) => [marketKey(r.season, r.week, r.team), r]));
}

type Metrics = { n: number; mae: number; rmse: number; bias: number; corr: number };
function metrics(pairs: { predicted: number; actual: number }[]): Metrics {
  const n = pairs.length;
  const err = pairs.map((p) => p.predicted - p.actual);
  const mae = err.reduce((s, e) => s + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / n);
  const bias = err.reduce((s, e) => s + e, 0) / n;
  const mp = pairs.reduce((s, p) => s + p.predicted, 0) / n;
  const ma = pairs.reduce((s, p) => s + p.actual, 0) / n;
  let cov = 0;
  for (const p of pairs) cov += (p.predicted - mp) * (p.actual - ma);
  const vp = pairs.reduce((s, p) => s + (p.predicted - mp) ** 2, 0);
  const va = pairs.reduce((s, p) => s + (p.actual - ma) ** 2, 0);
  const corr = vp > 0 && va > 0 ? cov / Math.sqrt(vp * va) : 0;
  return { n, mae, rmse, bias, corr };
}
const fmt = (m: Metrics) => `n=${m.n} MAE=${m.mae.toFixed(3)} RMSE=${m.rmse.toFixed(3)} bias=${m.bias.toFixed(3)} corr=${m.corr.toFixed(3)}`;

// Baseline 10 features, mirroring RIDGE_FEATURE_KEYS in teamOpportunityModel.ts exactly.
function baseRaw(f: NflTeamOpportunityFeatures): (number | null)[] {
  return [
    coalesceScalar(f.teamOffense.offensivePlaysPerGame),
    coalesceScalar(f.opponentDefense.offensivePlaysPerGameAllowed),
    coalesceScalar(f.teamOffense.dropbackRate),
    coalesceScalar(f.teamOffense.passRateOverExpected),
    coalesceScalar(f.teamOffense.earlyDownNeutralPassRate),
    coalesceScalar(f.opponentDefense.dropbackRateAllowed),
    f.market.spread,
    f.market.total,
    f.market.impliedTeamTotal,
    f.market.isHome,
  ];
}
function withAbsSpread(f: NflTeamOpportunityFeatures): (number | null)[] {
  return [...baseRaw(f), f.market.spread != null ? Math.abs(f.market.spread) : null];
}
function withAbsSpreadAndInteraction(f: NflTeamOpportunityFeatures): (number | null)[] {
  const totalHome = f.market.total != null ? f.market.total * f.market.isHome : null;
  return [...withAbsSpread(f), totalHome];
}

function fitAndPredict(
  trainRows: readonly NflTeamOpportunityFeatureRow[],
  valRows: readonly NflTeamOpportunityFeatureRow[],
  rawFn: (f: NflTeamOpportunityFeatures) => (number | null)[],
  targetKey: "offensivePlays" | "dropbackRate",
  alpha = 10,
): { predicted: number; actual: number }[] {
  const trainWithTarget = trainRows.filter((r) => r.target != null);
  const rawTrain = trainWithTarget.map((r) => rawFn(r.features));
  const nCols = rawTrain[0]?.length ?? 0;
  const fallbacks = Array.from({ length: nCols }, (_, c) => {
    const vals = rawTrain.map((r) => r[c]).filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });
  const encode = (f: NflTeamOpportunityFeatures) => rawFn(f).map((v, i) => v ?? fallbacks[i]);
  const encodedTrain = trainWithTarget.map((r) => encode(r.features));
  const targets = trainWithTarget.map((r) => (targetKey === "offensivePlays" ? r.target!.offensivePlays : r.target!.dropbackRate));
  const model = fitRidgeModel(encodedTrain, targets, alpha);
  return valRows.filter((r) => r.target != null).map((r) => ({
    predicted: scoreRidgeModel(model, encode(r.features)),
    actual: targetKey === "offensivePlays" ? r.target!.offensivePlays : r.target!.dropbackRate,
  }));
}

function main(): void {
  const playVolume = loadPlayVolume();
  const games = loadGames();
  const gameJoinIndex = buildGameJoinIndex(games);
  const neutralByGame = new Map(games.map((g) => [g.gameId, g.neutralSite === true]));
  const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolume, gameJoinIndex);
  const marketByKey = loadMarket();

  const allRows: NflTeamOpportunityFeatureRow[] = playVolume
    .filter((r) => gameJoinIndex.has(`${r.season}|${r.week}|${r.team}`))
    .map((r) => buildTeamOpportunityFeatureRow(r, gameJoinIndex, { fullTeamGameLog, marketByKey }, neutralByGame));

  const folds: { train: number[]; validate: number }[] = [
    { train: [2022, 2023], validate: 2024 },
    { train: [2022, 2023, 2024], validate: 2025 },
  ];

  const candidates: Record<string, (f: NflTeamOpportunityFeatures) => (number | null)[]> = {
    "A baseline (WU4A prod, 10ft)": baseRaw,
    "B +|spread| (11ft)": withAbsSpread,
    "C +|spread|+total*home (12ft)": withAbsSpreadAndInteraction,
  };

  for (const fold of folds) {
    const trainRows = allRows.filter((r) => fold.train.includes(r.season));
    const valRows = allRows.filter((r) => r.season === fold.validate);
    console.log(`\n==== FOLD train ${fold.train.join("+")} -> validate ${fold.validate} (val n=${valRows.filter((r) => r.target != null).length}) ====`);
    console.log("-- DROPBACK RATE MAE/RMSE/bias/corr --");
    for (const [name, rawFn] of Object.entries(candidates)) {
      console.log(`  ${name.padEnd(32)} ${fmt(metrics(fitAndPredict(trainRows, valRows, rawFn, "dropbackRate")))}`);
    }
    console.log("-- TEAM PLAYS MAE/RMSE/bias/corr --");
    for (const [name, rawFn] of Object.entries(candidates)) {
      console.log(`  ${name.padEnd(32)} ${fmt(metrics(fitAndPredict(trainRows, valRows, rawFn, "offensivePlays")))}`);
    }
  }
}

main();

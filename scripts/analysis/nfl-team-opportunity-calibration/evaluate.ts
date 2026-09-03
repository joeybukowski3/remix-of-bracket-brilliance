/**
 * WU4A walk-forward calibration for the team opportunity model.
 *
 * Folds (rolling origin, matching the football evaluation standard):
 *   - train 2022            -> validate 2023
 *   - train 2022-2023       -> validate 2024
 *   - train 2022-2024       -> validate 2025   (retrospective benchmark)
 *
 * Features are strictly point-in-time (buildTeamOpportunityFeatureRow only
 * reads games with an earlier kickoff). No target-week rows enter any fit.
 *
 * Usage: npx tsx scripts/analysis/nfl-team-opportunity-calibration/evaluate.ts
 */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../../../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, type NflTeamGameLogEntry } from "../../../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord } from "../../../src/lib/nfl/props/types/teamPregameFeatures";
import { marketKey, type NflHistoricalMarketRow } from "../../../src/lib/nfl/props/qbOpportunityFeatures";
import { buildTeamOpportunityFeatureRow } from "../../../src/lib/nfl/props/teamOpportunityFeatures";
import type { NflTeamOpportunityFeatureRow } from "../../../src/lib/nfl/props/types/teamOpportunity";
import {
  computeTeamOpportunityConstants,
  playsLeagueMean, playsPriorTeam, playsHistoryPlusOpponent,
  dropbackRateLeagueMean, dropbackRatePriorTeam, dropbackRateHistoryPlusOpponent,
  fitTeamOpportunityRidge, predictRidgeRaw,
  OPPONENT_BLEND_WEIGHT,
} from "../../../src/lib/nfl/props/teamOpportunityModel";
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
  let cov = 0, vp = 0, va = 0;
  for (const p of pairs) { cov += (p.predicted - mp) * (p.actual - ma); vp += (p.predicted - mp) ** 2; va += (p.actual - ma) ** 2; }
  const corr = vp > 0 && va > 0 ? cov / Math.sqrt(vp * va) : 0;
  return { n, mae, rmse, bias, corr };
}
const fmt = (m: Metrics) => `n=${m.n} MAE=${m.mae.toFixed(3)} RMSE=${m.rmse.toFixed(3)} bias=${m.bias.toFixed(3)} corr=${m.corr.toFixed(3)}`;

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
    { train: [2022], validate: 2023 },
    { train: [2022, 2023], validate: 2024 },
    { train: [2022, 2023, 2024], validate: 2025 },
  ];

  for (const fold of folds) {
    const trainRows = allRows.filter((r) => fold.train.includes(r.season));
    const valRows = allRows.filter((r) => r.season === fold.validate && r.target != null);
    const constants = computeTeamOpportunityConstants(trainRows);
    const ridge = fitTeamOpportunityRidge(trainRows);

    console.log(`\n==== FOLD train ${fold.train.join("+")} -> validate ${fold.validate} (val n=${valRows.length}) ====`);

    const playsCandidates: Record<string, (r: NflTeamOpportunityFeatureRow) => number> = {
      "league-mean": () => playsLeagueMean(constants),
      "prior-team": (r) => playsPriorTeam(r, constants),
      [`history+opp(w=${OPPONENT_BLEND_WEIGHT})`]: (r) => playsHistoryPlusOpponent(r, constants),
      "ridge+market": (r) => predictRidgeRaw(ridge, r.features).plays,
    };
    console.log("-- PLAYS --");
    for (const [name, fn] of Object.entries(playsCandidates)) {
      console.log(`  ${name.padEnd(22)} ${fmt(metrics(valRows.map((r) => ({ predicted: fn(r), actual: r.target!.offensivePlays }))))}`);
    }

    const dropCandidates: Record<string, (r: NflTeamOpportunityFeatureRow) => number> = {
      "league-mean": () => dropbackRateLeagueMean(constants),
      "prior-team": (r) => dropbackRatePriorTeam(r, constants),
      [`history+opp(w=${OPPONENT_BLEND_WEIGHT})`]: (r) => dropbackRateHistoryPlusOpponent(r, constants),
      "ridge+market": (r) => predictRidgeRaw(ridge, r.features).dropbackRate,
    };
    console.log("-- DROPBACK RATE --");
    for (const [name, fn] of Object.entries(dropCandidates)) {
      console.log(`  ${name.padEnd(22)} ${fmt(metrics(valRows.map((r) => ({ predicted: fn(r), actual: r.target!.dropbackRate }))))}`);
    }

    console.log("-- DERIVED PASS ATTEMPTS (plays x dropbackRate) --");
    for (const [name, pf] of Object.entries(playsCandidates)) {
      const df = dropCandidates[name] ?? dropCandidates["prior-team"];
      console.log(`  ${name.padEnd(22)} ${fmt(metrics(valRows.map((r) => ({ predicted: pf(r) * df(r), actual: r.target!.passAttempts }))))}`);
    }
  }
}

main();

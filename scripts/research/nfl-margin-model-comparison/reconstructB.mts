/**
 * RESEARCH-ONLY. Method B (JKB projected score -> implied margin) historical
 * reconstruction, 2023-2025 REG.
 *
 * Reuses the exact production feature builder and ridge
 * (src/lib/nfl/props/totals/*) that generates the live team-totals artifact.
 * Two fitting regimes:
 *   - "production": the frozen NFL_TOTAL_TRAINING_SEASONS window (2022-2024).
 *     Only leakage-safe for evaluation seasons > 2024.
 *   - "walkForward": refit for each evaluation season on every training-
 *     eligible season strictly before it. Leakage-safe for every eval season.
 *
 * The scoring-support index passed to the feature builder for evaluation
 * season S contains cache seasons <= S only; the builder's own strict
 * (season, week) cutoff excludes the target game itself.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { normalizeNflTeamAbbr } from "../../../src/lib/nfl/identity/identity.ts";
import { buildNflTotalFeatures, buildScoringSupportIndex } from "../../../src/lib/nfl/props/totals/totalsFeatures.ts";
import { fitNflTotalModel, scoreNflTotalModel, type NflTotalTrainingRow } from "../../../src/lib/nfl/props/totals/totalsModel.ts";
import type { NflTotalResearchScoringSupportRow } from "../../../src/lib/nfl/research/total/types.ts";
import { ROOT } from "./reconstructA.mts";

/** Earliest season present in the committed scoring-support cache. Feature history only. */
export const CACHE_FIRST_SEASON = 2021;
/** Earliest season usable as a ridge TRAINING season (needs a full prior season of feature history). */
export const FIRST_TRAINABLE_SEASON = 2022;

export type MethodBObservation = {
  gameId: string; season: number; week: number;
  homeAbbr: string; awayAbbr: string;
  homeExpectedPoints: number; awayExpectedPoints: number;
  projectedGameTotal: number;
  /** homeExpectedPoints - awayExpectedPoints. Positive = home favoured. */
  impliedHomeMargin: number;
  homeHistoryStatus: string; awayHistoryStatus: string;
};

type Outcome = { gameId: string; season: number; week: number; homeAbbr: string; awayAbbr: string; homeScore: number; awayScore: number };

function parseCsvSimple(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h.trim(), cells[i]]));
  });
}

export function loadScoringSupport(seasons: readonly number[]): NflTotalResearchScoringSupportRow[] {
  const out: NflTotalResearchScoringSupportRow[] = [];
  for (const season of seasons) {
    const path = join(ROOT, "data", "nfl", "research", "nfl-total-model", `scoring_support_team_game_${season}.csv`);
    if (!existsSync(path)) continue;
    for (const r of parseCsvSimple(readFileSync(path, "utf-8"))) {
      out.push({
        gameId: r.game_id, season: Number(r.season), week: Number(r.week),
        team: normalizeNflTeamAbbr(r.team)!, opponent: normalizeNflTeamAbbr(r.opponent)!,
        eligiblePlays: Number(r.eligible_plays), offEpaSum: Number(r.off_epa_sum),
        successNum: Number(r.success_num), successDen: Number(r.success_den),
        explosiveCount: Number(r.explosive_count),
      });
    }
  }
  return out;
}

export function loadOutcomes(season: number): Outcome[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "results.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as { results: any[] };
  const out: Outcome[] = [];
  for (const row of raw.results) {
    if (row.seasonType !== "REG" || row.final !== true) continue;
    if (row.homeScore == null || row.awayScore == null) continue;
    out.push({
      gameId: row.gameId, season: row.season, week: row.week,
      homeAbbr: normalizeNflTeamAbbr(row.homeAbbr)!, awayAbbr: normalizeNflTeamAbbr(row.awayAbbr)!,
      homeScore: row.homeScore, awayScore: row.awayScore,
    });
  }
  return out;
}

/**
 * Fits the production ridge on `trainingSeasons`, using a scoring-support
 * index that spans CACHE_FIRST_SEASON..max(trainingSeasons) only -- so no
 * post-training-window play data can reach a training row's window.
 */
export function fitForTrainingSeasons(trainingSeasons: readonly number[]) {
  const maxTrain = Math.max(...trainingSeasons);
  const index = buildScoringSupportIndex(loadScoringSupport(rangeSeasons(CACHE_FIRST_SEASON, maxTrain)));
  const rows: NflTotalTrainingRow[] = [];
  for (const season of trainingSeasons) {
    for (const g of loadOutcomes(season)) {
      rows.push({ features: buildNflTotalFeatures(index, g.homeAbbr, g.awayAbbr, { season: g.season, week: g.week }, "home"), actualTeamPoints: g.homeScore });
      rows.push({ features: buildNflTotalFeatures(index, g.awayAbbr, g.homeAbbr, { season: g.season, week: g.week }, "away"), actualTeamPoints: g.awayScore });
    }
  }
  return fitNflTotalModel(rows);
}

function rangeSeasons(from: number, to: number): number[] {
  const out: number[] = [];
  for (let s = from; s <= to; s += 1) out.push(s);
  return out;
}

/** Scores every REG game of `season` with `model`, using feature history <= season. */
export function scoreSeason(season: number, model: ReturnType<typeof fitNflTotalModel>): MethodBObservation[] {
  const index = buildScoringSupportIndex(loadScoringSupport(rangeSeasons(CACHE_FIRST_SEASON, season)));
  const out: MethodBObservation[] = [];
  for (const g of loadOutcomes(season)) {
    const homeFeatures = buildNflTotalFeatures(index, g.homeAbbr, g.awayAbbr, { season: g.season, week: g.week }, "home");
    const awayFeatures = buildNflTotalFeatures(index, g.awayAbbr, g.homeAbbr, { season: g.season, week: g.week }, "away");
    const home = scoreNflTotalModel(model, homeFeatures);
    const away = scoreNflTotalModel(model, awayFeatures);
    if (home == null || away == null) continue;
    out.push({
      gameId: g.gameId, season: g.season, week: g.week,
      homeAbbr: g.homeAbbr, awayAbbr: g.awayAbbr,
      homeExpectedPoints: home, awayExpectedPoints: away,
      projectedGameTotal: home + away,
      impliedHomeMargin: home - away,
      homeHistoryStatus: homeFeatures.historyStatus, awayHistoryStatus: awayFeatures.historyStatus,
    });
  }
  return out;
}

/**
 * Walk-forward Method B: for each eval season, refit on every trainable
 * season strictly before it. For eval 2025 this is exactly the production
 * 2022-2024 window, so production and walk-forward coincide there.
 */
export function reconstructMethodBWalkForward(evalSeasons: readonly number[]) {
  const bySeason = new Map<number, MethodBObservation[]>();
  const fits: { season: number; trainingSeasons: number[]; trainRowCount: number; fittedModelHash: string; intercept: number; coefficients: number[] }[] = [];
  for (const season of evalSeasons) {
    const trainingSeasons = rangeSeasons(FIRST_TRAINABLE_SEASON, season - 1);
    if (trainingSeasons.length === 0) throw new Error(`no trainable seasons before ${season}`);
    process.stderr.write(`[B] eval ${season} <- train ${trainingSeasons.join(",")}\n`);
    const model = fitForTrainingSeasons(trainingSeasons);
    fits.push({
      season, trainingSeasons, trainRowCount: model.trainRowCount, fittedModelHash: model.fittedModelHash,
      intercept: model.ridge.intercept, coefficients: [...model.ridge.coefficients],
    });
    bySeason.set(season, scoreSeason(season, model));
    process.stderr.write(`[B]   ${season}: ${bySeason.get(season)!.length} games\n`);
  }
  return { bySeason, fits };
}

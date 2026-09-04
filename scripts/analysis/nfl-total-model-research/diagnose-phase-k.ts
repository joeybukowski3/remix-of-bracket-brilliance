/**
 * Phase K -- diagnosis-only investigation of why total-model research
 * predictions increasingly under-project game totals late-season. No new
 * production-candidate model is fit here. Reuses Phase A-I's dataset,
 * scoring-support cache, and identity handling.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/diagnose-phase-k.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildResearchDataset } from "@/lib/nfl/research/total/dataset";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { pearsonCorrelation } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow, NflTotalResearchScoringSupportRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";
import { computeWindowedFeature, type WindowScheme } from "./lib/windowVariants";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");

const ENV_CORPUS_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const SCORING_SUPPORT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const TARGET_SEASONS = [2022, 2023, 2024, 2025];

console.log("[load] outcomes + scoring support...");
const envCorpusGames = loadOutcomesForSeasons(ENV_CORPUS_SEASONS);
const targetGames = loadOutcomesForSeasons(TARGET_SEASONS);
const scoringSupportRows = loadScoringSupportForSeasons(SCORING_SUPPORT_SEASONS);
const scoringSupportIndex = buildScoringSupportIndex(scoringSupportRows);
const dataset = buildResearchDataset({ targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex, environmentMode: "seasonToDateWithPriorFallback" });
console.log(`[load] dataset rows=${dataset.length}`);

const WEEK_BUCKETS = [
  { label: "weeks-1-4", min: 1, max: 4 },
  { label: "weeks-5-9", min: 5, max: 9 },
  { label: "weeks-10-14", min: 10, max: 14 },
  { label: "weeks-15+", min: 15, max: 99 },
];

function stats(values: readonly number[]) {
  if (values.length === 0) return { n: 0, mean: null, median: null, stddev: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, median, stddev: Math.sqrt(variance), min: sorted[0], max: sorted[n - 1] };
}

// ===========================================================================
// Item 1: feature distributions by week bucket (per season and pooled).
// ===========================================================================
type FeatureKey = "offenseEpa" | "offenseSuccess" | "offenseExplosive" | "defEpaAllowed" | "defSuccessAllowed" | "defExplosiveAllowed";
function extract(row: NflTotalResearchDatasetRow, key: FeatureKey): number | null {
  switch (key) {
    case "offenseEpa": return row.offense.epaPerPlay;
    case "offenseSuccess": return row.offense.successRate;
    case "offenseExplosive": return row.offense.explosiveRate;
    case "defEpaAllowed": return row.opponentDefenseAllowed.epaPerPlay;
    case "defSuccessAllowed": return row.opponentDefenseAllowed.successRate;
    case "defExplosiveAllowed": return row.opponentDefenseAllowed.explosiveRate;
  }
}
const FEATURE_KEYS: FeatureKey[] = ["offenseEpa", "offenseSuccess", "offenseExplosive", "defEpaAllowed", "defSuccessAllowed", "defExplosiveAllowed"];

function bucketOf(week: number): string {
  return WEEK_BUCKETS.find((b) => week >= b.min && week <= b.max)!.label;
}

const distributionsPooled: Record<string, Record<FeatureKey, ReturnType<typeof stats>>> = {};
for (const bucket of WEEK_BUCKETS) {
  const rows = dataset.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  distributionsPooled[bucket.label] = Object.fromEntries(
    FEATURE_KEYS.map((k) => [k, stats(rows.map((r) => extract(r, k)).filter((v): v is number => v !== null))]),
  ) as Record<FeatureKey, ReturnType<typeof stats>>;
}

const distributionsBySeason: Record<number, Record<string, Record<FeatureKey, ReturnType<typeof stats>>>> = {};
for (const season of TARGET_SEASONS) {
  distributionsBySeason[season] = {};
  for (const bucket of WEEK_BUCKETS) {
    const rows = dataset.filter((r) => r.season === season && r.week >= bucket.min && r.week <= bucket.max);
    distributionsBySeason[season][bucket.label] = Object.fromEntries(
      FEATURE_KEYS.map((k) => [k, stats(rows.map((r) => extract(r, k)).filter((v): v is number => v !== null))]),
    ) as Record<FeatureKey, ReturnType<typeof stats>>;
  }
}
console.log("[item1] distributions computed.");

// ===========================================================================
// Item 2: feature vs actual future scoring, correlation + quintiles by week bucket.
// ===========================================================================
const correlationsByBucket: Record<string, Record<FeatureKey, number | null>> = {};
for (const bucket of WEEK_BUCKETS) {
  const rows = dataset.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  correlationsByBucket[bucket.label] = Object.fromEntries(
    FEATURE_KEYS.map((k) => {
      const pairs = rows.map((r) => ({ x: extract(r, k), y: r.actualTeamPoints })).filter((p): p is { x: number; y: number } => p.x !== null);
      return [k, pearsonCorrelation(pairs.map((p) => p.x), pairs.map((p) => p.y))];
    }),
  ) as Record<FeatureKey, number | null>;
}

function quintileAnalysis(rows: readonly NflTotalResearchDatasetRow[], key: FeatureKey) {
  const withValues = rows.map((r) => ({ value: extract(r, key), points: r.actualTeamPoints })).filter((r): r is { value: number; points: number } => r.value !== null);
  const sorted = [...withValues].sort((a, b) => a.value - b.value);
  const quintileSize = Math.floor(sorted.length / 5);
  const quintiles = [];
  for (let q = 0; q < 5; q += 1) {
    const start = q * quintileSize;
    const end = q === 4 ? sorted.length : start + quintileSize;
    const slice = sorted.slice(start, end);
    quintiles.push({ quintile: q + 1, n: slice.length, meanFeature: slice.reduce((s, r) => s + r.value, 0) / slice.length, meanPoints: slice.reduce((s, r) => s + r.points, 0) / slice.length });
  }
  return quintiles;
}
const quintilesByBucket: Record<string, { offenseEpa: ReturnType<typeof quintileAnalysis>; defEpaAllowed: ReturnType<typeof quintileAnalysis> }> = {};
for (const bucket of WEEK_BUCKETS) {
  const rows = dataset.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  quintilesByBucket[bucket.label] = { offenseEpa: quintileAnalysis(rows, "offenseEpa"), defEpaAllowed: quintileAnalysis(rows, "defEpaAllowed") };
}
console.log("[item2] correlations + quintiles computed.");

// ===========================================================================
// Item 3: window definition worked examples.
// ===========================================================================
const EXAMPLE_TEAMS = ["buf", "kc", "det"];
const EXAMPLE_WEEKS = [2, 6, 12, 17];
const EXAMPLE_SEASON = 2023;
const workedExamples = EXAMPLE_TEAMS.map((team) => ({
  team,
  bySchemeWeek: EXAMPLE_WEEKS.map((week) => {
    const cutoff = { season: EXAMPLE_SEASON, week };
    const ownRows = scoringSupportIndex.byTeam.get(team) ?? [];
    const priorSorted = [...ownRows]
      .filter((r) => r.season < cutoff.season || (r.season === cutoff.season && r.week < cutoff.week))
      .sort((a, b) => a.season - b.season || a.week - b.week);
    const seasonPrior = priorSorted.filter((r) => r.season === cutoff.season);
    const usedGames = seasonPrior.length > 0 ? seasonPrior : priorSorted.filter((r) => r.season === cutoff.season - 1);
    const branch = seasonPrior.length > 0 ? "seasonPrior" : usedGames.length > 0 ? "priorSeason" : "insufficient";
    return {
      week,
      branch,
      gamesUsed: usedGames.map((r) => ({ season: r.season, week: r.week, opponent: r.opponent, eligiblePlays: r.eligiblePlays })),
    };
  }),
}));
console.log("[item3] worked examples computed.");

// ===========================================================================
// Item 4: recency diagnostic (window schemes A-F) -- offense EPA and defense-allowed EPA only, correlation by bucket and by season.
// ===========================================================================
const SCHEMES: { label: string; scheme: WindowScheme }[] = [
  { label: "A:current", scheme: { kind: "current" } },
  { label: "B:last3", scheme: { kind: "lastN", n: 3 } },
  { label: "C:last5", scheme: { kind: "lastN", n: 5 } },
  { label: "D:last8", scheme: { kind: "lastN", n: 8 } },
  { label: "E:seasonToDateOnly", scheme: { kind: "seasonToDateOnly" } },
  { label: "F:ewma-halfLife2", scheme: { kind: "ewma", halfLife: 2 } },
  { label: "F:ewma-halfLife4", scheme: { kind: "ewma", halfLife: 4 } },
  { label: "F:ewma-halfLife6", scheme: { kind: "ewma", halfLife: 6 } },
];

type RecencyRow = { season: number; week: number; team: string; actualPoints: number; offenseEpaBySeen: Record<string, number | null>; defEpaAllowedBySeen: Record<string, number | null>; effectiveNBySeen: Record<string, number> };
const recencyRows: RecencyRow[] = dataset.map((row) => {
  const ownRows = scoringSupportIndex.byTeam.get(row.team) ?? [];
  // The feature that should predict row.team's OWN points is the OPPONENT's defense-allowed window
  // (mirrors dataset.ts's buildDefenseAllowedWindow(index, row.opponent, cutoff) exactly) -- NOT row.team's own defense.
  const oppAllowedRows = scoringSupportIndex.byOpponent.get(row.opponent) ?? [];
  const cutoff = { season: row.season, week: row.week };
  const offenseEpaBySeen: Record<string, number | null> = {};
  const defEpaAllowedBySeen: Record<string, number | null> = {};
  const effectiveNBySeen: Record<string, number> = {};
  for (const { label, scheme } of SCHEMES) {
    const off = computeWindowedFeature(ownRows, cutoff, scheme);
    const def = computeWindowedFeature(oppAllowedRows, cutoff, scheme);
    offenseEpaBySeen[label] = off.epaPerPlay;
    defEpaAllowedBySeen[label] = def.epaPerPlay;
    effectiveNBySeen[label] = off.effectiveN;
  }
  return { season: row.season, week: row.week, team: row.team, actualPoints: row.actualTeamPoints, offenseEpaBySeen, defEpaAllowedBySeen, effectiveNBySeen };
});
console.log("[item4] recomputed all window schemes for every row.");

function correlationForScheme(rows: readonly RecencyRow[], field: "offenseEpaBySeen" | "defEpaAllowedBySeen", schemeLabel: string) {
  const pairs = rows.map((r) => ({ x: r[field][schemeLabel], y: r.actualPoints })).filter((p): p is { x: number; y: number } => p.x !== null);
  return { n: pairs.length, correlation: pearsonCorrelation(pairs.map((p) => p.x), pairs.map((p) => p.y)) };
}

const recencyCorrelationByBucket: Record<string, Record<string, { offenseEpa: ReturnType<typeof correlationForScheme>; defEpaAllowed: ReturnType<typeof correlationForScheme> }>> = {};
for (const bucket of WEEK_BUCKETS) {
  const rows = recencyRows.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  recencyCorrelationByBucket[bucket.label] = Object.fromEntries(
    SCHEMES.map(({ label }) => [label, { offenseEpa: correlationForScheme(rows, "offenseEpaBySeen", label), defEpaAllowed: correlationForScheme(rows, "defEpaAllowedBySeen", label) }]),
  );
}
const recencyCorrelationBySeason: Record<number, Record<string, { offenseEpa: ReturnType<typeof correlationForScheme>; defEpaAllowed: ReturnType<typeof correlationForScheme> }>> = {};
for (const season of TARGET_SEASONS) {
  const rows = recencyRows.filter((r) => r.season === season);
  recencyCorrelationBySeason[season] = Object.fromEntries(
    SCHEMES.map(({ label }) => [label, { offenseEpa: correlationForScheme(rows, "offenseEpaBySeen", label), defEpaAllowed: correlationForScheme(rows, "defEpaAllowedBySeen", label) }]),
  );
}
const avgEffectiveNByBucketScheme: Record<string, Record<string, number>> = {};
for (const bucket of WEEK_BUCKETS) {
  const rows = recencyRows.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  avgEffectiveNByBucketScheme[bucket.label] = Object.fromEntries(
    SCHEMES.map(({ label }) => [label, rows.reduce((s, r) => s + r.effectiveNBySeen[label], 0) / rows.length]),
  );
}
console.log("[item4] correlation-by-scheme tables computed.");

// ===========================================================================
// Item 5: prior-season shrinkage / influence by target week.
// ===========================================================================
const PRIOR_SEASON_TARGET_WEEKS = [2, 5, 10, 15, 18];
const priorSeasonInfluenceByWeek = PRIOR_SEASON_TARGET_WEEKS.map((week) => {
  const rows = dataset.filter((r) => r.week === week);
  const priorSeasonCount = rows.filter((r) => r.offense.window === "priorSeason").length;
  const seasonPriorCount = rows.filter((r) => r.offense.window === "seasonPrior").length;
  const insufficientCount = rows.filter((r) => r.offense.window === "insufficient").length;
  return { week, n: rows.length, priorSeasonCount, seasonPriorCount, insufficientCount, priorSeasonSharePct: rows.length > 0 ? (100 * priorSeasonCount) / rows.length : null };
});
console.log("[item5] prior-season influence by week computed.");

// ===========================================================================
// Item 6: team trend test -- mechanical identification of biggest first-half -> second-half offense EPA movers, per season.
// ===========================================================================
function rawGameEpa(row: NflTotalResearchScoringSupportRow): number | null {
  return row.eligiblePlays > 0 ? row.offEpaSum / row.eligiblePlays : null;
}
const teamTrendBySeasons = TARGET_SEASONS.map((season) => {
  const teams = [...new Set(scoringSupportRows.filter((r) => r.season === season).map((r) => r.team))];
  const movers = teams.map((team) => {
    const games = scoringSupportRows.filter((r) => r.season === season && r.team === team).sort((a, b) => a.week - b.week);
    const firstHalf = games.filter((g) => g.week <= 9);
    const secondHalf = games.filter((g) => g.week >= 10);
    const firstHalfMean = firstHalf.length > 0 ? firstHalf.reduce((s, g) => s + (rawGameEpa(g) ?? 0), 0) / firstHalf.length : null;
    const secondHalfMean = secondHalf.length > 0 ? secondHalf.reduce((s, g) => s + (rawGameEpa(g) ?? 0), 0) / secondHalf.length : null;
    const change = firstHalfMean !== null && secondHalfMean !== null ? secondHalfMean - firstHalfMean : null;
    return { team, firstHalfMean, secondHalfMean, change, firstHalfGames: firstHalf.length, secondHalfGames: secondHalf.length };
  }).filter((m) => m.change !== null);
  const sorted = [...movers].sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  return { season, biggestRiser: sorted[0], biggestFaller: sorted[sorted.length - 1] };
});

// Detailed weekly trace for the single most extreme mover across all seasons (by absolute change).
const allMovers = teamTrendBySeasons.flatMap((s) => [{ season: s.season, ...s.biggestRiser }, { season: s.season, ...s.biggestFaller }]);
const mostExtremeMover = [...allMovers].sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))[0];
const traceTeam = mostExtremeMover.team;
const traceSeason = mostExtremeMover.season;
const traceGames = scoringSupportRows.filter((r) => r.season === traceSeason && r.team === traceTeam).sort((a, b) => a.week - b.week);
const weeklyTrace = traceGames.map((g) => {
  const cutoff = { season: traceSeason, week: g.week };
  const ownRows = scoringSupportIndex.byTeam.get(traceTeam) ?? [];
  const current = computeWindowedFeature(ownRows, cutoff, { kind: "current" });
  const last3 = computeWindowedFeature(ownRows, cutoff, { kind: "lastN", n: 3 });
  const last5 = computeWindowedFeature(ownRows, cutoff, { kind: "lastN", n: 5 });
  const ewma2 = computeWindowedFeature(ownRows, cutoff, { kind: "ewma", halfLife: 2 });
  return { week: g.week, rawGameEpa: rawGameEpa(g), current: current.epaPerPlay, last3: last3.epaPerPlay, last5: last5.epaPerPlay, ewma2: ewma2.epaPerPlay };
});
console.log(`[item6] mechanical mover identification done; detailed trace for ${traceTeam} ${traceSeason} (change=${mostExtremeMover.change?.toFixed(3)}).`);

// ===========================================================================
// Item 7: offense vs defense persistence (first-half -> second-half same-team correlation).
// ===========================================================================
function persistenceCorrelation(metricExtractor: (row: NflTotalResearchScoringSupportRow) => number | null, defenseSide: boolean) {
  const pairs: { firstHalf: number; secondHalf: number }[] = [];
  for (const season of TARGET_SEASONS) {
    const teams = [...new Set(scoringSupportRows.filter((r) => r.season === season).map((r) => r.team))];
    for (const team of teams) {
      const games = defenseSide
        ? scoringSupportRows.filter((r) => r.season === season && r.opponent === team) // what this team's defense allowed
        : scoringSupportRows.filter((r) => r.season === season && r.team === team);
      const firstHalf = games.filter((g) => g.week <= 9).map(metricExtractor).filter((v): v is number => v !== null);
      const secondHalf = games.filter((g) => g.week >= 10).map(metricExtractor).filter((v): v is number => v !== null);
      if (firstHalf.length === 0 || secondHalf.length === 0) continue;
      pairs.push({ firstHalf: firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length, secondHalf: secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length });
    }
  }
  return { n: pairs.length, correlation: pearsonCorrelation(pairs.map((p) => p.firstHalf), pairs.map((p) => p.secondHalf)) };
}
const offensePersistence = persistenceCorrelation(rawGameEpa, false);
const defensePersistence = persistenceCorrelation(rawGameEpa, true);
console.log("[item7] offense persistence:", offensePersistence, "defense persistence:", defensePersistence);

// ===========================================================================
// Item 8: points-based sanity check -- rolling points/game (current scheme) vs actual target points, by bucket.
// ===========================================================================
type PointsEntry = { season: number; week: number; points: number };
const teamPointsLog = new Map<string, PointsEntry[]>();
for (const game of targetGames) {
  const homeEntry = { season: game.season, week: game.week, points: game.homeScore };
  const awayEntry = { season: game.season, week: game.week, points: game.awayScore };
  if (!teamPointsLog.has(game.homeAbbr)) teamPointsLog.set(game.homeAbbr, []);
  teamPointsLog.get(game.homeAbbr)!.push(homeEntry);
  if (!teamPointsLog.has(game.awayAbbr)) teamPointsLog.set(game.awayAbbr, []);
  teamPointsLog.get(game.awayAbbr)!.push(awayEntry);
}
function rollingPointsPerGame(team: string, cutoff: { season: number; week: number }): number | null {
  const log = teamPointsLog.get(team) ?? [];
  const priorSorted = log.filter((e) => e.season < cutoff.season || (e.season === cutoff.season && e.week < cutoff.week)).sort((a, b) => a.season - b.season || a.week - b.week);
  const seasonPrior = priorSorted.filter((e) => e.season === cutoff.season);
  const used = seasonPrior.length > 0 ? seasonPrior : priorSorted.filter((e) => e.season === cutoff.season - 1);
  if (used.length === 0) return null;
  return used.reduce((s, e) => s + e.points, 0) / used.length;
}
function rollingOpponentPointsAllowedPerGame(opponent: string, cutoff: { season: number; week: number }): number | null {
  // opponent's own points ALLOWED = what teams scored against them, i.e., look at games where `opponent` was the OTHER side.
  const allowed: PointsEntry[] = [];
  for (const game of targetGames) {
    if (game.homeAbbr === opponent) allowed.push({ season: game.season, week: game.week, points: game.awayScore });
    if (game.awayAbbr === opponent) allowed.push({ season: game.season, week: game.week, points: game.homeScore });
  }
  const priorSorted = allowed.filter((e) => e.season < cutoff.season || (e.season === cutoff.season && e.week < cutoff.week)).sort((a, b) => a.season - b.season || a.week - b.week);
  const seasonPrior = priorSorted.filter((e) => e.season === cutoff.season);
  const used = seasonPrior.length > 0 ? seasonPrior : priorSorted.filter((e) => e.season === cutoff.season - 1);
  if (used.length === 0) return null;
  return used.reduce((s, e) => s + e.points, 0) / used.length;
}
const pointsSanityByBucket: Record<string, { pointsPerGameCorr: number | null; opponentAllowedCorr: number | null; epaCorr: number | null; n: number }> = {};
for (const bucket of WEEK_BUCKETS) {
  const rows = dataset.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  const pairs = rows.map((r) => ({
    ppg: rollingPointsPerGame(r.team, { season: r.season, week: r.week }),
    oppAllowed: rollingOpponentPointsAllowedPerGame(r.opponent, { season: r.season, week: r.week }),
    epa: r.offense.epaPerPlay,
    actual: r.actualTeamPoints,
  }));
  const ppgPairs = pairs.filter((p): p is typeof p & { ppg: number } => p.ppg !== null);
  const allowedPairs = pairs.filter((p): p is typeof p & { oppAllowed: number } => p.oppAllowed !== null);
  const epaPairs = pairs.filter((p): p is typeof p & { epa: number } => p.epa !== null);
  pointsSanityByBucket[bucket.label] = {
    n: rows.length,
    pointsPerGameCorr: pearsonCorrelation(ppgPairs.map((p) => p.ppg), ppgPairs.map((p) => p.actual)),
    opponentAllowedCorr: pearsonCorrelation(allowedPairs.map((p) => p.oppAllowed), allowedPairs.map((p) => p.actual)),
    epaCorr: pearsonCorrelation(epaPairs.map((p) => p.epa), epaPairs.map((p) => p.actual)),
  };
}
console.log("[item8] points-based sanity check computed.");

// ===========================================================================
// Item 9: game-total environment check -- actual avg points vs pregame feature averages by bucket (reuses item1/item2 data).
// ===========================================================================
const gameTotalEnvironmentCheck = WEEK_BUCKETS.map((bucket) => {
  const rows = dataset.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  return {
    bucket: bucket.label,
    actualAvgTeamPoints: rows.reduce((s, r) => s + r.actualTeamPoints, 0) / rows.length,
    avgOffenseEpa: distributionsPooled[bucket.label].offenseEpa.mean,
    avgDefenseEpaAllowed: distributionsPooled[bucket.label].defEpaAllowed.mean,
    offenseEpaStddev: distributionsPooled[bucket.label].offenseEpa.stddev,
    defenseEpaAllowedStddev: distributionsPooled[bucket.label].defEpaAllowed.stddev,
  };
});
console.log("[item9] game-total environment check computed.");

// ===========================================================================
// Item 10: normalization audit -- train-pooled mean/std (as fitTotalRidge computes) vs raw validation-bucket mean, per fold.
// ===========================================================================
function meanStdOf(values: readonly number[]) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}
const NORMALIZATION_FOLDS = [
  { name: "fold2", trainSeasons: [2022, 2023], evalSeason: 2024 },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeason: 2025 },
];
const normalizationAudit = NORMALIZATION_FOLDS.map((fold) => {
  const trainRows = dataset.filter((r) => fold.trainSeasons.includes(r.season) && r.offense.epaPerPlay !== null);
  const trainStats = meanStdOf(trainRows.map((r) => r.offense.epaPerPlay!));
  const bucketsForFold = WEEK_BUCKETS.map((bucket) => {
    const valRows = dataset.filter((r) => r.season === fold.evalSeason && r.week >= bucket.min && r.week <= bucket.max && r.offense.epaPerPlay !== null);
    if (valRows.length === 0) return { bucket: bucket.label, n: 0, rawMean: null, standardizedMeanUsingTrainStats: null };
    const rawMean = valRows.reduce((s, r) => s + r.offense.epaPerPlay!, 0) / valRows.length;
    const standardizedMeanUsingTrainStats = (rawMean - trainStats.mean) / trainStats.std;
    return { bucket: bucket.label, n: valRows.length, rawMean, standardizedMeanUsingTrainStats };
  });
  return { fold: fold.name, trainPooledMean: trainStats.mean, trainPooledStd: trainStats.std, validationBuckets: bucketsForFold };
});
console.log("[item10] normalization audit computed.");

// ===========================================================================
// Item 11: data-quality checks.
// ===========================================================================
const VALID_TEAM_CODES = new Set(["ari", "atl", "bal", "buf", "car", "chi", "cin", "cle", "dal", "den", "det", "gb", "hou", "ind", "jax", "kc", "lac", "lar", "lv", "mia", "min", "ne", "no", "nyg", "nyj", "phi", "pit", "sea", "sf", "tb", "ten", "wsh"]);
const unrecognizedTeamCodes = [...new Set(scoringSupportRows.flatMap((r) => [r.team, r.opponent]))].filter((code) => !VALID_TEAM_CODES.has(code));

const gameRowCounts = new Map<string, number>();
for (const row of scoringSupportRows) gameRowCounts.set(row.gameId, (gameRowCounts.get(row.gameId) ?? 0) + 1);
const gamesWithWrongRowCount = [...gameRowCounts.entries()].filter(([, count]) => count !== 2);

const duplicateTeamGamePairs = (() => {
  const seen = new Map<string, number>();
  for (const row of scoringSupportRows) {
    const key = `${row.gameId}|${row.team}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1);
})();

const mirrorJoinFailures = scoringSupportRows.filter((row) => {
  const mirror = scoringSupportRows.find((r) => r.gameId === row.gameId && r.team === row.opponent && r.opponent === row.team);
  return !mirror;
});

const zeroFeatureRows = dataset.filter((r) => r.offense.epaPerPlay === 0 || r.offense.successRate === 0 || r.offense.explosiveRate === 0);

const rowsPerWeekPerSeason: Record<number, Record<number, number>> = {};
for (const season of SCORING_SUPPORT_SEASONS) {
  rowsPerWeekPerSeason[season] = {};
  for (let week = 1; week <= 18; week += 1) {
    rowsPerWeekPerSeason[season][week] = scoringSupportRows.filter((r) => r.season === season && r.week === week).length;
  }
}

const gamesPerSeason = Object.fromEntries(TARGET_SEASONS.map((s) => [s, targetGames.filter((g) => g.season === s).length]));
const weekRangeBySeasonCheck = Object.fromEntries(
  SCORING_SUPPORT_SEASONS.map((s) => [s, { minWeek: Math.min(...scoringSupportRows.filter((r) => r.season === s).map((r) => r.week)), maxWeek: Math.max(...scoringSupportRows.filter((r) => r.season === s).map((r) => r.week)) }]),
);

const dataQuality = {
  unrecognizedTeamCodes,
  gamesWithWrongRowCountCount: gamesWithWrongRowCount.length,
  gamesWithWrongRowCountSample: gamesWithWrongRowCount.slice(0, 5),
  duplicateTeamGamePairsCount: duplicateTeamGamePairs.length,
  mirrorJoinFailuresCount: mirrorJoinFailures.length,
  zeroFeatureRowsCount: zeroFeatureRows.length,
  rowsPerWeekPerSeason,
  gamesPerSeason,
  weekRangeBySeasonCheck,
  buf2022CincinnatiCancellation: { season2022TeamGameRows: rowsPerWeekPerSeason[2022] ? Object.values(rowsPerWeekPerSeason[2022]).reduce((s, v) => s + v, 0) : null, expectedIfNoCancellation: 544, actual2022Games: gamesPerSeason[2022] },
};
console.log("[item11] data quality checks computed:", { unrecognizedTeamCodes, gamesWithWrongRowCountCount: gamesWithWrongRowCount.length, duplicateTeamGamePairsCount: duplicateTeamGamePairs.length, mirrorJoinFailuresCount: mirrorJoinFailures.length, zeroFeatureRowsCount: zeroFeatureRows.length });

// ===========================================================================
// Write full report.
// ===========================================================================
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "report-phase-k.json"),
  JSON.stringify(
    {
      distributionsPooled,
      distributionsBySeason,
      correlationsByBucket,
      quintilesByBucket,
      workedExamples,
      recencyCorrelationByBucket,
      recencyCorrelationBySeason,
      avgEffectiveNByBucketScheme,
      priorSeasonInfluenceByWeek,
      teamTrendBySeasons,
      mostExtremeMover,
      weeklyTrace,
      offensePersistence,
      defensePersistence,
      pointsSanityByBucket,
      gameTotalEnvironmentCheck,
      normalizationAudit,
      dataQuality,
    },
    null,
    2,
  ),
  "utf-8",
);
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-k.json")}`);

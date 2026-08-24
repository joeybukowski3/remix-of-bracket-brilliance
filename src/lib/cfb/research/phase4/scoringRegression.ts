import { solveLinearSystem } from "../phase2/linearSolver";
import type { CfbSecondaryFeatureBlock, FittedScoringModel, ScoringModelConfig, ScoringObservation } from "./types";

type FeatureExtractor = (row: ScoringObservation) => number | null;

const SECONDARY_EXTRACTORS: Record<CfbSecondaryFeatureBlock, { own: FeatureExtractor; opponent: FeatureExtractor }> = {
  PPA: { own: (r) => r.teamPpaPerPlay, opponent: (r) => r.opponentPpaAllowed },
  SUCCESS: { own: (r) => r.teamSuccessRate, opponent: (r) => r.opponentSuccessRateAllowed },
  EXPLOSIVENESS: { own: (r) => r.teamExplosiveRate, opponent: (r) => r.opponentExplosiveRateAllowed },
};

/**
 * Builds the design-matrix column list for a given config. HFA is a
 * single national column, or one column per training season
 * (SEASON_VARYING) so each season gets its own estimated home effect.
 * Every feature here is available strictly at or before the walk-forward
 * cutoff that produced the observation (enforced by the caller — see
 * phase4WalkForwardCore.ts).
 */
function buildFeatureColumns(
  config: ScoringModelConfig,
  trainingSeasons: readonly number[],
): { name: string; extract: (row: ScoringObservation) => number | null }[] {
  const columns: { name: string; extract: (row: ScoringObservation) => number | null }[] = [
    { name: "scoringEnvironment", extract: (r) => r.scoringEnvironmentEstimate },
    { name: "offenseRating", extract: (r) => r.teamOffenseRating },
    { name: "defenseRatingAllowed", extract: (r) => r.opponentDefenseRating },
  ];

  if (config.hfa === "NATIONAL") {
    columns.push({ name: "hfa", extract: (r) => (r.isNeutral ? 0 : r.isHome ? 1 : -1) });
  } else if (config.hfa === "SEASON_VARYING") {
    for (const season of trainingSeasons) {
      columns.push({
        name: `hfa_${season}`,
        extract: (r) => (r.season !== season ? 0 : r.isNeutral ? 0 : r.isHome ? 1 : -1),
      });
    }
  }

  if (config.pace === "RAW") {
    columns.push({ name: "teamPaceRaw", extract: (r) => r.teamPaceRaw });
    columns.push({ name: "opponentPaceRaw", extract: (r) => r.opponentPaceRaw });
  } else if (config.pace === "SITUATION_NEUTRAL") {
    columns.push({ name: "teamPaceNeutral", extract: (r) => r.teamPaceSituationNeutral });
    columns.push({ name: "opponentPaceNeutral", extract: (r) => r.opponentPaceSituationNeutral });
  }

  for (const block of config.secondary) {
    const { own, opponent } = SECONDARY_EXTRACTORS[block];
    columns.push({ name: `${block}_own`, extract: own });
    columns.push({ name: `${block}_opponentAllowed`, extract: opponent });
  }

  return columns;
}

/**
 * Fits a small weighted-ridge scoring regression: actualPoints ~
 * columns(config). Rows with any missing required feature are dropped
 * from the fit (never imputed as zero) — see Section 9-style discipline
 * carried over from Phase 3.
 */
export function fitScoringModel(
  trainingRows: readonly ScoringObservation[],
  config: ScoringModelConfig,
): FittedScoringModel {
  const trainingSeasons = [...new Set(trainingRows.map((r) => r.season))].sort((a, b) => a - b);
  const columns = buildFeatureColumns(config, trainingSeasons);
  const usable = trainingRows.filter(
    (row) => row.actualPoints !== null && columns.every((c) => c.extract(row) !== null),
  );

  const nParams = columns.length + 1; // + intercept
  const ata = Array.from({ length: nParams }, () => new Array(nParams).fill(0));
  const atb = new Array(nParams).fill(0);

  for (const row of usable) {
    const x = [1, ...columns.map((c) => c.extract(row) as number)];
    const y = row.actualPoints as number;
    for (let i = 0; i < nParams; i += 1) {
      atb[i] += x[i] * y;
      for (let j = 0; j < nParams; j += 1) ata[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < nParams; i += 1) ata[i][i] += config.lambda; // no penalty on intercept

  const coefficients = usable.length >= nParams + 2 ? solveLinearSystem(ata, atb) : new Array(nParams).fill(0);
  // Fallback: with too few usable rows, predict the training mean via intercept only.
  if (usable.length < nParams + 2 && usable.length > 0) {
    coefficients[0] = usable.reduce((s, r) => s + (r.actualPoints as number), 0) / usable.length;
  }

  return { config, featureNames: ["intercept", ...columns.map((c) => c.name)], coefficients, trainingSeasons };
}

export function predictScore(model: FittedScoringModel, row: ScoringObservation): number | null {
  const columns = buildFeatureColumns(model.config, model.trainingSeasons);
  const values = columns.map((c) => c.extract(row));
  if (values.some((v) => v === null)) return null;
  let prediction = model.coefficients[0];
  values.forEach((v, i) => {
    prediction += model.coefficients[i + 1] * (v as number);
  });
  return prediction;
}

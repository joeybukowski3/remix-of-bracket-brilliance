/**
 * Phase 9: production Matchup Score scorer for a live (current-week) row.
 * Reuses the Phase 8 primitives (`matchupScore.ts`) and the extracted
 * dimension definitions (`matchupScoreDimensions.ts`) verbatim -- no score
 * weight, dimension, or normalization decision is re-derived here. Weights
 * are the already-frozen `selectedDefinition` read from the committed
 * `data/nfl/props/matchup-score-research.json` research artifact (Phase 8
 * output); reference distributions are rebuilt from the same frozen
 * `FINAL_TRAIN_SEASONS` (2022-2024) feature rows every consumer of this
 * research already uses -- 2025 and the live current week never enter a
 * reference.
 */
import {
  buildDimensionReference,
  buildGroupedDimensionReferences,
  combineDimensionScores,
  scoreDimension,
  type MatchupDimensionReference,
} from "./matchupScore";
import type { DimensionDefinitions } from "./matchupScoreDimensions";
import { NFL_YARDAGE_MATCHUP_REFERENCE_VERSION, NFL_YARDAGE_MATCHUP_SCORE_VERSION } from "./types/matchupScore";

export type NflFrozenScoreDefinition = {
  opportunityComponent: string;
  environmentComponents: readonly string[];
  weights: Readonly<Record<string, number>>;
};

function mean(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

export type NflPooledReference<Row> = { kind: "pooled"; reference: Readonly<Record<string, MatchupDimensionReference>> };
export type NflGroupedReference<Row> = { kind: "grouped"; group: (row: Row) => string; references: Readonly<Record<string, Readonly<Record<string, MatchupDimensionReference>>>> };

/** Builds a pooled reference from development-only (2022-2024) rows -- passing and rushing. */
export function buildPooledReference<Row>(
  key: string,
  developmentRows: readonly Row[],
  dimensions: DimensionDefinitions<Row>,
): Readonly<Record<string, MatchupDimensionReference>> {
  return Object.fromEntries(
    Object.entries(dimensions).map(([dimKey, indicators]) => [dimKey, buildDimensionReference(`${key}.${dimKey}`, developmentRows, indicators)]),
  );
}

/** Builds a position-grouped reference from development-only rows -- receiving only (Phase 8 position-normalized winner). */
export function buildGroupedReference<Row>(
  key: string,
  developmentRows: readonly Row[],
  dimensions: DimensionDefinitions<Row>,
  group: (row: Row) => string,
): Readonly<Record<string, Readonly<Record<string, MatchupDimensionReference>>>> {
  const groups = [...new Set(developmentRows.map(group))];
  return Object.fromEntries(
    groups.map((groupKey) => [
      groupKey,
      Object.fromEntries(
        Object.entries(dimensions).map(([dimKey, indicators]) => [
          dimKey,
          buildDimensionReference(`${key}.${dimKey}`, developmentRows.filter((row) => group(row) === groupKey), indicators),
        ]),
      ),
    ]),
  );
}

export type NflLiveMatchupScoreResult = {
  matchupScore: number;
  opportunityScore: number;
  environmentScore: number;
  components: Readonly<Record<string, { score: number; indicatorScores: Readonly<Record<string, number>> }>>;
  scoreVersion: typeof NFL_YARDAGE_MATCHUP_SCORE_VERSION;
  referenceDistributionVersion: typeof NFL_YARDAGE_MATCHUP_REFERENCE_VERSION;
};

/** Scores one live row against an already-built pooled reference and the frozen selected-weight definition. */
export function scoreLiveRowPooled<Row>(
  row: Row,
  dimensions: DimensionDefinitions<Row>,
  reference: Readonly<Record<string, MatchupDimensionReference>>,
  definition: NflFrozenScoreDefinition,
): NflLiveMatchupScoreResult {
  const dimensionScores: Record<string, { score: number; indicatorScores: Readonly<Record<string, number>> }> = {};
  const scalarScores: Record<string, number> = {};
  for (const [dimKey, indicators] of Object.entries(dimensions)) {
    const scored = scoreDimension(row, indicators, reference[dimKey]);
    dimensionScores[dimKey] = { score: scored.score, indicatorScores: scored.indicatorScores };
    scalarScores[dimKey] = scored.score;
  }
  const matchupScore = combineDimensionScores(scalarScores, definition.weights).score;
  const opportunityScore = scalarScores[definition.opportunityComponent];
  const environmentScore = mean(definition.environmentComponents.map((key) => scalarScores[key])) ?? 50;
  return {
    matchupScore, opportunityScore, environmentScore, components: dimensionScores,
    scoreVersion: NFL_YARDAGE_MATCHUP_SCORE_VERSION, referenceDistributionVersion: NFL_YARDAGE_MATCHUP_REFERENCE_VERSION,
  };
}

/** Scores one live row against a position-grouped reference (receiving). Falls back to neutral 50s if the row's group has no reference (should not happen for RB/WR/TE, guarded by the caller). */
export function scoreLiveRowGrouped<Row>(
  row: Row,
  dimensions: DimensionDefinitions<Row>,
  groupedReference: Readonly<Record<string, Readonly<Record<string, MatchupDimensionReference>>>>,
  groupKey: string,
  definition: NflFrozenScoreDefinition,
): NflLiveMatchupScoreResult {
  const reference = groupedReference[groupKey];
  if (!reference) throw new Error(`No Matchup Score reference for group "${groupKey}".`);
  return scoreLiveRowPooled(row, dimensions, reference, definition);
}

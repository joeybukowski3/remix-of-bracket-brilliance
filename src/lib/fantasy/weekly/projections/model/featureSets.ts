import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { FeatureBlock, FeatureBlockName, FeatureKey, Row } from "./types";

/**
 * Position-specific feature block definitions (spec section 7). Each position
 * is modeled independently: a block winning for one position does not
 * authorize it for another. Blocks are ordered so `ablationLadder` can add
 * them one at a time (spec section 12): baseline -> usage -> teamContext ->
 * opponentContext -> fpa -> snapUsage.
 *
 * Excluded by contract/spec: target-week stats/snaps, injury/starter
 * hindsight, markets, closing lines, current 2026 roster joins. None of those
 * fields exist on `WeeklyFantasyProjectionTrainingRow` in the first place.
 */

const BASELINE_FEATURES: readonly FeatureKey[] = [
  "seasonPpgPrior",
  "last3PpgPrior",
  "last5PpgPrior",
  "priorSeasonPpg",
  "gamesPlayedPrior",
  "weeksSinceLastAppearance",
  "teamChangedFromPriorSeason",
  "homeAway",
  "restDays",
  "shortWeek",
  "byeReturn",
];

const USAGE_BY_POSITION: Readonly<Record<FantasyPosition, readonly FeatureKey[]>> = {
  QB: [
    "passAttemptsSeasonPrior",
    "passAttemptsLast3",
    "passingYardsSeasonPrior",
    "passingTdsSeasonPrior",
    "interceptionsSeasonPrior",
    "carriesSeasonPrior",
    "rushingYardsSeasonPrior",
    "rushingTdsSeasonPrior",
  ],
  RB: [
    "carriesSeasonPrior",
    "carriesLast3",
    "targetsSeasonPrior",
    "targetsLast3",
    "receptionsSeasonPrior",
    "rushYardsSeasonPrior",
    "receivingYardsSeasonPrior",
    "targetShareSeasonPrior",
  ],
  WR: [
    "targetsSeasonPrior",
    "targetsLast3",
    "receptionsSeasonPrior",
    "receivingYardsSeasonPrior",
    "receivingAirYardsSeasonPrior",
    "airYardsShareSeasonPrior",
    "targetShareSeasonPrior",
  ],
  TE: [
    "targetsSeasonPrior",
    "targetsLast3",
    "receptionsSeasonPrior",
    "receivingYardsSeasonPrior",
    "receivingAirYardsSeasonPrior",
    "airYardsShareSeasonPrior",
    "targetShareSeasonPrior",
  ],
};

const TEAM_CONTEXT_BY_POSITION: Readonly<Record<FantasyPosition, readonly FeatureKey[]>> = {
  QB: ["teamPassEpaPrior", "teamOffensivePlaysPrior", "teamPassRatePrior"],
  RB: ["teamRushEpaPrior", "teamOffensivePlaysPrior"],
  WR: ["teamPassEpaPrior", "teamOffensivePlaysPrior"],
  TE: ["teamPassEpaPrior", "teamOffensivePlaysPrior"],
};

const OPPONENT_CONTEXT_BY_POSITION: Readonly<Record<FantasyPosition, readonly FeatureKey[]>> = {
  QB: ["opponentPassDefenseEpaPrior", "opponentDefensiveEpaPrior"],
  RB: ["opponentRushDefenseEpaPrior", "opponentDefensiveEpaPrior"],
  WR: ["opponentPassDefenseEpaPrior", "opponentDefensiveEpaPrior"],
  TE: ["opponentPassDefenseEpaPrior", "opponentDefensiveEpaPrior"],
};

const FPA_FEATURES: readonly FeatureKey[] = ["opponentPositionFpaPrior", "opponentPositionFpaPriorSeason"];

const SNAP_USAGE_FEATURES: readonly FeatureKey[] = ["snapShareSeasonPrior", "snapShareLast3"];

export function featureBlocksForPosition(position: FantasyPosition): readonly FeatureBlock[] {
  return [
    { name: "baseline", features: BASELINE_FEATURES },
    { name: "usage", features: USAGE_BY_POSITION[position] },
    { name: "teamContext", features: TEAM_CONTEXT_BY_POSITION[position] },
    { name: "opponentContext", features: OPPONENT_CONTEXT_BY_POSITION[position] },
    { name: "fpa", features: FPA_FEATURES },
    { name: "snapUsage", features: SNAP_USAGE_FEATURES },
  ];
}

/** Section-12 ablation ladder: cumulative blocks A..F, added one at a time. */
export function ablationLadder(position: FantasyPosition): readonly { label: string; blocks: readonly FeatureBlockName[] }[] {
  return [
    { label: "A. baseline only", blocks: ["baseline"] },
    { label: "B. + player usage", blocks: ["baseline", "usage"] },
    { label: "C. + team efficiency", blocks: ["baseline", "usage", "teamContext"] },
    { label: "D. + opponent efficiency", blocks: ["baseline", "usage", "teamContext", "opponentContext"] },
    { label: "E. + FPA", blocks: ["baseline", "usage", "teamContext", "opponentContext", "fpa"] },
    { label: "F. + snap usage", blocks: ["baseline", "usage", "teamContext", "opponentContext", "fpa", "snapUsage"] },
  ];
}

export function featuresForBlocks(position: FantasyPosition, blocks: readonly FeatureBlockName[]): readonly FeatureKey[] {
  const all = featureBlocksForPosition(position);
  const selected = all.filter((block) => blocks.includes(block.name));
  const seen = new Set<FeatureKey>();
  const out: FeatureKey[] = [];
  for (const block of selected) {
    for (const feature of block.features) {
      if (!seen.has(feature)) {
        seen.add(feature);
        out.push(feature);
      }
    }
  }
  return out;
}

/** Raw feature extraction from a training row. Booleans are encoded as 0/1; everything else stays numeric or null. */
export function featureValue(row: Row, feature: FeatureKey): number | null {
  switch (feature) {
    case "priorSeasonPpg": return row.priorSeasonPpg;
    case "seasonPpgPrior": return row.seasonPpgPrior;
    case "last3PpgPrior": return row.last3PpgPrior;
    case "last5PpgPrior": return row.last5PpgPrior;
    case "gamesPlayedPrior": return row.gamesPlayedPrior;
    case "weeksSinceLastAppearance": return row.weeksSinceLastAppearance;
    case "teamChangedFromPriorSeason": return row.teamChangedFromPriorSeason == null ? null : row.teamChangedFromPriorSeason ? 1 : 0;
    case "homeAway": return row.homeAway === "home" ? 1 : 0;
    case "restDays": return row.restDays;
    case "shortWeek": return row.shortWeek == null ? null : row.shortWeek ? 1 : 0;
    case "byeReturn": return row.byeReturn == null ? null : row.byeReturn ? 1 : 0;
    case "passAttemptsSeasonPrior": return row.passAttemptsSeasonPrior;
    case "passAttemptsLast3": return row.passAttemptsLast3;
    case "passingYardsSeasonPrior": return row.passingYardsSeasonPrior;
    case "passingTdsSeasonPrior": return row.passingTdsSeasonPrior;
    case "interceptionsSeasonPrior": return row.interceptionsSeasonPrior;
    case "carriesSeasonPrior": return row.carriesSeasonPrior;
    case "rushingYardsSeasonPrior": return row.rushingYardsSeasonPrior;
    case "rushingTdsSeasonPrior": return row.rushingTdsSeasonPrior;
    case "carriesLast3": return row.carriesLast3;
    case "targetsSeasonPrior": return row.targetsSeasonPrior;
    case "targetsLast3": return row.targetsLast3;
    case "receptionsSeasonPrior": return row.receptionsSeasonPrior;
    case "rushYardsSeasonPrior": return row.rushYardsSeasonPrior;
    case "receivingYardsSeasonPrior": return row.receivingYardsSeasonPrior;
    case "targetShareSeasonPrior": return row.targetShareSeasonPrior;
    case "receivingAirYardsSeasonPrior": return row.receivingAirYardsSeasonPrior;
    case "airYardsShareSeasonPrior": return row.airYardsShareSeasonPrior;
    case "snapShareSeasonPrior": return row.snapShareSeasonPrior;
    case "snapShareLast3": return row.snapShareLast3;
    case "teamOffensiveEpaPrior": return row.teamOffensiveEpaPrior;
    case "teamPassEpaPrior": return row.teamPassEpaPrior;
    case "teamRushEpaPrior": return row.teamRushEpaPrior;
    case "teamOffensivePlaysPrior": return row.teamOffensivePlaysPrior;
    case "teamPassRatePrior": return row.teamPassRatePrior;
    case "opponentDefensiveEpaPrior": return row.opponentDefensiveEpaPrior;
    case "opponentPassDefenseEpaPrior": return row.opponentPassDefenseEpaPrior;
    case "opponentRushDefenseEpaPrior": return row.opponentRushDefenseEpaPrior;
    case "opponentPositionFpaPrior": return row.opponentPositionFpaPrior;
    case "opponentPositionFpaPriorSeason": return row.opponentPositionFpaPriorSeason;
  }
}

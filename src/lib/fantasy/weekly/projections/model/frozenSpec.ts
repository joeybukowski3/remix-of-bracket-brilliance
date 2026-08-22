import { FANTASY_SCORING_VERSION } from "../../scoring";
import { WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION } from "../contract";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { BaselineAuthorityName, FeatureBlockName, FeatureKey, ModelFamily } from "./types";
import type { PositionModelState } from "./positionResearch";

/**
 * Compact, tracked, version-controlled model-authority snapshot for Phase 2
 * (spec: "close the frozen-spec governance gap"). This is the ONLY source a
 * future production/shadow consumer may use to determine a position's
 * promotion state and model configuration -- it must never call live
 * `runPositionResearch()` for that purpose. Live research code stays useful
 * for the NEXT model-version research cycle, but a model version's decisions,
 * once written here, are immutable: changing them requires a new
 * `modelVersion`, never an edit to an existing one.
 *
 * These values were frozen during the 2023-training / 2024-validation model
 * selection documented in `data/fantasy/projections/research/` (gitignored
 * research output, not copied here -- see requirement not to duplicate large
 * validation/report JSON into source). Only the compact decision itself is
 * pinned below.
 */

export const WEEKLY_FANTASY_PROJECTION_MODEL_VERSION = "weekly-fantasy-projection-v1" as const;

/** The frozen research split/version this model version's decisions were selected under (see `../splitAuthority.ts`). */
export const FROZEN_SPEC_SPLIT_AUTHORITY_VERSION = "2023-train-2024-validate-2025-holdout-v1" as const;

export type FrozenRookieFallback = {
  /** Population mean of `actualFantasyPoints` among rookie/no-prior-history TRAINING (2023) rows for this position. */
  positionMeanPpgFromTraining: number;
  appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available";
};

/** One position's fully frozen, immutable model-authority record for `WEEKLY_FANTASY_PROJECTION_MODEL_VERSION`. */
export type FrozenModelAuthoritySpec = {
  readonly modelVersion: typeof WEEKLY_FANTASY_PROJECTION_MODEL_VERSION;
  readonly position: FantasyPosition;
  readonly state: PositionModelState;
  readonly family: ModelFamily;
  readonly featureBlocks: readonly FeatureBlockName[];
  readonly features: readonly FeatureKey[];
  /** Ridge/elastic-net alpha; null for the deterministic shrinkage baseline (no learned hyperparameter). */
  readonly hyperparameter: number | null;
  readonly l1Ratio: number | null;
  readonly baselineAuthority: BaselineAuthorityName;
  /** Shrinkage-blend K used both as the residual `stableBaseline` and (for BASELINE_ONLY positions) as the scored output itself. */
  readonly shrinkageK: number;
  readonly rookieFallback: FrozenRookieFallback;
  /** Scaling/preprocessing authority: scalers are always fit on 2023 training rows only; see `scaling.ts`. */
  readonly preprocessingAuthority: "train-only-standardization-v1";
  readonly splitAuthorityVersion: typeof FROZEN_SPEC_SPLIT_AUTHORITY_VERSION;
  readonly scoringVersion: typeof FANTASY_SCORING_VERSION;
  readonly datasetSchemaVersion: typeof WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION;
};

const QB_SPEC: FrozenModelAuthoritySpec = {
  modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
  position: "QB",
  state: "BASELINE_ONLY",
  family: "deterministic-shrinkage-baseline",
  featureBlocks: ["baseline"],
  features: [
    "seasonPpgPrior", "last3PpgPrior", "last5PpgPrior", "priorSeasonPpg",
    "gamesPlayedPrior", "weeksSinceLastAppearance", "teamChangedFromPriorSeason",
    "homeAway", "restDays", "shortWeek", "byeReturn",
  ],
  hyperparameter: null,
  l1Ratio: null,
  baselineAuthority: "shrinkage-blend",
  shrinkageK: 2,
  rookieFallback: { positionMeanPpgFromTraining: 5.42509090909091, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
  preprocessingAuthority: "train-only-standardization-v1",
  splitAuthorityVersion: FROZEN_SPEC_SPLIT_AUTHORITY_VERSION,
  scoringVersion: FANTASY_SCORING_VERSION,
  datasetSchemaVersion: WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
};

const RB_SPEC: FrozenModelAuthoritySpec = {
  modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
  position: "RB",
  state: "READY_FOR_2026_SHADOW",
  family: "residual-ridge",
  featureBlocks: ["baseline", "usage", "teamContext"],
  features: [
    "carriesSeasonPrior", "carriesLast3", "targetsSeasonPrior", "targetsLast3",
    "receptionsSeasonPrior", "rushYardsSeasonPrior", "receivingYardsSeasonPrior",
    "targetShareSeasonPrior", "teamRushEpaPrior", "teamOffensivePlaysPrior",
  ],
  hyperparameter: 10,
  l1Ratio: null,
  baselineAuthority: "shrinkage-blend",
  shrinkageK: 2,
  rookieFallback: { positionMeanPpgFromTraining: 3.124084778420037, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
  preprocessingAuthority: "train-only-standardization-v1",
  splitAuthorityVersion: FROZEN_SPEC_SPLIT_AUTHORITY_VERSION,
  scoringVersion: FANTASY_SCORING_VERSION,
  datasetSchemaVersion: WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
};

const WR_SPEC: FrozenModelAuthoritySpec = {
  modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
  position: "WR",
  state: "READY_FOR_2026_SHADOW",
  family: "residual-ridge",
  featureBlocks: ["baseline", "usage"],
  features: [
    "targetsSeasonPrior", "targetsLast3", "receptionsSeasonPrior", "receivingYardsSeasonPrior",
    "receivingAirYardsSeasonPrior", "airYardsShareSeasonPrior", "targetShareSeasonPrior",
  ],
  hyperparameter: 30,
  l1Ratio: null,
  baselineAuthority: "shrinkage-blend",
  shrinkageK: 2,
  rookieFallback: { positionMeanPpgFromTraining: 5.264690265486727, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
  preprocessingAuthority: "train-only-standardization-v1",
  splitAuthorityVersion: FROZEN_SPEC_SPLIT_AUTHORITY_VERSION,
  scoringVersion: FANTASY_SCORING_VERSION,
  datasetSchemaVersion: WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
};

const TE_SPEC: FrozenModelAuthoritySpec = {
  modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
  position: "TE",
  state: "READY_FOR_2026_SHADOW",
  family: "residual-ridge",
  featureBlocks: ["baseline", "usage"],
  features: [
    "targetsSeasonPrior", "targetsLast3", "receptionsSeasonPrior", "receivingYardsSeasonPrior",
    "receivingAirYardsSeasonPrior", "airYardsShareSeasonPrior", "targetShareSeasonPrior",
  ],
  hyperparameter: 10,
  l1Ratio: null,
  baselineAuthority: "shrinkage-blend",
  shrinkageK: 2,
  rookieFallback: { positionMeanPpgFromTraining: 2.7327485380116974, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
  preprocessingAuthority: "train-only-standardization-v1",
  splitAuthorityVersion: FROZEN_SPEC_SPLIT_AUTHORITY_VERSION,
  scoringVersion: FANTASY_SCORING_VERSION,
  datasetSchemaVersion: WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
};

/**
 * The single frozen decision table for `WEEKLY_FANTASY_PROJECTION_MODEL_VERSION`.
 * QB is pinned explicitly to its own literal spec object (`BASELINE_ONLY` /
 * `deterministic-shrinkage-baseline`) -- there is no shared/generic
 * position-keyed construction here that could let QB inherit RB/WR/TE's
 * `residual-ridge` family. Each position's spec is a distinct, independently
 * authored literal.
 */
const FROZEN_SPECS_BY_VERSION: Readonly<Record<string, Readonly<Record<FantasyPosition, FrozenModelAuthoritySpec>>>> = {
  [WEEKLY_FANTASY_PROJECTION_MODEL_VERSION]: {
    QB: Object.freeze(QB_SPEC),
    RB: Object.freeze(RB_SPEC),
    WR: Object.freeze(WR_SPEC),
    TE: Object.freeze(TE_SPEC),
  },
};

/**
 * The only sanctioned way for a production/shadow consumer to obtain a
 * position's frozen model authority. Fails closed (throws) for any unknown
 * model version or position rather than silently falling back to a default
 * family or state.
 */
export function getFrozenModelAuthority(modelVersion: string, position: FantasyPosition): FrozenModelAuthoritySpec {
  const versionTable = FROZEN_SPECS_BY_VERSION[modelVersion];
  if (!versionTable) {
    throw new Error(`Unknown weekly fantasy projection model version "${modelVersion}". No frozen spec exists for it.`);
  }
  const spec = versionTable[position];
  if (!spec) {
    throw new Error(`No frozen model authority spec for position "${position}" under model version "${modelVersion}".`);
  }
  return spec;
}

/** Convenience accessor for the current (latest) frozen model version. */
export function getCurrentFrozenModelAuthority(position: FantasyPosition): FrozenModelAuthoritySpec {
  return getFrozenModelAuthority(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, position);
}

export function listFrozenPositions(modelVersion: string = WEEKLY_FANTASY_PROJECTION_MODEL_VERSION): readonly FantasyPosition[] {
  const versionTable = FROZEN_SPECS_BY_VERSION[modelVersion];
  if (!versionTable) {
    throw new Error(`Unknown weekly fantasy projection model version "${modelVersion}". No frozen spec exists for it.`);
  }
  return Object.keys(versionTable) as FantasyPosition[];
}

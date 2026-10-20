/**
 * Reproducible evaluation manifest and pre-registered acceptance criteria.
 *
 * The manifest id covers everything that defines an evaluation (models and
 * parameters, dataset identity and content, cutoff policy, windows, metrics,
 * criteria) and nothing produced by it; `resultsSha256` covers the outputs.
 * Neither contains a wall-clock time, so the same inputs always give the same
 * hashes.
 */
import { BASELINE_MODEL_VERSION } from "../projection";
import type { DataUse, SourceLicense } from "../sources/types";
import { sha256Json, stableStringify } from "../canonicalJson";
import { FRAMEWORK_PARAMETERS } from "./constants";

export { sha256Json, stableStringify };
import type { ProjectedStat } from "../types";
import type { ReportBody } from "./report";
import { AVAILABILITY_MODELS, CONDITIONAL_METHODS, NAIVE_METHODS, type AvailabilityModelId, type ConditionalMethodId, type CutoffPolicy, type EvaluationDataset, type FoldSpec } from "./types";
import type { BaselineParams } from "../projection";
import { MINUTES_V1_MODEL_VERSION, type MinutesV1Params } from "./minutesV1Candidate";

export type AcceptanceCriterion =
  | { id: string; kind: "min-sample"; n: number }
  /** Pooled common-sample MAE of `method` <= maxRatio x the best naive method's MAE. */
  | { id: string; kind: "mae-vs-best-naive"; method: ConditionalMethodId; stat: ProjectedStat; maxRatio: number }
  | { id: string; kind: "abs-bias-at-most"; method: ConditionalMethodId; stat: ProjectedStat; max: number }
  /** Pooled Brier of `model` <= maxRatio x the constant-rate model's. */
  | { id: string; kind: "availability-brier-vs-constant"; model: AvailabilityModelId; maxRatio: number }
  | { id: string; kind: "leakage-invariants" };

export interface AcceptanceOutcome {
  id: string;
  passed: boolean;
  observed: number | null;
  threshold: number | null;
  detail: string;
}

export const DEFAULT_ACCEPTANCE: readonly AcceptanceCriterion[] = [
  { id: "leakage", kind: "leakage-invariants" },
  { id: "sample-size", kind: "min-sample", n: 200 },
  ...(["minutes", "pts", "reb", "ast"] as const).map((stat): AcceptanceCriterion => ({ id: `v0-${stat}-vs-naive`, kind: "mae-vs-best-naive", method: "jkb_baseline_v0", stat, maxRatio: 1.05 })),
  ...(["minutes", "pts", "reb", "ast"] as const).map((stat): AcceptanceCriterion => ({ id: `v0-${stat}-bias`, kind: "abs-bias-at-most", method: "jkb_baseline_v0", stat, max: stat === "minutes" ? 1.5 : 1 })),
  // The candidate model is gated like the benchmark: a candidate that is not accepted is not promoted.
  ...(["minutes", "pts", "reb", "ast"] as const).map((stat): AcceptanceCriterion => ({ id: `v1-${stat}-vs-naive`, kind: "mae-vs-best-naive", method: "jkb_minutes_v1", stat, maxRatio: 1.05 })),
  ...(["minutes", "pts", "reb", "ast"] as const).map((stat): AcceptanceCriterion => ({ id: `v1-${stat}-bias`, kind: "abs-bias-at-most", method: "jkb_minutes_v1", stat, max: stat === "minutes" ? 1.5 : 1 })),
  { id: "availability-vs-constant", kind: "availability-brier-vs-constant", model: "status_aware", maxRatio: 1 },
];

export function evaluateAcceptance(criteria: readonly AcceptanceCriterion[], body: ReportBody): AcceptanceOutcome[] {
  const common = body.pooled.conditional.commonSample;
  return criteria.map((criterion): AcceptanceOutcome => {
    switch (criterion.kind) {
      case "leakage-invariants": {
        const v = body.diagnostics.leakageInvariantViolations;
        return { id: criterion.id, passed: v === 0, observed: v, threshold: 0, detail: "pregame inputs found at or after their cutoff" };
      }
      case "min-sample":
        return { id: criterion.id, passed: common.n >= criterion.n, observed: common.n, threshold: criterion.n, detail: "common-sample targets" };
      case "abs-bias-at-most": {
        const bias = common.byMethod[criterion.method][criterion.stat].bias;
        return { id: criterion.id, passed: bias !== null && Math.abs(bias) <= criterion.max, observed: bias, threshold: criterion.max, detail: `${criterion.method} ${criterion.stat} bias` };
      }
      case "mae-vs-best-naive": {
        const mae = common.byMethod[criterion.method][criterion.stat].mae;
        const naive = NAIVE_METHODS.map((m) => common.byMethod[m][criterion.stat].mae).filter((v): v is number => v !== null);
        const best = naive.length === 0 ? null : Math.min(...naive);
        const ratio = mae !== null && best !== null && best > 0 ? mae / best : null;
        return { id: criterion.id, passed: ratio !== null && ratio <= criterion.maxRatio, observed: ratio, threshold: criterion.maxRatio, detail: `${criterion.method} ${criterion.stat} MAE / best naive MAE` };
      }
      case "availability-brier-vs-constant": {
        const model = body.pooled.availability.byModel[criterion.model].brier;
        const constant = body.pooled.availability.byModel.constant_rate.brier;
        const ratio = model !== null && constant !== null && constant > 0 ? model / constant : null;
        return { id: criterion.id, passed: ratio !== null && ratio <= criterion.maxRatio, observed: ratio, threshold: criterion.maxRatio, detail: `${criterion.model} Brier / constant-rate Brier` };
      }
    }
  });
}

/** Floating-point noise below this is not a result difference. */
const HASH_DECIMALS = 10;

function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toFixed(HASH_DECIMALS));
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, roundDeep(v)]));
  return value;
}

const sortBy = <T>(items: readonly T[], key: (item: T) => string): T[] => [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/** Order-independent digest of every table the evaluation reads. */
export function datasetContentSha256(dataset: EvaluationDataset): string {
  return sha256Json({
    playerGames: sortBy(dataset.playerGames, (r) => `${r.gameId}|${r.playerId}|${r.teamId}`),
    teamGames: sortBy(dataset.teamGames, (r) => `${r.gameId}|${r.teamId}`),
    schedule: sortBy(dataset.schedule, (g) => g.gameId),
    availability: sortBy(dataset.availability, (r) => `${r.gameId}|${r.playerId}|${r.asOfUtc}`),
    finalStatuses: sortBy(dataset.finalStatuses, (r) => `${r.gameId}|${r.playerId}`),
  });
}

export interface ManifestInputs {
  dataset: EvaluationDataset;
  use: DataUse;
  cutoffPolicy: CutoffPolicy;
  folds: readonly FoldSpec[];
  baselineParams: BaselineParams;
  minutesV1Params: MinutesV1Params;
  criteria: readonly AcceptanceCriterion[];
  /** The license record the gate was evaluated against. */
  license: SourceLicense;
}

export interface EvaluationManifest {
  schemaVersion: "nba-evaluation-manifest-v1";
  /** Hash of everything that defines the evaluation, none of its results. */
  manifestId: string;
  evidenceClass: "synthetic" | "real";
  /** Synthetic evidence demonstrates mechanisms only and never supports a real-world accuracy claim. */
  realDataEligible: boolean;
  models: Array<{ id: string; version: string; paramsSha256: string; params: unknown }>;
  dataset: {
    sourceId: string;
    provenance: EvaluationDataset["provenance"];
    contentSha256: string;
    counts: { playerRows: number; teamRows: number; scheduledGames: number; availabilityRecords: number; finalStatuses: number };
    licenseGate: { use: DataUse; permitted: true; status: SourceLicense["status"]; permittedUses: readonly DataUse[]; basis: string; reviewedOn: string };
  };
  /** Fixed framework choices (roster lookback, usage and availability constants, bins, segments). */
  framework: typeof FRAMEWORK_PARAMETERS;
  featureCutoff: { policy: CutoffPolicy; rule: string; first: string | null; last: string | null };
  windows: FoldSpec[];
  metrics: string[];
  acceptance: { criteria: AcceptanceCriterion[]; outcomes: AcceptanceOutcome[]; passed: boolean };
  resultsSha256: string;
}

const METRIC_NAMES = ["n", "mae", "medianAe", "bias", "rmse", "brier", "logLoss", "accuracy", "calibration"];
const CUTOFF_RULE = "features use games whose result was available (tipoff + resultLagMinutes) and snapshots current strictly before (tipoff - leadMinutes)";

export function buildManifest(inputs: ManifestInputs, body: ReportBody): EvaluationManifest {
  const { dataset } = inputs;
  const models = [
    ...(NAIVE_METHODS as readonly string[]).map((id) => ({ id, version: "naive-rolling-v1", params: { windows: { previous_game: 1, last_5: 5, last_10: 10, season_to_date: "season" }[id] } })),
    { id: "jkb_baseline_v0", version: BASELINE_MODEL_VERSION, params: inputs.baselineParams },
    // The participation prior is replaced by the training-window rate in every fold, so the configured value is not an input.
    { id: "jkb_minutes_v1", version: MINUTES_V1_MODEL_VERSION, params: { minutesV1: { ...inputs.minutesV1Params, participationPrior: "learned per fold from training window" }, rates: inputs.baselineParams } },
    ...AVAILABILITY_MODELS.map((id) => ({ id: `availability:${id}`, version: FRAMEWORK_PARAMETERS.version, params: FRAMEWORK_PARAMETERS.availability })),
  ].map((model) => ({ ...model, paramsSha256: sha256Json(model.params) }));
  const outcomes = evaluateAcceptance(inputs.criteria, body);
  const identity = {
    evidenceClass: dataset.sourceId === "synthetic" ? ("synthetic" as const) : ("real" as const),
    models,
    dataset: {
      sourceId: dataset.sourceId,
      provenance: dataset.provenance,
      contentSha256: datasetContentSha256(dataset),
      counts: {
        playerRows: dataset.playerGames.length,
        teamRows: dataset.teamGames.length,
        scheduledGames: dataset.schedule.length,
        availabilityRecords: dataset.availability.length,
        finalStatuses: dataset.finalStatuses.length,
      },
      licenseGate: {
        use: inputs.use,
        permitted: true as const,
        status: inputs.license.status,
        permittedUses: inputs.license.permittedUses,
        basis: inputs.license.basis,
        reviewedOn: inputs.license.reviewedOn,
      },
    },
    framework: FRAMEWORK_PARAMETERS,
    featureCutoff: { policy: inputs.cutoffPolicy, rule: CUTOFF_RULE, first: body.cutoffRange?.first ?? null, last: body.cutoffRange?.last ?? null },
    windows: [...inputs.folds],
    metrics: METRIC_NAMES,
    criteria: [...inputs.criteria],
    methods: [...CONDITIONAL_METHODS],
  };
  return {
    schemaVersion: "nba-evaluation-manifest-v1",
    manifestId: sha256Json(identity),
    evidenceClass: identity.evidenceClass,
    realDataEligible: identity.evidenceClass === "real",
    models,
    dataset: identity.dataset,
    framework: identity.framework,
    featureCutoff: identity.featureCutoff,
    windows: identity.windows,
    metrics: identity.metrics,
    acceptance: { criteria: identity.criteria, outcomes, passed: outcomes.every((o) => o.passed) },
    resultsSha256: sha256Json(roundDeep(body)),
  };
}

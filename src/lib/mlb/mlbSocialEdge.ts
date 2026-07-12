/**
 * ML Edges social-table transparency layer.
 *
 * The Moneyline Edge model (see mlbModelEdge.ts, computeModelEdge) produces
 * five weighted factors whose `weightedDifference` values sum EXACTLY to the
 * overall away-minus-home model differential. This module regroups those
 * factors for a transparent ML Edges table and defines a genuinely
 * recent-window Form Edge that is NOT drawn from the model's
 * season-contaminated internal "Recent Form" factor.
 *
 * ── Component model (what the table shows) ──────────────────────────────────
 *   Pitching Edge = Pitcher Quality factor                     (model)
 *   Batting Edge  = Matchup Edge + Lineup Offense factors       (model)
 *   Other         = Model Edge − Pitching − Batting             (residual)
 *                 = model's internal Recent Form factor + Season Quality.
 *   ⇒ Pitching + Batting + Other = Model Edge  (additive identity, tested)
 *
 *   Form Edge     = a SEPARATE, season-free recent-record differential
 *                   (2W = last 5 games, 4W = last 14 games). It is a
 *                   diagnostic lens on short-window results and is deliberately
 *                   NOT part of the additive identity above — the model's own
 *                   recent-form factor lives inside "Other".
 *
 * Why Form Edge is not the model's Recent Form factor: that factor is
 * 55% last-5-games + 45% home/away SEASON split, so it cannot honestly be
 * labeled "recent only". Season Quality is never discarded — it stays inside
 * the canonical Model Edge and is disclosed via "Other".
 *
 * PER MODEL AUDIT (see ML_EDGE_METHODOLOGY): the model produces no calibrated
 * win probability. The headline Model Edge is a factor-point advantage, NOT a
 * win-probability betting edge. The only probability surfaced is the two-sided
 * no-vig market implied probability — real market data, kept separate.
 */

import {
  getEdgeTierKey,
  getEdgeTierLabel,
  type EdgeTierKey,
  type ModelEdgeResult,
  type ModelFactor,
} from "@/lib/mlb/mlbModelEdge";

// ---------------------------------------------------------------------------
// Recent-form window
// ---------------------------------------------------------------------------

/**
 * Supported recent-form windows. These map to the two genuine recent-record
 * windows the data exposes (last 5 games / last 14 games), which approximate
 * ~2 and ~4 weeks of play. A true calendar 28-day W-L window does not exist in
 * the model's data contract, so 4W falls back to the last-14-games record; a
 * row with no such record renders N/A (never fabricated).
 */
export type FormWindow = "2w" | "4w";

/** Canonical default window for the deterministic social screenshot. */
export const DEFAULT_FORM_WINDOW: FormWindow = "2w";

export const FORM_WINDOW_LABELS: Record<FormWindow, string> = {
  "2w": "2W",
  "4w": "4W",
};

/** Human sentence describing exactly what each window measures. */
export const FORM_WINDOW_SOURCES: Record<FormWindow, string> = {
  "2w": "last 5 completed games",
  "4w": "last 14 completed games",
};

/**
 * Weight applied to the recent win% differential so Form Edge lands on the
 * same factor-point scale as the model's other component edges. Mirrors the
 * model's own Recent Form factor weight (0.15) for visual comparability.
 */
const FORM_SCALE_WEIGHT = 0.15;

// ---------------------------------------------------------------------------
// Component edges (regrouped model factors)
// ---------------------------------------------------------------------------

const COMPONENT_FACTORS = {
  pitching: ["Pitcher Quality"],
  batting: ["Matchup Edge", "Lineup Offense"],
} as const;

export type ComponentEdges = {
  /** Selected team's starting-pitching factor advantage (points), or null. */
  pitching: number | null;
  /** Selected team's lineup/offense factor advantage (points), or null. */
  batting: number | null;
  /**
   * Residual model contribution not shown as its own column
   * (= model's internal recent-form factor + season quality), points.
   */
  other: number;
  /** Overall model edge for the pick (points) = pitching + batting + other. */
  overall: number;
};

function sumWeightedDifference(factors: ModelFactor[], labels: readonly string[]): number {
  return labels.reduce((total, label) => {
    const factor = factors.find((f) => f.label === label);
    return total + (factor ? factor.weightedDifference : 0);
  }, 0);
}

/** True when a factor group has at least one real (present) factor. */
function hasFactor(factors: ModelFactor[], labels: readonly string[]): boolean {
  return labels.some((label) => factors.some((f) => f.label === label));
}

/**
 * Regroup a model result into displayed component edges, oriented so a POSITIVE
 * value favors the selected team. `weightedDifference` is (away − home) × weight,
 * so a home pick flips the sign. Pushes have no selected side and should not be
 * shown as component rows.
 *
 * Pitching/Batting return null only when the underlying model factors are
 * entirely absent (never coerced to 0). `other` is a residual so the additive
 * identity Pitching + Batting + Other = Model Edge always holds for the pick.
 */
export function getComponentEdges(edge: ModelEdgeResult): ComponentEdges {
  const orient = edge.pick === "home" ? -1 : 1;
  const overall = orient * edge.factors.reduce((s, f) => s + f.weightedDifference, 0);

  const pitching = hasFactor(edge.factors, COMPONENT_FACTORS.pitching)
    ? orient * sumWeightedDifference(edge.factors, COMPONENT_FACTORS.pitching)
    : null;
  const batting = hasFactor(edge.factors, COMPONENT_FACTORS.batting)
    ? orient * sumWeightedDifference(edge.factors, COMPONENT_FACTORS.batting)
    : null;

  // Residual = everything not surfaced as its own column. Uses 0 for a missing
  // covered group so the identity still closes on the model's real total.
  const other = overall - (pitching ?? 0) - (batting ?? 0);

  return { pitching, batting, other, overall };
}

// ---------------------------------------------------------------------------
// Form Edge — genuine recent-window record differential (season-free)
// ---------------------------------------------------------------------------

/** Parse "W-L" → win fraction, or null when there are no games / it is invalid. */
export function parseRecordWinPct(record: string | null | undefined): number | null {
  if (!record) return null;
  const cleaned = record.replace(/[^0-9-]/g, "");
  const [w, l] = cleaned.split("-").map((n) => Number(n));
  if (!Number.isFinite(w) || !Number.isFinite(l)) return null;
  const games = w + l;
  if (games <= 0) return null;
  return w / games;
}

/**
 * Recent-form edge (points) for the selected team = (pickWin% − oppWin%) over
 * the chosen window, scaled to the component-edge point range. Returns null if
 * either side's recent record is missing/unparseable for that window — the
 * table then shows N/A rather than a fabricated 0.
 */
export function getFormEdge(
  pickRecord: string | null | undefined,
  oppRecord: string | null | undefined,
): number | null {
  const pick = parseRecordWinPct(pickRecord);
  const opp = parseRecordWinPct(oppRecord);
  if (pick == null || opp == null) return null;
  return (pick - opp) * 100 * FORM_SCALE_WEIGHT;
}

// ---------------------------------------------------------------------------
// Display bands / grade / null-safe formatting
// ---------------------------------------------------------------------------

export type ComponentBandKey = "strong" | "edge" | "even" | "against";

export function getComponentBand(value: number): {
  key: ComponentBandKey;
  label: string;
  color: string;
} {
  if (value >= 3.5) return { key: "strong", label: "Advantage", color: "#34d399" };
  if (value >= 1) return { key: "edge", label: "Slight edge", color: "#a3e635" };
  if (value > -1) return { key: "even", label: "Even", color: "#64748b" };
  return { key: "against", label: "Opp edge", color: "#f87171" };
}

export function getEdgeGrade(confidence: number): {
  key: EdgeTierKey;
  label: string;
  bg: string;
  text: string;
} {
  const key = getEdgeTierKey(confidence);
  const label = getEdgeTierLabel(confidence);
  if (key === "strong") return { key, label, bg: "#16a34a", text: "#ffffff" };
  if (key === "moderate") return { key, label, bg: "#22c55e", text: "#ffffff" };
  if (key === "slight") return { key, label, bg: "#facc15", text: "#000000" };
  return { key, label, bg: "#475569", text: "#ffffff" };
}

/** The single string every surface shows for missing/unverifiable data. */
export const NA_LABEL = "N/A";

/**
 * Shared null-safe signed-points formatter (e.g. "+4.2", "-1.1", "N/A").
 * Missing data is NEVER coerced to 0/Even/Neutral.
 */
export function formatEdgePoints(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA_LABEL;
  const rounded = Math.round(value * 10) / 10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded; // no "-0.0"
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1)}`;
}

/** Shared null-safe percentage formatter for market probabilities. */
export function formatMarketPct(prob: number | null | undefined): string {
  if (prob == null || !Number.isFinite(prob)) return NA_LABEL;
  return `${Math.round(prob * 100)}%`;
}

// ---------------------------------------------------------------------------
// Market probability (real market data — kept separate from the model)
// ---------------------------------------------------------------------------

export function americanToImpliedProbability(american: string | number | null | undefined): number | null {
  if (american == null || american === "") return null;
  const n = typeof american === "number" ? american : parseFloat(american);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

/**
 * No-vig implied probability for the selected side, from a two-sided market:
 *   noVig(pick) = pickImplied / (pickImplied + oppImplied)
 * Returns null if either side is missing (fails safe — never presents a
 * one-sided vig-loaded number as fair) or inputs are invalid.
 */
export function noVigProbability(
  pickImplied: number | null | undefined,
  oppImplied: number | null | undefined,
): number | null {
  if (pickImplied == null || oppImplied == null) return null;
  if (!Number.isFinite(pickImplied) || !Number.isFinite(oppImplied)) return null;
  const sum = pickImplied + oppImplied;
  if (sum <= 0) return null;
  const result = pickImplied / sum;
  return Number.isFinite(result) ? result : null;
}

// ---------------------------------------------------------------------------
// Missing-data policy: weight renormalization + completeness gate
// ---------------------------------------------------------------------------

/**
 * Display-group weights (mirror the model's grouped factor weights, summing to
 * 1.0). Pitching = Pitcher Quality (.30); Batting = Matchup (.25) + Lineup (.20)
 * = .45; Form = Recent Form (.15); Season = Season Quality (.10).
 *
 * NOTE ON CANONICAL POLICY: the production model (computeModelEdge) neutral-
 * fills missing inputs (50 / 0.5 win%) and does NOT renormalize — it always
 * produces a value. This module does not override that for the Model Edge
 * number. Renormalization here powers the DISPLAY-LEVEL completeness gate and
 * confidence indicator only, so a too-sparse row can render Model Edge = N/A
 * instead of a neutral-fill guess.
 */
export const MODEL_GROUP_WEIGHTS: Record<"pitching" | "batting" | "form" | "season", number> = {
  pitching: 0.30,
  batting: 0.45,
  form: 0.15,
  season: 0.10,
};

/**
 * Renormalize the weights of the groups that are present so they sum to 1.0,
 * preserving their relative proportions. Absent groups contribute nothing
 * (they are excluded, never treated as zero-valued measurements). Returns an
 * empty object when no group is present.
 */
export function renormalizeWeights(
  present: Partial<Record<keyof typeof MODEL_GROUP_WEIGHTS, boolean>>,
): Partial<Record<keyof typeof MODEL_GROUP_WEIGHTS, number>> {
  const keys = (Object.keys(MODEL_GROUP_WEIGHTS) as Array<keyof typeof MODEL_GROUP_WEIGHTS>)
    .filter((k) => present[k]);
  const total = keys.reduce((s, k) => s + MODEL_GROUP_WEIGHTS[k], 0);
  if (total <= 0) return {};
  const out: Partial<Record<keyof typeof MODEL_GROUP_WEIGHTS, number>> = {};
  for (const k of keys) out[k] = MODEL_GROUP_WEIGHTS[k] / total;
  return out;
}

export type CompletenessInput = {
  hasIdentity: boolean; // teams + pick present
  hasPitching: boolean;
  hasBatting: boolean;
  hasForm: boolean;
  hasSeason: boolean;
};

export type Completeness = {
  ok: boolean;
  weightAvailable: number; // 0–1, fraction of total model weight present
  primaryGroupsPresent: number; // of pitching/batting/form
};

/** Minimum fraction of total model weight required to trust the Model Edge. */
export const MIN_WEIGHT_AVAILABLE = 0.70;
/** Minimum number of the three primary component groups required. */
export const MIN_PRIMARY_GROUPS = 2;

/**
 * Deterministic completeness gate: core identity required, at least
 * MIN_PRIMARY_GROUPS of the three primary groups (pitching/batting/form)
 * present, and at least MIN_WEIGHT_AVAILABLE of total model weight available.
 * Fails closed → the caller renders Model Edge (and grade) as N/A.
 */
export function computeCompleteness(input: CompletenessInput): Completeness {
  const present = {
    pitching: input.hasPitching,
    batting: input.hasBatting,
    form: input.hasForm,
    season: input.hasSeason,
  };
  const weightAvailable = (Object.keys(MODEL_GROUP_WEIGHTS) as Array<keyof typeof MODEL_GROUP_WEIGHTS>)
    .reduce((s, k) => s + (present[k] ? MODEL_GROUP_WEIGHTS[k] : 0), 0);
  const primaryGroupsPresent = [input.hasPitching, input.hasBatting, input.hasForm].filter(Boolean).length;
  const ok =
    input.hasIdentity &&
    primaryGroupsPresent >= MIN_PRIMARY_GROUPS &&
    weightAvailable >= MIN_WEIGHT_AVAILABLE - 1e-9;
  return { ok, weightAvailable, primaryGroupsPresent };
}

// ---------------------------------------------------------------------------
// Primary reason (one concise, data-derived note; window-aware)
// ---------------------------------------------------------------------------

/**
 * Build a single concise reason for the lean. Only metrics that actually exist
 * can generate text — an N/A metric never produces a narrative. The recent-form
 * driver is labeled with the active window and never conflates season quality.
 */
export function buildPrimaryReason(args: {
  pitching: number | null;
  batting: number | null;
  form: number | null;
  formWindow: FormWindow;
  pickTeam: string;
  context?: string | null;
}): string | null {
  const { pitching, batting, form, formWindow, pickTeam, context } = args;
  const candidates: Array<{ label: string; value: number; kind: "pitch" | "bat" | "form" }> = [];
  if (pitching != null) candidates.push({ label: "Starter", value: pitching, kind: "pitch" });
  if (batting != null) candidates.push({ label: "Lineup", value: batting, kind: "bat" });
  if (form != null) candidates.push({ label: "Form", value: form, kind: "form" });

  if (candidates.length === 0) return context ?? null;

  const strongest = candidates.reduce((best, c) => (Math.abs(c.value) > Math.abs(best.value) ? c : best));
  if (Math.abs(strongest.value) < 1) return context ?? null;

  const windowLabel = FORM_WINDOW_LABELS[formWindow];
  const positives = candidates.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  // Strongest signal favors the opponent but another positive carries the lean.
  if (strongest.value < 0 && positives.length > 0) {
    const carrier = positives[0];
    if (carrier.kind === "form") return `Recent ${windowLabel} form offsets a weaker ${strongest.label.toLowerCase()}`;
    return `${carrier.label} edge offsets weaker ${strongest.label.toLowerCase()}`;
  }

  const driver = strongest.value > 0 ? strongest : positives[0];
  if (!driver) return context ?? null;
  if (driver.kind === "pitch") return "Starter advantage drives the lean";
  if (driver.kind === "bat") return "Lineup edge drives the lean";
  return `Recent ${windowLabel} form favors ${pickTeam}`;
}

// ---------------------------------------------------------------------------
// Data contract
// ---------------------------------------------------------------------------

/**
 * One row of the ML Edges social table. Missing values are preserved as null
 * (never fabricated as 0). There is no `mlEdgePercent`/`modelWinProbability`:
 * the model is uncalibrated (see module header).
 */
export type MlSocialRow = {
  gamePk: number;
  awayAbbr: string;
  homeAbbr: string;
  awayPitcher: string | null;
  homePitcher: string | null;
  gameTime: string;

  selectedTeam: string;
  fadeTeam: string;
  selectedAmerican: string | null;

  /** Overall model edge (points), or null when completeness fails. */
  modelEdgePoints: number | null;
  /** Uncalibrated edge-strength index (50–82) that drives the grade. */
  confidence: number;
  /** Fraction of model weight available (0–1). */
  completeness: number;

  pitchingEdge: number | null;
  battingEdge: number | null;
  /** Genuine recent-window record edge for the ACTIVE window (points), or null. */
  formEdge: number | null;
  formWindow: FormWindow;
  /** Residual model contribution (season + internal recent form), points. */
  otherEdge: number | null;

  marketImpliedProbability: number | null;
  noVigMarketProbability: number | null;

  polymarketYes: number | null;
  polymarketNo: number | null;

  /** Grade label, or null when Model Edge is N/A. */
  grade: string | null;
  primaryReason: string | null;
};

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Deterministic ordering:
 *   1. Rows with a valid Model Edge before N/A rows.
 *   2. Model Edge (points) descending.
 *   3. confidence descending.
 *   4. selected team abbreviation ascending.
 *   5. gamePk ascending.
 */
export function compareMlSocialRows(a: MlSocialRow, b: MlSocialRow): number {
  const aValid = a.modelEdgePoints != null;
  const bValid = b.modelEdgePoints != null;
  if (aValid !== bValid) return aValid ? -1 : 1;
  if (aValid && bValid && b.modelEdgePoints! !== a.modelEdgePoints!) {
    return b.modelEdgePoints! - a.modelEdgePoints!;
  }
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  if (a.selectedTeam !== b.selectedTeam) return a.selectedTeam < b.selectedTeam ? -1 : 1;
  return a.gamePk - b.gamePk;
}

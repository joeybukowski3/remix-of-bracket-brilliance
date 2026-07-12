/**
 * ML Edges social-table transparency layer.
 *
 * The canonical Moneyline Edge model (mlbModelEdge.ts, computeModelEdge)
 * produces five weighted factors whose `weightedDifference` values sum EXACTLY
 * to the overall away-minus-home model differential. This module:
 *
 *   1. Regroups those factors into four displayed, additive canonical drivers:
 *        Pitching   = Pitcher Quality factor
 *        Batting    = Matchup Edge + Lineup Offense factors
 *        Model Form = Recent Form factor       (internal to the JKB model)
 *        Season     = Season Quality factor
 *      ⇒ Pitching + Batting + Model Form + Season = canonical Model Edge.
 *
 *   2. Defines a SEPARATE recent-record diagnostic ("Recent Form L5/L14") from
 *      completed-game records. It is season-free, NOT one of the canonical
 *      model's factor contributions, and is deliberately excluded from the
 *      additive identity above.
 *
 *   3. Establishes factor-availability provenance from the SOURCE data. The
 *      canonical model neutral-fills missing inputs (eraScore(null)=50, empty
 *      record → 0.5 win%) and always emits all five factors, so a factor's
 *      weightedDifference of ~0 can be a real measured tie OR a neutral fill —
 *      the ModelEdgeResult alone cannot tell them apart. Missingness is
 *      therefore derived from whether the underlying detail fields exist.
 *
 *   4. Computes a display edge that equals the canonical edge when all factors
 *      are available, an "Adjusted Model Edge" (valid factors renormalized)
 *      when some are genuinely unavailable, or N/A below a completeness gate.
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
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

// ---------------------------------------------------------------------------
// Recent-record window (game-count windows — NOT calendar weeks)
// ---------------------------------------------------------------------------

/**
 * Recent-record windows. These are game-count windows exposed by the data:
 * L5 = last 5 completed games, L14 = last 14 completed games. They are NOT
 * 2-week / 4-week calendar windows — a true 14-day / 28-day W-L window is a
 * separate future enhancement. A window with no parseable record renders N/A.
 */
export type FormWindow = "l5" | "l14";

/** Canonical default window for the deterministic social screenshot/export. */
export const DEFAULT_FORM_WINDOW: FormWindow = "l5";

export const FORM_WINDOW_LABELS: Record<FormWindow, string> = {
  l5: "L5",
  l14: "L14",
};

/** Short source phrase (footer / inline). */
export const FORM_WINDOW_SOURCES: Record<FormWindow, string> = {
  l5: "last 5 completed games",
  l14: "last 14 completed games",
};

/** Full accessible/tooltip description. */
export const FORM_WINDOW_LONG: Record<FormWindow, string> = {
  l5: "Last 5 completed games",
  l14: "Last 14 completed games",
};

/**
 * Weight applied to the recent win% differential so the recent-record
 * diagnostic lands on the same factor-point scale as the canonical component
 * edges (mirrors the model's Recent Form weight, 0.15, for comparability).
 */
const FORM_SCALE_WEIGHT = 0.15;

// ---------------------------------------------------------------------------
// Canonical group weights
// ---------------------------------------------------------------------------

export type CanonicalGroup = "pitching" | "batting" | "modelForm" | "season";

/**
 * Grouped canonical factor weights (sum to 1.0): Pitching = Pitcher Quality
 * (.30); Batting = Matchup (.25) + Lineup Offense (.20) = .45; Model Form =
 * Recent Form (.15); Season = Season Quality (.10).
 */
export const MODEL_GROUP_WEIGHTS: Record<CanonicalGroup, number> = {
  pitching: 0.30,
  batting: 0.45,
  modelForm: 0.15,
  season: 0.10,
};

/** Primary (higher-weight performance) groups for the completeness gate. */
export const PRIMARY_GROUPS: CanonicalGroup[] = ["pitching", "batting", "modelForm"];

const GROUP_FACTOR_LABELS: Record<CanonicalGroup, readonly string[]> = {
  pitching: ["Pitcher Quality"],
  batting: ["Matchup Edge", "Lineup Offense"],
  modelForm: ["Recent Form"],
  season: ["Season Quality"],
};

// ---------------------------------------------------------------------------
// Factor availability provenance (distinguishes measured-zero from missing)
// ---------------------------------------------------------------------------

export type FactorAvailability = {
  /** True when the group can be used (its real source fields are present). */
  available: boolean;
  /** True when the underlying source fields exist (not neutral-filled). */
  sourceFieldsPresent: boolean;
  /** True when some sub-inputs were absent and the model fell back to neutral. */
  usedFallback: boolean;
  reason?: string;
};

export type GroupAvailability = Record<CanonicalGroup, FactorAvailability>;

function isNum(v: unknown): boolean {
  if (v == null || v === "") return false;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n);
}

/**
 * Derive per-group availability from the SOURCE detail fields — NOT from the
 * (always-populated, neutral-filled) ModelEdgeResult. A group is unavailable
 * only when its real inputs are absent; a present-but-zero value stays a real
 * measured zero.
 */
export function getFactorAvailability(detail: MlbGameDetail): GroupAvailability {
  const aw = detail?.starters?.away;
  const hw = detail?.starters?.home;
  const awayPitch = isNum(aw?.era) || isNum(aw?.strikeOuts) || isNum(aw?.inningsPitched);
  const homePitch = isNum(hw?.era) || isNum(hw?.strikeOuts) || isNum(hw?.inningsPitched);
  const pitching: FactorAvailability = {
    available: awayPitch && homePitch,
    sourceFieldsPresent: awayPitch && homePitch,
    usedFallback: !(isNum(aw?.era) && isNum(hw?.era)),
    reason: awayPitch && homePitch ? undefined : "starter stats missing",
  };

  const awayBat = isNum(detail?.lineupSummaries?.away?.ops);
  const homeBat = isNum(detail?.lineupSummaries?.home?.ops);
  const splitsPresent = isNum(detail?.opponentSplits?.awayBattingVsHomeStarter?.ops)
    || isNum(detail?.opponentSplits?.homeBattingVsAwayStarter?.ops);
  const batting: FactorAvailability = {
    available: awayBat && homeBat,
    sourceFieldsPresent: awayBat && homeBat,
    usedFallback: !splitsPresent,
    reason: awayBat && homeBat ? undefined : "lineup summaries missing",
  };

  const awayForm = parseRecordWinPct(detail?.awayContext?.lastFiveRecord) != null;
  const homeForm = parseRecordWinPct(detail?.homeContext?.lastFiveRecord) != null;
  const modelForm: FactorAvailability = {
    available: awayForm && homeForm,
    sourceFieldsPresent: awayForm && homeForm,
    usedFallback: false,
    reason: awayForm && homeForm ? undefined : "recent record missing",
  };

  const awaySzn = parseRecordWinPct(detail?.game?.away?.record) != null;
  const homeSzn = parseRecordWinPct(detail?.game?.home?.record) != null;
  const season: FactorAvailability = {
    available: awaySzn && homeSzn,
    sourceFieldsPresent: awaySzn && homeSzn,
    usedFallback: false,
    reason: awaySzn && homeSzn ? undefined : "season record missing",
  };

  return { pitching, batting, modelForm, season };
}

// ---------------------------------------------------------------------------
// Canonical component decomposition (additive)
// ---------------------------------------------------------------------------

export type ComponentEdges = {
  /** Selected team's Pitcher-Quality factor advantage (points). */
  pitching: number;
  /** Selected team's Matchup + Lineup-Offense advantage (points). */
  batting: number;
  /** Selected team's internal Recent-Form factor advantage (points). */
  modelForm: number;
  /** Selected team's Season-Quality factor advantage (points). */
  season: number;
  /** Canonical Model Edge for the pick (points) = the four groups summed. */
  overall: number;
};

function sumWeightedDifference(factors: ModelFactor[], labels: readonly string[]): number {
  return labels.reduce((total, label) => {
    const factor = factors.find((f) => f.label === label);
    return total + (factor ? factor.weightedDifference : 0);
  }, 0);
}

/**
 * Regroup a model result into the four canonical component edges, oriented so a
 * POSITIVE value favors the selected team. `weightedDifference` is
 * (away − home) × weight, so a home pick flips the sign. These four are the
 * full factor decomposition and are additive: their sum is the canonical Model
 * Edge for the pick. (Pushes have no selected side.)
 */
export function getComponentEdges(edge: ModelEdgeResult): ComponentEdges {
  const orient = edge.pick === "home" ? -1 : 1;
  const pitching = orient * sumWeightedDifference(edge.factors, GROUP_FACTOR_LABELS.pitching);
  const batting = orient * sumWeightedDifference(edge.factors, GROUP_FACTOR_LABELS.batting);
  const modelForm = orient * sumWeightedDifference(edge.factors, GROUP_FACTOR_LABELS.modelForm);
  const season = orient * sumWeightedDifference(edge.factors, GROUP_FACTOR_LABELS.season);
  return { pitching, batting, modelForm, season, overall: pitching + batting + modelForm + season };
}

// ---------------------------------------------------------------------------
// Displayed edge: canonical (complete) | adjusted (partial) | N/A (insufficient)
// ---------------------------------------------------------------------------

/** Minimum fraction of total canonical weight required to trust the edge. */
export const MIN_WEIGHT_AVAILABLE = 0.70;
/** Minimum number of the primary groups (pitching/batting/modelForm) required. */
export const MIN_PRIMARY_GROUPS = 2;

export type DisplayedEdge = {
  /** Canonical Model Edge (points) — full model, always computable. */
  canonical: number;
  /** What the table shows: canonical if complete, adjusted if partial, else null. */
  displayed: number | null;
  /** True when `displayed` used renormalization over a subset of factors. */
  adjusted: boolean;
  /** Fraction of canonical weight available (0–1). */
  weightAvailable: number;
  /** Count of primary groups present. */
  primaryGroupsPresent: number;
  /** Passes the completeness gate. */
  ok: boolean;
  /** Per-group display values: null when the group is unavailable. */
  components: Record<CanonicalGroup, number | null>;
};

/**
 * Compute the displayed edge from the canonical decomposition + source
 * availability.
 *
 *  • All four groups available → displayed === canonical exactly (no recompute).
 *  • Some groups unavailable but the completeness gate passes → Adjusted Model
 *    Edge: exclude unavailable groups and renormalize valid weights.
 *        adjusted = Σ(available weightedContribution) / Σ(available weight)
 *    which equals Σ rawDiffᵢ × (weightᵢ / availableWeight) since a stored
 *    weightedDifference already equals rawDiffᵢ × weightᵢ.
 *  • Below the gate → displayed = null (N/A). Unavailable factors are EXCLUDED,
 *    never substituted with 0 / neutral / league average.
 */
export function computeDisplayedEdge(edge: ModelEdgeResult, availability: GroupAvailability): DisplayedEdge {
  const c = getComponentEdges(edge);
  const rawByGroup: Record<CanonicalGroup, number> = {
    pitching: c.pitching,
    batting: c.batting,
    modelForm: c.modelForm,
    season: c.season,
  };

  const groups = Object.keys(MODEL_GROUP_WEIGHTS) as CanonicalGroup[];
  const present = Object.fromEntries(groups.map((g) => [g, availability[g].available])) as Record<CanonicalGroup, boolean>;

  const components = Object.fromEntries(
    groups.map((g) => [g, present[g] ? rawByGroup[g] : null]),
  ) as Record<CanonicalGroup, number | null>;

  const weightAvailable = groups.reduce((s, g) => s + (present[g] ? MODEL_GROUP_WEIGHTS[g] : 0), 0);
  const primaryGroupsPresent = PRIMARY_GROUPS.filter((g) => present[g]).length;
  const allPresent = groups.every((g) => present[g]);
  const ok = primaryGroupsPresent >= MIN_PRIMARY_GROUPS && weightAvailable >= MIN_WEIGHT_AVAILABLE - 1e-9;

  let displayed: number | null = null;
  let adjusted = false;
  if (ok) {
    if (allPresent) {
      // Guarantee the complete-row identity: displayed === canonical exactly.
      displayed = c.overall;
      adjusted = false;
    } else {
      const availWeight = groups.reduce((s, g) => s + (present[g] ? MODEL_GROUP_WEIGHTS[g] : 0), 0);
      const availContrib = groups.reduce((s, g) => s + (present[g] ? rawByGroup[g] : 0), 0);
      displayed = availWeight > 0 ? availContrib / availWeight : null;
      adjusted = displayed != null;
    }
  }

  return { canonical: c.overall, displayed, adjusted, weightAvailable, primaryGroupsPresent, ok, components };
}

// ---------------------------------------------------------------------------
// Recent-record diagnostic (season-free; NOT a canonical factor)
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
 * Recent-record diagnostic (points) for the selected team =
 * (pickWin% − oppWin%) over the chosen completed-game window, scaled to the
 * component-point range. Returns null (→ N/A) if either side's record is
 * missing/unparseable — never a fabricated 0. This is a season-free diagnostic
 * and is NOT part of the canonical Model Edge.
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

/**
 * Confidence index (50–82) for a given edge magnitude, mirroring the canonical
 * model's own mapping so a complete row's grade matches the model, and an
 * adjusted row's grade is derived consistently from its displayed edge.
 */
export function confidenceForEdgePoints(absPoints: number): number {
  return Math.round(Math.min(82, 52 + (Math.abs(absPoints) / 5) * 4));
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
 * A real measured zero renders "0.0"; only null/NaN render "N/A". Missing data
 * is NEVER coerced to 0/Even/Neutral.
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
// Weight renormalization (used by computeDisplayedEdge; exported for tests)
// ---------------------------------------------------------------------------

/**
 * Renormalize the weights of the groups that are present so they sum to 1.0,
 * preserving their relative proportions. Absent groups are EXCLUDED (never
 * treated as zero-valued measurements). Returns {} when nothing is present.
 */
export function renormalizeWeights(
  present: Partial<Record<CanonicalGroup, boolean>>,
): Partial<Record<CanonicalGroup, number>> {
  const keys = (Object.keys(MODEL_GROUP_WEIGHTS) as CanonicalGroup[]).filter((k) => present[k]);
  const total = keys.reduce((s, k) => s + MODEL_GROUP_WEIGHTS[k], 0);
  if (total <= 0) return {};
  const out: Partial<Record<CanonicalGroup, number>> = {};
  for (const k of keys) out[k] = MODEL_GROUP_WEIGHTS[k] / total;
  return out;
}

// ---------------------------------------------------------------------------
// Primary reason (window-aware; canonical drivers kept distinct from record)
// ---------------------------------------------------------------------------

/**
 * Build one concise reason. Canonical model-driver reasons (pitching/batting/
 * model form/season) are kept distinct from the recent-record diagnostic. Only
 * available metrics can generate text; an N/A metric never produces a
 * narrative, and a fallback-only value is not used.
 */
export function buildPrimaryReason(args: {
  pitching: number | null;
  batting: number | null;
  modelForm: number | null;
  season: number | null;
  formEdge: number | null;
  formWindow: FormWindow;
  pickTeam: string;
  context?: string | null;
}): string | null {
  const { pitching, batting, modelForm, season, formEdge, formWindow, pickTeam, context } = args;

  const canonical: Array<{ value: number; text: string }> = [];
  if (pitching != null) canonical.push({ value: pitching, text: "Starting pitching drives the model edge" });
  if (batting != null) canonical.push({ value: batting, text: `Lineup matchup favors ${pickTeam}` });
  if (modelForm != null) canonical.push({ value: modelForm, text: `Internal model form favors ${pickTeam}` });
  if (season != null) canonical.push({ value: season, text: `Season quality supports ${pickTeam}` });

  // Strongest canonical driver that favors the pick.
  const driver = canonical
    .filter((c) => c.value >= 1)
    .sort((a, b) => b.value - a.value)[0];
  if (driver) return driver.text;

  // No strong canonical driver: fall back to the recent-record diagnostic,
  // kept explicitly distinct from model-driver language.
  if (formEdge != null && formEdge >= 1) {
    return `Recent ${FORM_WINDOW_LABELS[formWindow]} record favors ${pickTeam}`;
  }

  return context ?? null;
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

  /** Displayed edge (points): canonical if complete, adjusted if partial, else null. */
  modelEdgePoints: number | null;
  /** Canonical edge (points) for reference; null only if the pick is a push. */
  canonicalEdgePoints: number | null;
  /** True when `modelEdgePoints` is a renormalized adjusted edge. */
  isAdjusted: boolean;
  /** Confidence index (50–82) derived from the DISPLAYED edge (drives grade/color). */
  confidence: number;
  /** Fraction of canonical weight available (0–1). */
  completeness: number;

  /** Canonical additive drivers (null when the group's source data is unavailable). */
  pitchingEdge: number | null;
  battingEdge: number | null;
  modelFormEdge: number | null;
  seasonEdge: number | null;

  /** Recent-record diagnostic for the ACTIVE window (points), or null. Not additive. */
  formEdge: number | null;
  formWindow: FormWindow;

  marketImpliedProbability: number | null;
  noVigMarketProbability: number | null;

  polymarketYes: number | null;
  polymarketNo: number | null;

  /** Grade label, or null when the displayed Model Edge is N/A. */
  grade: string | null;
  primaryReason: string | null;
};

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Deterministic ordering:
 *   1. Rows with a valid displayed Model Edge (canonical OR adjusted) before N/A.
 *   2. Displayed Model Edge (points) descending.
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

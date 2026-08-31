/**
 * Shared 8-tier percentile color scale for comparative MLB table cells, and the
 * site-wide source of truth for JKB Heat goodness fills: gold (elite) → emerald
 * (favorable) → neutral slate (mid) → red (unfavorable). Direction is always
 * favorable-percentile based (KS-010); this is not a hot/cold scale — the
 * sanctioned red-hot / blue-cold palette is `MlbStatTone` in mlbDisplayHelpers.
 * Deterministic pure helpers — no React dependency.
 */

export type PercentileDirection = "higherBetter" | "lowerBetter";

export type PercentileTierId =
  | "elite"
  | "excellent"
  | "great"
  | "aboveAverage"
  | "average"
  | "belowAverage"
  | "weak"
  | "poor";

/** How trustworthy the sample is for strong visual emphasis. */
export type SampleConfidence = "qualified" | "small-sample" | "sample-unavailable";

export type PercentileTierStyle = {
  backgroundColor: string;
  color: string;
  border: string;
};

export type PercentileTier = {
  id: PercentileTierId;
  /** Concise legend label */
  label: string;
  /** Inclusive lower bound of favorable percentile (0–100) after direction mapping */
  minFavorablePercentile: number;
  style: PercentileTierStyle;
};

export type PercentileDisplayResult = {
  tier: PercentileTier | null;
  confidence: SampleConfidence | null;
  /** Resolved cell style (already muted/capped when needed). */
  style: PercentileTierStyle | null;
};

/**
 * Sample floors for strong (non-neutral) percentile coloring.
 * Missing sample fields never coerce to zero.
 */
export const SAMPLE_MINIMUMS = {
  /** Nearest validated sample for xBA / Hard Hit% / Barrel% (BBE → AB → PA). */
  contactQuality: 20,
  /** Season rate metrics (PA when available; AB as nearest fallback). */
  seasonRate: 30,
  /** Batter-vs-pitcher rate coloring (PA or AB). */
  bvpRate: 5,
} as const;

/** Strongest tier allowed when metric is valid but sample count is unavailable. */
export const SAMPLE_UNAVAILABLE_MAX_TIER_ID: PercentileTierId = "great";

/**
 * Ordered high → low favorable. Used by cells and legend (same source of truth).
 *
 * Favorable percentile bands (after direction mapping):
 * >=98 Elite Gold, >=95 Excellent, >=80 Great, >=60 Above Average,
 * >=40 Average, >=25 Below Average, >=10 Weak, <10 Poor.
 */
export const PERCENTILE_TIERS: readonly PercentileTier[] = [
  {
    id: "elite",
    label: "Elite",
    minFavorablePercentile: 98,
    style: {
      // Warm muted gold — not neon yellow/orange
      backgroundColor: "#e8d5a8",
      color: "#5c3d0e",
      border: "1px solid rgba(146, 112, 42, 0.45)",
    },
  },
  {
    id: "excellent",
    label: "Excellent",
    minFavorablePercentile: 95,
    style: {
      backgroundColor: "#047857",
      color: "#ffffff",
      border: "1px solid rgba(4, 120, 87, 0.35)",
    },
  },
  {
    id: "great",
    label: "Great",
    minFavorablePercentile: 80,
    style: {
      backgroundColor: "#10b981",
      color: "#ffffff",
      border: "1px solid rgba(16, 185, 129, 0.3)",
    },
  },
  {
    id: "aboveAverage",
    label: "Above Average",
    minFavorablePercentile: 60,
    style: {
      backgroundColor: "rgba(34, 197, 94, 0.22)",
      color: "#166534",
      border: "1px solid rgba(22, 163, 74, 0.2)",
    },
  },
  {
    id: "average",
    label: "Average",
    minFavorablePercentile: 40,
    style: {
      backgroundColor: "rgba(148, 163, 184, 0.16)",
      color: "#475569",
      border: "1px solid rgba(148, 163, 184, 0.22)",
    },
  },
  {
    id: "belowAverage",
    label: "Below Average",
    minFavorablePercentile: 25,
    style: {
      // Soft red wash — unfavorable is red, not blue (KS-010 / TABLE_CONVENTIONS D)
      backgroundColor: "rgba(251, 113, 133, 0.18)",
      color: "#9f1239",
      border: "1px solid rgba(244, 63, 94, 0.22)",
    },
  },
  {
    id: "weak",
    label: "Weak",
    minFavorablePercentile: 10,
    style: {
      backgroundColor: "rgba(239, 68, 68, 0.38)",
      color: "#7f1d1d",
      border: "1px solid rgba(220, 38, 38, 0.32)",
    },
  },
  {
    id: "poor",
    label: "Poor",
    minFavorablePercentile: 0,
    style: {
      backgroundColor: "#dc2626",
      color: "#ffffff",
      border: "1px solid rgba(153, 27, 27, 0.45)",
    },
  },
] as const;

const TIER_BY_ID = Object.fromEntries(PERCENTILE_TIERS.map((t) => [t.id, t])) as Record<
  PercentileTierId,
  PercentileTier
>;

/** Legend order matches visual ranking: Elite → Poor */
export const PERCENTILE_TIER_LEGEND = PERCENTILE_TIERS.map((tier) => ({
  id: tier.id,
  label: tier.label,
  style: tier.style,
  minFavorablePercentile: tier.minFavorablePercentile,
}));

/** Known-small-sample: value visible, no Elite/Excellent, very subtle neutral tint. */
export const SMALL_SAMPLE_STYLE: PercentileTierStyle = {
  backgroundColor: "rgba(148, 163, 184, 0.10)",
  color: "#475569",
  border: "1px solid rgba(148, 163, 184, 0.14)",
};

/**
 * Map a 0–100 percentile (higher = larger raw value) to a visual tier.
 * For lower-is-better metrics, favorable direction is inverted (100 − p).
 */
export function getPercentileTier(
  percentile: number | null | undefined,
  direction: PercentileDirection = "higherBetter",
): PercentileTier | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  const raw = Math.min(100, Math.max(0, percentile));
  const favorable = direction === "higherBetter" ? raw : 100 - raw;

  for (const tier of PERCENTILE_TIERS) {
    if (favorable >= tier.minFavorablePercentile) return tier;
  }
  return PERCENTILE_TIERS[PERCENTILE_TIERS.length - 1] ?? null;
}

/**
 * Whether sample size qualifies for full-strength tier coloring.
 * null / undefined / non-finite sample → not sufficient (never treat as 0).
 */
export function isSampleSufficientForStrongColor(
  sampleSize: number | null | undefined,
  minimum: number,
): boolean {
  if (sampleSize == null || !Number.isFinite(sampleSize)) return false;
  if (!(minimum > 0) || !Number.isFinite(minimum)) return false;
  return sampleSize >= minimum;
}

/**
 * Resolve sample count without fabricating. Priority:
 * 1) metric-specific sample
 * 2) shared Statcast batted-ball events (BBE)
 * 3) AB
 * 4) PA
 */
export function resolveSampleSize(sources: {
  metricSample?: number | null | undefined;
  battedBallEvents?: number | null | undefined;
  atBats?: number | null | undefined;
  plateAppearances?: number | null | undefined;
}): number | null {
  const candidates = [
    sources.metricSample,
    sources.battedBallEvents,
    sources.atBats,
    sources.plateAppearances,
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const n = Number(value);
    // Missing stays null; valid zero is a known sample size of 0 (small-sample).
    if (!Number.isFinite(n) || n < 0) continue;
    return n;
  }
  return null;
}

export function classifySampleConfidence(
  sampleSize: number | null | undefined,
  minimum: number | null | undefined,
): SampleConfidence {
  if (sampleSize == null || !Number.isFinite(sampleSize)) return "sample-unavailable";
  if (minimum == null || !Number.isFinite(minimum) || minimum <= 0) {
    // No minimum configured → treat known sample as qualified.
    return "qualified";
  }
  return sampleSize >= minimum ? "qualified" : "small-sample";
}

/** Cap a tier so Elite/Excellent cannot appear when sample is unavailable. */
export function capTierForSampleUnavailable(tier: PercentileTier): PercentileTier {
  const maxTier = TIER_BY_ID[SAMPLE_UNAVAILABLE_MAX_TIER_ID];
  if (tier.minFavorablePercentile > maxTier.minFavorablePercentile) return maxTier;
  return tier;
}

/**
 * Reduce intensity of a tier style for sample-unavailable coloring.
 * Preserves hue family so strong / average / weak still differentiate.
 */
export function muteTierStyle(style: PercentileTierStyle): PercentileTierStyle {
  return {
    backgroundColor: reduceBackgroundIntensity(style.backgroundColor, 0.45),
    color: muteTextColor(style.color),
    border: "1px solid rgba(148, 163, 184, 0.2)",
  };
}

function reduceBackgroundIntensity(color: string, factor: number): string {
  const rgba = parseCssColor(color);
  if (!rgba) return `rgba(148, 163, 184, ${0.12 * factor})`;
  const { r, g, b, a } = rgba;
  // Blend toward white and lower alpha for a muted wash
  const blend = 0.55;
  const nr = Math.round(r + (255 - r) * blend);
  const ng = Math.round(g + (255 - g) * blend);
  const nb = Math.round(b + (255 - b) * blend);
  const na = Math.max(0.08, Math.min(0.55, a * factor + 0.08));
  return `rgba(${nr}, ${ng}, ${nb}, ${na})`;
}

function muteTextColor(color: string): string {
  const rgba = parseCssColor(color);
  if (!rgba) return "#475569";
  // Near-white text → slate; dark text stays dark slate-ish
  const luminance = (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255;
  return luminance > 0.7 ? "#334155" : "#1e293b";
}

function parseCssColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = color.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] != null ? Number(rgba[4]) : 1,
    };
  }
  return null;
}

/**
 * Percentile ranks for a population of values (same length as input).
 *
 * Conservative tie handling: percentile = (count of valid values strictly
 * worse/less than this value) / n × 100. Identical values share the same
 * percentile; large top ties do not inflate into Elite.
 */
export function computePercentileRanks(
  values: ReadonlyArray<number | null | undefined>,
): Array<number | null> {
  const n = values.length;
  const result: Array<number | null> = Array.from({ length: n }, () => null);

  const indexed: Array<{ index: number; value: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const value = values[i];
    if (value == null || !Number.isFinite(value)) continue;
    indexed.push({ index: i, value });
  }

  const finiteCount = indexed.length;
  if (finiteCount === 0) return result;
  if (finiteCount === 1) {
    result[indexed[0].index] = 50;
    return result;
  }

  indexed.sort((a, b) => a.value - b.value || a.index - b.index);

  let i = 0;
  while (i < finiteCount) {
    let j = i + 1;
    while (j < finiteCount && indexed[j].value === indexed[i].value) j += 1;
    const countStrictlyLess = i;
    const percentile = (countStrictlyLess / finiteCount) * 100;
    for (let k = i; k < j; k += 1) {
      result[indexed[k].index] = percentile;
    }
    i = j;
  }

  return result;
}

export function buildPercentileLookup(
  population: ReadonlyArray<number | null | undefined>,
): Map<number, number> {
  const finite = population.filter((v): v is number => v != null && Number.isFinite(v));
  const ranks = computePercentileRanks(finite);
  const map = new Map<number, number>();
  for (let i = 0; i < finite.length; i += 1) {
    const rank = ranks[i];
    if (rank != null) map.set(finite[i], rank);
  }
  return map;
}

export function lookupPercentile(
  value: number | null | undefined,
  lookup: Map<number, number>,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return lookup.get(value) ?? null;
}

/**
 * Resolve tier + confidence + display style for a comparative cell.
 *
 * - qualified: full percentile styling (Elite gold allowed)
 * - small-sample: known sample below threshold → subtle neutral, no Elite/Excellent
 * - sample-unavailable: metric valid, no sample field → muted tier, cap at Great, no Elite gold
 * - missing metric/percentile: no color
 */
export function resolvePercentileDisplay(input: {
  value: number | null | undefined;
  percentile: number | null | undefined;
  direction?: PercentileDirection;
  /** Pre-resolved sample count (prefer resolveSampleSize). */
  sampleSize?: number | null | undefined;
  sampleMinimum?: number | null | undefined;
  /** Model scores with internal sample protection. */
  bypassSampleGate?: boolean;
}): PercentileDisplayResult {
  const empty: PercentileDisplayResult = { tier: null, confidence: null, style: null };
  const { value, percentile, direction = "higherBetter" } = input;
  if (value == null || !Number.isFinite(value)) return empty;
  if (percentile == null || !Number.isFinite(percentile)) return empty;

  if (input.bypassSampleGate) {
    const tier = getPercentileTier(percentile, direction);
    if (!tier) return empty;
    return { tier, confidence: "qualified", style: tier.style };
  }

  const minimum = input.sampleMinimum ?? null;
  const confidence = classifySampleConfidence(input.sampleSize, minimum);
  const rawTier = getPercentileTier(percentile, direction);
  if (!rawTier) return empty;

  if (confidence === "qualified") {
    return { tier: rawTier, confidence, style: rawTier.style };
  }

  if (confidence === "small-sample") {
    // Known insufficient sample: no Elite/Excellent paint; keep a single subtle tint.
    return { tier: rawTier, confidence, style: SMALL_SAMPLE_STYLE };
  }

  // sample-unavailable: muted hierarchy, never Elite gold, cap at Great
  const capped = capTierForSampleUnavailable(rawTier);
  return {
    tier: capped,
    confidence: "sample-unavailable",
    style: muteTierStyle(capped.style),
  };
}

/**
 * @deprecated Prefer resolvePercentileDisplay. Returns tier only; small-sample
 * and sample-unavailable no longer force null (use the new API for styles).
 */
export function resolvePercentileTierForDisplay(input: {
  value: number | null | undefined;
  percentile: number | null | undefined;
  direction?: PercentileDirection;
  sampleSize?: number | null | undefined;
  sampleMinimum?: number | null | undefined;
  bypassSampleGate?: boolean;
}): PercentileTier | null {
  return resolvePercentileDisplay(input).tier;
}

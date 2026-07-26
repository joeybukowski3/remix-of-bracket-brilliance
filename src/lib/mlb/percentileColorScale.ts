/**
 * Shared 8-tier percentile color scale for comparative MLB table cells.
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

/**
 * Sample floors for strong (non-neutral) percentile coloring.
 * Missing sample fields never coerce to zero — they block strong color.
 */
export const SAMPLE_MINIMUMS = {
  /** Nearest validated sample for xBA / Hard Hit% / Barrel% (AB when BBE unavailable). */
  contactQuality: 20,
  /** Season rate metrics (PA when available; AB as nearest fallback). */
  seasonRate: 30,
  /** Batter-vs-pitcher rate coloring (PA or AB). */
  bvpRate: 5,
} as const;

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
      backgroundColor: "rgba(96, 165, 250, 0.22)",
      color: "#1e40af",
      border: "1px solid rgba(59, 130, 246, 0.2)",
    },
  },
  {
    id: "weak",
    label: "Weak",
    minFavorablePercentile: 10,
    style: {
      backgroundColor: "rgba(37, 99, 235, 0.42)",
      color: "#1e3a8a",
      border: "1px solid rgba(37, 99, 235, 0.28)",
    },
  },
  {
    id: "poor",
    label: "Poor",
    minFavorablePercentile: 0,
    style: {
      backgroundColor: "#1d4ed8",
      color: "#ffffff",
      border: "1px solid rgba(29, 78, 216, 0.35)",
    },
  },
] as const;

/** Legend order matches visual ranking: Elite → Poor */
export const PERCENTILE_TIER_LEGEND = PERCENTILE_TIERS.map((tier) => ({
  id: tier.id,
  label: tier.label,
  style: tier.style,
  minFavorablePercentile: tier.minFavorablePercentile,
}));

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
 * Whether sample size qualifies for strong tier coloring.
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
 * Percentile ranks for a population of values (same length as input).
 *
 * Conservative tie handling: percentile = (count of valid values strictly
 * worse/less than this value) / n × 100. Identical values share the same
 * percentile; large top ties do not inflate into Elite.
 *
 * Higher raw value → higher percentile in [0, 100].
 * Null / non-finite inputs yield null. Single finite value → 50.
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
    // Strictly fewer (worse for higher-is-better ranking base)
    const countStrictlyLess = i;
    const percentile = (countStrictlyLess / finiteCount) * 100;
    for (let k = i; k < j; k += 1) {
      result[indexed[k].index] = percentile;
    }
    i = j;
  }

  return result;
}

/**
 * Build a value → percentile lookup for unique finite values in a population.
 * Useful when many rows share the same metric value.
 */
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
 * Resolve tier for display: missing metric / missing percentile / insufficient
 * sample → null (neutral cell). Qualifying sample + percentile → tier.
 */
export function resolvePercentileTierForDisplay(input: {
  value: number | null | undefined;
  percentile: number | null | undefined;
  direction?: PercentileDirection;
  sampleSize?: number | null | undefined;
  sampleMinimum?: number | null | undefined;
  /** When true, skip sample gate (model scores with internal protection). */
  bypassSampleGate?: boolean;
}): PercentileTier | null {
  const { value, percentile, direction = "higherBetter" } = input;
  if (value == null || !Number.isFinite(value)) return null;
  if (percentile == null || !Number.isFinite(percentile)) return null;

  if (!input.bypassSampleGate) {
    const minimum = input.sampleMinimum;
    if (minimum != null && Number.isFinite(minimum)) {
      if (!isSampleSufficientForStrongColor(input.sampleSize, minimum)) return null;
    }
  }

  return getPercentileTier(percentile, direction);
}

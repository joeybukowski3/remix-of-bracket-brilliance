/**
 * wcThreeWayValue.ts
 *
 * Shared helpers for the World Cup three-way market value analysis.
 *
 * Sources (in priority order):
 *  1. Polymarket – gamma-api events with three-way (home / draw / away) outcomes
 *  2. ESPN odds  – converted from American moneyline to implied probability
 *
 * All probability values are 0–100 (percentage points, e.g. 54.2).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThreeWayOutcome = {
  /** Model-derived probability (0–100, regulation) */
  modelProbability: number;
  /** Market-derived probability after normalization (0–100) */
  marketProbability: number;
  /** modelProbability − marketProbability, signed percentage points */
  valueEdge: number;
};

export type MatchupMarketValue = {
  team1: ThreeWayOutcome;
  draw: ThreeWayOutcome;
  team2: ThreeWayOutcome;
  /** "polymarket" | "espn" | null */
  source: "polymarket" | "espn" | null;
  marketId?: string;
  updatedAt?: string;
};

export type RawThreeWayPrices = {
  /** Raw probability for team1 win (0–1 decimal OR 0–100 cents) */
  team1: number;
  draw: number;
  team2: number;
  source: "polymarket" | "espn";
  marketId?: string;
  updatedAt?: string;
};

// ─── Normalization ─────────────────────────────────────────────────────────────

/**
 * Detect whether values are in 0–1 decimal form or 0–100 cent form and
 * convert to 0–100 percentage.
 */
export function toPercent(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  // Heuristic: if all are ≤ 1 they're decimal; if > 1 they're cents
  return v <= 1 ? v * 100 : v;
}

/**
 * Normalize three raw prices so they sum to exactly 100%.
 * Returns null when any value is missing, zero, or non-finite.
 */
export function normalizeThreeWay(
  raw1: number,
  rawD: number,
  raw2: number,
): { p1: number; pD: number; p2: number } | null {
  const p1 = toPercent(raw1);
  const pD = toPercent(rawD);
  const p2 = toPercent(raw2);

  // Reject missing or zero values — never show 0 for a genuine missing price
  if (!Number.isFinite(p1) || p1 <= 0 || !Number.isFinite(pD) || pD <= 0 || !Number.isFinite(p2) || p2 <= 0) {
    return null;
  }

  const total = p1 + pD + p2;
  if (total <= 0) return null;

  return {
    p1: parseFloat(((p1 / total) * 100).toFixed(1)),
    pD: parseFloat(((pD / total) * 100).toFixed(1)),
    p2: parseFloat(((p2 / total) * 100).toFixed(1)),
  };
}

// ─── Value calculation ────────────────────────────────────────────────────────

/**
 * Compute signed value edge: model% − market%.
 * Positive = model sees more value than market implies.
 */
export function calcEdge(modelPct: number, marketPct: number): number {
  return parseFloat((modelPct - marketPct).toFixed(1));
}

/** Format a signed edge value: "+4.2%" / "-3.5%" / "0.0%" */
export function formatEdge(edge: number): string {
  if (!Number.isFinite(edge)) return "—";
  const sign = edge > 0 ? "+" : "";
  return `${sign}${edge.toFixed(1)}%`;
}

/**
 * Build a MatchupMarketValue from raw prices and model probabilities.
 * Returns null when prices cannot be normalized.
 */
export function buildMatchupValue(
  raw: RawThreeWayPrices,
  modelTeam1: number,
  modelDraw: number,
  modelTeam2: number,
): MatchupMarketValue | null {
  const norm = normalizeThreeWay(raw.team1, raw.draw, raw.team2);
  if (!norm) return null;

  return {
    team1: {
      modelProbability: modelTeam1,
      marketProbability: norm.p1,
      valueEdge: calcEdge(modelTeam1, norm.p1),
    },
    draw: {
      modelProbability: modelDraw,
      marketProbability: norm.pD,
      valueEdge: calcEdge(modelDraw, norm.pD),
    },
    team2: {
      modelProbability: modelTeam2,
      marketProbability: norm.p2,
      valueEdge: calcEdge(modelTeam2, norm.p2),
    },
    source: raw.source,
    marketId: raw.marketId,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Return the outcome index with the largest positive value edge.
 * Returns null when no edge ≥ threshold exists.
 */
export function bestValueOutcome(
  value: MatchupMarketValue,
  threshold = 2,
): "team1" | "draw" | "team2" | null {
  const candidates: Array<{ key: "team1" | "draw" | "team2"; edge: number }> = [
    { key: "team1", edge: value.team1.valueEdge },
    { key: "draw",  edge: value.draw.valueEdge  },
    { key: "team2", edge: value.team2.valueEdge },
  ].filter(c => c.edge >= threshold);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.edge - a.edge);
  return candidates[0].key;
}

// ─── Team name normalization for market matching ───────────────────────────────

const TEAM_ALIASES: Record<string, string> = {
  // Polymarket / ESPN → canonical
  "united states": "usa",
  "u.s.": "usa",
  "ivory coast": "cote d'ivoire",
  "côte d'ivoire": "cote d'ivoire",
  "cote divoire": "cote d'ivoire",
  "cape verde": "cabo verde",
  "iran": "ir iran",
  "south korea": "korea rep.",
  "republic of korea": "korea rep.",
  "turkey": "türkiye",
  "turkiye": "türkiye",
  "drc": "congo dr",
  "democratic republic of congo": "congo dr",
  "dr congo": "congo dr",
  "bosnia": "bosnia & herz",
  "bosnia-herzegovina": "bosnia & herz",
  "switzerland": "switzerland",
};

export function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_ALIASES[lower] ?? lower;
}

export function teamsMatch(a: string, b: string): boolean {
  return normalizeTeamName(a) === normalizeTeamName(b);
}

// ─── Market freshness ─────────────────────────────────────────────────────────

/**
 * Reject a market that is closed or has a stale timestamp
 * (more than 6 hours old for a live match day).
 */
export function isMarketFresh(
  updatedAt: string | undefined,
  maxAgeHours = 6,
): boolean {
  if (!updatedAt) return true; // unknown age — allow
  const age = (Date.now() - new Date(updatedAt).getTime()) / 3_600_000;
  return age <= maxAgeHours;
}

/**
 * Deterministic position classification for Defense vs. Position (DvP).
 *
 * A player-game is attributed to the five positions by weights that sum to 1.
 * Two sources of weights, in priority order:
 *   1. "position-minutes": the share of the player's minutes at each position
 *      (from lineup or play-level data). Used only when it is supplied; never inferred.
 *   2. "roster-label": a roster position label expanded by the fixed table below.
 *
 * Roster label rules (case-insensitive, tokens split on "-", "/" or ","):
 *   PG, SG, SF, PF, C      one position, weight 1
 *   G                      PG and SG, 0.5 each
 *   F                      SF and PF, 0.5 each
 *   G-F or F-G             SG and SF, 0.5 each (order does not matter)
 *   F-C or C-F             PF and C, 0.5 each (order does not matter)
 *   several specific codes (e.g. PG-SG, SG/SF/PF)  equal weights across the distinct codes
 * Anything else (G-C, an empty string, an unknown token, a mix of generic and
 * specific tokens) is unclassified. Unclassified players are excluded from DvP
 * and reported; they are never guessed.
 *
 * The primary position (used where a table needs one position) is the heaviest
 * weight; ties go to the earliest position in PG, SG, SF, PF, C order.
 */

export const DVP_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type DvpPosition = (typeof DVP_POSITIONS)[number];

export type PositionWeights = Partial<Record<DvpPosition, number>>;
export type PositionMethod = "position-minutes" | "roster-label";

export type PositionClassification =
  | { ok: true; method: PositionMethod; weights: PositionWeights; primary: DvpPosition; isMultiPosition: boolean }
  | { ok: false; reason: string };

const WEIGHT_SUM_TOLERANCE = 1e-6;
const MINUTES_SUM_TOLERANCE = 0.05;
const TOKEN_SPLIT = /[-/,]/;

const isPosition = (token: string): token is DvpPosition => (DVP_POSITIONS as readonly string[]).includes(token);

/** Generic combinations that mean a fixed set of positions, keyed by the sorted, "-"-joined tokens. */
const GENERIC_SETS: Readonly<Record<string, readonly DvpPosition[]>> = Object.freeze({
  G: ["PG", "SG"],
  F: ["SF", "PF"],
  "F-G": ["SG", "SF"],
  "C-F": ["PF", "C"],
});

function finish(method: PositionMethod, weights: PositionWeights): PositionClassification {
  const entries = (Object.entries(weights) as [DvpPosition, number][]).filter(([, w]) => w > 0);
  if (entries.length === 0) return { ok: false, reason: "no positive position weight" };
  const sum = entries.reduce((total, [, w]) => total + w, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) return { ok: false, reason: `position weights sum to ${sum}, not 1` };
  const primary = [...entries].sort((a, b) => b[1] - a[1] || DVP_POSITIONS.indexOf(a[0]) - DVP_POSITIONS.indexOf(b[0]))[0][0];
  return { ok: true, method, weights: Object.fromEntries(entries) as PositionWeights, primary, isMultiPosition: entries.length > 1 };
}

const equalWeights = (positions: readonly DvpPosition[]): PositionWeights =>
  Object.fromEntries(positions.map((p) => [p, 1 / positions.length])) as PositionWeights;

/** Expand a roster position label. */
export function classifyRosterLabel(label: string | null | undefined): PositionClassification {
  const raw = (label ?? "").trim().toUpperCase();
  if (!raw) return { ok: false, reason: "empty position label" };
  const tokens = raw.split(TOKEN_SPLIT).map((t) => t.trim());
  if (tokens.some((t) => t === "")) return { ok: false, reason: `malformed position label "${raw}"` };
  const distinct = [...new Set(tokens)];
  if (distinct.every(isPosition)) return finish("roster-label", equalWeights(DVP_POSITIONS.filter((p) => distinct.includes(p))));
  const generic = GENERIC_SETS[[...distinct].sort().join("-")];
  if (generic && distinct.every((t) => t === "G" || t === "F" || t === "C")) return finish("roster-label", equalWeights(generic));
  return { ok: false, reason: `unsupported position label "${raw}"` };
}

/** Convert minutes played at each position into weights. The sum must equal the player's minutes. */
export function classifyPositionMinutes(positionMinutes: Partial<Record<string, number>>, playerMinutes: number): PositionClassification {
  const entries = Object.entries(positionMinutes);
  if (!Number.isFinite(playerMinutes) || playerMinutes <= 0) return { ok: false, reason: "player minutes must be positive" };
  if (entries.length === 0) return { ok: false, reason: "no position minutes" };
  let total = 0;
  for (const [position, minutes] of entries) {
    if (!isPosition(position)) return { ok: false, reason: `unknown position "${position}"` };
    if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return { ok: false, reason: `invalid minutes for ${position}` };
    total += minutes;
  }
  if (Math.abs(total - playerMinutes) > MINUTES_SUM_TOLERANCE) return { ok: false, reason: "position minutes do not sum to player minutes" };
  const weights = Object.fromEntries(entries.map(([p, m]) => [p, (m as number) / total])) as PositionWeights;
  return finish("position-minutes", weights);
}

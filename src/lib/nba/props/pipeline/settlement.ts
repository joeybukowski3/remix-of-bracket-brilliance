/**
 * Prop settlement and projection error, from an immutable pregame snapshot and
 * the latest final-result revision. Pure.
 *
 * Rules:
 *   - the game must be final; postponed or cancelled games void, anything
 *     still in play or suspended stays pending;
 *   - a played line settles over / under / push on full-game totals
 *     (overtime counts);
 *   - a CONFIRMED non-participation voids (book rules vary; this is the common
 *     standard and is the single place to change it);
 *   - absence from a box score is not a confirmed DNP: it stays pending.
 */
import {
  buildEvaluation,
  playerKeyOf,
  type Market,
  type NbaFinalResult,
  type NbaPregameSnapshot,
  type NbaPropEvaluation,
  type Settlement,
} from "./contracts";

export interface Settled {
  settlement: Settlement;
  reason: string | null;
  actual: number | null;
  errors: NbaPropEvaluation["errors"];
}

const NO_ERRORS = { projection: null, minutes: null } as const;

export function settleProp(snapshot: NbaPregameSnapshot, result: NbaFinalResult | null): Settled {
  if (!result) return { settlement: "pending", reason: "no_result_yet", actual: null, errors: NO_ERRORS };
  const { status } = result.game;
  if (status === "postponed" || status === "cancelled") return { settlement: "void", reason: `game_${status}`, actual: null, errors: NO_ERRORS };
  if (status !== "final") return { settlement: "pending", reason: `game_${status}`, actual: null, errors: NO_ERRORS };
  if (result.participation === "unverified_absent") return { settlement: "pending", reason: "participation_unverified", actual: null, errors: NO_ERRORS };
  if (result.participation !== "played" || result.stats === null) return { settlement: "void", reason: "player_did_not_play", actual: null, errors: NO_ERRORS };
  const actual = result.stats[snapshot.market];
  const { value, minutes } = snapshot.projection;
  const settlement: Settlement = actual > snapshot.line ? "over" : actual < snapshot.line ? "under" : "push";
  return {
    settlement,
    reason: null,
    actual,
    errors: { projection: value === null ? null : value - actual, minutes: minutes === null ? null : minutes - result.stats.minutes },
  };
}

/**
 * The evaluation to append for this snapshot, or null when the latest one
 * already says the same thing. The result's own correction history stays in
 * the results table; each evaluation records which result revision it used.
 */
export function evaluateSnapshot(
  snapshot: NbaPregameSnapshot,
  result: NbaFinalResult | null,
  previous: NbaPropEvaluation | null,
  evaluatedAtUtc: string,
): NbaPropEvaluation | null {
  const settled = settleProp(snapshot, result);
  if (previous && previous.settlement === settled.settlement && previous.actual === settled.actual && previous.reason === settled.reason && previous.resultRevision === (result?.revision ?? null)) return null;
  return buildEvaluation({
    snapshot,
    revision: (previous?.revision ?? 0) + 1,
    resultId: result?.resultId ?? null,
    resultRevision: result?.revision ?? null,
    resultPermittedUses: result ? [...result.permissions.permittedUses] : [],
    settlement: settled.settlement,
    reason: settled.reason,
    actual: settled.actual,
    errors: settled.errors,
    evaluatedAtUtc,
  });
}

/** Does this result describe the player on the snapshot? */
export const resultMatchesSnapshot = (snapshot: NbaPregameSnapshot, result: NbaFinalResult): boolean =>
  result.game.canonicalGameKey === snapshot.game.canonicalGameKey && playerKeyOf(result.player) === playerKeyOf(snapshot.player);

// ---- Prices and probabilities ----

export function americanToDecimal(price: number): number {
  if (!Number.isInteger(price) || (price > -100 && price < 100)) throw new Error(`Invalid American price ${price}`);
  return price > 0 ? 1 + price / 100 : 1 + 100 / -price;
}

export const impliedProbability = (price: number): number => 1 / americanToDecimal(price);

/** Removes the book's margin by proportional scaling. */
export function noVigProbabilities(overPrice: number, underPrice: number): { pOver: number; pUnder: number; overround: number } {
  const over = impliedProbability(overPrice);
  const under = impliedProbability(underPrice);
  return { pOver: over / (over + under), pUnder: under / (over + under), overround: over + under - 1 };
}

/** Expected profit per unit staked at `price` if the true win probability is `p`. */
export const expectedValue = (p: number, price: number): number => p * (americanToDecimal(price) - 1) - (1 - p);

/**
 * Probabilities and EV, only from a CALIBRATED model: the version string names
 * the calibration so every figure can be traced to it. Without one, snapshots
 * carry null rather than a guess.
 */
export function buildProbabilities(pOver: number, overPrice: number, underPrice: number, calibrationVersion: string): NonNullable<NbaPregameSnapshot["probabilities"]> {
  if (!(pOver >= 0 && pOver <= 1)) throw new Error(`pOver out of range: ${pOver}`);
  return { pOver, pUnder: 1 - pOver, evOver: expectedValue(pOver, overPrice), evUnder: expectedValue(1 - pOver, underPrice), calibrationVersion };
}

/** Realized profit per unit staked on the side that was bet; push and void return the stake. */
export function realizedProfit(side: "over" | "under", settlement: Settlement, price: number): number | null {
  if (settlement === "pending") return null;
  if (settlement === "push" || settlement === "void") return 0;
  return settlement === side ? americanToDecimal(price) - 1 : -1;
}

export type { Market };

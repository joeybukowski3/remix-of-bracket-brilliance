/**
 * reduce.ts — Core number reduction for JoeKnowsBall Numerology Engine v2
 *
 * Rules:
 *  - Master numbers 11, 22, 33 are preserved at each stage.
 *  - Reduction traces every step for auditability.
 *  - Zero is neutral; never receives player-matching points.
 */

export const MASTER_NUMBERS = new Set([11, 22, 33]);

export interface ReducedNumber {
  /** Original integer input */
  original: number;
  /** Sum before final reduction (may equal original) */
  compound: number;
  /** Set when compound is 11, 22, or 33 */
  master: number | null;
  /** Single digit root (1–9) */
  root: number;
  /** Human-readable calculation steps */
  trace: string[];
}

/** Sum all digits of a non-negative integer */
function sumDigits(n: number): number {
  return String(Math.abs(Math.round(n)))
    .split("")
    .reduce((acc, d) => acc + parseInt(d, 10), 0);
}

/**
 * Reduce a positive integer to a single root, preserving master numbers.
 * @param n - The number to reduce (must be a positive integer)
 */
export function reduce(n: number): ReducedNumber {
  const original = Math.abs(Math.round(n));
  const trace: string[] = [];

  // Single digit — no reduction needed
  if (original >= 1 && original <= 9) {
    return { original, compound: original, master: null, root: original, trace: [String(original)] };
  }

  // If the original value itself is a master number, preserve it immediately
  if (MASTER_NUMBERS.has(original)) {
    const root = sumDigits(original);
    trace.push(`${original} (master) → ${root}`);
    return { original, compound: original, master: original, root, trace };
  }

  // First compound sum
  let compound = sumDigits(original);
  const digits = String(original).split("").join(" + ");
  trace.push(`${digits} = ${compound}`);

  // Check master at compound level
  if (MASTER_NUMBERS.has(compound)) {
    const root = sumDigits(compound);
    trace.push(`${compound} (master) → ${root}`);
    return { original, compound, master: compound, root, trace };
  }

  // Reduce compound to single digit
  let current = compound;
  while (current > 9) {
    const next = sumDigits(current);
    if (MASTER_NUMBERS.has(next)) {
      const root = sumDigits(next);
      trace.push(`${current.toString().split("").join(" + ")} = ${next} (master) → ${root}`);
      return { original, compound, master: next, root, trace };
    }
    trace.push(`${current.toString().split("").join(" + ")} = ${next}`);
    current = next;
  }

  return { original, compound, master: null, root: current, trace };
}

/**
 * Sum all digits of a date string "YYYY-MM-DD" or "MM/DD/YYYY" etc.
 * Returns { raw, reduced }
 */
export function reduceFullDate(dateDigits: string): ReducedNumber & { rawSum: number } {
  const digits = dateDigits.replace(/\D/g, "").split("").map(Number);
  const rawSum = digits.reduce((a, b) => a + b, 0);
  const traceStr = digits.join(" + ") + " = " + rawSum;
  // Pass rawSum to reduce so master numbers are detected correctly
  const base = reduce(rawSum);
  return {
    ...base,
    rawSum,
    trace: [traceStr, ...base.trace.slice(1)],
  };
}

/** Number families per methodology config */
export const NUMBER_FAMILIES: [number, number, number][] = [
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
];

export function getFamily(root: number): number[] {
  return NUMBER_FAMILIES.find((f) => f.includes(root)) ?? [];
}

/** Balancing complement: numbers that sum to 10 (model-defined) */
export function balancingComplement(root: number): number {
  if (root === 5) return 5;
  return 10 - root;
}

/** Countercurrent: 9 - root; if 0 use 9 (model-defined) */
export function countercurrent(root: number): number {
  const c = 9 - root;
  return c === 0 ? 9 : c;
}

/**
 * nameNumerology.ts — Pythagorean name numerology
 * Methodology v2.0.0
 *
 * Chart:
 * 1: A J S   2: B K T   3: C L U   4: D M V   5: E N W
 * 6: F O X   7: G P Y   8: H Q Z   9: I R
 */

import { reduce, type ReducedNumber } from "./reduce";

const PYTHAGOREAN: Record<string, number> = {
  a: 1, j: 1, s: 1,
  b: 2, k: 2, t: 2,
  c: 3, l: 3, u: 3,
  d: 4, m: 4, v: 4,
  e: 5, n: 5, w: 5,
  f: 6, o: 6, x: 6,
  g: 7, p: 7, y: 7,
  h: 8, q: 8, z: 8,
  i: 9, r: 9,
};

/**
 * Normalise a name before calculation:
 * - Lowercase, strip accents, remove punctuation/suffixes/apostrophes
 * - Keep only letters
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Calculate Expression Number (full name) */
export function expressionNumber(fullName: string): ReducedNumber {
  const normalized = normalizeName(fullName);
  const letters = normalized.replace(/\s/g, "").split("");
  const values = letters.map((l) => PYTHAGOREAN[l] ?? 0).filter((v) => v > 0);
  const sum = values.reduce((a, b) => a + b, 0);
  return reduce(sum);
}

/** Calculate the number for a single name part (first or last) */
export function namePartNumber(namePart: string): ReducedNumber {
  const normalized = normalizeName(namePart);
  const letters = normalized.replace(/\s/g, "").split("");
  const values = letters.map((l) => PYTHAGOREAN[l] ?? 0).filter((v) => v > 0);
  const sum = values.reduce((a, b) => a + b, 0);
  return reduce(sum);
}

/** Initials number — reduce sum of first letter values */
export function initialsNumber(fullName: string): ReducedNumber {
  const normalized = normalizeName(fullName);
  const initials = normalized
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .filter((c) => c && PYTHAGOREAN[c]);
  const sum = initials.reduce((acc, c) => acc + (PYTHAGOREAN[c] ?? 0), 0);
  return reduce(sum);
}

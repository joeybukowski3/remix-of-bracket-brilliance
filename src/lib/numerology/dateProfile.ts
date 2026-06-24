/**
 * dateProfile.ts — Deterministic daily numerology profile
 * Methodology v2.0.0
 *
 * Primary Universal Day = full-date digit sum (e.g. 06/24/2026 → 0+6+2+4+2+0+2+6 = 22)
 * Calendar Day = digit sum of day-of-month only (24 → 6)
 * Universal Year = digit sum of year (2026 → 10 → 1)
 * Universal Month = calendar month + Universal Year root (6 + 1 = 7)
 * Structural Echo = month root + calendar-day root + year root (diagnostic only)
 */

import {
  reduce,
  reduceFullDate,
  getFamily,
  balancingComplement,
  countercurrent,
  NUMBER_FAMILIES,
  type ReducedNumber,
} from "./reduce";

export interface RepeatedDigit {
  digit: number;
  count: number;
  reinforces: "primary" | "secondary" | "neither";
}

export interface DailyProfile {
  date: string;
  /** Primary current: full-date digit sum */
  universalDay: ReducedNumber & { rawSum: number };
  /** Secondary current: calendar day only */
  calendarDay: ReducedNumber;
  /** Digit sum of year */
  universalYear: ReducedNumber;
  /** Calendar month + Universal Year root */
  universalMonth: ReducedNumber;
  /** Diagnostic: month_root + calDay_root + year_root */
  structuralEcho: ReducedNumber;
  /** Primary family (contains universalDay root) */
  primaryFamily: number[];
  /** Secondary family (contains calendarDay root) */
  secondaryFamily: number[];
  /** Model-defined balancing complement of primary root */
  balancingComplement: number;
  /** Model-defined countercurrent of primary root */
  countercurrent: number;
  /** Non-zero repeated digits in the full date */
  repeatedDigits: RepeatedDigit[];
}

/**
 * Build the complete deterministic date profile for a given date.
 * @param dateStr - Eastern Time date in "YYYY-MM-DD" format
 */
export function buildDailyProfile(dateStr: string): DailyProfile {
  // Parse
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // 1. Primary Universal Day — ALL digits of full date
  const fullDateForDigits = dateStr.replace(/-/g, "");
  const universalDay = reduceFullDate(fullDateForDigits);

  // 2. Calendar Day — day of month only
  const calendarDay = reduce(day);

  // 3. Universal Year — year digits
  const universalYear = reduce(year);

  // 4. Universal Month — calendar month + Universal Year root
  const universalMonth = reduce(month + universalYear.root);

  // 5. Structural Echo (diagnostic) — month root + calDay root + year root
  const monthRoot = reduce(month).root;
  const structuralEcho = reduce(monthRoot + calendarDay.root + universalYear.root);

  // 6. Families
  const primaryFamily = getFamily(universalDay.root);
  const secondaryFamily = getFamily(calendarDay.root);

  // 7. Complements
  const balancing = balancingComplement(universalDay.root);
  const counter = countercurrent(universalDay.root);

  // 8. Repeated digits in full date (non-zero)
  const allDigits = fullDateForDigits.split("").map(Number).filter((d) => d !== 0);
  const digitCounts = new Map<number, number>();
  for (const d of allDigits) digitCounts.set(d, (digitCounts.get(d) ?? 0) + 1);
  const repeatedDigits: RepeatedDigit[] = [];
  for (const [digit, count] of digitCounts) {
    if (count < 2) continue;
    const reinforces: RepeatedDigit["reinforces"] =
      primaryFamily.includes(digit)
        ? "primary"
        : secondaryFamily.includes(digit)
        ? "secondary"
        : "neither";
    repeatedDigits.push({ digit, count, reinforces });
  }

  return {
    date: dateStr,
    universalDay,
    calendarDay,
    universalYear,
    universalMonth,
    structuralEcho,
    primaryFamily,
    secondaryFamily,
    balancingComplement: balancing,
    countercurrent: counter,
    repeatedDigits,
  };
}

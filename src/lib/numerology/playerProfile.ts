/**
 * playerProfile.ts — Per-player deterministic numerology profile
 * Methodology v2.0.0
 */

import { reduce, type ReducedNumber } from "./reduce";
import { expressionNumber, namePartNumber, initialsNumber } from "./nameNumerology";

export interface PersonalCycles {
  personalYear: ReducedNumber;
  personalMonth: ReducedNumber;
  personalDay: ReducedNumber;
}

export interface PlayerNumerologyProfile {
  playerName: string;
  /** Undefined if birth date unavailable */
  birthDate?: string | null;
  /** Undefined if jersey unknown */
  jerseyNumber?: number | null;
  jerseyReduced?: ReducedNumber | null;
  battingOrder?: number | null;
  battingOrderReduced?: ReducedNumber | null;
  expressionNumber: ReducedNumber;
  firstNameNumber: ReducedNumber;
  lastNameNumber: ReducedNumber;
  initialsNumber: ReducedNumber;
  /** Undefined if birth date unavailable */
  lifePathNumber?: ReducedNumber | null;
  birthDayNumber?: ReducedNumber | null;
  personalCycles?: PersonalCycles | null;
  /** Data quality flags */
  missingFields: string[];
}

/**
 * Calculate Life Path: reduce full birth date digits.
 * Same as Universal Day calculation but for birth date.
 */
export function lifePathNumber(birthDateStr: string): ReducedNumber {
  const digits = birthDateStr.replace(/\D/g, "");
  const sum = digits.split("").reduce((a, d) => a + parseInt(d, 10), 0);
  return reduce(sum);
}

/**
 * Calculate Personal Year: birth month + birth day + universal year root
 */
export function personalYear(birthDateStr: string, universalYearRoot: number): ReducedNumber {
  const parts = birthDateStr.split("-");
  const birthMonth = parseInt(parts[1] ?? "0", 10);
  const birthDay = parseInt(parts[2] ?? "0", 10);
  return reduce(birthMonth + birthDay + universalYearRoot);
}

/** Personal Month: personal year root + calendar month */
export function personalMonth(personalYearRoot: number, calendarMonth: number): ReducedNumber {
  return reduce(personalYearRoot + calendarMonth);
}

/** Personal Day: personal month root + calendar day */
export function personalDay(personalMonthRoot: number, calendarDay: number): ReducedNumber {
  return reduce(personalMonthRoot + calendarDay);
}

interface BuildProfileInput {
  playerName: string;
  birthDate?: string | null;
  jerseyNumber?: number | null;
  battingOrder?: number | null;
  slateDate: string; // YYYY-MM-DD (Eastern Time)
  universalYearRoot: number;
  calendarMonth: number;
  calendarDay: number;
}

export function buildPlayerProfile(input: BuildProfileInput): PlayerNumerologyProfile {
  const {
    playerName,
    birthDate,
    jerseyNumber,
    battingOrder,
    universalYearRoot,
    calendarMonth,
    calendarDay,
  } = input;

  const missingFields: string[] = [];

  // Name numbers
  const parts = playerName.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  const exprNum = expressionNumber(playerName);
  const firstNum = namePartNumber(firstName);
  const lastNum = lastName ? namePartNumber(lastName) : namePartNumber(firstName);
  const initNum = initialsNumber(playerName);

  // Jersey
  let jerseyReduced: ReducedNumber | null = null;
  if (jerseyNumber != null) {
    jerseyReduced = reduce(jerseyNumber);
  } else {
    missingFields.push("jerseyNumber");
  }

  // Batting order
  let battingOrderReduced: ReducedNumber | null = null;
  if (battingOrder != null) {
    battingOrderReduced = reduce(battingOrder);
  }

  // Birth-date dependent fields
  let lifePath: ReducedNumber | null = null;
  let birthDay: ReducedNumber | null = null;
  let cycles: PersonalCycles | null = null;

  if (birthDate) {
    lifePath = lifePathNumber(birthDate);
    const dayStr = birthDate.split("-")[2] ?? "1";
    birthDay = reduce(parseInt(dayStr, 10));

    const pyear = personalYear(birthDate, universalYearRoot);
    const pmonth = personalMonth(pyear.root, calendarMonth);
    const pday = personalDay(pmonth.root, calendarDay);
    cycles = {
      personalYear: pyear,
      personalMonth: pmonth,
      personalDay: pday,
    };
  } else {
    missingFields.push("birthDate", "lifePath", "personalCycles");
  }

  return {
    playerName,
    birthDate,
    jerseyNumber,
    jerseyReduced,
    battingOrder,
    battingOrderReduced,
    expressionNumber: exprNum,
    firstNameNumber: firstNum,
    lastNameNumber: lastNum,
    initialsNumber: initNum,
    lifePathNumber: lifePath,
    birthDayNumber: birthDay,
    personalCycles: cycles,
    missingFields,
  };
}

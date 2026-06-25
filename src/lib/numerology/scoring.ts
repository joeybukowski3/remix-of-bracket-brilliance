/**
 * scoring.ts — Deterministic scoring for MLB Numerology Engine v2.0.0
 *
 * All weights come from the methodology config.
 * Double-counting rules enforced here.
 * Grok cannot change any calculated value.
 */

import { MASTER_NUMBERS, type ReducedNumber } from "./reduce";
import type { DailyProfile } from "./dateProfile";
import type { PlayerNumerologyProfile } from "./playerProfile";

export interface ScoredSignal {
  field: string;
  label: string;
  type:
    | "primary_exact_master"
    | "primary_exact_root"
    | "primary_root"
    | "secondary_exact"
    | "secondary_root"
    | "family_support"
    | "personal_cycle"
    | "name_resonance"
    | "contextual_echo"
    | "countercurrent"
    | "baseball_opportunity"
    | "data_caution";
  points: number;
  description: string;
  /** Which underlying fields contributed (for double-counting guard) */
  sourceFields: string[];
}

export interface ScoringTrace {
  signals: ScoredSignal[];
  positiveTotal: number;
  countercurrentTotal: number;
  convergenceBonus: number;
  numerologyResonanceScore: number;
  /** Supplied by caller (from existing MLB model data) */
  baseballOpportunityScore: number;
  finalAlignmentScore: number;
  formula: string;
}

export interface ScoringWeights {
  personalDayExactMaster: number;
  personalDayRoot: number;
  jerseyExactMaster: number;
  jerseyRoot: number;
  battingOrderExactRoot: number;
  lifePathExactMaster: number;
  lifePathRoot: number;
  birthDayExactCompound: number;
  birthDayRoot: number;
  ageExactCompound: number;
  ageRoot: number;
  expressionRoot: number;
  primaryFamilyMatch: number;
  calendarDayExactCompound: number;
  calendarDayRoot: number;
  secondaryFamilyMatch: number;
  repeatedDateDigit: number;
  gameTimeMatch: number;
  contextMatch: number;
  countercurrentHighField: number;
  countercurrentMultiple: number;
  convergenceMaxBonus: number;
  numerologyWeight: number;
  baseballWeight: number;
}

const MAX_CONVERGENCE_BONUS = 8;

/** Returns true if n matches the primary Universal Day (exact compound/master or root) */
function matchesPrimaryExact(n: ReducedNumber, profile: DailyProfile): boolean {
  const ud = profile.universalDay;
  return n.original === ud.rawSum || n.compound === ud.rawSum || (ud.master != null && (n.compound === ud.master || n.original === ud.master));
}

function matchesPrimaryRoot(n: ReducedNumber, profile: DailyProfile): boolean {
  return n.root === profile.universalDay.root;
}

function matchesSecondaryExact(n: ReducedNumber, profile: DailyProfile): boolean {
  return n.original === profile.calendarDay.original || n.compound === profile.calendarDay.original;
}

function matchesSecondaryRoot(n: ReducedNumber, profile: DailyProfile): boolean {
  return n.root === profile.calendarDay.root;
}

function isPrimaryFamily(root: number, profile: DailyProfile): boolean {
  return profile.primaryFamily.includes(root);
}

function isSecondaryFamily(root: number, profile: DailyProfile): boolean {
  return profile.secondaryFamily.includes(root);
}

function isCountercurrent(root: number, profile: DailyProfile): boolean {
  return root === profile.countercurrent;
}

/**
 * Score a single player's numerology profile against the daily profile.
 * Double-counting: once a field-source pair has awarded points at a tier,
 * it does not also award points at a lower tier.
 */
export function scorePlayer(
  playerProfile: PlayerNumerologyProfile,
  dailyProfile: DailyProfile,
  baseballOpportunityScore: number,
  weights: ScoringWeights,
  ageOnDate?: number | null
): ScoringTrace {
  const signals: ScoredSignal[] = [];
  const awardedSources = new Set<string>(); // guard double-counting

  function award(
    field: string,
    label: string,
    type: ScoredSignal["type"],
    points: number,
    description: string,
    sourceKey: string
  ) {
    if (awardedSources.has(sourceKey) || points === 0) return;
    awardedSources.add(sourceKey);
    signals.push({ field, label, type, points, description, sourceFields: [sourceKey] });
  }

  // ── Personal Day ──────────────────────────────────────────────────────────
  const pd = playerProfile.personalCycles?.personalDay;
  if (pd) {
    const udMaster = dailyProfile.universalDay.master;
    if (udMaster != null && (pd.compound === udMaster || pd.master === udMaster)) {
      award(
        "personalDay", `Personal Day ${pd.compound}${pd.master ? `/${pd.root}` : ""} — Exact Master`,
        "primary_exact_master", weights.personalDayExactMaster,
        `Personal Day ${pd.compound} matches Universal Day master ${udMaster}.`,
        "personalDay:exactMaster"
      );
    } else if (matchesPrimaryExact(pd, dailyProfile)) {
      award(
        "personalDay", `Personal Day ${pd.compound} — Exact Primary`,
        "primary_exact_root", weights.personalDayExactMaster - 4,
        `Personal Day ${pd.original} matches Universal Day compound ${dailyProfile.universalDay.rawSum}.`,
        "personalDay:exactPrimary"
      );
    } else if (matchesPrimaryRoot(pd, dailyProfile)) {
      award(
        "personalDay", `Personal Day root ${pd.root} — Root Match`,
        "personal_cycle", weights.personalDayRoot,
        `Personal Day root ${pd.root} matches Universal Day root ${dailyProfile.universalDay.root}.`,
        "personalDay:root"
      );
    } else if (isCountercurrent(pd.root, dailyProfile)) {
      award(
        "personalDay", `Personal Day ${pd.compound} — Countercurrent`,
        "countercurrent", -weights.countercurrentHighField,
        `Personal Day root ${pd.root} is the countercurrent (${dailyProfile.countercurrent}) for this Universal Day.`,
        "personalDay:counter"
      );
    }
  }

  // ── Jersey Number ─────────────────────────────────────────────────────────
  const jersey = playerProfile.jerseyReduced;
  if (jersey) {
    const udMaster = dailyProfile.universalDay.master;
    if (udMaster != null && (jersey.compound === udMaster || jersey.original === udMaster)) {
      award(
        "jersey", `Jersey ${jersey.original} — Exact Master Match`,
        "primary_exact_master", weights.jerseyExactMaster,
        `Jersey ${jersey.original} is a master number matching Universal Day ${udMaster}.`,
        "jersey:exactMaster"
      );
    } else if (matchesSecondaryExact(jersey, dailyProfile)) {
      award(
        "jersey", `Jersey ${jersey.original} — Calendar Day Exact`,
        "secondary_exact", weights.calendarDayExactCompound,
        `Jersey ${jersey.original} matches Calendar Day ${dailyProfile.calendarDay.original}.`,
        "jersey:calendarExact"
      );
    } else if (matchesPrimaryExact(jersey, dailyProfile)) {
      award(
        "jersey", `Jersey ${jersey.original} — Exact Primary Match`,
        "primary_exact_root", weights.jerseyExactMaster - 2,
        `Jersey ${jersey.original} matches Universal Day compound ${dailyProfile.universalDay.rawSum}.`,
        "jersey:exactPrimary"
      );
    } else if (matchesPrimaryRoot(jersey, dailyProfile)) {
      award(
        "jersey", `Jersey ${jersey.original}/${jersey.root} — Root Match`,
        "primary_root", weights.jerseyRoot,
        `Jersey ${jersey.original} reduces to ${jersey.root}, matching Universal Day root.`,
        "jersey:root"
      );
    } else if (matchesSecondaryRoot(jersey, dailyProfile)) {
      award(
        "jersey", `Jersey ${jersey.original}/${jersey.root} — Secondary Root`,
        "secondary_root", weights.calendarDayRoot,
        `Jersey ${jersey.original} reduces to ${jersey.root}, matching Calendar Day root ${dailyProfile.calendarDay.root}.`,
        "jersey:secondaryRoot"
      );
    } else if (isCountercurrent(jersey.root, dailyProfile)) {
      award(
        "jersey", `Jersey ${jersey.original} — Countercurrent`,
        "countercurrent", -weights.countercurrentHighField,
        `Jersey ${jersey.original} root ${jersey.root} is the countercurrent.`,
        "jersey:counter"
      );
    } else if (isPrimaryFamily(jersey.root, dailyProfile)) {
      award(
        "jersey", `Jersey root ${jersey.root} — Primary Family`,
        "family_support", weights.primaryFamilyMatch,
        `Jersey root ${jersey.root} belongs to primary family [${dailyProfile.primaryFamily.join("–")}].`,
        "jersey:primaryFamily"
      );
    } else if (isSecondaryFamily(jersey.root, dailyProfile)) {
      award(
        "jersey", `Jersey root ${jersey.root} — Secondary Family`,
        "family_support", weights.secondaryFamilyMatch,
        `Jersey root ${jersey.root} belongs to secondary family [${dailyProfile.secondaryFamily.join("–")}].`,
        "jersey:secondaryFamily"
      );
    }
  }

  // ── Batting Order ─────────────────────────────────────────────────────────
  const bo = playerProfile.battingOrderReduced;
  if (bo) {
    // Batting order is a single digit 1-9; treat original as root
    const boRoot = bo.original; // batting orders 1-9 are already single digit
    if (boRoot === dailyProfile.universalDay.root) {
      award(
        "battingOrder", `Batting ${boRoot} — Exact Root Match`,
        "primary_exact_root", weights.battingOrderExactRoot,
        `Batting order ${boRoot} exactly matches Universal Day root ${dailyProfile.universalDay.root}.`,
        "battingOrder:exactRoot"
      );
    } else if (isPrimaryFamily(boRoot, dailyProfile)) {
      award(
        "battingOrder", `Batting ${boRoot} — Primary Family`,
        "family_support", weights.primaryFamilyMatch,
        `Batting position ${boRoot} belongs to primary family [${dailyProfile.primaryFamily.join("–")}].`,
        "battingOrder:primaryFamily"
      );
    } else if (isSecondaryFamily(boRoot, dailyProfile)) {
      award(
        "battingOrder", `Batting ${boRoot} — Secondary Family`,
        "family_support", weights.secondaryFamilyMatch,
        `Batting position ${boRoot} belongs to secondary family [${dailyProfile.secondaryFamily.join("–")}].`,
        "battingOrder:secondaryFamily"
      );
    }
  }

  // ── Life Path ─────────────────────────────────────────────────────────────
  const lp = playerProfile.lifePathNumber;
  if (lp) {
    const udMaster = dailyProfile.universalDay.master;
    if (udMaster != null && (lp.compound === udMaster || lp.master === udMaster)) {
      award(
        "lifePath", `Life Path ${lp.compound}${lp.master ? `/${lp.root}` : ""} — Master Match`,
        "primary_exact_master", weights.lifePathExactMaster,
        `Life Path ${lp.compound} is a master match to Universal Day ${udMaster}.`,
        "lifePath:master"
      );
    } else if (matchesPrimaryRoot(lp, dailyProfile)) {
      award(
        "lifePath", `Life Path ${lp.compound} — Root Match`,
        "primary_root", weights.lifePathRoot,
        `Life Path ${lp.compound} root ${lp.root} matches Universal Day root.`,
        "lifePath:root"
      );
    } else if (isCountercurrent(lp.root, dailyProfile)) {
      award(
        "lifePath", `Life Path ${lp.compound} — Countercurrent`,
        "countercurrent", -Math.round(weights.countercurrentHighField / 2),
        `Life Path root ${lp.root} is countercurrent.`,
        "lifePath:counter"
      );
    }
  }

  // ── Birth Day ─────────────────────────────────────────────────────────────
  const bd = playerProfile.birthDayNumber;
  if (bd) {
    if (bd.original === dailyProfile.calendarDay.original) {
      award(
        "birthDay", `Birth Day ${bd.original} — Calendar Day Exact`,
        "secondary_exact", weights.birthDayExactCompound,
        `Birth day ${bd.original} matches Calendar Day ${dailyProfile.calendarDay.original}.`,
        "birthDay:calendarExact"
      );
    } else if (matchesPrimaryRoot(bd, dailyProfile)) {
      award(
        "birthDay", `Birth Day ${bd.original}/${bd.root} — Root Match`,
        "primary_root", weights.birthDayRoot,
        `Birth day ${bd.original} reduces to ${bd.root}, matching Universal Day root.`,
        "birthDay:primaryRoot"
      );
    }
  }

  // ── Age ───────────────────────────────────────────────────────────────────
  if (ageOnDate != null) {
    const ageR = reduce(ageOnDate);
    const udMaster = dailyProfile.universalDay.master;
    if (udMaster != null && ageR.compound === udMaster) {
      award("age", `Age ${ageOnDate} — Master Match`, "primary_exact_master", weights.ageExactCompound, `Age ${ageOnDate} matches Universal Day master.`, "age:master");
    } else if (matchesPrimaryRoot(ageR, dailyProfile)) {
      award("age", `Age ${ageOnDate} root ${ageR.root} — Root Match`, "primary_root", weights.ageRoot, `Age ${ageOnDate} reduces to ${ageR.root}.`, "age:root");
    }
  }

  // ── Expression Number ─────────────────────────────────────────────────────
  const expr = playerProfile.expressionNumber;
  if (expr && matchesPrimaryRoot(expr, dailyProfile)) {
    award(
      "expression", `Expression Number ${expr.compound} — Root Match`,
      "name_resonance", weights.expressionRoot,
      `Name Expression Number ${expr.compound} (${expr.root}) matches Universal Day root.`,
      "expression:root"
    );
  }

  // ── Repeated Date Digits ──────────────────────────────────────────────────
  for (const rep of dailyProfile.repeatedDigits) {
    const jerseyR = playerProfile.jerseyReduced?.root;
    const boNum = playerProfile.battingOrder;
    if ((jerseyR === rep.digit || boNum === rep.digit) && rep.reinforces === "primary") {
      award(
        "repeatedDigit", `Date digit ${rep.digit} appears ${rep.count}× — Contextual Echo`,
        "contextual_echo", weights.repeatedDateDigit,
        `Digit ${rep.digit} repeats ${rep.count} times in today's date.`,
        `repeatedDigit:${rep.digit}`
      );
    }
  }

  // ── Compute totals ────────────────────────────────────────────────────────
  const positiveSignals = signals.filter((s) => s.points > 0);
  const negativeSignals = signals.filter((s) => s.points < 0);
  const positiveTotal = positiveSignals.reduce((a, s) => a + s.points, 0);
  const countercurrentTotal = Math.abs(negativeSignals.reduce((a, s) => a + s.points, 0));

  // Convergence bonus: independent source fields that all positively match
  const independentPositiveSources = new Set(
    positiveSignals
      .filter((s) => s.type !== "family_support" && s.type !== "contextual_echo")
      .map((s) => s.sourceFields[0].split(":")[0])
  );
  const convergenceBonus = Math.min(
    independentPositiveSources.size >= 4
      ? weights.convergenceMaxBonus
      : independentPositiveSources.size >= 3
      ? Math.round(weights.convergenceMaxBonus * 0.5)
      : 0,
    weights.convergenceMaxBonus
  );

  const rawNumerology = Math.max(0, positiveTotal - countercurrentTotal + convergenceBonus);
  // Scale to 0-100 (assume 60 raw points = 100)
  const numerologyResonanceScore = Math.min(100, Math.round((rawNumerology / 60) * 100));
  const finalAlignmentScore = Math.round(
    weights.numerologyWeight * numerologyResonanceScore +
    weights.baseballWeight * baseballOpportunityScore
  );

  return {
    signals,
    positiveTotal,
    countercurrentTotal,
    convergenceBonus,
    numerologyResonanceScore,
    baseballOpportunityScore,
    finalAlignmentScore,
    formula: `Final = ${Math.round(weights.numerologyWeight * 100)}% × ${numerologyResonanceScore} (Numerology) + ${Math.round(weights.baseballWeight * 100)}% × ${baseballOpportunityScore} (Baseball) = ${finalAlignmentScore}`,
  };
}

/**
 * numerology-scoring-engine.mjs
 * Pure scoring function — no file I/O, importable by both generator and tests.
 *
 * Signal-type hierarchy (enforced in field scoring order):
 *   1. UD exact master
 *   2. UD exact compound (original === rawSum)
 *   3. UD root match
 *   4. Primary-family support
 *   5. Calendar Day exact / secondary root / secondary family
 *   6. Countercurrent (negative)
 *   7. Contextual echo
 *
 * Synergy: only "primary_root" | "personal_cycle" | "name_resonance" qualify
 * as a Tier-1 root match for the exact+root synergy bonus.
 *
 * @param {object} playerProfile  Pre-computed numerology fields (generator format)
 * @param {object} dailyProfile   Internal generator daily profile
 * @param {object} config         Derived from METHODOLOGY JSON
 * @returns {object}              Scoring result
 */

// Signal types that qualify as a root match for synergy purposes
const ROOT_MATCH_SIGNAL_TYPES = new Set(["primary_root", "personal_cycle", "name_resonance"]);

/**
 * @param {object} playerProfile
 *   jerseyNumber, jerseyReduced, battingOrder, age, ageReduced,
 *   personalDay, lifePath, birthDayNum, expressionNum
 * @param {object} dailyProfile
 *   universalDay, calendarDay, primaryFamily, secondaryFamily,
 *   countercurrent, repeatedDigits
 * @param {object} config
 *   W (weights), TIER1_FIELDS (Set), TIER2_FIELDS (Set),
 *   INDIRECT_DECAY (number[]), MODEL_VERSION (string)
 */
export function scorePlayerProfile(playerProfile, dailyProfile, config) {
  const { W, TIER1_FIELDS, TIER2_FIELDS, INDIRECT_DECAY, MODEL_VERSION } = config;

  const ud = dailyProfile.universalDay;
  const target = ud.rawSum;
  const udRoot = ud.root;
  const udMaster = ud.master;
  const counter = dailyProfile.countercurrent;
  const primary = dailyProfile.primaryFamily ?? [];
  const secondary = dailyProfile.secondaryFamily ?? [];

  const rawSignals = [];
  const awarded = new Set();

  function getFieldTier(field) {
    if (TIER1_FIELDS.has(field)) return 1;
    if (TIER2_FIELDS.has(field)) return 2;
    return 3;
  }

  function awardRaw(field, label, type, rawPoints, description, key, isDirect) {
    if (awarded.has(key) || rawPoints === 0) return;
    awarded.add(key);
    rawSignals.push({ field, label, type, rawPoints, description, isDirect, tier: getFieldTier(field) });
  }

  // ── Personal Day (Tier1) ──────────────────────────────────────────────────
  const pd = playerProfile.personalDay;
  if (pd) {
    if (udMaster != null && (pd.compound === udMaster || pd.master === udMaster)) {
      awardRaw("personalDay", `Personal Day ${pd.compound}/${pd.root} — Master Match`, "primary_exact_master", W.personalDayExactMaster, `Personal Day matches Universal Day master ${udMaster}.`, "pd:master", true);
    } else if (pd.original === target || pd.compound === target) {
      awardRaw("personalDay", `Personal Day ${pd.original}/${pd.root} — Exact Target`, "primary_exact_root", W.personalDayExact, `Personal Day ${pd.original} matches Universal Day ${target}.`, "pd:exact", true);
    } else if (pd.root === udRoot) {
      awardRaw("personalDay", `Personal Day ${pd.original}/${pd.root} — Root Match`, "personal_cycle", W.personalDayRoot, `Personal Day root ${pd.root} matches Universal Day root.`, "pd:root", false);
    } else if (pd.root === counter) {
      awardRaw("personalDay", `Personal Day — Countercurrent`, "countercurrent", -(W.countercurrentHighField ?? 7), `Personal Day root ${pd.root} is the countercurrent.`, "pd:counter", false);
    }
  }

  // ── Life Path (Tier1) ─────────────────────────────────────────────────────
  const lp = playerProfile.lifePath;
  if (lp) {
    if (udMaster != null && (lp.compound === udMaster || lp.master === udMaster)) {
      awardRaw("lifePath", `Life Path ${lp.compound} — Master Match`, "primary_exact_master", W.lifePathExactMaster, `Life Path matches Universal Day master.`, "lp:master", true);
    } else if (lp.original === target || lp.compound === target) {
      awardRaw("lifePath", `Life Path ${lp.original}/${lp.root} — Exact Target`, "primary_exact_root", W.lifePathExact, `Life Path ${lp.original} exactly matches Universal Day ${target}.`, "lp:exact", true);
    } else if (lp.root === udRoot) {
      awardRaw("lifePath", `Life Path ${lp.compound}/${lp.root} — Root Match`, "primary_root", W.lifePathRoot, `Life Path ${lp.compound} root ${lp.root} matches Universal Day root.`, "lp:root", false);
    } else if (lp.root === counter) {
      awardRaw("lifePath", `Life Path — Countercurrent`, "countercurrent", -(W.countercurrentHighField ?? 7), `Life Path root ${lp.root} is countercurrent.`, "lp:counter", false);
    }
  }

  // ── Birth Day (Tier1) — root match evaluated before Calendar Day exact ─────
  const bd = playerProfile.birthDayNum;
  if (bd) {
    if (udMaster != null && (bd.compound === udMaster || bd.original === udMaster)) {
      awardRaw("birthDay", `Birth Day ${bd.original} — Master Match`, "primary_exact_master", W.birthDayExactMaster ?? 24, `Birth day matches Universal Day master.`, "bd:master", true);
    } else if (bd.original === target || bd.compound === target) {
      awardRaw("birthDay", `Birth Day ${bd.original} — Exact Target`, "primary_exact_root", W.birthDayExact, `Birth day exactly matches Universal Day ${target}.`, "bd:exactTarget", true);
    } else if (bd.root === udRoot) {
      // Root match is stronger than Calendar Day exact — evaluated first
      awardRaw("birthDay", `Birth Day ${bd.original}/${bd.root} — Reduces to Target`, "primary_root", W.birthDayRoot, `Birth day root ${bd.root} reduces to Universal Day root.`, "bd:root", false);
    } else if (daily_calendarDayOriginal(dailyProfile) !== null && bd.original === daily_calendarDayOriginal(dailyProfile)) {
      awardRaw("birthDay", `Birth Day ${bd.original} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, `Birth day matches Calendar Day ${daily_calendarDayOriginal(dailyProfile)}.`, "bd:calendar", false);
    } else if (primary.includes(bd.root) && bd.root !== counter) {
      awardRaw("birthDay", `Birth Day ${bd.original}/${bd.root} — Primary Family`, "family_support", W.primaryFamilyMatchTier1 ?? W.primaryFamilyMatch, `Birth day root ${bd.root} is in primary family.`, "bd:family", false);
    }
  }

  // ── Expression (Tier1) ────────────────────────────────────────────────────
  const expr = playerProfile.expressionNum;
  if (expr) {
    if (udMaster != null && (expr.compound === udMaster || expr.original === udMaster)) {
      awardRaw("expression", `Expression ${expr.compound}/${expr.root} — Master Match`, "primary_exact_master", W.jerseyExactMaster ?? 24, `Expression matches Universal Day master.`, "expression:master", true);
    } else if (expr.original === target || expr.compound === target) {
      awardRaw("expression", `Expression ${expr.compound} — Exact Target`, "primary_exact_root", W.expressionExact, `Expression ${expr.compound} matches Universal Day ${target}.`, "expression:exact", true);
    } else if (expr.root === udRoot) {
      awardRaw("expression", `Expression ${expr.compound}/${expr.root} — Reduces to Target`, "name_resonance", W.expressionRoot, `Name Expression root reduces to Universal Day root.`, "expression:root", false);
    }
  }

  // ── Jersey (Tier2) — UD exact evaluated before Calendar Day exact ─────────
  const j = playerProfile.jerseyReduced;
  const jerseyNo = playerProfile.jerseyNumber;
  if (j) {
    const calDayOrig = daily_calendarDayOriginal(dailyProfile);
    if (udMaster != null && (j.compound === udMaster || j.original === udMaster)) {
      awardRaw("jersey", `Jersey ${jerseyNo} — Exact Master`, "primary_exact_master", W.jerseyExactMaster, `Jersey ${jerseyNo} matches Universal Day master.`, "jersey:master", true);
    } else if (j.original === target) {
      // UD exact before Calendar Day exact
      awardRaw("jersey", `Jersey ${jerseyNo} — Exact Target`, "primary_exact_root", W.jerseyExact, `Jersey ${jerseyNo} matches Universal Day ${target}.`, "jersey:udexact", true);
    } else if (j.root === udRoot) {
      awardRaw("jersey", `Jersey ${jerseyNo}/${j.root} — Root Match`, "primary_root", W.jerseyRoot, `Jersey ${jerseyNo} reduces to ${j.root}.`, "jersey:root", false);
    } else if (calDayOrig !== null && j.original === calDayOrig) {
      awardRaw("jersey", `Jersey ${jerseyNo} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, `Jersey ${jerseyNo} equals Calendar Day ${calDayOrig}.`, "jersey:calexact", false);
    } else if (j.root === daily_calendarDayRoot(dailyProfile) && j.root !== udRoot) {
      awardRaw("jersey", `Jersey ${jerseyNo}/${j.root} — Secondary Root`, "secondary_root", W.calendarDayRoot, `Jersey root ${j.root} matches Calendar Day root.`, "jersey:secroot", false);
    } else if (j.root === counter) {
      awardRaw("jersey", `Jersey ${jerseyNo} — Countercurrent`, "countercurrent", -(W.countercurrentTier2 ?? 5), `Jersey root is countercurrent.`, "jersey:counter", false);
    } else if (primary.includes(j.root)) {
      awardRaw("jersey", `Jersey root ${j.root} — Primary Family`, "family_support", W.primaryFamilyMatch, `Jersey root belongs to family [${primary.join("–")}].`, "jersey:family", false);
    } else if (secondary.includes(j.root)) {
      awardRaw("jersey", `Jersey root ${j.root} — Secondary Family`, "family_support", W.secondaryFamilyMatch, `Jersey root belongs to secondary family.`, "jersey:secfam", false);
    }
  }

  // ── Age (Tier2) ───────────────────────────────────────────────────────────
  const age = playerProfile.age;
  const ageR = playerProfile.ageReduced;
  if (ageR != null) {
    if (udMaster != null && (ageR.original === udMaster || ageR.compound === udMaster)) {
      awardRaw("age", `Age ${age} — Master Match`, "primary_exact_master", W.ageExactMaster ?? 24, `Age ${age} matches Universal Day master.`, "age:master", true);
    } else if (ageR.original === target || ageR.compound === target) {
      awardRaw("age", `Age ${age} — Exact Target`, "primary_exact_root", W.ageExact, `Age ${age} matches Universal Day ${target}.`, "age:exact", true);
    } else if (ageR.root === udRoot) {
      awardRaw("age", `Age ${age} root ${ageR.root} — Reduces to Target`, "primary_root", W.ageRoot, `Age ${age} reduces to root ${ageR.root}.`, "age:root", false);
    }
  }

  // ── Batting order (Tier3) ─────────────────────────────────────────────────
  const bo = playerProfile.battingOrder;
  if (bo != null && bo >= 1 && bo <= 9) {
    if (bo === udRoot) {
      awardRaw("battingOrder", `Batting ${bo} — Exact Root Match`, "primary_exact_root", W.battingOrderExactRoot, `Batting ${bo} exactly matches Universal Day root.`, "bo:exact", false);
    } else if (primary.includes(bo)) {
      awardRaw("battingOrder", `Batting ${bo} — Primary Family`, "family_support", W.primaryFamilyMatch, `Batting ${bo} belongs to primary family.`, "bo:primfam", false);
    } else if (secondary.includes(bo)) {
      awardRaw("battingOrder", `Batting ${bo} — Secondary Family`, "family_support", W.secondaryFamilyMatch, `Batting ${bo} belongs to secondary family.`, "bo:secfam", false);
    }
  }

  // ── Repeated digits (Tier3) ───────────────────────────────────────────────
  for (const rep of dailyProfile.repeatedDigits ?? []) {
    const jerseyMatch = j?.root === rep.digit || j?.original === rep.digit;
    const boMatch = bo === rep.digit;
    if ((jerseyMatch || boMatch) && rep.reinforces === "primary") {
      awardRaw("repeatedDigit", `Date digit ${rep.digit} (×${rep.count}) — Contextual Echo`, "contextual_echo", W.repeatedDateDigit, `Digit ${rep.digit} repeats ${rep.count}× in today's date.`, `rep:${rep.digit}`, false);
    }
  }

  // ── Separate direct / indirect / countercurrent ───────────────────────────
  const directPositive = rawSignals.filter(s => s.isDirect && s.rawPoints > 0);
  const indirectPositive = rawSignals.filter(s => !s.isDirect && s.rawPoints > 0);
  const negativeRaw = rawSignals.filter(s => s.rawPoints < 0);

  const sortedIndirect = [...indirectPositive].sort((a, b) =>
    a.tier - b.tier || b.rawPoints - a.rawPoints || a.field.localeCompare(b.field)
  );

  const finalSignals = [];

  for (const s of directPositive) {
    finalSignals.push({ field: s.field, label: s.label, type: s.type, points: s.rawPoints, description: s.description, rawPoints: s.rawPoints, fieldTier: s.tier });
  }

  for (let i = 0; i < sortedIndirect.length; i++) {
    const s = sortedIndirect[i];
    const multiplier = INDIRECT_DECAY[Math.min(i, INDIRECT_DECAY.length - 1)];
    const adjusted = Math.max(1, Math.round(s.rawPoints * multiplier));
    finalSignals.push({ field: s.field, label: s.label, type: s.type, points: adjusted, description: s.description, rawPoints: s.rawPoints, indirectMultiplier: multiplier, fieldTier: s.tier });
  }

  for (const s of negativeRaw) {
    finalSignals.push({ field: s.field, label: s.label, type: s.type, points: s.rawPoints, description: s.description });
  }

  if (negativeRaw.length >= 2) {
    const penalty = -(W.countercurrentMultiple * (negativeRaw.length - 1));
    finalSignals.push({ field: "multiCountercurrent", label: `${negativeRaw.length} independent countercurrents`, type: "countercurrent", points: penalty, description: `Multiple independent countercurrent signals compound.` });
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const positiveTotal = finalSignals.filter(s => s.points > 0).reduce((a, s) => a + s.points, 0);
  const countercurrentTotal = Math.abs(finalSignals.filter(s => s.points < 0).reduce((a, s) => a + s.points, 0));

  // ── Synergy: Tier1 exact + Tier1 ROOT MATCH (qualifying types only) ───────
  const tier1ExactFields = new Set(directPositive.filter(s => s.tier === 1).map(s => s.field));
  const tier1RootFields = new Set(
    indirectPositive.filter(s => s.tier === 1 && ROOT_MATCH_SIGNAL_TYPES.has(s.type)).map(s => s.field)
  );

  let synergyBonus = 0;
  if (tier1ExactFields.size >= 2) {
    synergyBonus = W.synergyDoubleExactTier1 ?? 12;
    if (tier1ExactFields.size >= 3) synergyBonus += W.synergyTripleExactTier1 ?? 6;
  } else if (tier1ExactFields.size === 1 && tier1RootFields.size >= 1) {
    synergyBonus = W.synergyExactPlusRootTier1 ?? 4;
  }

  const normCeiling = W.normCeiling ?? 76;
  const normalizationDenominator = normCeiling;
  const convergenceBonus = 0;
  const exactComboBonus = synergyBonus;
  const rawNumerology = Math.max(0, positiveTotal - countercurrentTotal + synergyBonus);
  const numerologyScore = Math.min(100, Math.round((rawNumerology / normCeiling) * 100));

  return {
    signals: finalSignals,
    positiveTotal,
    countercurrentTotal,
    convergenceBonus,
    exactComboBonus,
    synergyBonus,
    rawNumerology,
    normCeiling,
    normalizationDenominator,
    numerologyScore,
    modelVersion: MODEL_VERSION ?? "3.0.0",
  };
}

// ── Helpers for extracting calendar day values from generator-format daily ───
function daily_calendarDayOriginal(dailyProfile) {
  return dailyProfile.calendarDay?.original ?? null;
}

function daily_calendarDayRoot(dailyProfile) {
  return dailyProfile.calendarDay?.root ?? null;
}

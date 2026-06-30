import type { DailyProfile, NumerologyScoreBreakdown, NumerologySignal } from "@/types/mlbNumerology";

export type PlayerIdentity = { birthDate?: string | null; jerseyNumber?: number | null };
export type AuditablePlayer = { playerName: string; jerseyNumber?: number | null; battingOrder?: number | null; numerologyScore: number };

type Reduced = { original: number; compound: number; master: number | null; root: number };

const MASTER = new Set([11, 22, 33]);
const FAMILY = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];
const PYTH: Record<string, number> = { a:1,j:1,s:1,b:2,k:2,t:2,c:3,l:3,u:3,d:4,m:4,v:4,e:5,n:5,w:5,f:6,o:6,x:6,g:7,p:7,y:7,h:8,q:8,z:8,i:9,r:9 };

// Default weights (mirrors config/mlb-numerology-methodology.json v3.0.0)
const DEFAULT_WEIGHTS: Record<string, number> = {
  personalDayExactMaster: 24, personalDayExact: 22, personalDayRoot: 11,
  jerseyExactMaster: 24, jerseyExact: 18, jerseyRoot: 9,
  battingOrderExactRoot: 8, battingOrderRoot: 5,
  lifePathExactMaster: 24, lifePathExact: 22, lifePathRoot: 11,
  birthDayExactMaster: 24, birthDayExact: 22, birthDayRoot: 11,
  ageExactMaster: 24, ageExact: 15, ageRoot: 8,
  expressionExact: 22, expressionRoot: 11,
  primaryFamilyMatchTier1: 5, primaryFamilyMatch: 3,
  calendarDayExactCompound: 8, calendarDayRoot: 4,
  secondaryFamilyMatch: 1, repeatedDateDigit: 2,
  countercurrentHighField: 7, countercurrentTier2: 5, countercurrentTier3: 3,
  countercurrentMultiple: 3,
  synergyDoubleExactTier1: 12, synergyTripleExactTier1: 6, synergyExactPlusRootTier1: 4,
  normCeiling: 76,
  convergenceMaxBonus: 0, exactComboBonus: 0, birthdayComboBonus: 0,
};

// Diminishing returns schedule: 1st→100%, 2nd→70%, 3rd→40%, 4th+→20%
const INDIRECT_DECAY = [1.0, 0.7, 0.4, 0.2];

const TIER1_FIELDS = new Set(["personalDay", "lifePath", "birthDay", "expression"]);
const TIER2_FIELDS = new Set(["age", "jersey"]);
function getFieldTier(field: string): 1 | 2 | 3 {
  if (TIER1_FIELDS.has(field)) return 1;
  if (TIER2_FIELDS.has(field)) return 2;
  return 3;
}

function digitSum(n: number): number {
  return String(Math.abs(Math.round(n))).split("").reduce((a, d) => a + Number(d), 0);
}

function reduce(n: number): Reduced {
  const o = Math.abs(Math.round(n));
  if (o < 10) return { original: o, compound: o, master: null, root: o };
  if (MASTER.has(o)) return { original: o, compound: o, master: o, root: digitSum(o) };
  const c = digitSum(o);
  if (MASTER.has(c)) return { original: o, compound: c, master: c, root: digitSum(c) };
  let r = c;
  while (r > 9) r = digitSum(r);
  return { original: o, compound: c, master: null, root: r };
}

function fmt(v: Reduced | null): string | null {
  if (!v) return null;
  return v.original === v.root ? String(v.root) : `${v.original}/${v.root}`;
}

function normName(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

function expressionNum(name: string): Reduced {
  return reduce([...normName(name)].reduce((a, c) => a + (PYTH[c] ?? 0), 0));
}

function lifePathNum(dateStr: string): Reduced {
  return reduce([...dateStr.replace(/\D/g, "")].reduce((a, x) => a + Number(x), 0));
}

function ageOn(birth: string, slate: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [sy, sm, sd] = slate.split("-").map(Number);
  return sy - by - (sm < bm || (sm === bm && sd < bd) ? 1 : 0);
}

type RawSignal = {
  field: string; label: string; type: NumerologySignal["type"];
  rawPoints: number; description: string; isDirect: boolean; tier: 1 | 2 | 3;
};

export function calculateNumerologyScoreBreakdown(
  player: AuditablePlayer,
  identity: PlayerIdentity | null,
  daily: DailyProfile,
  slateDate: string,
  configured?: Record<string, number>,
): NumerologyScoreBreakdown {
  const W = { ...DEFAULT_WEIGHTS, ...(configured ?? {}) };
  const [, monthStr, dayStr] = slateDate.split("-");
  const month = Number(monthStr);
  const day = Number(dayStr);

  const birth = identity?.birthDate ?? null;
  const jerseyNo = player.jerseyNumber ?? identity?.jerseyNumber ?? null;
  const batting = player.battingOrder ?? null;

  const jersey = jerseyNo == null ? null : reduce(jerseyNo);
  const age = birth ? ageOn(birth, slateDate) : null;
  const ageR = age == null ? null : reduce(age);
  const life = birth ? lifePathNum(birth) : null;
  const birthDay = birth ? reduce(Number(birth.slice(-2))) : null;
  const py = birth ? reduce(Number(birth.slice(5, 7)) + Number(birth.slice(-2)) + daily.universalYear) : null;
  const pm = py ? reduce(py.root + month) : null;
  const personal = pm ? reduce(pm.root + day) : null;
  const expr = expressionNum(player.playerName);

  const target = daily.universalDayRawSum;
  const udRoot = daily.universalDayRoot;
  const udMaster = daily.universalDayMaster;
  const counter = daily.countercurrent;
  const primary = daily.primaryFamily ?? FAMILY.find(f => f.includes(udRoot)) ?? [];
  const secondary = daily.secondaryFamily ?? [];

  const rawSignals: RawSignal[] = [];
  const used = new Set<string>();

  function awardRaw(
    field: string, label: string, type: NumerologySignal["type"],
    rawPoints: number, description: string, key: string, isDirect: boolean,
  ) {
    if (used.has(key)) return;
    used.add(key);
    rawSignals.push({ field, label, type, rawPoints, description, isDirect, tier: getFieldTier(field) });
  }

  // ── Personal Day (Tier1) ──────────────────────────────────────────────────
  if (personal) {
    if (udMaster != null && (personal.compound === udMaster || personal.master === udMaster)) {
      awardRaw("personalDay", `Personal Day ${fmt(personal)} — Master Match`, "primary_exact_master", W.personalDayExactMaster, "Personal Day matches Universal Day master.", "pd:master", true);
    } else if (personal.original === target || personal.compound === target) {
      awardRaw("personalDay", `Personal Day ${fmt(personal)} — Exact Target`, "primary_exact_root", W.personalDayExact, `Personal Day ${personal.original} matches Universal Day ${target}.`, "pd:exact", true);
    } else if (personal.root === udRoot) {
      awardRaw("personalDay", `Personal Day ${fmt(personal)} — Root Match`, "personal_cycle", W.personalDayRoot, `Personal Day root ${personal.root} matches Universal Day root.`, "pd:root", false);
    } else if (personal.root === counter) {
      awardRaw("personalDay", `Personal Day ${fmt(personal)} — Countercurrent`, "countercurrent", -(W.countercurrentHighField ?? 7), `Personal Day root is the countercurrent.`, "pd:counter", false);
    }
  }

  // ── Life Path (Tier1) — exact compound check before root ──────────────────
  if (life) {
    if (udMaster != null && (life.compound === udMaster || life.master === udMaster)) {
      awardRaw("lifePath", `Life Path ${fmt(life)} — Master Match`, "primary_exact_master", W.lifePathExactMaster, "Life Path matches Universal Day master.", "lp:master", true);
    } else if (life.original === target || life.compound === target) {
      awardRaw("lifePath", `Life Path ${fmt(life)} — Exact Target`, "primary_exact_root", W.lifePathExact, `Life Path ${life.original} exactly matches Universal Day ${target}.`, "lp:exact", true);
    } else if (life.root === udRoot) {
      awardRaw("lifePath", `Life Path ${fmt(life)} — Root Match`, "primary_root", W.lifePathRoot, `Life Path ${life.compound} root ${life.root} matches Universal Day root.`, "lp:root", false);
    } else if (life.root === counter) {
      awardRaw("lifePath", `Life Path ${fmt(life)} — Countercurrent`, "countercurrent", -(W.countercurrentHighField ?? 7), `Life Path root is countercurrent.`, "lp:counter", false);
    }
  }

  // ── Birth Day (Tier1) ─────────────────────────────────────────────────────
  if (birthDay) {
    if (udMaster != null && (birthDay.compound === udMaster || birthDay.original === udMaster)) {
      awardRaw("birthDay", `Birth Day ${fmt(birthDay)} — Master Match`, "primary_exact_master", W.birthDayExactMaster, "Birth day matches Universal Day master.", "birth:master", true);
    } else if (birthDay.original === target || birthDay.compound === target) {
      awardRaw("birthDay", `Birth Day ${fmt(birthDay)} — Exact Target`, "primary_exact_root", W.birthDayExact, `Birth day exactly matches Universal Day ${target}.`, "birth:exactTarget", true);
    } else if (birthDay.original === daily.calendarDayCompound) {
      awardRaw("birthDay", `Birth Day ${birthDay.original} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, "Birth day equals the calendar day.", "birth:calendar", false);
    } else if (birthDay.root === udRoot) {
      awardRaw("birthDay", `Birth Day ${fmt(birthDay)} — Reduces to Target`, "primary_root", W.birthDayRoot, `Birth day reduces to today's root ${udRoot}.`, "birth:root", false);
    } else if (primary.includes(birthDay.root) && birthDay.root !== counter) {
      awardRaw("birthDay", `Birth Day ${fmt(birthDay)} — Primary Family`, "family_support", W.primaryFamilyMatchTier1 ?? W.primaryFamilyMatch, `Birth day root ${birthDay.root} is in primary family.`, "birth:family", false);
    }
  }

  // ── Expression (Tier1) ────────────────────────────────────────────────────
  if (udMaster != null && (expr.compound === udMaster || expr.original === udMaster)) {
    awardRaw("expression", `Expression ${fmt(expr)} — Master Match`, "primary_exact_master", W.jerseyExactMaster ?? 24, "Expression matches Universal Day master.", "expression:master", true);
  } else if (expr.original === target || expr.compound === target) {
    awardRaw("expression", `Expression ${fmt(expr)} — Exact Target`, "primary_exact_root", W.expressionExact, `Expression exactly matches Universal Day ${target}.`, "expression:exact", true);
  } else if (expr.root === udRoot) {
    awardRaw("expression", `Expression ${fmt(expr)} — Reduces to Target`, "name_resonance", W.expressionRoot, "Name Expression reduces to today's root.", "expression:root", false);
  }

  // ── Jersey (Tier2) ────────────────────────────────────────────────────────
  if (jersey) {
    if (udMaster != null && (jersey.compound === udMaster || jersey.original === udMaster)) {
      awardRaw("jersey", `Jersey ${jerseyNo} — Exact Master`, "primary_exact_master", W.jerseyExactMaster, "Jersey matches Universal Day master.", "jersey:master", true);
    } else if (jersey.original === daily.calendarDayCompound) {
      awardRaw("jersey", `Jersey ${jerseyNo} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, "Jersey equals the calendar day.", "jersey:calendar", false);
    } else if (jersey.original === target) {
      awardRaw("jersey", `Jersey ${jerseyNo} — Exact Target`, "primary_exact_root", W.jerseyExact, `Jersey ${jerseyNo} matches Universal Day ${target}.`, "jersey:udexact", true);
    } else if (jersey.root === udRoot) {
      awardRaw("jersey", `Jersey ${jerseyNo}/${jersey.root} — Root Match`, "primary_root", W.jerseyRoot, `Jersey reduces to ${jersey.root}.`, "jersey:root", false);
    } else if (jersey.root === daily.calendarDayRoot && jersey.root !== udRoot) {
      awardRaw("jersey", `Jersey ${jerseyNo}/${jersey.root} — Secondary Root`, "secondary_root", W.calendarDayRoot, "Jersey root matches Calendar Day root.", "jersey:secroot", false);
    } else if (jersey.root === counter) {
      awardRaw("jersey", `Jersey ${jerseyNo} — Countercurrent`, "countercurrent", -(W.countercurrentTier2 ?? 5), "Jersey root is countercurrent.", "jersey:counter", false);
    } else if (primary.includes(jersey.root)) {
      awardRaw("jersey", `Jersey root ${jersey.root} — Primary Family`, "family_support", W.primaryFamilyMatch, "Jersey root belongs to the primary family.", "jersey:family", false);
    } else if (secondary.includes(jersey.root)) {
      awardRaw("jersey", `Jersey root ${jersey.root} — Secondary Family`, "family_support", W.secondaryFamilyMatch, "Jersey root belongs to the secondary family.", "jersey:secfam", false);
    }
  }

  // ── Age (Tier2) ───────────────────────────────────────────────────────────
  if (ageR) {
    if (udMaster != null && (ageR.original === udMaster || ageR.compound === udMaster)) {
      awardRaw("age", `Age ${age} — Master Match`, "primary_exact_master", W.ageExactMaster ?? 24, "Age matches Universal Day master.", "age:master", true);
    } else if (ageR.original === target || ageR.compound === target) {
      awardRaw("age", `Age ${age} — Exact Target`, "primary_exact_root", W.ageExact, `Age ${age} matches Universal Day ${target}.`, "age:exact", true);
    } else if (ageR.root === udRoot) {
      awardRaw("age", `Age ${age} root ${ageR.root} — Reduces to Target`, "primary_root", W.ageRoot, `Age ${age} reduces to root ${ageR.root}.`, "age:root", false);
    }
  }

  // ── Batting order (Tier3) ─────────────────────────────────────────────────
  if (batting != null) {
    if (batting === udRoot) {
      awardRaw("battingOrder", `Batting ${batting} — Exact Root Match`, "primary_exact_root", W.battingOrderExactRoot, "Batting order equals today's root.", "batting:root", false);
    } else if (primary.includes(batting)) {
      awardRaw("battingOrder", `Batting ${batting} — Primary Family`, "family_support", W.primaryFamilyMatch, "Batting order belongs to the primary family.", "batting:family", false);
    } else if (secondary.includes(batting)) {
      awardRaw("battingOrder", `Batting ${batting} — Secondary Family`, "family_support", W.secondaryFamilyMatch, "Batting order belongs to the secondary family.", "batting:secfam", false);
    }
  }

  // ── Repeated digits (Tier3) ───────────────────────────────────────────────
  for (const repeated of daily.repeatedDigits ?? []) {
    if (repeated.reinforces === "primary" && ((jersey?.root === repeated.digit) || (jersey?.original === repeated.digit) || batting === repeated.digit)) {
      awardRaw("repeatedDigit", `Date digit ${repeated.digit} (×${repeated.count}) — Contextual Echo`, "contextual_echo", W.repeatedDateDigit, "Repeated date digit reinforces an existing field.", `repeat:${repeated.digit}`, false);
    }
  }

  // ── Separate direct vs indirect vs countercurrent ─────────────────────────
  const directPositive = rawSignals.filter(s => s.isDirect && s.rawPoints > 0);
  const indirectPositive = rawSignals.filter(s => !s.isDirect && s.rawPoints > 0);
  const negativeRaw = rawSignals.filter(s => s.rawPoints < 0);

  // Sort indirect: tier asc → rawPoints desc → field alpha (deterministic decay order)
  const sortedIndirect = [...indirectPositive].sort((a, b) =>
    a.tier - b.tier || b.rawPoints - a.rawPoints || a.field.localeCompare(b.field),
  );

  const finalSignals: NumerologySignal[] = [];

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
    finalSignals.push({ field: "multiCountercurrent", label: `${negativeRaw.length} independent countercurrents`, type: "countercurrent", points: penalty, description: "Multiple countercurrents compound." });
  }

  // ── Compute totals ─────────────────────────────────────────────────────────
  const positiveTotal = finalSignals.filter(s => s.points > 0).reduce((a, s) => a + s.points, 0);
  const countercurrentTotal = Math.abs(finalSignals.filter(s => s.points < 0).reduce((a, s) => a + s.points, 0));

  // ── Synergy bonus ──────────────────────────────────────────────────────────
  const tier1ExactFields = new Set(directPositive.filter(s => s.tier === 1).map(s => s.field));
  const tier1IndirectFields = new Set(indirectPositive.filter(s => s.tier === 1).map(s => s.field));
  let synergyBonus = 0;
  if (tier1ExactFields.size >= 2) {
    synergyBonus = W.synergyDoubleExactTier1 ?? 12;
    if (tier1ExactFields.size >= 3) synergyBonus += W.synergyTripleExactTier1 ?? 6;
  } else if (tier1ExactFields.size === 1 && tier1IndirectFields.size >= 1) {
    synergyBonus = W.synergyExactPlusRootTier1 ?? 4;
  }

  const normCeiling = W.normCeiling ?? 76;
  const convergenceBonus = 0;
  const exactComboBonus = synergyBonus;
  const rawNumerology = Math.max(0, positiveTotal - countercurrentTotal + synergyBonus);
  const calculatedScore = Math.min(100, Math.round((rawNumerology / normCeiling) * 100));

  // ── Audit metadata ─────────────────────────────────────────────────────────
  const EXACT_PRIMARY_TYPES = new Set(["primary_exact_master", "primary_exact_root"]);
  const exactPrimaryCount = finalSignals.filter(s => s.points > 0 && EXACT_PRIMARY_TYPES.has(s.type)).length;
  const hasBirthdayExact = finalSignals.some(s => s.points > 0 && EXACT_PRIMARY_TYPES.has(s.type) && s.field === "birthDay");
  const hasBirthdayStrong = finalSignals.some(s => s.points > 0 && (EXACT_PRIMARY_TYPES.has(s.type) || s.type === "primary_root") && s.field === "birthDay");

  const missingData = [!birth ? "birthDate" : null, jerseyNo == null ? "jersey" : null].filter(Boolean) as string[];

  return {
    signals: finalSignals,
    positiveTotal,
    countercurrentTotal,
    convergenceBonus,
    exactComboBonus,
    synergyBonus,
    exactPrimaryCount,
    hasBirthdayExact,
    hasBirthdayStrong,
    rawNumerology,
    normCeiling,
    calculatedScore,
    reportedScore: player.numerologyScore,
    scoreVerified: calculatedScore === Number(player.numerologyScore),
    modelVersion: "3.0.0",
    profile: {
      personalDay: fmt(personal),
      jersey: jersey ? `#${jerseyNo} (${fmt(jersey)})` : null,
      battingOrder: batting == null ? null : String(batting),
      lifePath: fmt(life),
      birthDay: fmt(birthDay),
      age: ageR ? `${age} (${fmt(ageR)})` : null,
      expression: fmt(expr),
    },
    missingData,
  };
}

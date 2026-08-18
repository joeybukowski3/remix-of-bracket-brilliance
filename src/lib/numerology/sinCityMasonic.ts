/**
 * Sin City Masonic Symbol evaluation — a separate Numerology scoring component.
 *
 * Evaluates five symbol fields against the daily Universal Day profile:
 *   Jersey #, Lineup Spot / Batting Order, Birthday, Life Path, Current HR Count.
 *
 * This is intentionally independent of regular field scoring. Overlapping
 * fields (jersey, batting order, birthday, life path) still score normally
 * in mlbScoreAudit; Sin City only awards its own smaller symbol points and
 * combo bonus so those fields are never double-counted at regular weights.
 *
 * Current HR Count is season HR total only. Missing values contribute nothing.
 */

import type { DailyProfile } from "@/types/mlbNumerology";

export const SIN_CITY_FIELD_KEYS = [
  "jersey",
  "battingOrder",
  "birthDay",
  "lifePath",
  "currentHrCount",
] as const;

export type SinCityFieldKey = (typeof SIN_CITY_FIELD_KEYS)[number];

export type SinCityFieldInclusion = Record<SinCityFieldKey, boolean>;

export type SinCityMatchKind = "exact" | "root" | "family" | "none" | "missing";

export interface SinCityMatch {
  field: SinCityFieldKey;
  label: string;
  value: string | null;
  matchKind: SinCityMatchKind;
  points: number;
}

export interface SinCityWeights {
  exact: number;
  root: number;
  family: number;
  combo3: number;
  combo4: number;
  combo5: number;
}

export interface SinCityEvaluation {
  included: boolean;
  matches: SinCityMatch[];
  matchCount: number;
  evaluatedCount: number;
  fieldPoints: number;
  comboBonus: number;
  bonus: number;
  /** Standalone 0–100 grade against SIN_CITY_RAW_CEILING. Never folded into the /76 base ledger. */
  score: number;
  rawCeiling: number;
}

export const SIN_CITY_RAW_CEILING = 21;

export type SinCitySignalTypeKey = "exact" | "root" | "family";
export type SinCitySignalTypeInclusion = Record<SinCitySignalTypeKey, boolean>;

export const DEFAULT_SIN_CITY_SIGNAL_TYPES: SinCitySignalTypeInclusion = {
  exact: true,
  root: true,
  family: true,
};

export const DEFAULT_SIN_CITY_FIELDS: SinCityFieldInclusion = {
  jersey: true,
  battingOrder: true,
  birthDay: true,
  lifePath: true,
  currentHrCount: true,
};

export const DEFAULT_SIN_CITY_WEIGHTS: SinCityWeights = {
  exact: 3,
  root: 2,
  family: 1,
  combo3: 2,
  combo4: 4,
  combo5: 6,
};

const MASTER = new Set([11, 22, 33]);
const FAMILY = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];

function digitSum(n: number): number {
  return String(Math.abs(Math.round(n))).split("").reduce((a, d) => a + Number(d), 0);
}

export function reduceSinCityNumber(n: number): { original: number; compound: number; master: number | null; root: number } {
  const o = Math.abs(Math.round(n));
  if (o < 10) return { original: o, compound: o, master: null, root: o };
  if (MASTER.has(o)) return { original: o, compound: o, master: o, root: digitSum(o) };
  const c = digitSum(o);
  if (MASTER.has(c)) return { original: o, compound: c, master: c, root: digitSum(c) };
  let r = c;
  while (r > 9) r = digitSum(r);
  return { original: o, compound: c, master: null, root: r };
}

function fmt(v: { original: number; root: number } | null): string | null {
  if (!v) return null;
  return v.original === v.root ? String(v.root) : `${v.original}/${v.root}`;
}

export function defaultSinCityFields(overrides?: Partial<SinCityFieldInclusion>): SinCityFieldInclusion {
  return { ...DEFAULT_SIN_CITY_FIELDS, ...overrides };
}

type Reduced = ReturnType<typeof reduceSinCityNumber>;

function classifyMatch(
  value: Reduced,
  daily: DailyProfile,
): Exclude<SinCityMatchKind, "missing"> {
  const target = daily.universalDayRawSum;
  const udRoot = daily.universalDayRoot;
  const udMaster = daily.universalDayMaster;
  const primary = daily.primaryFamily ?? FAMILY.find((f) => f.includes(udRoot)) ?? [];

  if (value.original === 0 && value.root === 0) return "none";

  if (udMaster != null && (value.original === udMaster || value.compound === udMaster || value.master === udMaster)) {
    return "exact";
  }
  if (value.original === target || value.compound === target) return "exact";
  if (value.root === udRoot) return "root";
  if (primary.includes(value.root)) return "family";
  return "none";
}

function pointsFor(kind: SinCityMatchKind, weights: SinCityWeights): number {
  if (kind === "exact") return weights.exact;
  if (kind === "root") return weights.root;
  if (kind === "family") return weights.family;
  return 0;
}

function comboBonusFor(matchCount: number, weights: SinCityWeights): number {
  if (matchCount >= 5) return weights.combo5;
  if (matchCount >= 4) return weights.combo4;
  if (matchCount >= 3) return weights.combo3;
  return 0;
}

const FIELD_LABELS: Record<SinCityFieldKey, string> = {
  jersey: "Jersey #",
  battingOrder: "Lineup Spot / Batting Order",
  birthDay: "Birthday",
  lifePath: "Life Path",
  currentHrCount: "Current HR Count",
};

export interface SinCityInput {
  included: boolean;
  fields?: Partial<SinCityFieldInclusion>;
  includedSignalTypes?: Partial<SinCitySignalTypeInclusion>;
  jerseyNumber?: number | null;
  battingOrder?: number | null;
  birthDay?: Reduced | null;
  lifePath?: Reduced | null;
  currentHrCount?: number | null;
  daily: DailyProfile;
  weights?: Partial<SinCityWeights>;
}

function emptyEvaluation(included: boolean): SinCityEvaluation {
  return {
    included,
    matches: [],
    matchCount: 0,
    evaluatedCount: 0,
    fieldPoints: 0,
    comboBonus: 0,
    bonus: 0,
    score: 0,
    rawCeiling: SIN_CITY_RAW_CEILING,
  };
}

function standaloneScore(bonus: number): number {
  return Math.min(100, Math.round((bonus / SIN_CITY_RAW_CEILING) * 100));
}

export function evaluateSinCityMasonic(input: SinCityInput): SinCityEvaluation {
  if (!input.included) return emptyEvaluation(false);

  const fields = defaultSinCityFields(input.fields);
  const weights = { ...DEFAULT_SIN_CITY_WEIGHTS, ...input.weights };
  const types: SinCitySignalTypeInclusion = {
    ...DEFAULT_SIN_CITY_SIGNAL_TYPES,
    ...input.includedSignalTypes,
  };
  const matches: SinCityMatch[] = [];

  const candidates: Array<{ key: SinCityFieldKey; raw: number | null | undefined; reduced?: Reduced | null }> = [
    { key: "jersey", raw: input.jerseyNumber },
    { key: "battingOrder", raw: input.battingOrder },
    { key: "birthDay", raw: input.birthDay?.original ?? null, reduced: input.birthDay },
    { key: "lifePath", raw: input.lifePath?.original ?? null, reduced: input.lifePath },
    { key: "currentHrCount", raw: input.currentHrCount },
  ];

  for (const candidate of candidates) {
    if (!fields[candidate.key]) continue;

    const raw = candidate.raw;
    if (raw == null || !Number.isFinite(Number(raw))) {
      matches.push({
        field: candidate.key,
        label: `${FIELD_LABELS[candidate.key]} — unavailable`,
        value: null,
        matchKind: "missing",
        points: 0,
      });
      continue;
    }

    const reduced = candidate.reduced ?? reduceSinCityNumber(Number(raw));
    const matchKind = classifyMatch(reduced, input.daily);
    const typeExcluded =
      (matchKind === "exact" && types.exact === false) ||
      (matchKind === "root" && types.root === false) ||
      (matchKind === "family" && types.family === false);
    const points = typeExcluded ? 0 : pointsFor(matchKind, weights);
    const kindLabel = matchKind === "none" ? "No match" : typeExcluded ? `${matchKind} excluded` : matchKind;
    matches.push({
      field: candidate.key,
      label: `${FIELD_LABELS[candidate.key]} ${fmt(reduced)} — ${kindLabel}`,
      value: candidate.key === "jersey"
        ? `#${raw} (${fmt(reduced)})`
        : candidate.key === "currentHrCount"
          ? `${raw} (${fmt(reduced)})`
          : fmt(reduced),
      matchKind,
      points,
    });
  }

  const hits = matches.filter((m) => m.points > 0 && (m.matchKind === "exact" || m.matchKind === "root" || m.matchKind === "family"));
  const fieldPoints = matches.reduce((sum, m) => sum + m.points, 0);
  const comboBonus = comboBonusFor(hits.length, weights);
  const bonus = fieldPoints + comboBonus;

  return {
    included: true,
    matches,
    matchCount: hits.length,
    evaluatedCount: matches.filter((m) => m.matchKind !== "missing").length,
    fieldPoints,
    comboBonus,
    bonus,
    score: standaloneScore(bonus),
    rawCeiling: SIN_CITY_RAW_CEILING,
  };
}

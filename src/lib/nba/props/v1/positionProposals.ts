/**
 * Proposed primary positions for the highest-minute players with none, for a person to review. Nothing here is applied.
 *
 * Evidence: no source names these players' positions (Wikidata has the item but no position statement), so the proposal
 * rests on their own box-score rates, judged against players whose position IS known. ESPN's coarse listing restricts the
 * question to two classes: a guard is PG or SG, a forward is SF or PF (the same rule the position mapper uses; a
 * guard is never proposed as SF here). A ridge logistic model is fit per group on players with a clean single Wikidata
 * label, and 10-fold out-of-fold probabilities measure how often its more likely class is right. A proposal is
 * PROPOSED only when its probability reaches the smallest threshold at which the out-of-fold precision is at least the
 * required level on enough held-out players; otherwise the player stays unassigned, with the best guess shown.
 *
 * Private research only: the features are hoopR/ESPN-derived.
 */
import type { DvpPosition } from "../dvpPositions";
import { accuracy, fitLogistic, outOfFold, predictProbability, standardized, thresholdTable, type LogisticModel, type ThresholdRow } from "./positionModel";

export const GROUPS = {
  G: { classes: ["PG", "SG"] as const, features: ["ast36", "tov36", "stl36", "reb36", "fg3Rate", "fta36", "pts36"] as const },
  F: { classes: ["SF", "PF"] as const, features: ["reb36", "oreb36", "blk36", "fg3Rate", "ast36", "stl36", "fta36", "pts36"] as const },
};
export type Group = keyof typeof GROUPS;
type FeatureName = (typeof GROUPS)[Group]["features"][number];

/** Players with fewer combined minutes than this are neither trained on nor proposed for: their rates are noise. */
export const MIN_MINUTES = 400;
export const FOLDS = 10;
export const LAMBDA = 2;
export const THRESHOLDS = [0.7, 0.75, 0.8, 0.85, 0.9] as const;
/** A proposal is made only at a threshold whose out-of-fold precision is at least this (medium confidence)... */
export const REQUIRED_PRECISION = 0.85;
/** ...and is high confidence at a threshold whose out-of-fold precision is at least this. */
export const HIGH_PRECISION = 0.9;
/** ...on at least this many held-out players (the Wilson lower bound is reported with every proposal). */
export const REQUIRED_HELD_OUT = 30;

export interface PlayerSeasonFeatures {
  season: string;
  playerId: string;
  name: string;
  team: string;
  games: number;
  starts: number;
  minutes: number;
  totals: Record<"pts" | "reb" | "oreb" | "ast" | "stl" | "blk" | "tov" | "fga" | "fg3a" | "fta", number>;
  espnPositions: Record<string, number>;
}

export interface CombinedPlayer {
  playerId: string;
  name: string;
  team: string;
  minutes: number;
  group: Group | null;
  rates: Record<FeatureName, number>;
}

const ESPN_GROUP: Readonly<Record<string, Group>> = { G: "G", F: "F" };

/** ESPN's most frequent listing across the player's rows (ties to the alphabetically first), as a group; null for C or none. */
export function espnGroupOf(counts: Record<string, number>): Group | null {
  const best = Object.entries(counts).filter(([code]) => ["G", "F", "C", "PG", "SG", "SF", "PF"].includes(code)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return best ? (ESPN_GROUP[best] ?? null) : null;
}

/** One record per player: both seasons' totals pooled (the labels are career-level), rates per 36 minutes. */
export function combinePlayers(rows: readonly PlayerSeasonFeatures[]): Map<string, CombinedPlayer> {
  const byPlayer = new Map<string, PlayerSeasonFeatures[]>();
  for (const r of rows) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);
  const out = new Map<string, CombinedPlayer>();
  for (const [playerId, seasons] of byPlayer) {
    const latest = [...seasons].sort((a, b) => b.season.localeCompare(a.season))[0];
    const minutes = seasons.reduce((s, r) => s + r.minutes, 0);
    const sum = (key: keyof PlayerSeasonFeatures["totals"]) => seasons.reduce((s, r) => s + r.totals[key], 0);
    const espn: Record<string, number> = {};
    for (const r of seasons) for (const [code, n] of Object.entries(r.espnPositions)) espn[code] = (espn[code] ?? 0) + n;
    const per36 = (key: keyof PlayerSeasonFeatures["totals"]) => (minutes > 0 ? (sum(key) * 36) / minutes : 0);
    out.set(playerId, {
      playerId, name: latest.name, team: latest.team, minutes, group: espnGroupOf(espn),
      rates: { ast36: per36("ast"), tov36: per36("tov"), stl36: per36("stl"), reb36: per36("reb"), oreb36: per36("oreb"), blk36: per36("blk"), fta36: per36("fta"), pts36: per36("pts"), fg3Rate: sum("fga") > 0 ? sum("fg3a") / sum("fga") : 0 },
    });
  }
  return out;
}

const vector = (group: Group, p: CombinedPlayer): number[] => GROUPS[group].features.map((f) => p.rates[f]);

export interface GroupValidation {
  group: Group;
  classes: readonly [DvpPosition, DvpPosition];
  trained: number;
  /** Class counts among the labelled players. */
  classCounts: Record<string, number>;
  outOfFoldAccuracy: number;
  thresholds: ThresholdRow[];
  /** The smallest threshold meeting the precision and held-out requirements, or null: then nothing in the group is proposed. */
  assignThreshold: number | null;
  /** The smallest threshold meeting the high-confidence precision on enough held-out players, or null. */
  highThreshold: number | null;
}

export interface GroupModel {
  validation: GroupValidation;
  model: LogisticModel;
}

/** A clean label: a player with a single career-level Wikidata position that ESPN's listing allows. */
export interface LabelledPlayer {
  playerId: string;
  primary: DvpPosition;
}

export function trainGroup(group: Group, players: ReadonlyMap<string, CombinedPlayer>, labels: readonly LabelledPlayer[]): GroupModel | null {
  const [zero, one] = GROUPS[group].classes;
  const rows = labels
    .map((l) => ({ p: players.get(l.playerId), primary: l.primary }))
    .filter((r): r is { p: CombinedPlayer; primary: DvpPosition } => r.p !== undefined && r.p.group === group && r.p.minutes >= MIN_MINUTES && (r.primary === zero || r.primary === one))
    .sort((a, b) => a.p.playerId.localeCompare(b.p.playerId));
  const y = rows.map((r) => (r.primary === one ? 1 : 0));
  if (y.filter((v) => v === 1).length < FOLDS || y.filter((v) => v === 0).length < FOLDS) return null;
  const x = rows.map((r) => vector(group, r.p));
  const oof = outOfFold(x, y, LAMBDA, FOLDS);
  const thresholds = thresholdTable(oof, y, THRESHOLDS);
  const reaching = (precision: number) => thresholds.find((t) => t.n >= REQUIRED_HELD_OUT && t.precision !== null && t.precision >= precision);
  const qualifying = reaching(REQUIRED_PRECISION);
  return {
    model: fitLogistic(x, y, LAMBDA),
    validation: { group, classes: [zero, one], trained: rows.length, classCounts: { [zero]: y.filter((v) => v === 0).length, [one]: y.filter((v) => v === 1).length }, outOfFoldAccuracy: accuracy(oof, y), thresholds, assignThreshold: qualifying?.threshold ?? null, highThreshold: reaching(HIGH_PRECISION)?.threshold ?? null },
  };
}

/** "proposed" is a suggestion for a reviewer, never an applied position; "unassigned" means the evidence does not support one. */
export type Confidence = "proposed" | "unassigned";

export interface Proposal {
  playerId: string;
  name: string;
  team: string;
  minutes: number;
  espnGroup: Group | null;
  /** The model's more likely class, or null when ESPN gives no guard/forward listing or the model cannot be fit. */
  best: DvpPosition | null;
  /** Probability of `best` (0.5 to 1). */
  probability: number | null;
  status: Confidence;
  /** For a proposed position: "high" at a threshold validated to 90% held-out precision, "medium" at 85%. */
  confidence: "high" | "medium" | null;
  /** Why the player is assigned or not, with the strongest evidence. */
  evidence: string;
}

const LABELS: Record<FeatureName, string> = { ast36: "AST/36", tov36: "TOV/36", stl36: "STL/36", reb36: "REB/36", oreb36: "OREB/36", blk36: "BLK/36", fg3Rate: "3PA share", fta36: "FTA/36", pts36: "PTS/36" };

function strongestSignals(group: Group, model: LogisticModel, p: CombinedPlayer): string {
  const z = standardized(model, vector(group, p));
  return GROUPS[group].features
    .map((f, j) => ({ f, contribution: z[j] * model.weights[j], z: z[j] }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 2)
    .map((s) => `${LABELS[s.f]} ${f2(p.rates[s.f])} (${s.z >= 0 ? "+" : ""}${s.z.toFixed(1)} sd vs ${group === "G" ? "guards" : "forwards"})`)
    .join(", ");
}

const f2 = (v: number): string => v.toFixed(v < 1 ? 2 : 1);

export function propose(player: CombinedPlayer, groupModels: Partial<Record<Group, GroupModel>>): Proposal {
  const base = { playerId: player.playerId, name: player.name, team: player.team, minutes: Math.round(player.minutes), espnGroup: player.group, best: null, probability: null, confidence: null };
  if (player.group === null) return { ...base, status: "unassigned", confidence: null, evidence: "ESPN lists no guard or forward position: nothing to narrow, nothing proposed" };
  if (player.minutes < MIN_MINUTES) return { ...base, status: "unassigned", confidence: null, evidence: `under ${MIN_MINUTES} combined minutes: rates are noise` };
  const trained = groupModels[player.group];
  if (!trained) return { ...base, status: "unassigned", confidence: null, evidence: `too few labelled ${player.group === "G" ? "guards" : "forwards"} to fit a model` };
  const [zero, one] = trained.validation.classes;
  const pOne = predictProbability(trained.model, vector(player.group, player));
  const best = pOne >= 0.5 ? one : zero;
  const probability = Math.max(pOne, 1 - pOne);
  const threshold = trained.validation.assignThreshold;
  const signals = strongestSignals(player.group, trained.model, player);
  if (threshold === null) return { ...base, best, probability, status: "unassigned", confidence: null, evidence: `best guess ${best} (${probability.toFixed(2)}); the model never reached ${REQUIRED_PRECISION} held-out precision for this group. ${signals}` };
  if (probability < threshold) return { ...base, best, probability, status: "unassigned", confidence: null, evidence: `best guess ${best} (${probability.toFixed(2)}) is below the ${threshold} threshold validated for this group. ${signals}` };
  const high = trained.validation.highThreshold !== null && probability >= trained.validation.highThreshold;
  const row = trained.validation.thresholds.find((t) => t.threshold === (high ? trained.validation.highThreshold : threshold));
  return { ...base, best, probability, status: "proposed", confidence: high ? "high" : "medium", evidence: `${best} (${probability.toFixed(2)}); ${high ? "high" : "medium"} confidence: out-of-fold precision at >=${high ? trained.validation.highThreshold : threshold} was ${(row?.precision ?? 0).toFixed(2)} (95% lower bound ${(row?.precisionLow ?? 0).toFixed(2)}) on ${row?.n} players whose positions are already known; players Wikidata cannot place may differ. ${signals}` };
}

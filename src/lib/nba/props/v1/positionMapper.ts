/**
 * Builds the V1 position-estimate files from real hoopR players, without inventing a player or a position.
 *
 * Why not a depth chart: the only depth charts are ESPN's pages, and automated collection from ESPN is not permitted
 * (docs/nba-espn-upstream-rights-review.md), so no depth-chart source exists here. The label comes from where it is
 * actually published and reusable instead:
 *   - Wikidata (CC0) five-position labels, joined to hoopR by the ESPN athlete id (Wikidata property P3685 is that same
 *     id), using career-level statements only (no season, team or end-date scope; deprecated ranks ignored);
 *   - narrowed by ESPN's own coarse listing in the hoopR rows (G allows PG or SG, F allows SF or PF, C allows C; a
 *     specific code allows itself) when Wikidata lists several positions.
 * Wikidata is the five-position source and ESPN's coarse listing is only a tie-breaker among several Wikidata labels. If
 * the two contradict, Wikidata's first label is kept and the player is flagged, not dropped. A player with no Wikidata
 * label is labelled directly from ESPN only when ESPN's own listing names one position (a "C", or a specific code);
 * a player ESPN lists only as "G" or "F" stays unclassified, because choosing PG or SG, SF or PF would be a guess.
 * Role comes from the data: a starter if the player started at least half their games, a rotation player at 12 or
 * more minutes a game, otherwise bench. A player with no usable label stays unclassified and is counted (their minutes
 * are reported as uncovered); a manual override can classify them, and only a player that exists in the hoopR data.
 *
 * Wikidata labels are career-level, not per season, so the same label is applied to 2025-26 and 2026-27 and the file
 * says so. Every file is marked estimated: this is not verified minutes at a position.
 */
import { z } from "zod";
import { DVP_POSITIONS, type DvpPosition } from "../dvpPositions";
import { POSITION_ESTIMATES_SCHEMA, ESTIMATE_SEASONS, type EstimateSeason } from "./positionEstimates";
import type { PlayerSeasonSummary } from "./hooprAdapter";

/** Wikidata position items for basketball (match by QID, never by label: football "center" and "guard" also exist). */
const FIVE_QIDS: Readonly<Record<string, DvpPosition>> = Object.freeze({ Q212413: "PG", Q273199: "SG", Q308879: "SF", Q462471: "PF", Q222052: "C" });

/** What each ESPN position abbreviation allows. */
const ESPN_ALLOWS: Readonly<Record<string, readonly DvpPosition[]>> = Object.freeze({
  G: ["PG", "SG"], F: ["SF", "PF"], C: ["C"], PG: ["PG"], SG: ["SG"], SF: ["SF"], PF: ["PF"],
});

export const ROLE_STARTER_SHARE = 0.5;
/** Games before a start share means anything: one start in one game is not a starting role. */
export const ROLE_MIN_GAMES_FOR_STARTER = 3;
export const ROLE_ROTATION_MINUTES = 12;
const MAX_UNCLASSIFIED_LISTED = 15;

const snapshotSchema = z.object({
  schemaVersion: z.literal("wikidata-positions-snapshot-v1"),
  provenance: z.object({ retrievedAtUtc: z.string() }),
  players: z.array(
    z.object({
      qid: z.string(),
      ids: z.object({ espn: z.array(z.object({ value: z.string(), rank: z.enum(["preferred", "normal", "deprecated"]) })) }),
      positions: z.array(
        z.object({
          positionQid: z.string(),
          rank: z.enum(["preferred", "normal", "deprecated"]),
          qualifiers: z.object({ seasons: z.array(z.unknown()), teamQids: z.array(z.string()), end: z.string().nullable() }),
        }),
      ),
    }),
  ),
});

export interface WikidataLabel {
  qid: string;
  positions: DvpPosition[];
}

export interface WikidataIndex {
  retrievedAtUtc: string;
  /** ESPN athlete id -> item. An id carried by two items is left out and listed in `ambiguousIds`. */
  byEspnId: ReadonlyMap<string, WikidataLabel>;
  ambiguousIds: ReadonlySet<string>;
}

/** Reads the Wikidata snapshot written by the position audit (only the fields used here are required). */
export function indexWikidataSnapshot(raw: unknown): WikidataIndex {
  const snapshot = snapshotSchema.parse(raw);
  const owners = new Map<string, WikidataLabel[]>();
  for (const player of snapshot.players) {
    const careerLevel = player.positions.filter((s) => s.rank !== "deprecated" && s.qualifiers.seasons.length === 0 && s.qualifiers.teamQids.length === 0 && s.qualifiers.end === null);
    const set = new Set(careerLevel.flatMap((s) => (s.positionQid in FIVE_QIDS ? [FIVE_QIDS[s.positionQid]] : [])));
    const label: WikidataLabel = { qid: player.qid, positions: DVP_POSITIONS.filter((p) => set.has(p)) };
    for (const id of new Set(player.ids.espn.filter((i) => i.rank !== "deprecated").map((i) => i.value))) owners.set(id, [...(owners.get(id) ?? []), label]);
  }
  const byEspnId = new Map<string, WikidataLabel>();
  const ambiguousIds = new Set<string>();
  for (const [id, labels] of owners) {
    if (labels.length === 1) byEspnId.set(id, labels[0]);
    else ambiguousIds.add(id);
  }
  return { retrievedAtUtc: snapshot.provenance.retrievedAtUtc, byEspnId, ambiguousIds };
}

export const overridesFileSchema = z.object({
  schemaVersion: z.literal("jkb-position-overrides-v1"),
  overrides: z.array(
    z.object({
      season: z.enum(ESTIMATE_SEASONS),
      playerId: z.string(),
      primary: z.enum(DVP_POSITIONS),
      secondary: z.array(z.enum(DVP_POSITIONS)).default([]),
      reason: z.string().min(5),
    }),
  ),
});
export type PositionOverrides = z.input<typeof overridesFileSchema>["overrides"];

export interface SeasonMapReport {
  players: number;
  classified: number;
  bySource: { wikidataSingle: number; wikidataMultiPrimaryChosen: number; wikidataOverEspn: number; espnListing: number; manualOverride: number };
  unclassified: Record<string, number>;
  /** Share of the season's player minutes that belong to a classified player (0-1). */
  minutesCoverage: number | null;
  roles: Record<string, number>;
  /** Highest-minute players with no position, the ones a manual override would help most. */
  topUnclassified: Array<{ playerId: string; name: string; team: string; minutes: number; reason: string }>;
}

export interface PositionMapResult {
  files: Record<EstimateSeason, unknown>;
  report: { seasons: Record<string, SeasonMapReport>; wikidataRetrievedAtUtc: string; overridesApplied: number };
}

function roleOf(p: PlayerSeasonSummary): "starter" | "rotation" | "bench" {
  if (p.games >= ROLE_MIN_GAMES_FOR_STARTER && p.starts / p.games >= ROLE_STARTER_SHARE) return "starter";
  return p.games > 0 && p.minutes / p.games >= ROLE_ROTATION_MINUTES ? "rotation" : "bench";
}

/** ESPN's most frequent listing for the player (ties go to the alphabetically first code), as the set of positions it allows. */
function espnAllowed(p: PlayerSeasonSummary): readonly DvpPosition[] {
  const listed = Object.entries(p.espnPositions).filter(([code]) => code in ESPN_ALLOWS).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return listed.length > 0 ? ESPN_ALLOWS[listed[0][0]] : DVP_POSITIONS;
}

type Source = "single" | "multi" | "wikidataOverEspn" | "espnListing";
type Decision = { kind: "classified"; primary: DvpPosition; secondary: DvpPosition[]; source: Source; note: string } | { kind: "unclassified"; reason: string };

/** ESPN's own listing as a label, only when it names exactly one position. */
function espnOnly(p: PlayerSeasonSummary, why: string): Decision {
  const allowed = espnAllowed(p);
  if (allowed.length === 1) return { kind: "classified", primary: allowed[0], secondary: [], source: "espnListing", note: `ESPN lists ${allowed[0]}; ${why}` };
  return { kind: "unclassified", reason: `${why}, and ESPN lists only G or F (PG vs SG, SF vs PF would be a guess)` };
}

function decide(p: PlayerSeasonSummary, wikidata: WikidataIndex): Decision {
  if (wikidata.ambiguousIds.has(p.playerId)) return espnOnly(p, "ESPN id matches two Wikidata items");
  const label = wikidata.byEspnId.get(p.playerId);
  if (!label) return espnOnly(p, "no Wikidata item for this ESPN id");
  if (label.positions.length === 0) return espnOnly(p, "Wikidata item has no career-level five-position label");
  const candidates = label.positions.filter((pos) => espnAllowed(p).includes(pos));
  const primary = (candidates.length > 0 ? candidates : label.positions)[0];
  const source: Source = candidates.length === 0 ? "wikidataOverEspn" : candidates.length > 1 ? "multi" : "single";
  const note = {
    single: `Wikidata ${label.qid}`,
    multi: `Wikidata ${label.qid}; primary chosen by PG, SG, SF, PF, C order among labels ESPN allows`,
    wikidataOverEspn: `Wikidata ${label.qid}; ESPN's coarse listing differs, Wikidata's first label kept`,
    espnListing: "",
  }[source];
  return { kind: "classified", primary, secondary: label.positions.filter((pos) => pos !== primary), source, note };
}

function sourceNote(wikidata: WikidataIndex): string {
  return `Estimated primary positions: Wikidata (CC0, snapshot ${wikidata.retrievedAtUtc.slice(0, 10)}) career-level five-position labels joined by ESPN athlete id and narrowed by ESPN's coarse G/F/C listing in hoopR; ESPN's own listing where it names one position; roles from hoopR starts and minutes; manual overrides where listed. Not verified minutes at a position. The same career-level label is applied to 2025-26 and 2026-27. No depth-chart source is available.`;
}

function emptyReport(): SeasonMapReport {
  return { players: 0, classified: 0, bySource: { wikidataSingle: 0, wikidataMultiPrimaryChosen: 0, wikidataOverEspn: 0, espnListing: 0, manualOverride: 0 }, unclassified: {}, minutesCoverage: null, roles: {}, topUnclassified: [] };
}

/** An override must name a player that exists in the hoopR data for that season, once: identities are never invented. */
function validateOverrides(overrides: NonNullable<PositionOverrides>, players: readonly PlayerSeasonSummary[]): void {
  const known = new Set(players.map((p) => `${p.season}|${p.playerId}`));
  for (const o of overrides) if (!known.has(`${o.season}|${o.playerId}`)) throw new Error(`override for ${o.playerId} in ${o.season}: no such player in the hoopR data for that season (identities are never invented)`);
  if (new Set(overrides.map((o) => `${o.season}|${o.playerId}`)).size !== overrides.length) throw new Error("two overrides for the same player and season");
}

/** One position file per season that has at least one classified player. */
function assembleFiles(entries: Record<string, unknown[]>, overrides: NonNullable<PositionOverrides>, wikidata: WikidataIndex, asOfUtc: string): Record<EstimateSeason, unknown> {
  return Object.fromEntries(
    ESTIMATE_SEASONS.filter((s) => (entries[s]?.length ?? 0) > 0).map((season) => [
      season,
      {
        schemaVersion: POSITION_ESTIMATES_SCHEMA,
        season,
        asOfUtc,
        sourceNote: sourceNote(wikidata),
        players: entries[season],
        overrides: overrides.filter((o) => o.season === season).map((o) => ({ playerId: o.playerId, primary: o.primary, secondary: o.secondary ?? [], reason: o.reason })),
      },
    ]),
  ) as Record<EstimateSeason, unknown>;
}

export function buildPositionFiles(args: { players: readonly PlayerSeasonSummary[]; wikidata: WikidataIndex; overrides?: PositionOverrides; asOfUtc: string }): PositionMapResult {
  const overrides = args.overrides ?? [];
  validateOverrides(overrides, args.players);

  const reports: Record<string, SeasonMapReport> = {};
  const entries: Record<string, unknown[]> = {};
  const totalMinutes: Record<string, number> = {};
  const coveredMinutes: Record<string, number> = {};
  for (const p of args.players) {
    const report = (reports[p.season] ??= emptyReport());
    report.players += 1;
    totalMinutes[p.season] = (totalMinutes[p.season] ?? 0) + p.minutes;
    const role = roleOf(p);
    const override = overrides.find((o) => o.season === p.season && o.playerId === p.playerId);
    const decision = decide(p, args.wikidata);
    let primary: DvpPosition | null = null;
    let secondary: DvpPosition[] = [];
    let note: string | undefined;
    if (override) {
      primary = override.primary;
      secondary = override.secondary ?? [];
      report.bySource.manualOverride += 1;
    } else if (decision.kind === "classified") {
      ({ primary, secondary, note } = decision);
      report.bySource[{ single: "wikidataSingle", multi: "wikidataMultiPrimaryChosen", wikidataOverEspn: "wikidataOverEspn", espnListing: "espnListing" }[decision.source] as keyof SeasonMapReport["bySource"]] += 1;
    } else {
      report.unclassified[decision.reason] = (report.unclassified[decision.reason] ?? 0) + 1;
      report.topUnclassified.push({ playerId: p.playerId, name: p.name, team: p.team, minutes: Math.round(p.minutes), reason: decision.reason });
      continue;
    }
    report.classified += 1;
    report.roles[role] = (report.roles[role] ?? 0) + 1;
    coveredMinutes[p.season] = (coveredMinutes[p.season] ?? 0) + p.minutes;
    (entries[p.season] ??= []).push({ playerId: p.playerId, name: p.name, team: p.team, primary, secondary: secondary.filter((s) => s !== primary), role, ...(note ? { note } : {}) });
  }
  for (const [season, report] of Object.entries(reports)) {
    report.minutesCoverage = totalMinutes[season] > 0 ? (coveredMinutes[season] ?? 0) / totalMinutes[season] : null;
    report.topUnclassified = report.topUnclassified.sort((a, b) => b.minutes - a.minutes).slice(0, MAX_UNCLASSIFIED_LISTED);
  }
  const files = assembleFiles(entries, overrides, args.wikidata, args.asOfUtc);
  return { files, report: { seasons: reports, wikidataRetrievedAtUtc: args.wikidata.retrievedAtUtc, overridesApplied: overrides.length } };
}

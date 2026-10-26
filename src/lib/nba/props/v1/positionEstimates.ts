/**
 * Practical position estimates for the props board and approximate Defense vs. Position (DvP).
 *
 * One mapping file per season gives each player ONE estimated primary position (PG/SG/SF/PF/C) and optional
 * secondary positions, taken from the projected starting depth chart for starters and from the listed rotation
 * role and minutes for bench players. These are estimates, never verified minutes played at a position, and every
 * record says so (`status: "estimated"`).
 *
 * Rules:
 *  - a season's estimates apply only to that season. A 2026-27 team or position is never applied to a 2025-26
 *    game: a player missing from the 2025-26 file is unclassified there (excluded from DvP and reported);
 *  - a manual override replaces the depth-chart estimate, must carry a reason, and is flagged on the result;
 *  - nothing is guessed: a malformed record fails the whole file instead of being skipped.
 *
 * Player ids are the same source-native ids as the player-game import; no cross-source identity system is built.
 */
import { z } from "zod";
import { canonicalTeamCode } from "../canonical";
import { DVP_POSITIONS, type DvpPosition } from "../dvpPositions";

export const POSITION_ESTIMATES_SCHEMA = "jkb-position-estimates-v1";
export const ESTIMATE_SEASONS = ["2025-26", "2026-27"] as const;
export type EstimateSeason = (typeof ESTIMATE_SEASONS)[number];

/** starter = on the projected starting depth chart; rotation and bench = listed role and minutes; out = excluded from the slate. */
export const PLAYER_ROLES = ["starter", "rotation", "bench", "out"] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

const position = z.enum(DVP_POSITIONS);
const id = z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/, "player id must be 1-40 letters, digits, '.', '_' or '-'");

export const positionEstimatesFileSchema = z.object({
  schemaVersion: z.literal(POSITION_ESTIMATES_SCHEMA),
  season: z.enum(ESTIMATE_SEASONS),
  asOfUtc: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && !Number.isNaN(Date.parse(v)), "asOfUtc must be an ISO UTC instant"),
  /** Where the depth chart and roles came from, and who compiled it. Required: an estimate without a stated basis is not shown. */
  sourceNote: z.string().min(10),
  players: z
    .array(
      z.object({
        playerId: id,
        name: z.string().min(1),
        team: z.string(),
        primary: position,
        secondary: z.array(position).default([]),
        role: z.enum(PLAYER_ROLES),
        note: z.string().optional(),
      }),
    )
    .min(1, "a position file with no players is not a position file"),
  overrides: z.array(z.object({ playerId: id, primary: position, secondary: z.array(position).default([]), reason: z.string().min(5) })).default([]),
});
export type PositionEstimatesFile = z.input<typeof positionEstimatesFileSchema>;

export interface PositionEstimate {
  season: EstimateSeason;
  playerId: string;
  name: string;
  team: string;
  primary: DvpPosition;
  secondary: DvpPosition[];
  role: PlayerRole;
  /** Always "estimated": these are never verified minutes at a position. */
  status: "estimated";
  basis: "projected-depth-chart" | "rotation-role" | "manual-override";
  overridden: boolean;
  overrideReason: string | null;
  asOfUtc: string;
  sourceNote: string;
}

export type PositionEstimateSet = ReadonlyMap<string, PositionEstimate>;

export const estimateKey = (season: string, playerId: string): string => `${season}|${playerId}`;

function secondariesFor(primary: DvpPosition, secondary: readonly DvpPosition[], who: string): DvpPosition[] {
  if (new Set(secondary).size !== secondary.length) throw new Error(`${who}: secondary positions repeat`);
  if (secondary.includes(primary)) throw new Error(`${who}: the primary position is also listed as secondary`);
  return DVP_POSITIONS.filter((p) => secondary.includes(p));
}

function estimateFrom(file: z.output<typeof positionEstimatesFileSchema>, entry: z.output<typeof positionEstimatesFileSchema>["players"][number], override: z.output<typeof positionEstimatesFileSchema>["overrides"][number] | undefined): PositionEstimate {
  const who = `${file.season} player ${entry.playerId}`;
  const team = canonicalTeamCode(entry.team);
  if (team === null) throw new Error(`${who}: unknown team "${entry.team}"`);
  const primary = override?.primary ?? entry.primary;
  return {
    season: file.season,
    playerId: entry.playerId,
    name: entry.name,
    team,
    primary,
    secondary: secondariesFor(primary, override?.secondary ?? entry.secondary, who),
    role: entry.role,
    status: "estimated",
    basis: override ? "manual-override" : entry.role === "starter" ? "projected-depth-chart" : "rotation-role",
    overridden: override !== undefined,
    overrideReason: override?.reason ?? null,
    asOfUtc: file.asOfUtc,
    sourceNote: file.sourceNote,
  };
}

/** Parses and validates one season's file. Throws on any malformed, duplicate or unmatched record. */
export function parsePositionEstimates(raw: unknown): PositionEstimate[] {
  const file = positionEstimatesFileSchema.parse(raw);
  const seen = new Set<string>();
  for (const player of file.players) {
    if (seen.has(player.playerId)) throw new Error(`${file.season}: player ${player.playerId} appears twice`);
    seen.add(player.playerId);
  }
  const overrides = new Map<string, (typeof file.overrides)[number]>();
  for (const override of file.overrides) {
    if (!seen.has(override.playerId)) throw new Error(`${file.season}: override for unknown player ${override.playerId}`);
    if (overrides.has(override.playerId)) throw new Error(`${file.season}: player ${override.playerId} has two overrides`);
    overrides.set(override.playerId, override);
  }
  return file.players.map((entry) => estimateFrom(file, entry, overrides.get(entry.playerId)));
}

/** Combines season files. At most one file per season; seasons never share an estimate. */
export function buildEstimateSet(files: readonly unknown[]): PositionEstimateSet {
  const set = new Map<string, PositionEstimate>();
  const seasons = new Set<string>();
  for (const raw of files) {
    const estimates = parsePositionEstimates(raw);
    const season = estimates[0]?.season ?? (raw as { season?: string }).season ?? "";
    if (seasons.has(season)) throw new Error(`two position files for ${season}`);
    seasons.add(season);
    for (const estimate of estimates) set.set(estimateKey(estimate.season, estimate.playerId), estimate);
  }
  return set;
}

/** The single-code label the DvP builder reads: the primary position, weight 1. Null when the season has no estimate for the player. */
export function dvpLabelFor(set: PositionEstimateSet, season: string, playerId: string): DvpPosition | null {
  return set.get(estimateKey(season, playerId))?.primary ?? null;
}

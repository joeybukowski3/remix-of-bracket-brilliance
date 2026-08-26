/**
 * Phase 9.2: canonical current-week depth-chart role evidence.
 *
 * Source: nflverse's ESPN-origin `depth_charts_{season}.csv` release
 * (CC-BY 4.0), committed as a single-most-recent-snapshot projection by
 * `scripts/refresh-nfl-depth-chart-source-cache.mjs` (see that script's
 * header for the size/validation rationale). `gsis_id` is native to the
 * source -- no identity crosswalk is needed.
 *
 * This module answers ONE question: "does pregame roster/role evidence
 * support this player plausibly entering the projection universe?" It
 * never produces a projected-yard value, a Matchup Score input, or any
 * betting/confidence field -- see README Phase 9.2 "Role evidence versus
 * projection".
 */
import { canonicalPlayerId, normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { NflPropPosition } from "./types/identity";

export const DEPTH_CHART_ROLE_SOURCE = "nflverse-depth-charts-espn" as const;
export const DEPTH_CHART_STALENESS_THRESHOLD_HOURS = 48;

const POSITION_NAME_MAP: Readonly<Record<string, NflPropPosition>> = {
  Quarterback: "QB",
  "Running Back": "RB",
  "Wide Receiver": "WR",
  "Tight End": "TE",
};

export type NflDepthChartCsvRow = {
  dt: string;
  team: string;
  player_name: string;
  espn_id: string;
  gsis_id: string;
  pos_name: string;
  pos_rank: string;
};

export type NflDepthChartEntry = {
  team: string;
  position: NflPropPosition;
  playerId: string;
  playerName: string;
  depthRank: number;
  sourceSnapshotAt: string;
};

export type NflDepthChartParseResult = {
  entries: readonly NflDepthChartEntry[];
  sourceSnapshotAt: string | null;
  skippedRows: number;
};

/** Parses the committed offensive-skill-position rows out of one depth-chart CSV snapshot. Non-QB/RB/WR/TE rows (OL, defense, ST) are silently out of scope, not an error. */
export function parseDepthChartRows(rows: readonly NflDepthChartCsvRow[]): NflDepthChartParseResult {
  const entries: NflDepthChartEntry[] = [];
  let skippedRows = 0;
  let sourceSnapshotAt: string | null = null;

  for (const row of rows) {
    const position = POSITION_NAME_MAP[String(row.pos_name ?? "").trim()];
    if (!position) continue; // out of scope (OL/DEF/ST), not a skip

    const team = normalizeNflTeamAbbr(row.team);
    const playerId = canonicalPlayerId(row.gsis_id);
    const depthRank = Number(row.pos_rank);
    const dt = String(row.dt ?? "").trim();
    if (!team || !playerId || !dt || !Number.isFinite(depthRank) || depthRank <= 0 || !Number.isInteger(depthRank)) {
      skippedRows += 1;
      continue;
    }
    if (sourceSnapshotAt == null) sourceSnapshotAt = dt;
    else if (dt !== sourceSnapshotAt) {
      // The committed cache is a single-snapshot projection; a mixed `dt`
      // set means the cache itself is malformed. Report loudly rather than
      // silently averaging across two different days.
      throw new Error(`Depth chart rows span multiple snapshot timestamps (${sourceSnapshotAt} and ${dt}) -- expected a single-day projection.`);
    }

    entries.push({ team, position, playerId, playerName: String(row.player_name ?? "").trim(), depthRank, sourceSnapshotAt: dt });
  }

  return { entries, sourceSnapshotAt, skippedRows };
}

export type NflDepthChartIndex = {
  sourceSnapshotAt: string | null;
  byPlayer: ReadonlyMap<string, NflDepthChartEntry>; // key: team|position|playerId
  byTeamPosition: ReadonlyMap<string, readonly NflDepthChartEntry[]>; // key: team|position
};

function playerKey(team: string, position: string, playerId: string): string {
  return `${team}|${position}|${playerId}`;
}
function teamPositionKey(team: string, position: string): string {
  return `${team}|${position}`;
}

export function buildDepthChartIndex(parseResult: NflDepthChartParseResult): NflDepthChartIndex {
  const byPlayer = new Map<string, NflDepthChartEntry>();
  const byTeamPosition = new Map<string, NflDepthChartEntry[]>();
  for (const entry of parseResult.entries) {
    byPlayer.set(playerKey(entry.team, entry.position, entry.playerId), entry);
    const key = teamPositionKey(entry.team, entry.position);
    const list = byTeamPosition.get(key) ?? [];
    list.push(entry);
    byTeamPosition.set(key, list);
  }
  for (const list of byTeamPosition.values()) list.sort((a, b) => a.depthRank - b.depthRank);
  return { sourceSnapshotAt: parseResult.sourceSnapshotAt, byPlayer, byTeamPosition };
}

export function lookupDepthChartEntry(index: NflDepthChartIndex, team: string, position: NflPropPosition, playerId: string): NflDepthChartEntry | null {
  return index.byPlayer.get(playerKey(team, position, playerId)) ?? null;
}

/**
 * Every player at `team`/`position` holding the source's rank-1 slot. Almost
 * always exactly one. Zero means no sourced evidence for that team/position
 * (e.g. the group is absent from this snapshot). More than one means the
 * source itself is ambiguous (a data quirk, e.g. two players tied at rank 1)
 * -- callers must NOT silently pick one; see `qbStarterResolution.ts`.
 */
export function depthRankOneCandidates(index: NflDepthChartIndex, team: string, position: NflPropPosition): readonly NflDepthChartEntry[] {
  const list = index.byTeamPosition.get(teamPositionKey(team, position)) ?? [];
  return list.filter((e) => e.depthRank === 1);
}

export type NflDepthChartStaleness = { isStale: boolean; ageHours: number | null };

/** Staleness relative to the source's OWN snapshot timestamp (`sourceSnapshotAt`), never the retrieval/generation time -- the source refreshes roughly daily. */
export function computeDepthChartStaleness(sourceSnapshotAt: string | null, asOf: string): NflDepthChartStaleness {
  if (!sourceSnapshotAt) return { isStale: true, ageHours: null };
  const ageMs = new Date(asOf).getTime() - new Date(sourceSnapshotAt).getTime();
  if (!Number.isFinite(ageMs)) return { isStale: true, ageHours: null };
  const ageHours = ageMs / (1000 * 60 * 60);
  return { isStale: ageHours < 0 || ageHours > DEPTH_CHART_STALENESS_THRESHOLD_HOURS, ageHours };
}

export type NflRoleEvidence = {
  roleSource: typeof DEPTH_CHART_ROLE_SOURCE | "historicalVolume" | "rosterScarcityFloor" | "unavailable";
  roleSourceUpdatedAt: string | null;
  depthRank: number | null;
  starterFlag: boolean;
  roleConfidence: "sourced" | "inferred";
  roleEvidence: string;
};

/** Builds the disclosed role-evidence block for a candidate with sourced depth-chart evidence. */
export function sourcedRoleEvidence(entry: NflDepthChartEntry): NflRoleEvidence {
  return {
    roleSource: DEPTH_CHART_ROLE_SOURCE,
    roleSourceUpdatedAt: entry.sourceSnapshotAt,
    depthRank: entry.depthRank,
    starterFlag: entry.depthRank === 1,
    roleConfidence: "sourced",
    roleEvidence: `ESPN depth chart rank ${entry.depthRank} (${entry.position}) via nflverse, snapshot ${entry.sourceSnapshotAt}`,
  };
}

/** Role-evidence block for a candidate admitted WITHOUT sourced depth-chart data (historical volume or the roster-scarcity floor). */
export function fallbackRoleEvidence(source: "historicalVolume" | "rosterScarcityFloor" | "unavailable", detail: string): NflRoleEvidence {
  return { roleSource: source, roleSourceUpdatedAt: null, depthRank: null, starterFlag: false, roleConfidence: "inferred", roleEvidence: detail };
}

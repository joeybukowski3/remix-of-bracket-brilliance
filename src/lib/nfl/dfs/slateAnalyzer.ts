// WU2 DFS slate analyzer: turns validated DK NFL Classic rows + the weekly
// JKB Full PPR projection universe + canonical NFL teams into deterministic
// analyzer rows (salary ranks, JKB ranks, Rank Diff, points/$1K).
//
// Pure domain functions only -- no fetching, no week/freshness policy (WU3),
// no UI. Callers supply an already-loaded projection universe and team list.

import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { CanonicalNflTeam, NflGameRecord } from "@/lib/nfl/standings";
import type { DraftKingsParsedGameInfo, ValidatedDraftKingsNflClassicRow } from "@/lib/nfl/dfs/contracts";
import type { DfsGameMatch, DfsSlateCompatibility, DfsTeamMismatchStatus } from "@/lib/nfl/dfs/artifactCompatibility";
import type { DfsPlayerResearch, DfsResearchAssessment } from "@/lib/nfl/dfs/research";
import {
  findDuplicateDstCanonicalIdentities,
  findDuplicateOffensiveCanonicalIdentities,
  isDraftKingsOffensiveRow,
  resolveDstIdentity,
  resolveOffensiveIdentity,
  type DfsOffensivePosition,
  type DstIdentityResolution,
  type DstIdentityStatus,
  type OffensiveIdentityResolution,
  type OffensiveIdentityStatus,
  type ValidatedDraftKingsOffensiveRow,
} from "@/lib/nfl/dfs/identity";

/**
 * Every projection value in this module traces back to the canonical
 * production weekly-fantasy artifact (JKB Full PPR). This is never a
 * DraftKings scoring projection -- see WeeklyFantasyProjectionProductionRow.
 */
export const DFS_PROJECTION_SOURCE = "JKB Full PPR" as const;

const OFFENSIVE_POSITIONS: readonly DfsOffensivePosition[] = ["QB", "RB", "WR", "TE"];

export type DfsAnalyzerOffensiveRow = {
  kind: "offense";
  dkId: string;
  playerName: string;
  position: DfsOffensivePosition;
  rosterPosition: string;
  salary: number;
  team: string;
  game: DraftKingsParsedGameInfo | null;
  gameInfoRaw: string;
  dkAvgPointsPerGame: number | null;
  dkStatus: string | null;

  identityStatus: OffensiveIdentityStatus;
  playerId: string | null;
  identityConflict: boolean;

  projectedFantasyPoints: number | null;
  projectionSource: typeof DFS_PROJECTION_SOURCE | null;
  jkbWeeklyPositionRank: number | null;
  jkbSlatePositionRank: number | null;
  jkbOverallSlateProjectionRank: number | null;

  dkPositionSalaryRank: number;
  dkOverallSalaryRank: number | null;

  posRankDiff: number | null;
  overallRankDiff: number | null;
  pointsPer1k: number | null;
};

export type DfsAnalyzerDstRow = {
  kind: "dst";
  dkId: string;
  playerName: string;
  position: "DST";
  rosterPosition: string;
  salary: number;
  team: string;
  game: DraftKingsParsedGameInfo | null;
  gameInfoRaw: string;
  dkAvgPointsPerGame: number | null;
  dkStatus: string | null;

  identityStatus: DstIdentityStatus;
  canonicalTeamId: string | null;
  identityConflict: boolean;

  projectedFantasyPoints: null;
  projectionSource: null;
  jkbWeeklyPositionRank: null;
  jkbSlatePositionRank: null;
  jkbOverallSlateProjectionRank: null;

  dkPositionSalaryRank: number;
  /** DST is intentionally excluded from the projection-comparable overall rank. See buildDfsSlateAnalysis. */
  dkOverallSalaryRank: null;

  posRankDiff: null;
  overallRankDiff: null;
  pointsPer1k: null;
};

export type DfsAnalyzerRow = DfsAnalyzerOffensiveRow | DfsAnalyzerDstRow;

export type DfsAnalyzerSummary = {
  totalUploadedRows: number;
  offensiveRows: number;
  dstRows: number;

  /** Raw identity-resolution outcome counts, unaffected by duplicate-identity blocking. */
  resolvedOffensivePlayers: number;
  unresolvedOffensivePlayers: number;
  ambiguousOrConflictingOffensivePlayers: number;
  offensiveIdentityStatusCounts: Record<OffensiveIdentityStatus, number>;
  dstIdentityStatusCounts: Record<DstIdentityStatus, number>;

  /** Distinct canonical identities (playerId or team id) claimed by more than one uploaded DK row. */
  duplicateCanonicalIdentityCount: number;

  /** Analyzer rows that retained a JKB projection after duplicate-identity blocking. */
  rowsWithProjections: number;

  positionsPresent: string[];
  gamesPresent: string[];
  teamsPresent: string[];
};

export type DfsSlateAnalysis = {
  rows: DfsAnalyzerRow[];
  summary: DfsAnalyzerSummary;
};

export type BuildDfsSlateAnalysisInput = {
  /** The full set of WU1-validated DK NFL Classic rows -- the uploaded slate universe. */
  dkRows: readonly ValidatedDraftKingsNflClassicRow[];
  /** Weekly JKB Full PPR projection universe, flattened across QB/RB/WR/TE. */
  projectionRows: readonly WeeklyFantasyProjectionProductionRow[];
  /** Canonical NFL team records (public/data/nfl/teams.json), for DST identity. */
  teams: readonly CanonicalNflTeam[];
};

type RankedItem<T> = { item: T; rank: number };

/** Competition ranking: ties share a rank, the next distinct value's rank equals its 1-based array position. */
function rankDescendingCompetition<T>(
  items: readonly T[],
  valueOf: (item: T) => number,
  tiebreakKeyOf: (item: T) => string,
): RankedItem<T>[] {
  const sorted = [...items].sort((a, b) => {
    const diff = valueOf(b) - valueOf(a);
    if (diff !== 0) return diff;
    return tiebreakKeyOf(a).localeCompare(tiebreakKeyOf(b));
  });

  const ranked: RankedItem<T>[] = [];
  let previousValue: number | null = null;
  let previousRank = 0;
  sorted.forEach((item, index) => {
    const value = valueOf(item);
    const rank = previousValue !== null && value === previousValue ? previousRank : index + 1;
    ranked.push({ item, rank });
    previousValue = value;
    previousRank = rank;
  });
  return ranked;
}

function rankLookupByDkId<T extends { dkId: string }>(ranked: readonly RankedItem<T>[]): Map<string, number> {
  const lookup = new Map<string, number>();
  ranked.forEach(({ item, rank }) => lookup.set(item.dkId, rank));
  return lookup;
}

function countByStatus<S extends string>(statuses: readonly S[], allStatuses: readonly S[]): Record<S, number> {
  const counts = Object.fromEntries(allStatuses.map((status) => [status, 0])) as Record<S, number>;
  statuses.forEach((status) => {
    counts[status] += 1;
  });
  return counts;
}

/**
 * Builds the deterministic WU2 DFS analyzer output for an uploaded slate.
 *
 * Off-slate players never affect any rank here: every ranking universe is
 * built exclusively from `dkRows` (or a resolved/projected subset of it).
 * `projectionRows`/`teams` are lookup sources, not additional slate members.
 */
export function buildDfsSlateAnalysis(input: BuildDfsSlateAnalysisInput): DfsSlateAnalysis {
  const { dkRows, projectionRows, teams } = input;

  const offensiveDkRows: ValidatedDraftKingsOffensiveRow[] = dkRows.filter(isDraftKingsOffensiveRow);
  const dstDkRows = dkRows.filter((row) => row.position === "DST");

  const offensiveResolutions = offensiveDkRows.map((row) => resolveOffensiveIdentity(row, projectionRows));
  const dstResolutions = dstDkRows.map((row) => resolveDstIdentity(row, teams));

  const duplicateOffensiveGroups = findDuplicateOffensiveCanonicalIdentities(offensiveResolutions);
  const duplicateDstGroups = findDuplicateDstCanonicalIdentities(dstResolutions);
  const conflictedDkIds = new Set<string>([
    ...duplicateOffensiveGroups.flatMap((group) => group.dkIds),
    ...duplicateDstGroups.flatMap((group) => group.dkIds),
  ]);

  // A. DK positional salary rank -- universe: all structurally valid uploaded
  // rows at that position (offense AND DST, each within their own position).
  const positionGroups = new Map<string, ValidatedDraftKingsNflClassicRow[]>();
  dkRows.forEach((row) => {
    const list = positionGroups.get(row.position) ?? [];
    list.push(row);
    positionGroups.set(row.position, list);
  });
  const dkPositionSalaryRankByDkId = new Map<string, number>();
  positionGroups.forEach((rows) => {
    const ranked = rankDescendingCompetition(rows, (row) => row.salary, (row) => row.dkId);
    ranked.forEach(({ item, rank }) => dkPositionSalaryRankByDkId.set(item.dkId, rank));
  });

  // DK overall salary rank -- universe: all uploaded offensive rows (DST
  // excluded so it is directly comparable to the JKB overall projection rank).
  const dkOverallSalaryRanked = rankDescendingCompetition(offensiveDkRows, (row) => row.salary, (row) => row.dkId);
  const dkOverallSalaryRankByDkId = rankLookupByDkId(dkOverallSalaryRanked);

  // B. JKB slate position rank -- universe: resolved, non-conflicted
  // offensive rows with a projection, grouped by position.
  const slateOffensiveResolutions = offensiveResolutions.filter(
    (resolution) => resolution.status === "resolved" && resolution.projection !== null && !conflictedDkIds.has(resolution.dkId),
  );
  const jkbSlatePositionRankByDkId = new Map<string, number>();
  OFFENSIVE_POSITIONS.forEach((position) => {
    const group = slateOffensiveResolutions.filter((resolution) => resolution.projection?.position === position);
    const ranked = rankDescendingCompetition(
      group,
      (resolution) => resolution.projection?.projectedFantasyPoints as number,
      (resolution) => resolution.dkId,
    );
    ranked.forEach(({ item, rank }) => jkbSlatePositionRankByDkId.set(item.dkId, rank));
  });

  // JKB overall slate projection rank -- universe: all resolved,
  // non-conflicted offensive rows with a projection, across all positions.
  const jkbOverallRanked = rankDescendingCompetition(
    slateOffensiveResolutions,
    (resolution) => resolution.projection?.projectedFantasyPoints as number,
    (resolution) => resolution.dkId,
  );
  const jkbOverallSlateProjectionRankByDkId = rankLookupByDkId(jkbOverallRanked);

  const offensiveAnalyzerRows: DfsAnalyzerOffensiveRow[] = offensiveResolutions.map((resolution) => {
    const row = resolution.dkRow;
    const conflict = conflictedDkIds.has(resolution.dkId);
    const projection = !conflict ? resolution.projection : null;

    const dkPositionSalaryRank = dkPositionSalaryRankByDkId.get(row.dkId) as number;
    const dkOverallSalaryRank = dkOverallSalaryRankByDkId.get(row.dkId) ?? null;
    const jkbSlatePositionRank = conflict ? null : jkbSlatePositionRankByDkId.get(row.dkId) ?? null;
    const jkbOverallSlateProjectionRank = conflict ? null : jkbOverallSlateProjectionRankByDkId.get(row.dkId) ?? null;

    const posRankDiff = jkbSlatePositionRank !== null ? dkPositionSalaryRank - jkbSlatePositionRank : null;
    const overallRankDiff =
      jkbOverallSlateProjectionRank !== null && dkOverallSalaryRank !== null
        ? dkOverallSalaryRank - jkbOverallSlateProjectionRank
        : null;
    const pointsPer1k = projection ? (projection.projectedFantasyPoints / row.salary) * 1000 : null;

    return {
      kind: "offense",
      dkId: row.dkId,
      playerName: row.name,
      position: row.position,
      rosterPosition: row.rosterPosition,
      salary: row.salary,
      team: row.teamAbbrev,
      game: row.game,
      gameInfoRaw: row.gameInfoRaw,
      dkAvgPointsPerGame: row.avgPointsPerGame,
      dkStatus: row.status,
      identityStatus: resolution.status,
      playerId: resolution.playerId,
      identityConflict: conflict,
      projectedFantasyPoints: projection?.projectedFantasyPoints ?? null,
      projectionSource: projection ? DFS_PROJECTION_SOURCE : null,
      jkbWeeklyPositionRank: projection?.positionRank ?? null,
      jkbSlatePositionRank,
      jkbOverallSlateProjectionRank,
      dkPositionSalaryRank,
      dkOverallSalaryRank,
      posRankDiff,
      overallRankDiff,
      pointsPer1k,
    };
  });

  const dstAnalyzerRows: DfsAnalyzerDstRow[] = dstResolutions.map((resolution) => {
    const row = resolution.dkRow;
    const conflict = conflictedDkIds.has(resolution.dkId);

    return {
      kind: "dst",
      dkId: row.dkId,
      playerName: row.name,
      position: "DST",
      rosterPosition: row.rosterPosition,
      salary: row.salary,
      team: row.teamAbbrev,
      game: row.game,
      gameInfoRaw: row.gameInfoRaw,
      dkAvgPointsPerGame: row.avgPointsPerGame,
      dkStatus: row.status,
      identityStatus: resolution.status,
      canonicalTeamId: conflict ? null : resolution.team?.id ?? null,
      identityConflict: conflict,
      projectedFantasyPoints: null,
      projectionSource: null,
      jkbWeeklyPositionRank: null,
      jkbSlatePositionRank: null,
      jkbOverallSlateProjectionRank: null,
      dkPositionSalaryRank: dkPositionSalaryRankByDkId.get(row.dkId) as number,
      dkOverallSalaryRank: null,
      posRankDiff: null,
      overallRankDiff: null,
      pointsPer1k: null,
    };
  });

  const rows: DfsAnalyzerRow[] = [...offensiveAnalyzerRows, ...dstAnalyzerRows];

  const offensiveIdentityStatusCounts = countByStatus(
    offensiveResolutions.map((resolution) => resolution.status),
    ["resolved", "unresolved", "ambiguous", "position-conflict", "team-conflict"] as const,
  );
  const dstIdentityStatusCounts = countByStatus(
    dstResolutions.map((resolution) => resolution.status),
    ["resolved", "unresolved", "ambiguous"] as const,
  );

  const summary: DfsAnalyzerSummary = {
    totalUploadedRows: dkRows.length,
    offensiveRows: offensiveDkRows.length,
    dstRows: dstDkRows.length,
    resolvedOffensivePlayers: offensiveIdentityStatusCounts.resolved,
    unresolvedOffensivePlayers: offensiveIdentityStatusCounts.unresolved,
    ambiguousOrConflictingOffensivePlayers:
      offensiveIdentityStatusCounts.ambiguous +
      offensiveIdentityStatusCounts["position-conflict"] +
      offensiveIdentityStatusCounts["team-conflict"],
    offensiveIdentityStatusCounts,
    dstIdentityStatusCounts,
    duplicateCanonicalIdentityCount: duplicateOffensiveGroups.length + duplicateDstGroups.length,
    rowsWithProjections: offensiveAnalyzerRows.filter((row) => row.projectedFantasyPoints !== null).length,
    positionsPresent: Array.from(new Set(dkRows.map((row) => row.position))).sort(),
    gamesPresent: Array.from(new Set(dkRows.map((row) => row.gameInfoRaw))).sort(),
    teamsPresent: Array.from(new Set(dkRows.map((row) => row.teamAbbrev))).sort(),
  };

  return { rows, summary };
}

// ---------------------------------------------------------------------------
// WU3: enrichment with slate/artifact compatibility + weekly research.
//
// Deliberately layered on top of buildDfsSlateAnalysis rather than folded
// into it: the WU2 function/tests above are untouched, and this stays a pure
// additive consumer of WU3's compatibility + research assessments.
// ---------------------------------------------------------------------------

export type DfsEnrichedOffensiveRow = DfsAnalyzerOffensiveRow & {
  research: DfsPlayerResearch | null;
  teamMismatchStatus: DfsTeamMismatchStatus | "none";
  opponent: string | null;
  homeAway: "home" | "away" | null;
  canonicalGameId: string | null;
};

export type DfsEnrichedDstRow = DfsAnalyzerDstRow & {
  /** DST never carries research -- there is no fantasy research authority for team defense. */
  research: null;
  /** DST identity resolves directly from TeamAbbrev; there is no name-based team-mismatch concept. */
  teamMismatchStatus: "none";
  opponent: string | null;
  homeAway: "home" | "away" | null;
  canonicalGameId: string | null;
};

export type DfsEnrichedAnalyzerRow = DfsEnrichedOffensiveRow | DfsEnrichedDstRow;

export type DfsEnrichedSummary = DfsAnalyzerSummary & {
  projectionCoveragePct: number;
  rowsWithResearch: number;
  researchCoveragePct: number;
  researchCompatible: boolean;
  matchedGames: number;
  unmatchedGames: number;
  readiness: DfsSlateCompatibility["readiness"];
};

export type DfsEnrichedSlateAnalysis = {
  rows: DfsEnrichedAnalyzerRow[];
  summary: DfsEnrichedSummary;
  compatibility: DfsSlateCompatibility;
};

type TeamGameContext = { opponent: string; homeAway: "home" | "away"; canonicalGame: NflGameRecord };

function buildTeamGameContext(matchedGames: readonly DfsGameMatch[]): Map<string, TeamGameContext> {
  const lookup = new Map<string, TeamGameContext>();
  matchedGames.forEach(({ normalizedAway, normalizedHome, canonicalGame }) => {
    if (!canonicalGame || !normalizedAway || !normalizedHome) return;
    lookup.set(normalizedAway, { opponent: normalizedHome, homeAway: "away", canonicalGame });
    lookup.set(normalizedHome, { opponent: normalizedAway, homeAway: "home", canonicalGame });
  });
  return lookup;
}

/**
 * Attaches WU3 slate/artifact compatibility context and the canonical
 * weekly research companion to each WU2 analyzer row. Never recomputes a
 * projection, rank, research metric, or matchup grade -- every enriched
 * field is copied from `analysis`, `research`, or `compatibility`.
 */
export function enrichDfsSlateAnalysis(
  analysis: DfsSlateAnalysis,
  research: DfsResearchAssessment,
  compatibility: DfsSlateCompatibility,
): DfsEnrichedSlateAnalysis {
  const teamMismatchByDkId = new Map(compatibility.teamMismatches.map((record) => [record.dkId, record.status]));
  const teamGameContext = buildTeamGameContext(compatibility.games.matched);

  const rows: DfsEnrichedAnalyzerRow[] = analysis.rows.map((row) => {
    const context = teamGameContext.get(normalizeNflTeamAbbr(row.team));
    const opponent = context?.opponent ?? null;
    const homeAway = context?.homeAway ?? null;
    const canonicalGameId = context?.canonicalGame.gameId ?? null;

    if (row.kind === "dst") {
      return { ...row, research: null, teamMismatchStatus: "none", opponent, homeAway, canonicalGameId };
    }

    return {
      ...row,
      research: row.playerId ? research.byPlayerId.get(row.playerId) ?? null : null,
      teamMismatchStatus: teamMismatchByDkId.get(row.dkId) ?? "none",
      opponent,
      homeAway,
      canonicalGameId,
    };
  });

  const rowsWithResearch = rows.filter((row) => row.research?.status === "available").length;
  const projectionCoveragePct = analysis.summary.offensiveRows > 0
    ? (analysis.summary.rowsWithProjections / analysis.summary.offensiveRows) * 100
    : 0;
  const researchCoveragePct = analysis.summary.rowsWithProjections > 0
    ? (rowsWithResearch / analysis.summary.rowsWithProjections) * 100
    : 0;

  const summary: DfsEnrichedSummary = {
    ...analysis.summary,
    projectionCoveragePct,
    rowsWithResearch,
    researchCoveragePct,
    researchCompatible: research.compatibility.status === "compatible",
    matchedGames: compatibility.games.matched.length,
    unmatchedGames: compatibility.games.unmatched.length,
    readiness: compatibility.readiness,
  };

  return { rows, summary, compatibility };
}

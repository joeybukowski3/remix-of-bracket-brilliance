import { buildPgaPlayerLookup, resolvePgaPlayerMatch, type PgaPlayerMatchMethod, type PgaPlayerRecord } from "@/lib/pga/playerIdentity";
import type { JkbTrendRanking } from "@/hooks/useJkbTrendRankings";
import { normalizePlayerKey, type PgaTournamentModelRow } from "@/lib/pga/historyModel";
import { getPgaPlayerNationality, type PgaPlayerNationality } from "@/lib/pga/playerNationality";

export type PgaDfsSalaryRow = {
  player: string;
  salary: number;
  normalizedName: string;
  canonicalName: string;
};

export type PgaDfsComparisonStatus = "matched" | "unmatched" | "missing-rank-data";
export type PgaDfsCompareMode = "model" | "tournament" | "custom";
export type PgaDfsCoverageState = "FULL_MODEL" | "PARTIAL" | "SALARY_BASELINE";
export type PgaDfsSortDirection = "asc" | "desc";
export type PgaDfsSortKey =
  | "salaryRank"
  | "player"
  | "salary"
  | "modelRank"
  | "tournamentRank"
  | "customRank"
  | "vsModel"
  | "vsTournament"
  | "vsCustom";

export const PGA_DFS_VALUE_THRESHOLD = 3;

export type PgaDfsCanonicalPlayer = PgaPlayerRecord & {
  canonicalKey: string;
  playerId: string | null;
  nationality: PgaPlayerNationality | null;
  currentModelRank: number | null;
  tourModelRank: number;
  model: PgaTournamentModelRow;
  jkbTrend: JkbTrendRanking | null;
};

export type PgaDfsComparisonEntry = {
  salaryRank: number;
  uploadedPlayer: string;
  matchedPlayer: string | null;
  salary: number;
  matchMethod: PgaPlayerMatchMethod;
  status: PgaDfsComparisonStatus;
  coverageState: PgaDfsCoverageState;
  modelRank: number | null;
  tournamentRank: number | null;
  customRank: number | null;
  vsModel: number | null;
  vsTournament: number | null;
  vsCustom: number | null;
  normalizedName: string;
  canonicalName: string;
  canonicalPlayer: PgaDfsCanonicalPlayer | null;
};

export type PgaDfsTableRow = {
  salaryRank: number;
  player: string;
  salary: number;
  modelRank: number | null;
  tournamentRank: number | null;
  customRank: number | null;
  vsModel: number | null;
  vsTournament: number | null;
  vsCustom: number | null;
  coverageState: PgaDfsCoverageState;
  canonicalPlayer: PgaDfsCanonicalPlayer | null;
};

export type PgaDfsComparisonSummary = {
  uploadedRows: number;
  matchedRows: number;
  unmatchedRows: number;
  missingRankRows: number;
  matchMethods: Record<PgaPlayerMatchMethod, number>;
  unmatchedPlayers: string[];
  missingRankPlayers: string[];
  resolvedPlayers: Array<{
    uploadedPlayer: string;
    matchedPlayer: string;
    matchMethod: Exclude<PgaPlayerMatchMethod, "none">;
  }>;
};

export type PgaDfsComparisonData = {
  entries: PgaDfsComparisonEntry[];
  summary: PgaDfsComparisonSummary;
};

type RankLookup = Map<string, number>;

export function getPgaDfsComparisonValue(
  row: Pick<PgaDfsComparisonEntry, "vsModel" | "vsTournament" | "vsCustom">,
  mode: PgaDfsCompareMode,
) {
  if (mode === "model") return row.vsModel;
  if (mode === "tournament") return row.vsTournament;
  return row.vsCustom;
}

export function sortPgaDfsRows(
  rows: readonly PgaDfsTableRow[],
  sortKey: PgaDfsSortKey,
  sortDirection: PgaDfsSortDirection,
) {
  const multiplier = sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];

    if (leftValue == null && rightValue != null) return 1;
    if (leftValue != null && rightValue == null) return -1;

    let comparison = 0;
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      comparison = leftValue.localeCompare(rightValue) * multiplier;
    } else if (typeof leftValue === "number" && typeof rightValue === "number") {
      comparison = (leftValue - rightValue) * multiplier;
    }

    if (comparison !== 0) return comparison;
    const playerComparison = left.player.localeCompare(right.player);
    if (playerComparison !== 0) return playerComparison;
    return left.salaryRank - right.salaryRank;
  });
}

export function filterPgaDfsRows(
  rows: readonly PgaDfsTableRow[],
  {
    search,
    salaryBounds,
    compareMode,
    showValueOnly,
    valueThreshold = PGA_DFS_VALUE_THRESHOLD,
  }: {
    search: string;
    salaryBounds: readonly [number, number];
    compareMode: PgaDfsCompareMode;
    showValueOnly: boolean;
    valueThreshold?: number;
  },
) {
  const searchValue = search.trim().toLowerCase();
  return rows.filter((row) => {
    const selectedValue = getPgaDfsComparisonValue(row, compareMode);
    return (!searchValue || row.player.toLowerCase().includes(searchValue))
      && row.salary >= salaryBounds[0]
      && row.salary <= salaryBounds[1]
      && (!showValueOnly || (selectedValue != null && selectedValue >= valueThreshold));
  });
}

export function buildPgaDfsComparisonData(
  uploadedRows: readonly PgaDfsSalaryRow[],
  playerPool: readonly PgaDfsCanonicalPlayer[],
  tournamentRankMap: RankLookup,
  customRankMap: RankLookup,
): PgaDfsComparisonData {
  const lookup = buildPgaPlayerLookup(playerPool);
  const summary: PgaDfsComparisonSummary = {
    uploadedRows: uploadedRows.length,
    matchedRows: 0,
    unmatchedRows: 0,
    missingRankRows: 0,
    matchMethods: {
      exact: 0,
      canonical: 0,
      alias: 0,
      fuzzy: 0,
      none: 0,
    },
    unmatchedPlayers: [],
    missingRankPlayers: [],
    resolvedPlayers: [],
  };

  const entries = uploadedRows.map((row, index): PgaDfsComparisonEntry => {
    const match = resolvePgaPlayerMatch(row.player, lookup);
    summary.matchMethods[match.method] += 1;

    if (!match.matchedPlayer) {
      summary.unmatchedRows += 1;
      summary.unmatchedPlayers.push(row.player);
      return {
        salaryRank: index + 1,
        uploadedPlayer: row.player,
        matchedPlayer: null,
        salary: row.salary,
        matchMethod: match.method,
        status: "unmatched",
        coverageState: "SALARY_BASELINE",
        modelRank: null,
        tournamentRank: null,
        customRank: null,
        vsModel: null,
        vsTournament: null,
        vsCustom: null,
        normalizedName: row.normalizedName,
        canonicalName: row.canonicalName,
        canonicalPlayer: null,
      };
    }

    const canonicalPlayer = match.matchedPlayer;
    const resolvedPlayer = canonicalPlayer.player;
    const modelRank = canonicalPlayer.currentModelRank;
    const tournamentRank = tournamentRankMap.get(resolvedPlayer) ?? null;
    const customRank = customRankMap.get(resolvedPlayer) ?? null;

    summary.resolvedPlayers.push({
      uploadedPlayer: row.player,
      matchedPlayer: resolvedPlayer,
      matchMethod: match.method === "none" ? "canonical" : match.method,
    });

    const coverageState: PgaDfsCoverageState = modelRank != null && tournamentRank != null
      ? "FULL_MODEL"
      : "PARTIAL";
    const hasMissingRank = modelRank == null || tournamentRank == null || customRank == null;

    if (hasMissingRank) {
      summary.missingRankRows += 1;
      summary.missingRankPlayers.push(row.player);
    }

    if (!hasMissingRank) summary.matchedRows += 1;
    return {
      salaryRank: index + 1,
      uploadedPlayer: row.player,
      matchedPlayer: resolvedPlayer,
      salary: row.salary,
      matchMethod: match.method,
      status: hasMissingRank ? "missing-rank-data" : "matched",
      coverageState,
      modelRank,
      tournamentRank,
      customRank,
      vsModel: modelRank == null ? null : index + 1 - modelRank,
      vsTournament: tournamentRank == null ? null : index + 1 - tournamentRank,
      vsCustom: customRank == null ? null : index + 1 - customRank,
      normalizedName: row.normalizedName,
      canonicalName: row.canonicalName,
      canonicalPlayer,
    };
  });

  return { entries, summary };
}

export function buildPgaDfsCanonicalPlayers(
  modelRows: readonly PgaTournamentModelRow[],
  playerIdMap: ReadonlyMap<string, string>,
  jkbTrendMap: ReadonlyMap<string, JkbTrendRanking>,
): PgaDfsCanonicalPlayer[] {
  return modelRows.map((model) => {
    const canonicalKey = normalizePlayerKey(model.player);
    return {
      player: model.player,
      canonicalKey,
      playerId: playerIdMap.get(canonicalKey) ?? null,
      nationality: getPgaPlayerNationality(model.player),
      currentModelRank: model.fieldRank,
      tourModelRank: model.modelRank,
      model,
      jkbTrend: jkbTrendMap.get(canonicalKey) ?? null,
    };
  });
}

import { buildPgaPlayerLookup, resolvePgaPlayerMatch, type PgaPlayerMatchMethod, type PgaPlayerRecord } from "@/lib/pga/playerIdentity";

export type PgaDfsSalaryRow = {
  player: string;
  salary: number;
  normalizedName: string;
  canonicalName: string;
};

export type PgaDfsComparisonStatus = "matched" | "unmatched" | "missing-rank-data";

export type PgaDfsComparisonEntry = {
  salaryRank: number;
  uploadedPlayer: string;
  matchedPlayer: string | null;
  salary: number;
  matchMethod: PgaPlayerMatchMethod;
  status: PgaDfsComparisonStatus;
  modelRank: number | null;
  tournamentRank: number | null;
  customRank: number | null;
  vsModel: number | null;
  vsTournament: number | null;
  vsCustom: number | null;
  normalizedName: string;
  canonicalName: string;
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

export function buildPgaDfsComparisonData<T extends PgaPlayerRecord>(
  uploadedRows: readonly PgaDfsSalaryRow[],
  playerPool: readonly T[],
  modelRankMap: RankLookup,
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
        modelRank: null,
        tournamentRank: null,
        customRank: null,
        vsModel: null,
        vsTournament: null,
        vsCustom: null,
        normalizedName: row.normalizedName,
        canonicalName: row.canonicalName,
      };
    }

    const resolvedPlayer = match.matchedPlayer.player;
    const modelRank = modelRankMap.get(resolvedPlayer) ?? null;
    const tournamentRank = tournamentRankMap.get(resolvedPlayer) ?? null;
    const customRank = customRankMap.get(resolvedPlayer) ?? null;

    summary.resolvedPlayers.push({
      uploadedPlayer: row.player,
      matchedPlayer: resolvedPlayer,
      matchMethod: match.method === "none" ? "canonical" : match.method,
    });

    if (modelRank == null || tournamentRank == null || customRank == null) {
      summary.missingRankRows += 1;
      summary.missingRankPlayers.push(row.player);
      return {
        salaryRank: index + 1,
        uploadedPlayer: row.player,
        matchedPlayer: resolvedPlayer,
        salary: row.salary,
        matchMethod: match.method,
        status: "missing-rank-data",
        modelRank,
        tournamentRank,
        customRank,
        vsModel: null,
        vsTournament: null,
        vsCustom: null,
        normalizedName: row.normalizedName,
        canonicalName: row.canonicalName,
      };
    }

    summary.matchedRows += 1;
    return {
      salaryRank: index + 1,
      uploadedPlayer: row.player,
      matchedPlayer: resolvedPlayer,
      salary: row.salary,
      matchMethod: match.method,
      status: "matched",
      modelRank,
      tournamentRank,
      customRank,
      vsModel: index + 1 - modelRank,
      vsTournament: index + 1 - tournamentRank,
      vsCustom: index + 1 - customRank,
      normalizedName: row.normalizedName,
      canonicalName: row.canonicalName,
    };
  });

  return { entries, summary };
}

import type { CfbResearchTeamSeason } from "../types";

export type UnresolvedTeamMapping = {
  season: number;
  externalTeamId: string;
};

/** Rows where a CFBD external team id has no canonical JKB team id (expected for historical/defunct programs). */
export function collectUnresolvedTeamMappings(
  rows: readonly CfbResearchTeamSeason[],
): UnresolvedTeamMapping[] {
  return rows
    .filter((row) => row.jkbTeamId === null)
    .map((row) => ({ season: row.season, externalTeamId: row.externalTeamId }));
}

/**
 * Two distinct CFBD external team ids resolving to the same JKB team id
 * within one season is a mapping bug, not a legitimate outcome — fail
 * loudly rather than silently overwriting one team's data with another's.
 */
export function assertNoAmbiguousTeamMappings(rows: readonly CfbResearchTeamSeason[]): void {
  const bySeason = new Map<number, Map<string, string>>();
  for (const row of rows) {
    if (row.jkbTeamId === null) continue;
    let seen = bySeason.get(row.season);
    if (!seen) {
      seen = new Map<string, string>();
      bySeason.set(row.season, seen);
    }
    const existingExternalId = seen.get(row.jkbTeamId);
    if (existingExternalId !== undefined && existingExternalId !== row.externalTeamId) {
      throw new Error(
        `Ambiguous team mapping in season ${row.season}: jkbTeamId "${row.jkbTeamId}" resolves to ` +
          `both externalTeamId "${existingExternalId}" and "${row.externalTeamId}"`,
      );
    }
    seen.set(row.jkbTeamId, row.externalTeamId);
  }
}

/**
 * Parsing of preserved stats.nba.com response bodies (no network code).
 *
 * The retrieval client is local-only tooling and is not part of the
 * repository (Phase 2B review decision); see docs/nba-player-props-phase-2b-plan.md.
 */

export interface StatsNbaResultSet {
  name: string;
  headers: string[];
  rowSet: unknown[][];
}

/** Throws unless the body is a stats.nba.com payload with at least one result set. */
export function parseStatsNbaResultSets(bodyText: string): StatsNbaResultSet[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("stats.nba.com response is not valid JSON");
  }
  const resultSets = (parsed as { resultSets?: unknown })?.resultSets;
  if (!Array.isArray(resultSets) || resultSets.length === 0) {
    throw new Error("stats.nba.com response has no resultSets");
  }
  return resultSets.map((set, index) => {
    const candidate = set as Partial<StatsNbaResultSet>;
    if (!Array.isArray(candidate.headers) || !Array.isArray(candidate.rowSet)) {
      throw new Error(`stats.nba.com resultSets[${index}] is missing headers or rowSet`);
    }
    return { name: String(candidate.name ?? index), headers: candidate.headers, rowSet: candidate.rowSet };
  });
}

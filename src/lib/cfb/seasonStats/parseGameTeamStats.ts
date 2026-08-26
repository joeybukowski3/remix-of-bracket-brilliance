// Pure parsing of one CFBD /games/teams team-row `stats: [{category, stat}]`
// array into a typed numeric line. Deliberately independent of
// src/lib/cfb/pipeline/normalizeCfbd.ts (V1/V1.1 rating math owns that file) —
// this module is production-stats-only and has no rating-model coupling.

export type CfbdRawTeamStatEntry = { category: string; stat: string };

/** A parsed "made-attempted" pair, e.g. CFBD's "4-11" thirdDownEff string. */
export type SplitStat = { made: number; attempted: number };

function normalizedCategory(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses CFBD's "made-attempted" box-score strings (thirdDownEff:
 * "4-11", completionAttempts: "11-15"). Returns null for any
 * malformed/missing value rather than a partial guess.
 */
export function parseSplitStat(value: string | undefined): SplitStat | null {
  if (value === undefined) return null;
  const parts = value.trim().split("-");
  if (parts.length !== 2) return null;
  const made = parseNumber(parts[0]);
  const attempted = parseNumber(parts[1]);
  if (made === null || attempted === null || attempted < 0 || made < 0 || made > attempted) return null;
  return { made, attempted };
}

/** One team's fully-parsed offensive box-score line for a single game. */
export type CfbGameTeamStatLine = {
  totalYards: number | null;
  rushingYards: number | null;
  rushingAttempts: number | null;
  passingYards: number | null;
  passCompletions: number | null;
  passAttempts: number | null;
  /** rushingAttempts + passAttempts — CFBD does not publish a direct "plays" category. */
  offensivePlays: number | null;
  thirdDownConversions: number | null;
  thirdDownAttempts: number | null;
  turnovers: number | null;
};

/**
 * Extracts the fields this stats unit needs from a raw CFBD team-stats row.
 * Unknown/missing categories become null on that field only — one missing
 * category never blanks the rest of the line.
 */
export function extractGameTeamStatLine(stats: readonly CfbdRawTeamStatEntry[]): CfbGameTeamStatLine {
  const lookup = new Map(stats.map((row) => [normalizedCategory(row.category), row.stat]));

  const totalYards = parseNumber(lookup.get("totalyards"));
  const rushingYards = parseNumber(lookup.get("rushingyards"));
  const rushingAttempts = parseNumber(lookup.get("rushingattempts"));
  const passingYards = parseNumber(lookup.get("netpassingyards") ?? lookup.get("passingyards"));
  const completionAttempts = parseSplitStat(
    lookup.get("completionattempts") ?? lookup.get("completionsattempts"),
  );
  const thirdDown = parseSplitStat(lookup.get("thirddowneff"));
  const turnovers = parseNumber(lookup.get("turnovers"));

  const passCompletions = completionAttempts?.made ?? null;
  const passAttempts = completionAttempts?.attempted ?? null;
  const offensivePlays =
    rushingAttempts !== null && passAttempts !== null ? rushingAttempts + passAttempts : null;

  return {
    totalYards,
    rushingYards,
    rushingAttempts,
    passingYards,
    passCompletions,
    passAttempts,
    offensivePlays,
    thirdDownConversions: thirdDown?.made ?? null,
    thirdDownAttempts: thirdDown?.attempted ?? null,
    turnovers,
  };
}

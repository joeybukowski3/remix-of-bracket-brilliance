/**
 * 2025 actual PAR, joined to the 2026 board on "Source ID".
 *
 * Read-only display data. Nothing here feeds a 2026 PAR calculation, and no
 * value is recomputed — the file's own replacement baseline and PAR figures are
 * used exactly as supplied.
 *
 * Three populations exist in the source file and each is handled explicitly:
 *   - rows with a Source ID that matches the 2026 consensus and populated
 *     stats: the only ones that produce a 2025 line;
 *   - rows with a matching Source ID but null stat fields (rookies, no 2025
 *     season): they join, but there is nothing to show, so they resolve to
 *     `undefined` rather than a zero that could be misread as zero PAR;
 *   - rows with a null Source ID: 2025-only players with no scheme to match
 *     them to a 2026 ID. They are deliberately left unjoined — never
 *     name-matched as a fallback.
 */

import parActualSource from "../../../data/fantasy/2025-par-actual.json";

export type FantasyParActualSourceRow = {
  Player: string;
  Team: string;
  Position: string;
  "Source ID": string | null;
  "2025 Games Played": number | null;
  "2025 Fantasy Points": number | null;
  "2025 PPG": number | null;
  "2025 Replacement PPG": number | null;
  "2025 PAR/G": number | null;
  "2025 Season PAR": number | null;
};

/** One player's populated 2025 season, as supplied. */
export type FantasyParActual2025 = {
  sourceId: string;
  player: string;
  team: string;
  position: string;
  gamesPlayed: number;
  fantasyPoints: number;
  ppg: number;
  replacementPpg: number;
  parPerGame: number;
  seasonPar: number;
};

const rawRows = parActualSource as readonly FantasyParActualSourceRow[];

function toActualRow(row: FantasyParActualSourceRow): FantasyParActual2025 | null {
  const sourceId = row["Source ID"];
  if (!sourceId) return null;

  const gamesPlayed = row["2025 Games Played"];
  const fantasyPoints = row["2025 Fantasy Points"];
  const ppg = row["2025 PPG"];
  const replacementPpg = row["2025 Replacement PPG"];
  const parPerGame = row["2025 PAR/G"];
  const seasonPar = row["2025 Season PAR"];

  // A row with any null stat field played no 2025 season we can report on.
  if (
    !Number.isFinite(gamesPlayed) ||
    !Number.isFinite(fantasyPoints) ||
    !Number.isFinite(ppg) ||
    !Number.isFinite(replacementPpg) ||
    !Number.isFinite(parPerGame) ||
    !Number.isFinite(seasonPar)
  ) {
    return null;
  }

  return {
    sourceId,
    player: row.Player,
    team: row.Team,
    position: row.Position,
    gamesPlayed: gamesPlayed as number,
    fantasyPoints: fantasyPoints as number,
    ppg: ppg as number,
    replacementPpg: replacementPpg as number,
    parPerGame: parPerGame as number,
    seasonPar: seasonPar as number,
  };
}

export function buildParActual2025Index(
  sourceRows: readonly FantasyParActualSourceRow[],
): ReadonlyMap<string, FantasyParActual2025> {
  const index = new Map<string, FantasyParActual2025>();
  for (const row of sourceRows) {
    const actual = toActualRow(row);
    if (!actual) continue;
    if (index.has(actual.sourceId)) {
      throw new Error(`Duplicate 2025 actual PAR Source ID ${actual.sourceId}.`);
    }
    index.set(actual.sourceId, actual);
  }
  return index;
}

export const FANTASY_PAR_ACTUAL_2025 = buildParActual2025Index(rawRows);

/** Returns the player's 2025 season, or undefined when there is no 2025 data to show. */
export function getParActual2025(sourceId: string | undefined): FantasyParActual2025 | undefined {
  return sourceId ? FANTASY_PAR_ACTUAL_2025.get(sourceId) : undefined;
}

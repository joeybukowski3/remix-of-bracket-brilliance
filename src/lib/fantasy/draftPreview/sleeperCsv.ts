/**
 * Pure parser for the supplied Sleeper draft-board CSV
 * (`data/fantasy/source/PixBook-Sleeper-DraftBoard-2026.csv`).
 *
 * The source file has two leading blank rows before the header, so blank
 * rows (every field empty) are dropped before the first remaining row is
 * treated as the header. No values are invented — a missing numeric cell
 * throws rather than being coerced to zero, and TEAM/BYE placeholders
 * ("—" / "-") become `null`, never a fabricated value.
 */

export type SleeperDraftBoardRow = {
  /** Sleeper draft-room rank. Fixed source data — never reordered or recomputed. */
  sleeperRank: number;
  player: string;
  /** Verbatim POS column from the source (e.g. "QB", "DEF", "K", "DB/WR"). */
  sourcePosition: string;
  /** Sleeper's team code, or `null` for "—"/blank (free agent / unrostered). */
  team: string | null;
  adp: number;
  /** Bye week, or `null` when the source has no team/bye ("-"). */
  bye: number | null;
  projectedPoints: number;
  projectedPpg: number;
  rushAttempts: number;
  rushYards: number;
  rushTouchdowns: number;
  receivingTargets: number;
  receivingYards: number;
  receivingTouchdowns: number;
  passAttempts: number;
  passYards: number;
  passTouchdowns: number;
};

const EXPECTED_HEADER = [
  "RK",
  "PLAYER",
  "POS",
  "TEAM",
  "ADP",
  "BYE",
  "PROJ_PTS",
  "PROJ_AVG",
  "RUSH_ATT",
  "RUSH_YDS",
  "RUSH_TD",
  "REC_TAR",
  "REC_YDS",
  "REC_TD",
  "PASS_ATT",
  "PASS_YDS",
  "PASS_TD",
] as const;

function parseRequiredNumber(raw: string, field: string, context: string): number {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field} "${raw}" for ${context}.`);
  }
  return value;
}

function parseRequiredInt(raw: string, field: string, context: string): number {
  const value = parseRequiredNumber(raw, field, context);
  if (!Number.isInteger(value)) {
    throw new Error(`Expected integer ${field} "${raw}" for ${context}.`);
  }
  return value;
}

/** BYE and TEAM use "-" / "—" as explicit placeholders; both mean "not available". */
function parseOptionalNumber(raw: string, field: string, context: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "—") return null;
  return parseRequiredInt(raw, field, context);
}

function parseTeam(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "—") return null;
  return trimmed;
}

export function parseSleeperDraftBoardCsv(raw: string): readonly SleeperDraftBoardRow[] {
  const lines = raw.split(/\r?\n/).filter((line) => !/^,*$/.test(line));
  if (lines.length === 0) {
    throw new Error("Sleeper draft board CSV has no data.");
  }

  const header = lines[0].split(",");
  if (header.length !== EXPECTED_HEADER.length || header.some((cell, index) => cell !== EXPECTED_HEADER[index])) {
    throw new Error(`Unexpected Sleeper draft board header: ${lines[0]}`);
  }

  return lines.slice(1).map((line, index) => {
    const cells = line.split(",");
    if (cells.length !== EXPECTED_HEADER.length) {
      throw new Error(`Row ${index + 1} has ${cells.length} fields; expected ${EXPECTED_HEADER.length}. Line: ${line}`);
    }
    const player = cells[1].trim();
    const context = `${player || "(blank player)"} (source row ${index + 1})`;
    return {
      sleeperRank: parseRequiredInt(cells[0], "RK", context),
      player,
      sourcePosition: cells[2].trim(),
      team: parseTeam(cells[3]),
      adp: parseRequiredNumber(cells[4], "ADP", context),
      bye: parseOptionalNumber(cells[5], "BYE", context),
      projectedPoints: parseRequiredNumber(cells[6], "PROJ_PTS", context),
      projectedPpg: parseRequiredNumber(cells[7], "PROJ_AVG", context),
      rushAttempts: parseRequiredNumber(cells[8], "RUSH_ATT", context),
      rushYards: parseRequiredNumber(cells[9], "RUSH_YDS", context),
      rushTouchdowns: parseRequiredNumber(cells[10], "RUSH_TD", context),
      receivingTargets: parseRequiredNumber(cells[11], "REC_TAR", context),
      receivingYards: parseRequiredNumber(cells[12], "REC_YDS", context),
      receivingTouchdowns: parseRequiredNumber(cells[13], "REC_TD", context),
      passAttempts: parseRequiredNumber(cells[14], "PASS_ATT", context),
      passYards: parseRequiredNumber(cells[15], "PASS_YDS", context),
      passTouchdowns: parseRequiredNumber(cells[16], "PASS_TD", context),
    };
  });
}

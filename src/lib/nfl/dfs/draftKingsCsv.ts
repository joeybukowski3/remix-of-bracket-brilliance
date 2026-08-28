import Papa from "papaparse";
import {
  DK_NFL_CLASSIC_HEADERS,
  DK_NFL_CLASSIC_KNOWN_STATUSES,
  DK_NFL_CLASSIC_POSITIONS,
  DK_NFL_CLASSIC_ROSTER_POSITION_BY_POSITION,
  type DraftKingsContestFormat,
  type DraftKingsDiagnostic,
  type DraftKingsDiagnosticCode,
  type DraftKingsDiagnosticSeverity,
  type DraftKingsNflClassicParseResult,
  type DraftKingsNflClassicPosition,
  type DraftKingsNflClassicSummary,
  type DraftKingsParsedGameInfo,
  type ValidatedDraftKingsNflClassicRow,
} from "@/lib/nfl/dfs/contracts";

const REQUIRED_HEADER_SET = new Set<string>(DK_NFL_CLASSIC_HEADERS);
const SUPPORTED_POSITION_SET = new Set<string>(DK_NFL_CLASSIC_POSITIONS);
const KNOWN_STATUS_SET = new Set<string>(DK_NFL_CLASSIC_KNOWN_STATUSES);

const DK_ID_PATTERN = /^[0-9]+$/;
const SALARY_PATTERN = /^[0-9]+$/;
// "NO@DET 09/13/2026 01:00PM ET"
const GAME_INFO_PATTERN = /^([A-Z]{2,4})@([A-Z]{2,4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2}(?:AM|PM))\s+([A-Z]{2,4})$/;

function diag(
  severity: DraftKingsDiagnosticSeverity,
  code: DraftKingsDiagnosticCode,
  message: string,
  options: { row?: number; field?: string; value?: string } = {},
): DraftKingsDiagnostic {
  return {
    severity,
    code,
    message,
    row: options.row ?? null,
    field: options.field ?? null,
    value: options.value ?? null,
  };
}

function parseGameInfo(raw: string): DraftKingsParsedGameInfo | null {
  const match = GAME_INFO_PATTERN.exec(raw.trim());
  if (!match) return null;
  const [, awayTeam, homeTeam, date, time, timezone] = match;
  return { awayTeam, homeTeam, date, time, timezone };
}

function buildSummary(
  rows: readonly ValidatedDraftKingsNflClassicRow[],
  diagnostics: readonly DraftKingsDiagnostic[],
): DraftKingsNflClassicSummary {
  const positions = new Set<DraftKingsNflClassicPosition>();
  const rosterPositions = new Set<string>();
  const teams = new Set<string>();
  const games = new Set<string>();
  const statusCounts: Record<string, number> = {};

  rows.forEach((row) => {
    positions.add(row.position);
    rosterPositions.add(row.rosterPosition);
    teams.add(row.teamAbbrev);
    games.add(row.gameInfoRaw);
    const statusKey = row.status ?? "(blank)";
    statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;
  });

  const duplicateDkIds = Array.from(
    new Set(
      diagnostics
        .filter((entry): entry is DraftKingsDiagnostic & { value: string } => entry.code === "DUPLICATE_DK_ID" && entry.value !== null)
        .map((entry) => entry.value),
    ),
  ).sort();

  return {
    positions: Array.from(positions).sort(),
    rosterPositions: Array.from(rosterPositions).sort(),
    teams: Array.from(teams).sort(),
    games: Array.from(games).sort(),
    duplicateDkIds,
    statusCounts,
  };
}

function buildResult(
  contestFormat: DraftKingsContestFormat,
  headers: string[],
  rawRowCount: number,
  rows: ValidatedDraftKingsNflClassicRow[],
  diagnostics: DraftKingsDiagnostic[],
  invalidRowCount: number,
): DraftKingsNflClassicParseResult {
  const accepted = contestFormat === "NFL_CLASSIC" && diagnostics.every((entry) => entry.severity !== "error");

  return {
    accepted,
    contestFormat,
    headers,
    rawRowCount,
    validRowCount: rows.length,
    invalidRowCount,
    rows,
    diagnostics,
    summary: buildSummary(rows, diagnostics),
  };
}

/**
 * Strictly parses and validates a DraftKings NFL Classic salary CSV.
 *
 * Behavior:
 * - Reordered headers are accepted (columns are read by header name).
 * - Unrecognized extra columns are tolerated (warning diagnostic, not blocking).
 * - Malformed rows are never silently dropped: every row is parsed and every
 *   diagnostic collected, then the overall result is rejected if any
 *   error-severity diagnostic exists.
 * - Showdown/Captain-mode exports (CPT markers in Position or Roster
 *   Position) and non-DraftKings/unrelated CSVs are rejected as an
 *   unsupported contest format.
 */
export function parseDraftKingsNflClassicCsv(csvText: string): DraftKingsNflClassicParseResult {
  const diagnostics: DraftKingsDiagnostic[] = [];

  if (!csvText || csvText.trim().length === 0) {
    diagnostics.push(diag("error", "EMPTY_FILE", "The uploaded file is empty."));
    return buildResult("UNKNOWN", [], 0, [], diagnostics, 0);
  }

  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: "greedy",
  });

  parsed.errors.forEach((error) => {
    diagnostics.push(
      diag("error", "CSV_PARSE_ERROR", error.message, {
        row: typeof error.row === "number" ? error.row + 2 : undefined,
      }),
    );
  });

  const data = parsed.data;
  if (data.length === 0) {
    diagnostics.push(diag("error", "EMPTY_FILE", "The uploaded file contains no rows."));
    return buildResult("UNKNOWN", [], 0, [], diagnostics, 0);
  }

  const headers = data[0].map((header) => header.trim());
  const dataRows = data.slice(1);

  const headerCounts = new Map<string, number>();
  headers.forEach((header) => headerCounts.set(header, (headerCounts.get(header) ?? 0) + 1));
  headerCounts.forEach((count, header) => {
    if (count > 1 && header.length > 0) {
      diagnostics.push(diag("error", "DUPLICATE_HEADER", `Header "${header}" appears ${count} times.`, { field: header }));
    }
  });

  const missingHeaders = DK_NFL_CLASSIC_HEADERS.filter((required) => !headers.includes(required));
  missingHeaders.forEach((missing) => {
    diagnostics.push(diag("error", "MISSING_REQUIRED_COLUMN", `Missing required column "${missing}".`, { field: missing }));
  });

  headers
    .filter((header) => header.length > 0 && !REQUIRED_HEADER_SET.has(header))
    .forEach((header) => {
      diagnostics.push(diag("warning", "UNKNOWN_COLUMN", `Unrecognized column "${header}" was ignored.`, { field: header }));
    });

  if (missingHeaders.length > 0) {
    diagnostics.push(diag("error", "UNSUPPORTED_CONTEST_FORMAT", "File headers do not match the DraftKings NFL Classic schema."));
    return buildResult("UNKNOWN", headers, dataRows.length, [], diagnostics, dataRows.length);
  }

  if (dataRows.length === 0) {
    diagnostics.push(diag("error", "HEADER_ONLY_FILE", "The file contains headers but no data rows."));
    return buildResult("NFL_CLASSIC", headers, 0, [], diagnostics, 0);
  }

  const columnIndex = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!columnIndex.has(header)) columnIndex.set(header, index);
  });
  const get = (row: string[], header: string) => (row[columnIndex.get(header) as number] ?? "").trim();

  const rows: ValidatedDraftKingsNflClassicRow[] = [];
  const seenDkIds = new Map<string, number>();
  let showdownDetected = false;
  let invalidRowCount = 0;

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for header row, +1 for 1-indexing

    if (row.length !== headers.length) {
      diagnostics.push(
        diag("error", "INVALID_ROW_WIDTH", `Row ${rowNumber} has ${row.length} fields; expected ${headers.length}.`, { row: rowNumber }),
      );
      invalidRowCount += 1;
      return;
    }

    const rowDiagnostics: DraftKingsDiagnostic[] = [];

    const positionRaw = get(row, "Position");
    const namePlusId = get(row, "Name + ID");
    const name = get(row, "Name");
    const dkId = get(row, "ID");
    const rosterPosition = get(row, "Roster Position");
    const salaryRaw = get(row, "Salary");
    const gameInfoRaw = get(row, "Game Info");
    const teamAbbrev = get(row, "TeamAbbrev");
    const avgPointsRaw = get(row, "AvgPointsPerGame");
    const statusRaw = get(row, "Status");

    if (/cpt/i.test(positionRaw) || /cpt/i.test(rosterPosition)) {
      showdownDetected = true;
    }

    if (!positionRaw) {
      rowDiagnostics.push(diag("error", "MISSING_REQUIRED_VALUE", `Row ${rowNumber} is missing Position.`, { row: rowNumber, field: "position" }));
    } else if (!SUPPORTED_POSITION_SET.has(positionRaw)) {
      rowDiagnostics.push(
        diag("error", "INVALID_POSITION", `Row ${rowNumber} has unsupported position "${positionRaw}".`, {
          row: rowNumber,
          field: "position",
          value: positionRaw,
        }),
      );
    }

    if (!name) {
      rowDiagnostics.push(diag("error", "MISSING_REQUIRED_VALUE", `Row ${rowNumber} is missing Name.`, { row: rowNumber, field: "name" }));
    }

    if (!teamAbbrev) {
      rowDiagnostics.push(diag("error", "MISSING_REQUIRED_VALUE", `Row ${rowNumber} is missing TeamAbbrev.`, { row: rowNumber, field: "teamAbbrev" }));
    }

    if (!dkId) {
      rowDiagnostics.push(diag("error", "INVALID_DK_ID", `Row ${rowNumber} is missing ID.`, { row: rowNumber, field: "dkId" }));
    } else if (!DK_ID_PATTERN.test(dkId)) {
      rowDiagnostics.push(
        diag("error", "INVALID_DK_ID", `Row ${rowNumber} has malformed ID "${dkId}".`, { row: rowNumber, field: "dkId", value: dkId }),
      );
    } else {
      const existingRow = seenDkIds.get(dkId);
      if (existingRow !== undefined) {
        rowDiagnostics.push(
          diag("error", "DUPLICATE_DK_ID", `Row ${rowNumber} duplicates ID "${dkId}" first seen on row ${existingRow}.`, {
            row: rowNumber,
            field: "dkId",
            value: dkId,
          }),
        );
      } else {
        seenDkIds.set(dkId, rowNumber);
      }
    }

    const expectedRosterPosition = SUPPORTED_POSITION_SET.has(positionRaw)
      ? DK_NFL_CLASSIC_ROSTER_POSITION_BY_POSITION[positionRaw as DraftKingsNflClassicPosition]
      : null;
    if (!rosterPosition) {
      rowDiagnostics.push(
        diag("error", "INVALID_ROSTER_POSITION", `Row ${rowNumber} is missing Roster Position.`, { row: rowNumber, field: "rosterPosition" }),
      );
    } else if (expectedRosterPosition && rosterPosition !== expectedRosterPosition) {
      rowDiagnostics.push(
        diag(
          "error",
          "INVALID_ROSTER_POSITION",
          `Row ${rowNumber} has Roster Position "${rosterPosition}" inconsistent with position "${positionRaw}".`,
          { row: rowNumber, field: "rosterPosition", value: rosterPosition },
        ),
      );
    }

    let salary: number | null = null;
    if (!salaryRaw) {
      rowDiagnostics.push(diag("error", "INVALID_SALARY", `Row ${rowNumber} is missing Salary.`, { row: rowNumber, field: "salary" }));
    } else if (!SALARY_PATTERN.test(salaryRaw)) {
      rowDiagnostics.push(
        diag("error", "INVALID_SALARY", `Row ${rowNumber} has invalid Salary "${salaryRaw}".`, { row: rowNumber, field: "salary", value: salaryRaw }),
      );
    } else {
      const numeric = Number(salaryRaw);
      if (numeric <= 0) {
        rowDiagnostics.push(
          diag("error", "INVALID_SALARY", `Row ${rowNumber} has non-positive Salary "${salaryRaw}".`, {
            row: rowNumber,
            field: "salary",
            value: salaryRaw,
          }),
        );
      } else {
        salary = numeric;
      }
    }

    let avgPointsPerGame: number | null = null;
    if (avgPointsRaw) {
      const numeric = Number(avgPointsRaw);
      if (!Number.isFinite(numeric)) {
        diagnostics.push(
          diag("warning", "INVALID_AVG_POINTS", `Row ${rowNumber} has malformed AvgPointsPerGame "${avgPointsRaw}".`, {
            row: rowNumber,
            field: "avgPointsPerGame",
            value: avgPointsRaw,
          }),
        );
      } else {
        avgPointsPerGame = numeric;
      }
    }

    let status: string | null = null;
    if (statusRaw) {
      status = statusRaw;
      if (!KNOWN_STATUS_SET.has(statusRaw)) {
        diagnostics.push(
          diag("warning", "UNKNOWN_STATUS", `Row ${rowNumber} has an unrecognized Status "${statusRaw}".`, {
            row: rowNumber,
            field: "status",
            value: statusRaw,
          }),
        );
      }
    }

    const game = parseGameInfo(gameInfoRaw);
    if (gameInfoRaw && !game) {
      diagnostics.push(
        diag("warning", "UNPARSED_GAME_INFO", `Row ${rowNumber} has Game Info that could not be parsed: "${gameInfoRaw}".`, {
          row: rowNumber,
          field: "gameInfoRaw",
          value: gameInfoRaw,
        }),
      );
    }

    const hasBlockingError = rowDiagnostics.some((entry) => entry.severity === "error");
    diagnostics.push(...rowDiagnostics);

    if (hasBlockingError || salary === null || !SUPPORTED_POSITION_SET.has(positionRaw)) {
      invalidRowCount += 1;
      return;
    }

    rows.push({
      position: positionRaw as DraftKingsNflClassicPosition,
      namePlusId,
      name,
      dkId,
      rosterPosition,
      salary,
      gameInfoRaw,
      game,
      teamAbbrev,
      avgPointsPerGame,
      status,
    });
  });

  let contestFormat: DraftKingsContestFormat = "NFL_CLASSIC";
  if (showdownDetected) {
    contestFormat = "SHOWDOWN";
    diagnostics.push(
      diag("error", "UNSUPPORTED_CONTEST_FORMAT", "This file appears to be a DraftKings Showdown/Captain Mode export, which is not supported."),
    );
  }

  return buildResult(contestFormat, headers, dataRows.length, rows, diagnostics, invalidRowCount);
}

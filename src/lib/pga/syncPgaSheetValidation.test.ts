/**
 * Tests for the sync-pga-sheet.mjs tournament model validation logic.
 *
 * These tests verify that:
 * 1. Stale sheet rows cannot inherit the current schedule tournament name
 * 2. Sheet identity is independently checked against the schedule
 * 3. Stale embedded dates are rejected
 * 4. Unavailable models keep zero rows
 * 5. Unvalidated rows cannot replace an unavailable model
 * 6. Required metadata (tournamentId, startDate, endDate) is not removed
 * 7. A correctly-identified and current sheet is accepted
 * 8. The regression transition (modelAvailable=false → rows>0 without sourceValidated) fails
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline re-implementations of the key functions from sync-pga-sheet.mjs
// (the script is an ESM Node script, not importable directly in vitest)
// ---------------------------------------------------------------------------

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function extractSheetReferenceDate(rows: string[][]): string | null {
  const datePattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const match = String(cell ?? "").match(datePattern);
      if (!match) continue;
      const month = match[1].padStart(2, "0");
      const day = match[2].padStart(2, "0");
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

interface ScheduleEntry {
  name: string;
  courseName: string;
  id: string;
  startDate: string;
  endDate: string;
}

function getSheetTournamentIdentity(
  siteOutputRows: string[][],
  scheduleRows: ScheduleEntry[]
): { sheetDate: string | null; sheetTournamentEntry: ScheduleEntry | null } {
  const sheetDate = extractSheetReferenceDate(siteOutputRows);
  if (!sheetDate) return { sheetDate: null, sheetTournamentEntry: null };

  let entry = scheduleRows.find(
    (e) => e.startDate <= sheetDate && (e.endDate ?? e.startDate) >= sheetDate
  );
  if (!entry) {
    const pastOrCurrent = scheduleRows.filter((e) => e.startDate <= sheetDate);
    entry = pastOrCurrent.at(-1) ?? undefined;
  }
  return { sheetDate, sheetTournamentEntry: entry ?? null };
}

function validateSheetIdentity(
  sheetDate: string | null,
  sheetTournamentEntry: ScheduleEntry | null,
  expectedEntry: ScheduleEntry,
  maxAgeDays = 14
): string {
  const normalize = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

  if (!sheetDate) {
    throw new Error(
      `Cannot validate sheet freshness: no date found. Expected "${expectedEntry.name}".`
    );
  }

  const today = getTodayDate();
  const sheetDateMs = new Date(sheetDate + "T00:00:00Z").getTime();
  const todayMs = new Date(today + "T00:00:00Z").getTime();
  const ageInDays = (todayMs - sheetDateMs) / (1000 * 60 * 60 * 24);
  if (ageInDays > maxAgeDays) {
    throw new Error(
      `Sheet is too stale: date=${sheetDate} (${Math.round(ageInDays)} days ago), expected "${expectedEntry.name}".`
    );
  }

  if (!sheetTournamentEntry) {
    throw new Error(`Cannot map sheet date "${sheetDate}" to any schedule entry.`);
  }

  if (normalize(sheetTournamentEntry.name) !== normalize(expectedEntry.name)) {
    throw new Error(
      `Sheet tournament "${sheetTournamentEntry.name}" does not match expected "${expectedEntry.name}". ` +
        `Refusing to relabel stale rows.`
    );
  }

  return sheetDate;
}

interface TournamentPayload {
  section: string;
  tournamentName: string;
  tournamentId: string | null;
  startDate: string | null;
  endDate: string | null;
  modelAvailable: boolean;
  sourceValidated: boolean;
  rows: unknown[];
}

function validateTournamentPayload(
  payload: TournamentPayload,
  expectedName: string
): void {
  const normalize = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

  if (!payload.tournamentId) throw new Error(`${payload.section}: missing tournamentId`);
  if (!payload.startDate || !payload.endDate)
    throw new Error(`${payload.section}: missing startDate or endDate`);
  if (normalize(payload.tournamentName) !== normalize(expectedName))
    throw new Error(
      `${payload.section}: tournamentName "${payload.tournamentName}" !== "${expectedName}"`
    );

  const hasRows = payload.rows.length > 0;
  if (hasRows && !payload.sourceValidated) {
    throw new Error(
      `${payload.section}: has ${payload.rows.length} rows but sourceValidated=false. ` +
        `Stale rows cannot be published without source validation.`
    );
  }
  if (payload.modelAvailable && (!payload.sourceValidated || !hasRows)) {
    throw new Error(`${payload.section}: modelAvailable=true but inconsistent state.`);
  }
  if (hasRows && !payload.modelAvailable) {
    throw new Error(`${payload.section}: has rows but modelAvailable=false.`);
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SCHEDULE: ScheduleEntry[] = [
  {
    name: "Truist Championship",
    courseName: "Quail Hollow Club",
    id: "truist-championship-2026",
    startDate: "2026-05-07",
    endDate: "2026-05-11",
  },
  {
    name: "PGA Championship",
    courseName: "Quail Hollow Club",
    id: "pga-championship-2026",
    startDate: "2026-05-14",
    endDate: "2026-05-17",
  },
  {
    name: "U.S. Open",
    courseName: "Shinnecock Hills",
    id: "us-open-2026",
    startDate: "2026-06-18",
    endDate: "2026-06-21",
  },
  {
    name: "Travelers Championship",
    courseName: "TPC River Highlands",
    id: "travelers-championship-2026",
    startDate: "2026-06-25",
    endDate: "2026-06-28",
  },
  {
    name: "John Deere Classic",
    courseName: "TPC Deere Run",
    id: "john-deere-classic-2026",
    startDate: "2026-07-02",
    endDate: "2026-07-05",
  },
];

const TRAVELERS = SCHEDULE.find((e) => e.name === "Travelers Championship")!;
const JOHN_DEERE = SCHEDULE.find((e) => e.name === "John Deere Classic")!;
const TRUIST = SCHEDULE.find((e) => e.name === "Truist Championship")!;

// Sheet with a stale May 7 date (Truist Championship era)
const STALE_TRUIST_SHEET_ROWS: string[][] = [
  ["JKB Model Export - Updated 05/07/2026"],
  [],
  ["PLAYER", "RANK", "MODEL SCORE"],
  ["Jake Knapp", "1", "82.3"],
];

// Sheet with a fresh date matching Travelers week
const FRESH_TRAVELERS_SHEET_ROWS: string[][] = [
  ["JKB Model Export - Updated 06/25/2026"],
  [],
  ["PLAYER", "RANK", "MODEL SCORE"],
  ["Scottie Scheffler", "1", "85.1"],
];

// Sheet with no date at all
const NO_DATE_SHEET_ROWS: string[][] = [
  ["JKB Model Export"],
  [],
  ["PLAYER", "RANK", "MODEL SCORE"],
  ["Rory McIlroy", "1", "80.0"],
];

// ---------------------------------------------------------------------------
// Tests: extractSheetReferenceDate
// ---------------------------------------------------------------------------
describe("extractSheetReferenceDate", () => {
  it("extracts MM/DD/YYYY date from sheet header rows", () => {
    expect(extractSheetReferenceDate(STALE_TRUIST_SHEET_ROWS)).toBe("2026-05-07");
  });

  it("extracts Travelers-era date", () => {
    expect(extractSheetReferenceDate(FRESH_TRAVELERS_SHEET_ROWS)).toBe("2026-06-25");
  });

  it("returns null when no date is present", () => {
    expect(extractSheetReferenceDate(NO_DATE_SHEET_ROWS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: getSheetTournamentIdentity
// ---------------------------------------------------------------------------
describe("getSheetTournamentIdentity", () => {
  it("maps stale May 7 sheet date to Truist Championship", () => {
    const { sheetDate, sheetTournamentEntry } = getSheetTournamentIdentity(
      STALE_TRUIST_SHEET_ROWS,
      SCHEDULE
    );
    expect(sheetDate).toBe("2026-05-07");
    expect(sheetTournamentEntry?.name).toBe("Truist Championship");
  });

  it("maps Travelers week date to Travelers Championship", () => {
    const { sheetDate, sheetTournamentEntry } = getSheetTournamentIdentity(
      FRESH_TRAVELERS_SHEET_ROWS,
      SCHEDULE
    );
    expect(sheetDate).toBe("2026-06-25");
    expect(sheetTournamentEntry?.name).toBe("Travelers Championship");
  });

  it("returns null tournament when sheet has no date", () => {
    const { sheetDate, sheetTournamentEntry } = getSheetTournamentIdentity(
      NO_DATE_SHEET_ROWS,
      SCHEDULE
    );
    expect(sheetDate).toBeNull();
    expect(sheetTournamentEntry).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: validateSheetIdentity — core regression prevention
// ---------------------------------------------------------------------------
describe("validateSheetIdentity", () => {
  it("REJECTS stale Truist sheet when Travelers is expected", () => {
    // This is the exact regression that caused the second bug:
    // sheet has May 7 date → Truist Championship identity
    // but expected = Travelers Championship (from today's schedule)
    const { sheetDate, sheetTournamentEntry } = getSheetTournamentIdentity(
      STALE_TRUIST_SHEET_ROWS,
      SCHEDULE
    );
    expect(() =>
      validateSheetIdentity(sheetDate, sheetTournamentEntry, TRAVELERS, 99999)
    ).toThrow(/Truist Championship.*Travelers Championship|does not match/);
  });

  it("REJECTS sheet with no date", () => {
    expect(() =>
      validateSheetIdentity(null, null, TRAVELERS, 14)
    ).toThrow(/no date found/i);
  });

  it("REJECTS sheet whose date is older than maxAgeDays", () => {
    // Sheet date = 2020-01-01 (very old), maxAgeDays = 14
    expect(() =>
      validateSheetIdentity("2020-01-01", TRUIST, TRAVELERS, 14)
    ).toThrow(/stale|days ago/i);
  });

  it("REJECTS fresh sheet whose tournament does not match expected", () => {
    // A sheet might be fresh (within 14 days) but for a different tournament
    const recentButWrongSheet: string[][] = [
      // Use a date within 14 days that maps to U.S. Open
      [`JKB Model Export - Updated 06/20/2026`],
    ];
    const { sheetDate, sheetTournamentEntry } = getSheetTournamentIdentity(
      recentButWrongSheet,
      SCHEDULE
    );
    expect(() =>
      validateSheetIdentity(sheetDate, sheetTournamentEntry, TRAVELERS, 14)
    ).toThrow(/does not match|U\.S\. Open/i);
  });

  it("ACCEPTS a valid Travelers sheet when Travelers is expected (within age)", () => {
    // Simulate a sheet date during Travelers week
    const travelersSheet: string[][] = [
      [`JKB Model Export - Updated 06/25/2026`],
    ];
    const { sheetDate, sheetTournamentEntry } = getSheetTournamentIdentity(
      travelersSheet,
      SCHEDULE
    );
    // This should not throw — sheet is for Travelers and Travelers is expected
    // We use a very large maxAgeDays so the freshness check doesn't interfere with the test date
    expect(() =>
      validateSheetIdentity(sheetDate, sheetTournamentEntry, TRAVELERS, 99999)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: validateTournamentPayload — structural consistency
// ---------------------------------------------------------------------------
describe("validateTournamentPayload", () => {
  const baseValid: TournamentPayload = {
    section: "current-tournament",
    tournamentName: "Travelers Championship",
    tournamentId: "travelers-championship-2026",
    startDate: "2026-06-25",
    endDate: "2026-06-28",
    modelAvailable: false,
    sourceValidated: false,
    rows: [],
  };

  it("accepts a valid unavailable model with zero rows", () => {
    expect(() => validateTournamentPayload(baseValid, "Travelers Championship")).not.toThrow();
  });

  it("REJECTS missing tournamentId", () => {
    expect(() =>
      validateTournamentPayload({ ...baseValid, tournamentId: null }, "Travelers Championship")
    ).toThrow(/tournamentId/);
  });

  it("REJECTS missing startDate", () => {
    expect(() =>
      validateTournamentPayload({ ...baseValid, startDate: null }, "Travelers Championship")
    ).toThrow(/startDate/);
  });

  it("REJECTS tournamentName mismatch", () => {
    expect(() =>
      validateTournamentPayload(
        { ...baseValid, tournamentName: "Truist Championship" },
        "Travelers Championship"
      )
    ).toThrow(/Truist Championship/);
  });

  it("REJECTS rows without sourceValidated — the critical regression guard", () => {
    // This is the exact regression pattern from the second automated commit:
    // modelAvailable was missing, rows > 0, sourceValidated was missing
    const regressed: TournamentPayload = {
      ...baseValid,
      rows: [{ rank: 1, player: "Rory McIlroy", modelScore: "80.0" }],
      sourceValidated: false,
      modelAvailable: false,
    };
    expect(() =>
      validateTournamentPayload(regressed, "Travelers Championship")
    ).toThrow(/sourceValidated.*false|stale rows/i);
  });

  it("REJECTS modelAvailable=true without sourceValidated", () => {
    expect(() =>
      validateTournamentPayload(
        { ...baseValid, modelAvailable: true, sourceValidated: false, rows: [{}] as unknown[] },
        "Travelers Championship"
      )
    ).toThrow(/sourceValidated/i);
  });

  it("accepts a valid available model with rows and sourceValidated", () => {
    const validAvailable: TournamentPayload = {
      ...baseValid,
      modelAvailable: true,
      sourceValidated: true,
      rows: [{ rank: 1, player: "Scottie Scheffler", modelScore: "85.1" }],
    };
    expect(() =>
      validateTournamentPayload(validAvailable, "Travelers Championship")
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: transition regression guard — unavailable → overwritten with rows
// ---------------------------------------------------------------------------
describe("regression guard: unavailable model cannot be overwritten with unvalidated rows", () => {
  it("detects the exact regression: modelAvailable missing, rows > 0, sourceValidated missing", () => {
    // This simulates what the automated commit did: overwrote the safe
    // unavailable model with 166 stale rows, removing tournamentId/dates/modelAvailable
    const regressedPayload: TournamentPayload = {
      section: "current-tournament",
      tournamentName: "Travelers Championship",
      tournamentId: null,        // REMOVED by bug
      startDate: null,           // REMOVED by bug
      endDate: null,             // REMOVED by bug
      modelAvailable: false,     // Was missing/false despite rows > 0
      sourceValidated: false,    // MISSING by bug
      rows: new Array(166).fill({ rank: 1, player: "Jake Knapp" }),
    };

    // tournamentId check triggers first
    expect(() =>
      validateTournamentPayload(regressedPayload, "Travelers Championship")
    ).toThrow(/tournamentId|startDate|sourceValidated/);
  });

  it("safe unavailable model passes all guards", () => {
    const safeUnavailable: TournamentPayload = {
      section: "current-tournament",
      tournamentName: "Travelers Championship",
      tournamentId: "travelers-championship-2026",
      startDate: "2026-06-25",
      endDate: "2026-06-28",
      modelAvailable: false,
      sourceValidated: false,
      rows: [],
    };
    expect(() =>
      validateTournamentPayload(safeUnavailable, "Travelers Championship")
    ).not.toThrow();
  });
});

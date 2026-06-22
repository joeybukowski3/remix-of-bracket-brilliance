import { describe, expect, it } from "vitest";
import {
  assertModelPayload,
  assertNoUnsafeRegression,
  buildScheduleContext,
  buildValidatedModelPayload,
  calculateFieldDiagnostics,
  parseEmbeddedReferenceDate,
  validateSheetSource,
} from "./pga-sheet-model-validation.mjs";

const schedule = [
  { id: "truist-2026", name: "Truist Championship", courseName: "Quail Hollow Club", startDate: "2026-05-07", endDate: "2026-05-10" },
  { id: "pga-2026", name: "PGA Championship", courseName: "Aronimink Golf Club", startDate: "2026-05-14", endDate: "2026-05-17" },
  { id: "travelers-2026", name: "Travelers Championship", courseName: "TPC River Highlands", startDate: "2026-06-25", endDate: "2026-06-28" },
  { id: "john-deere-2026", name: "John Deere Classic", courseName: "TPC Deere Run", startDate: "2026-07-02", endDate: "2026-07-05" },
];

const rawRows = [{ rank: 1, player: "Scottie Scheffler", modelScore: "90" }];

function buildValidation(section, sheetDate, today = "2026-06-22") {
  return validateSheetSource({
    section,
    expectedContext: buildScheduleContext(schedule, today),
    sourceContext: sheetDate ? buildScheduleContext(schedule, sheetDate) : { currentUpcoming: null, nextWeek: null },
    sourceReferenceDate: sheetDate,
    today,
  });
}

describe("PGA sheet model source validation", () => {
  it("extracts the embedded sheet date independently", () => {
    expect(parseEmbeddedReferenceDate([["PGA Model — 05/07/2026"]])).toBe("2026-05-07");
    expect(parseEmbeddedReferenceDate([["No date"]])).toBeNull();
  });

  it("maps a date inside an active event back to that event", () => {
    expect(buildScheduleContext(schedule, "2026-05-08").currentUpcoming?.name).toBe("Truist Championship");
  });

  it("rejects stale Truist rows from being relabeled as Travelers", () => {
    const result = buildValidation("current-tournament", "2026-05-07");
    expect(result.valid).toBe(false);
    expect(result.expected.name).toBe("Travelers Championship");
    expect(result.source.name).toBe("Truist Championship");
    expect(result.errors.join(" ")).toContain("Expected Travelers Championship");
  });

  it("rejects a stale embedded date", () => {
    const result = buildValidation("current-tournament", "2026-05-07");
    expect(result.errors.some((error) => error.includes("days old"))).toBe(true);
    expect(result.errors.some((error) => error.includes("too early"))).toBe(true);
  });

  it("accepts a current Travelers sheet dated during preparation week or tournament week", () => {
    expect(buildValidation("current-tournament", "2026-06-22").valid).toBe(true);
    expect(buildValidation("current-tournament", "2026-06-25").valid).toBe(true);
  });

  it("validates the next tournament independently", () => {
    const stale = buildValidation("next-tournament", "2026-05-07");
    const current = buildValidation("next-tournament", "2026-06-22");
    expect(stale.valid).toBe(false);
    expect(stale.source.name).toBe("PGA Championship");
    expect(current.valid).toBe(true);
    expect(current.source.name).toBe("John Deere Classic");
  });

  it("withholds rows when source validation fails", () => {
    const payload = buildValidatedModelPayload({
      section: "current-tournament",
      rawPayload: { title: "CURRENT TOURNAMENT MODEL", rows: rawRows },
      validation: buildValidation("current-tournament", "2026-05-07"),
      generatedAt: "2026-06-22T20:00:00.000Z",
    });
    expect(payload.tournamentName).toBe("Travelers Championship");
    expect(payload.modelAvailable).toBe(false);
    expect(payload.sourceValidated).toBe(false);
    expect(payload.rows).toEqual([]);
    expect(() => assertModelPayload(payload)).not.toThrow();
  });

  it("publishes rows only after independent source validation succeeds", () => {
    const payload = buildValidatedModelPayload({
      section: "current-tournament",
      rawPayload: { title: "CURRENT TOURNAMENT MODEL", rows: rawRows },
      validation: buildValidation("current-tournament", "2026-06-25"),
      generatedAt: "2026-06-22T20:00:00.000Z",
    });
    expect(payload.modelAvailable).toBe(true);
    expect(payload.sourceValidated).toBe(true);
    expect(payload.rows).toHaveLength(1);
    expect(payload.tournamentId).toBe("travelers-2026");
  });

  it("requires unavailable models to have no rows", () => {
    expect(() => assertModelPayload({
      section: "current-tournament",
      tournamentName: "Travelers Championship",
      tournamentId: "travelers-2026",
      startDate: "2026-06-25",
      endDate: "2026-06-28",
      modelAvailable: false,
      modelSource: "google-sheet",
      sourceValidated: false,
      rows: rawRows,
    })).toThrow("Unavailable models must have zero rows");
  });

  it("requires identity metadata and explicit booleans", () => {
    expect(() => assertModelPayload({
      section: "current-tournament",
      tournamentName: "Travelers Championship",
      tournamentId: "",
      startDate: "2026-06-25",
      endDate: "2026-06-28",
      modelAvailable: false,
      modelSource: "google-sheet",
      sourceValidated: false,
      rows: [],
    })).toThrow("Invalid required model metadata: tournamentId");
  });

  it("blocks the exact safe-to-unsafe regression", () => {
    const previous = { modelAvailable: false, rows: [] };
    const next = { rows: rawRows };
    expect(() => assertNoUnsafeRegression(previous, next)).toThrow("unsafe regression");
  });

  it("reports official-field overlap without using it as the sole identity", () => {
    const diagnostics = calculateFieldDiagnostics(
      [{ player: "Scottie Scheffler" }, { player: "Rory McIlroy" }],
      ["Scottie Scheffler", "Patrick Cantlay"],
    );
    expect(diagnostics).toMatchObject({
      matchedPlayerCount: 1,
      unmatchedModelPlayerCount: 1,
      missingOfficialPlayerCount: 1,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  enforceCurrentPgaModelField,
  normalizePgaModelPlayerName,
} from "../../../scripts/enforce-pga-model-field.mjs";

const FIELD = {
  validated: true,
  tournament: "3M Open",
  tournamentId: "R2026525",
  localScheduleId: "three-m-open-2026",
  startDate: "2026-07-23",
  endDate: "2026-07-26",
  players: ["Keita Nakajima", "Rasmus Højgaard", "Cam Davis"],
};

const MODEL = {
  tournamentName: "3M Open",
  tournamentId: "three-m-open-2026",
  startDate: "2026-07-23",
  endDate: "2026-07-26",
  modelAvailable: true,
  rows: [
    { rank: 1, player: "Rory McIlroy", modelScore: "90.0" },
    { rank: 2, player: "Keita Nakajima", modelScore: "80.0" },
    { rank: 3, player: "Rasmus Hojgaard", modelScore: "70.0" },
  ],
};

describe("normalizePgaModelPlayerName", () => {
  it("normalizes accents and Last, First format", () => {
    expect(normalizePgaModelPlayerName("Højgaard, Rasmus")).toBe("rasmus hojgaard");
    expect(normalizePgaModelPlayerName("Rasmus Hojgaard")).toBe("rasmus hojgaard");
  });
});

describe("enforceCurrentPgaModelField", () => {
  it("removes non-field players, reranks matches, and reports missing stats", () => {
    const output = enforceCurrentPgaModelField(FIELD, MODEL, "2026-07-20T15:00:00.000Z");
    expect(output.rows.map((row) => row.player)).toEqual(["Keita Nakajima", "Rasmus Hojgaard"]);
    expect(output.rows.map((row) => row.rank)).toEqual([1, 2]);
    expect(output.fieldIntegrity.excludedNonFieldPlayers).toEqual(["Rory McIlroy"]);
    expect(output.fieldIntegrity.missingStatsPlayers).toEqual(["Cam Davis"]);
    expect(output.fieldIntegrity.fieldCount).toBe(3);
    expect(output.fieldIntegrity.modelRowCount).toBe(2);
  });

  it("accepts an exact tournament-name match when schedule ids are unavailable", () => {
    const output = enforceCurrentPgaModelField(
      { ...FIELD, localScheduleId: null },
      { ...MODEL, tournamentId: null },
    );
    expect(output.rows).toHaveLength(2);
  });

  it("fails closed on tournament identity or date mismatch", () => {
    expect(() => enforceCurrentPgaModelField(FIELD, { ...MODEL, tournamentName: "Rocket Classic", tournamentId: "rocket-classic-2026" }))
      .toThrow(/tournament mismatch/i);
    expect(() => enforceCurrentPgaModelField(FIELD, { ...MODEL, startDate: "2026-07-30" }))
      .toThrow(/start-date mismatch/i);
  });

  it("fails on duplicate field identities and duplicate model rows", () => {
    expect(() => enforceCurrentPgaModelField({ ...FIELD, players: ["Rasmus Højgaard", "Rasmus Hojgaard"] }, MODEL))
      .toThrow(/duplicate normalized player identity/i);
    expect(() => enforceCurrentPgaModelField(FIELD, { ...MODEL, rows: [...MODEL.rows, { rank: 4, player: "Keita Nakajima" }] }))
      .toThrow(/duplicate field player/i);
  });

  it("fails when no rows match the validated field", () => {
    expect(() => enforceCurrentPgaModelField(FIELD, { ...MODEL, rows: [{ rank: 1, player: "Rory McIlroy" }] }))
      .toThrow(/No model rows matched/i);
  });
});

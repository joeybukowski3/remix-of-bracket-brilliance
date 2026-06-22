import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canGenerateBestBets,
  pickTournamentData,
  preparePicksForOutput,
  prepareTournamentModel,
  validatePickArray,
} from "../../../scripts/generate-pga-best-bets.mjs";

const travelersField = {
  tournament: "Travelers Championship",
  tournamentId: "R2026034",
  tournamentSlug: "travelers-championship-2026-picks",
  validated: true,
  source: "pga-tour-official-field",
  alternatesExcluded: true,
  players: ["Scottie Scheffler", "Rory McIlroy", "Collin Morikawa"],
};

const travelerModel = {
  tournamentName: "Travelers Championship",
  tournamentId: "R2026034",
  rows: [
    { player: "Scottie Scheffler", rank: 1 },
    { player: "Rory McIlroy", rank: 2 },
    { player: "Collin Morikawa", rank: 3 },
  ],
};

const stalePgaModel = {
  tournamentName: "PGA Championship",
  rows: travelerModel.rows,
};

describe("PGA best-bets tournament selection", () => {
  it("safely skips Travelers when both tournament model files are stale", () => {
    expect(pickTournamentData(travelersField, { ...stalePgaModel, tournamentName: "Truist Championship" }, stalePgaModel)).toBeNull();
  });

  it("selects a matching current-tournament model", () => {
    expect(pickTournamentData(travelersField, travelerModel, stalePgaModel)).toMatchObject({
      source: "current-tournament.json",
      tournamentData: travelerModel,
    });
  });

  it("selects next-tournament only when it matches the official field", () => {
    expect(pickTournamentData(travelersField, stalePgaModel, travelerModel)).toMatchObject({
      source: "next-tournament.json",
      tournamentData: travelerModel,
    });
  });

  it("does not permit a missing Grok key to generate or replace best bets", () => {
    expect(canGenerateBestBets({ currentField: travelersField, tournamentData: travelerModel, apiKey: "" }))
      .toBe("GROK_API_KEY or XAI_API_KEY is not set");

    const root = mkdtempSync(path.join(tmpdir(), "pga-best-bets-"));
    const dataDir = path.join(root, "public", "data", "pga");
    mkdirSync(dataDir, { recursive: true });
    const writeJson = (name: string, value: unknown) => writeFileSync(path.join(dataDir, name), JSON.stringify(value));
    const existing = JSON.stringify({ tournament: "Existing Tournament", marker: "unchanged" });
    writeJson("current-field.json", travelersField);
    writeJson("current-tournament.json", travelerModel);
    writeJson("next-tournament.json", stalePgaModel);
    writeJson("power-rankings.json", { rows: [] });
    writeJson("player-stats-raw.json", []);
    writeJson("course-weights.json", []);
    writeFileSync(path.join(dataDir, "best-bets.json"), existing);

    try {
      execFileSync(process.execPath, [path.resolve(process.cwd(), "scripts/generate-pga-best-bets.mjs")], {
        cwd: root,
        env: { ...process.env, GROK_API_KEY: "", XAI_API_KEY: "" },
      });
      expect(readFileSync(path.join(dataDir, "best-bets.json"), "utf8")).toBe(existing);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves model picks with null odds when odds are unavailable", () => {
    const picks = [{ player: "Scottie Scheffler", tournamentRank: 1 }];
    expect(preparePicksForOutput(picks, {}, false)).toEqual([{ ...picks[0], odds: null }]);
  });

  it("filters alternate players out of both the model and best-bets source", () => {
    const model = {
      ...travelerModel,
      rows: [...travelerModel.rows, { player: "Alternate Player", rank: 4 }],
    };
    expect(prepareTournamentModel(model, travelersField).model?.rows.map((row) => row.player))
      .not.toContain("Alternate Player");
    expect(validatePickArray([
      { player: "Scottie Scheffler", topStats: ["SG Total=1", "SG OTT=1"], bullets: ["One", "Two"] },
      { player: "Alternate Player", topStats: ["SG Total=1", "SG OTT=1"], bullets: ["One", "Two"] },
    ], travelersField.players).map((pick) => pick.player)).toEqual(["Scottie Scheffler"]);
  });
});

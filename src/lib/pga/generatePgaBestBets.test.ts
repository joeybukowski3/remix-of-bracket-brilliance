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
  validateArticle,
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

  it("carries through risk and angles when the model provides them, defaulting to empty when absent", () => {
    const [withAngles, withoutAngles] = validatePickArray([
      { player: "Scottie Scheffler", topStats: ["a", "b"], bullets: ["One", "Two"], risk: "Rust off a layoff.", angles: ["Open Top 5", "FedExCup safe"] },
      { player: "Rory McIlroy", topStats: ["a", "b"], bullets: ["One", "Two"] },
    ]);
    expect(withAngles.risk).toBe("Rust off a layoff.");
    expect(withAngles.angles).toEqual(["Open Top 5", "FedExCup safe"]);
    expect(withoutAngles.risk).toBe("");
    expect(withoutAngles.angles).toEqual([]);
  });
});

describe("validateArticle", () => {
  const validArticle = {
    title: "3M Open Betting Preview",
    dek: "A short subtitle.",
    introduction: "Two sentences of introduction.",
    sections: [
      { heading: "The Tournament", body: "Body text." },
      { heading: "Outright Targets", body: "Body text." },
      { heading: "Top-10 Targets", body: "Body text." },
    ],
    conclusion: "Final wrap-up.",
  };

  it("accepts a well-formed article with at least 3 sections", () => {
    expect(validateArticle(validArticle)).toEqual(validArticle);
  });

  it("rejects a missing/malformed article", () => {
    expect(validateArticle(null)).toBeNull();
    expect(validateArticle(undefined)).toBeNull();
    expect(validateArticle("not an object")).toBeNull();
  });

  it("rejects an article missing a title, introduction, or conclusion", () => {
    expect(validateArticle({ ...validArticle, title: "" })).toBeNull();
    expect(validateArticle({ ...validArticle, introduction: "" })).toBeNull();
    expect(validateArticle({ ...validArticle, conclusion: "" })).toBeNull();
  });

  it("rejects an article with fewer than 3 valid sections", () => {
    expect(validateArticle({ ...validArticle, sections: [validArticle.sections[0]] })).toBeNull();
  });

  it("drops a malformed individual section (missing heading or body) rather than keeping it blank", () => {
    const withBadSection = {
      ...validArticle,
      sections: [...validArticle.sections, { heading: "", body: "orphaned body" }],
    };
    expect(validateArticle(withBadSection)?.sections).toHaveLength(3);
  });

  it("dek is optional -- an article without one is still valid", () => {
    const { dek: _dek, ...withoutDek } = validArticle;
    expect(validateArticle(withoutDek)?.dek).toBe("");
  });
});

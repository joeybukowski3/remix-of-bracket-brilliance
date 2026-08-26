import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSleeperDraftBoardCsv } from "@/lib/fantasy/draftPreview/sleeperCsv";

const SOURCE_PATH = resolve(__dirname, "../../../../data/fantasy/source/PixBook-Sleeper-DraftBoard-2026.csv");
const RAW = readFileSync(SOURCE_PATH, "utf8");

describe("parseSleeperDraftBoardCsv", () => {
  it("parses exactly 267 data rows", () => {
    const rows = parseSleeperDraftBoardCsv(RAW);
    expect(rows).toHaveLength(267);
  });

  it("is deterministic across repeated parses", () => {
    expect(parseSleeperDraftBoardCsv(RAW)).toEqual(parseSleeperDraftBoardCsv(RAW));
  });

  it("parses numeric fields, not strings", () => {
    const rows = parseSleeperDraftBoardCsv(RAW);
    const gibbs = rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs).toMatchObject({
      sleeperRank: 1,
      sourcePosition: "RB",
      team: "DET",
      bye: 6,
      projectedPoints: 331.4,
      projectedPpg: 19.5,
      rushAttempts: 256,
      rushYards: 1293,
      rushTouchdowns: 12,
      receivingTargets: 0,
      receivingYards: 523,
      receivingTouchdowns: 3,
      passAttempts: 0,
      passYards: 0,
      passTouchdowns: 0,
    });
    for (const value of Object.values(gibbs)) {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("retains every source stat field for a passing QB row", () => {
    const rows = parseSleeperDraftBoardCsv(RAW);
    const mahomes = rows.find((row) => row.player === "Patrick Mahomes")!;
    expect(mahomes).toMatchObject({
      sourcePosition: "QB",
      passAttempts: 564,
      passYards: 3967,
      passTouchdowns: 26,
    });
  });

  it("treats TEAM/BYE placeholders as null rather than a fabricated value", () => {
    const rows = parseSleeperDraftBoardCsv(RAW);
    const noTeam = rows.find((row) => row.player === "Jerand Washington")!;
    expect(noTeam.team).toBeNull();
    expect(noTeam.bye).toBeNull();
  });

  it("preserves the fixed Sleeper rank order (1..267, no gaps or duplicates)", () => {
    const rows = parseSleeperDraftBoardCsv(RAW);
    expect(rows.map((row) => row.sleeperRank)).toEqual(Array.from({ length: 267 }, (_, i) => i + 1));
  });

  it("rejects a header that doesn't match the expected source shape", () => {
    expect(() => parseSleeperDraftBoardCsv("A,B\n1,2\n")).toThrow(/header/i);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyFantasyRankingArtifactSchema } from "./productionAuthority";

const artifact = weeklyFantasyRankingArtifactSchema.parse(JSON.parse(readFileSync(
  join(process.cwd(), "public/data/fantasy/weekly/2026/week-01.json"), "utf8",
)));
const rows = Object.values(artifact.rankings).flat();

describe("generated 2026 Week 1 production artifact", () => {
  it("uses only the approved ROS authority with no fabricated current PPG", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.baselineAuthority === "preseason-ros" && row.priorGamesCount === 0)).toBe(true);
    expect(rows.every((row) => row.currentSeasonPpg == null && row.baselineProjectedPpg === row.baselineValue)).toBe(true);
  });

  it("includes projected rookies/no-prior players without a historical penalty", () => {
    expect(rows.some((row) => row.playerName === "Jeremiyah Love")).toBe(true);
    expect(rows.find((row) => row.playerName === "Jeremiyah Love")?.confidence).toBe("medium");
  });

  it("uses the validated current roster team after projection-ID collisions", () => {
    expect(rows.find((row) => row.playerName === "Josh Allen")).toMatchObject({ team: "buf", opponent: "hou" });
    expect(rows.find((row) => row.playerName === "Jahmyr Gibbs")).toMatchObject({ team: "det", opponent: "no" });
  });

  it("excludes reserve and unresolved identities and has no false Week 1 byes", () => {
    expect(artifact.diagnostics.excluded.some((row) => row.reasons.includes("RESERVE"))).toBe(true);
    expect(artifact.diagnostics.excluded.some((row) => row.reasons.includes("IDENTITY_UNRESOLVED"))).toBe(true);
    expect(artifact.diagnostics.excluded.some((row) => row.reasons.includes("BYE"))).toBe(false);
    expect(artifact.diagnostics.excluded.find((row) => row.playerName === "Parris Campbell")?.reasons).toContain("RESERVE");
  });

  it("retains only the audited E14 availability exception at Low confidence", () => {
    expect(rows.filter((row) => row.confidence === "low").map((row) => row.playerName)).toEqual(["Seydou Traore"]);
    expect(rows.find((row) => row.playerName === "Seydou Traore")).toMatchObject({ availability: "unknown", team: "mia" });
  });

  it("assigns contiguous deterministic position ranks", () => {
    for (const positionRows of Object.values(artifact.rankings)) {
      expect(positionRows.map((row) => row.positionRank)).toEqual(positionRows.map((_, index) => index + 1));
      expect(positionRows.every((row, index) => index === 0 || row.baselineValue <= positionRows[index - 1].baselineValue)).toBe(true);
    }
  });

  it("carries provenance and reports the unavailable injury source", () => {
    expect(artifact.provenance.length).toBeGreaterThanOrEqual(7);
    expect(artifact.provenance.every((row) => /^[a-f0-9]{64}$/.test(row.sourceHash))).toBe(true);
    expect(artifact.diagnostics.missingSources).toContain("2026 nflverse injury report (not cached; roster status used without numeric penalty)");
  });
});

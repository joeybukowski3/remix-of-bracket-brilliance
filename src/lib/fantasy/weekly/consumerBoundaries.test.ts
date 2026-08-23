import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const consumerFiles = [
  "src/pages/FantasyWeeklyRankings.tsx",
  "src/hooks/useNflWeeklyDashboard.ts",
  "src/components/fantasy/WeeklyFantasyRankingsTable.tsx",
].map(read);

describe("weekly fantasy consumer boundaries", () => {
  it("keeps ranking calculations and research candidates out of consumers", () => {
    for (const source of consumerFiles) {
      // Reading a precomputed artifact field (e.g.
      // `row.components.opponentFpaAdjustment`, `row.context.scoringEnvironment`)
      // is display, not computation -- strip those known field-path reads
      // before checking for hand-rolled matchup/FPA math below.
      const withoutArtifactFieldReads = source.replace(/\.(?:components|context)\.[A-Za-z0-9_.]+/g, "");
      expect(source).not.toMatch(/\.sort\s*\(/);
      expect(source).not.toMatch(/baseline[-_]?usage|phase[-_]?c|usageCandidate/i);
      expect(withoutArtifactFieldReads).not.toMatch(/matchup.*(?:multiplier|adjustment)|fpa.*(?:multiplier|adjustment)/i);
    }
  });

  it("uses one canonical loader hook on both public consumers", () => {
    expect(consumerFiles[0]).toContain("useWeeklyFantasyProjectionArtifact");
    expect(consumerFiles[1]).toContain("useWeeklyFantasyProjectionArtifact");
  });

  it("does not leak weekly artifact ranks into the ROS board", () => {
    const rosSources = [
      read("src/pages/FantasyFootball.tsx"),
      read("src/components/fantasy/FantasyParBoard.tsx"),
      read("src/components/fantasy/LegacyPositionBoard.tsx"),
    ];
    for (const source of rosSources) {
      expect(source).not.toMatch(/WeeklyFantasyProjectionProductionArtifact|useWeeklyFantasyProjectionArtifact|WeeklyFantasyRankingArtifact|useWeeklyFantasyRankingArtifact/);
    }
  });
});

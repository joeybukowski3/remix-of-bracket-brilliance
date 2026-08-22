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
      expect(source).not.toMatch(/\.sort\s*\(/);
      expect(source).not.toMatch(/baseline[-_]?usage|phase[-_]?c|usageCandidate/i);
      expect(source).not.toMatch(/matchup.*(?:multiplier|adjustment)|fpa.*(?:multiplier|adjustment)/i);
    }
  });

  it("uses one canonical loader hook on both public consumers", () => {
    expect(consumerFiles[0]).toContain("useWeeklyFantasyRankingArtifact");
    expect(consumerFiles[1]).toContain("useWeeklyFantasyRankingArtifact");
  });

  it("does not leak weekly artifact ranks into the ROS board", () => {
    const rosSources = [
      read("src/pages/FantasyFootball.tsx"),
      read("src/components/fantasy/FantasyParBoard.tsx"),
      read("src/components/fantasy/LegacyPositionBoard.tsx"),
    ];
    for (const source of rosSources) expect(source).not.toMatch(/WeeklyFantasyRankingArtifact|useWeeklyFantasyRankingArtifact/);
  });
});

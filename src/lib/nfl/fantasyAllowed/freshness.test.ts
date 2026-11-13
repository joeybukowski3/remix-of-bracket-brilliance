import { describe, expect, it } from "vitest";
import { describeFantasyAllowedFreshness, STALE_ARTIFACT_HOURS } from "./freshness";
import type { FantasyAllowedArtifact, FantasyAllowedCoverage } from "./types";

const NOW = new Date("2026-11-12T15:00:00Z");
const coverage = (overrides: Partial<FantasyAllowedCoverage> = {}): FantasyAllowedCoverage => ({
  status: "complete",
  finalGames: 135,
  incorporatedGames: 135,
  dataThroughWeek: 9,
  missingFinalGameIds: [],
  notYetFinalGameIds: [],
  ...overrides,
});
const artifact = (overrides: Partial<FantasyAllowedArtifact> = {}): FantasyAllowedArtifact => ({
  schemaVersion: "nfl-fantasy-points-allowed-v2",
  generatedAt: "2026-11-12T13:00:00Z",
  season: 2026,
  week: 10,
  scoringVersion: "test",
  rows: [],
  coverage: coverage(),
  ...overrides,
});

describe("describeFantasyAllowedFreshness", () => {
  it("states the opponent week and the data-through week for a complete, fresh artifact", () => {
    const view = describeFantasyAllowedFreshness(artifact(), NOW);
    expect(view.tone).toBe("ok");
    expect(view.headline).toBe("Opponents shown for Week 10 · Ranks include games through Week 9 (135 of 135)");
    expect(view.warnings).toEqual([]);
  });

  it("warns, naming the count, when completed games have not reached the data yet (partial coverage)", () => {
    const view = describeFantasyAllowedFreshness(
      artifact({ coverage: coverage({ status: "partial", incorporatedGames: 133, missingFinalGameIds: ["a", "b"] }) }),
      NOW,
    );
    expect(view.tone).toBe("warn");
    expect(view.headline).toContain("133 of 135");
    expect(view.warnings.join(" ")).toMatch(/2 completed games.*not yet in the data/i);
  });

  it("warns when results lag the stats cache", () => {
    const view = describeFantasyAllowedFreshness(artifact({ coverage: coverage({ status: "partial", notYetFinalGameIds: ["c"] }) }), NOW);
    expect(view.tone).toBe("warn");
    expect(view.warnings.join(" ")).toMatch(/1 game.*not yet marked final/i);
  });

  it("warns on its own when the artifact is old, whatever the workflows report", () => {
    const old = new Date(NOW.getTime() - (STALE_ARTIFACT_HOURS + 10) * 3600e3).toISOString();
    const view = describeFantasyAllowedFreshness(artifact({ generatedAt: old }), NOW);
    expect(view.tone).toBe("warn");
    expect(view.warnings.join(" ")).toMatch(/last refreshed \d+ days? ago/i);
  });

  it("does not show an 'out of date' banner in the offseason, when the data is expected to sit unchanged", () => {
    const july = new Date("2027-07-15T15:00:00Z");
    const view = describeFantasyAllowedFreshness(artifact({ generatedAt: "2027-02-20T00:00:00Z" }), july);
    expect(view.warnings).toEqual([]);
    expect(view.tone).toBe("ok");
  });

  it("still warns about age in September through February", () => {
    for (const month of ["2026-09-20", "2026-12-20", "2027-01-20", "2027-02-10"]) {
      const view = describeFantasyAllowedFreshness(artifact({ generatedAt: "2026-08-01T00:00:00Z" }), new Date(`${month}T15:00:00Z`));
      expect(view.tone, month).toBe("warn");
    }
  });

  it("does not warn just under the staleness threshold", () => {
    const recent = new Date(NOW.getTime() - (STALE_ARTIFACT_HOURS - 1) * 3600e3).toISOString();
    expect(describeFantasyAllowedFreshness(artifact({ generatedAt: recent }), NOW).tone).toBe("ok");
  });

  it("degrades gracefully for an artifact generated before coverage existed", () => {
    const view = describeFantasyAllowedFreshness(artifact({ coverage: undefined }), NOW);
    expect(view.headline).toBe("Opponents shown for Week 10");
    expect(view.tone).toBe("ok");
  });

  it("says so when the week is unknown rather than inventing one", () => {
    const view = describeFantasyAllowedFreshness(artifact({ week: null, coverage: undefined }), NOW);
    expect(view.headline).not.toMatch(/Week null|NaN/);
  });

  it("treats an unparseable generatedAt as a warning, never as fresh", () => {
    const view = describeFantasyAllowedFreshness(artifact({ generatedAt: "not-a-date" }), NOW);
    expect(view.tone).toBe("warn");
  });
});

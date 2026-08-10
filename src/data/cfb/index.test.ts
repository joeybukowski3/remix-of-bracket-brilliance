import { describe, expect, it } from "vitest";
import {
  CFB_PROVENANCE,
  getAllTeams,
  getTeamBySlug,
  isPreseasonPhase,
} from "./index";

describe("CFB data architecture", () => {
  it("composes layered team data with logos", () => {
    const uga = getTeamBySlug("georgia");
    expect(uga).toBeDefined();
    expect(uga!.logo).toContain("espncdn.com");
    expect(uga!.ratings.jkbRank).toBeGreaterThanOrEqual(1);
    expect(uga!.ratings.sosPlayedRank).toBeNull();
    expect(uga!.ratings.sosRemainingRank).not.toBeNull();
    expect(uga!.record.wins).toBe(0);
    expect(uga!.stats.pointsPerGame).toBeNull();
  });

  it("marks generated v1 ratings and live schedule provenance explicitly", () => {
    expect(CFB_PROVENANCE.ratingsSource).toBe("generated-v1");
    expect(CFB_PROVENANCE.scheduleSource).toBe("live");
    expect(isPreseasonPhase()).toBe(true);
  });

  it("includes exactly 138 FBS teams across required conferences", () => {
    const teams = getAllTeams();
    expect(teams).toHaveLength(138);
    const confs = new Set(teams.map((t) => t.conference));
    for (const id of [
      "sec",
      "big-ten",
      "big-12",
      "acc",
      "american",
      "pac-12",
      "mountain-west",
      "sun-belt",
      "mac",
      "conference-usa",
      "independents",
    ]) {
      expect(confs.has(id as never)).toBe(true);
    }
  });
});

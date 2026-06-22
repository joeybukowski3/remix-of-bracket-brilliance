import { describe, expect, it } from "vitest";
import { NFL_GUIDE_DIVISIONS, NFL_GUIDE_PLAYOFFS, NFL_GUIDE_TEAM_BY_SLUG, NFL_GUIDE_TEAMS, slugifyNflTeam } from "./guide2026";

describe("NFL guide data", () => {
  it("has 32 unique team profiles", () => {
    expect(NFL_GUIDE_TEAMS).toHaveLength(32);
    expect(new Set(NFL_GUIDE_TEAMS.map((team) => team.slug)).size).toBe(32);
  });

  it("has eight four-team divisions", () => {
    expect(NFL_GUIDE_DIVISIONS).toHaveLength(8);
    NFL_GUIDE_DIVISIONS.forEach(({ teams }) => expect(teams).toHaveLength(4));
  });

  it("projects seven playoff teams per conference", () => {
    expect(NFL_GUIDE_PLAYOFFS.AFC.divisionWinners).toHaveLength(4);
    expect(NFL_GUIDE_PLAYOFFS.AFC.wildCards).toHaveLength(3);
    expect(NFL_GUIDE_PLAYOFFS.NFC.divisionWinners).toHaveLength(4);
    expect(NFL_GUIDE_PLAYOFFS.NFC.wildCards).toHaveLength(3);
  });

  it("keeps projections in range and supplies three questions", () => {
    NFL_GUIDE_TEAMS.forEach((team) => {
      expect(team.projectedWins).toBeGreaterThanOrEqual(3);
      expect(team.projectedWins).toBeLessThanOrEqual(13);
      expect(team.questions).toHaveLength(3);
    });
  });

  it("builds stable team slugs", () => {
    expect(slugifyNflTeam("New England Patriots")).toBe("new-england-patriots");
    expect(NFL_GUIDE_TEAM_BY_SLUG.get("new-england-patriots")?.abbr).toBe("ne");
  });
});

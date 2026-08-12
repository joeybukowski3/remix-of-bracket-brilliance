import { describe, expect, it } from "vitest";
import { getMlbTeamLogoUrl, MLB_TEAM_LOGOS } from "./mlbTeamLogos";

describe("getMlbTeamLogoUrl", () => {
  it("resolves the Arizona Diamondbacks logo for the ESPN-style abbreviation ARI", () => {
    expect(getMlbTeamLogoUrl("ARI")).toBe("/logos/mlb/ari.svg");
  });

  it("resolves the Arizona Diamondbacks logo for the MLB Stats API abbreviation AZ", () => {
    expect(getMlbTeamLogoUrl("AZ")).toBe("/logos/mlb/ari.svg");
  });

  it("is case-insensitive and trims whitespace for the AZ alias", () => {
    expect(getMlbTeamLogoUrl(" az ")).toBe("/logos/mlb/ari.svg");
    expect(getMlbTeamLogoUrl("Az")).toBe("/logos/mlb/ari.svg");
  });

  it("still resolves other representative teams correctly", () => {
    expect(getMlbTeamLogoUrl("NYY")).toBe(MLB_TEAM_LOGOS.NYY);
    expect(getMlbTeamLogoUrl("lad")).toBe(MLB_TEAM_LOGOS.LAD);
  });

  it("returns undefined (not a broken path) for an unknown abbreviation", () => {
    expect(getMlbTeamLogoUrl("ZZZ")).toBeUndefined();
  });
});

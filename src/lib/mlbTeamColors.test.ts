import { describe, expect, it } from "vitest";
import { getMlbTeamColors } from "./mlbTeamColors";

describe("getMlbTeamColors", () => {
  it("resolves Arizona Diamondbacks colors for the ESPN-style abbreviation ARI", () => {
    expect(getMlbTeamColors("ARI")).toEqual({
      primary: "#A71930",
      tint: "rgba(167,25,48,0.12)",
      secondary: "#E3D4AD",
    });
  });

  it("resolves Arizona Diamondbacks colors for the MLB Stats API abbreviation AZ", () => {
    expect(getMlbTeamColors("AZ")).toEqual({
      primary: "#A71930",
      tint: "rgba(167,25,48,0.12)",
      secondary: "#E3D4AD",
    });
  });

  it("is case-insensitive for the AZ alias", () => {
    expect(getMlbTeamColors("az")).toEqual(getMlbTeamColors("ARI"));
  });

  it("still resolves other representative teams correctly", () => {
    expect(getMlbTeamColors("NYY").primary).toBe("#132448");
    expect(getMlbTeamColors("SD")).toEqual(getMlbTeamColors("SDP"));
  });

  it("falls back to the generic slate palette for an unknown or missing abbreviation", () => {
    const fallback = { primary: "#334155", tint: "rgba(51,65,85,0.12)", secondary: "#CBD5E1" };
    expect(getMlbTeamColors("ZZZ")).toEqual(fallback);
    expect(getMlbTeamColors(null)).toEqual(fallback);
    expect(getMlbTeamColors(undefined)).toEqual(fallback);
  });
});

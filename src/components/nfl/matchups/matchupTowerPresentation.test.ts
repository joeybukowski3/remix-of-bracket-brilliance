import { describe, expect, it } from "vitest";
import {
  resolveTowerComparisonColors,
  towerColorText,
} from "@/components/nfl/matchups/matchupTowerPresentation";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";

const team = (abbr: string, color: string) => ({ abbr, color }) as NflMatchupTeam;

describe("resolveTowerComparisonColors", () => {
  it("keeps both primary colours when they are sufficiently distinct", () => {
    expect(resolveTowerComparisonColors({
      awayTeam: team("kc", "#e31837"),
      homeTeam: team("phi", "#004c54"),
      awayPrimary: "#e31837",
      homePrimary: "#004c54",
    })).toEqual({ away: "#e31837", home: "#004c54", awayUsesAlternate: false });
  });

  it("keeps the home primary and selects the strongest away accent for similar primaries", () => {
    expect(resolveTowerComparisonColors({
      awayTeam: team("nyg", "#0b2265"),
      homeTeam: team("lar", "#003594"),
      awayPrimary: "#0b2265",
      homePrimary: "#003594",
    })).toEqual({ away: "#a71930", home: "#003594", awayUsesAlternate: true });
  });

  it("ignores unusable light accents and chooses the strongest remaining palette colour", () => {
    expect(resolveTowerComparisonColors({
      awayTeam: team("nyg", "#0b2265"),
      homeTeam: team("lar", "#003594"),
      awayPrimary: "#0b2265",
      homePrimary: "#003594",
      awayAlternates: ["#ffffff", "#a71930", "#31558f"],
    }).away).toBe("#a71930");
  });
});

describe("towerColorText", () => {
  it("selects readable badge text for light and dark team colours", () => {
    expect(towerColorText("#ffb612")).toBe("#0f172a");
    expect(towerColorText("#003594")).toBe("#ffffff");
  });
});

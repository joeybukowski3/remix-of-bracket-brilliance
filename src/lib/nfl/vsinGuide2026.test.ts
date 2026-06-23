import { describe, expect, it } from "vitest";
import {
  NFL_VSIN_GUIDE_TEAM_ABBRS,
  getNflVsinGuideTeam,
} from "@/lib/nfl/vsinGuide2026";

describe("PDF-derived VSiN NFL guide data", () => {
  it("contains all 32 NFL teams with complete stat tables", () => {
    expect(NFL_VSIN_GUIDE_TEAM_ABBRS).toHaveLength(32);

    for (const abbr of NFL_VSIN_GUIDE_TEAM_ABBRS) {
      const team = getNflVsinGuideTeam(abbr);
      expect(team).not.toBeNull();
      expect(team?.statistics.offense).toHaveLength(15);
      expect(team?.statistics.defense).toHaveLength(12);
      expect(team?.sourcePage).toBeGreaterThanOrEqual(40);
      expect(team?.sourcePage).toBeLessThanOrEqual(109);
    }
  });

  it("matches the Seattle team page in the uploaded guide", () => {
    const seattle = getNflVsinGuideTeam("sea");

    expect(seattle).toMatchObject({
      team: "Seattle Seahawks",
      sourcePage: 109,
      odds: {
        superBowl: { displayValue: "11-1" },
        conference: { label: "NFC", displayValue: "+600" },
        division: { label: "NFC West", displayValue: "+200" },
      },
    });
    expect(seattle?.statistics.offense[0]).toEqual({
      key: "pointsPerGame",
      label: "Points per game",
      displayValue: "28.4",
      rank: 3,
    });
    expect(seattle?.statistics.defense[0]).toEqual({
      key: "pointsPerGameAllowed",
      label: "Points per game allowed",
      displayValue: "17.2",
      rank: 1,
    });
  });

  it("preserves the Buffalo odds and statistics shown on page 40", () => {
    const buffalo = getNflVsinGuideTeam("buf");

    expect(buffalo?.sourcePage).toBe(40);
    expect(buffalo?.odds.superBowl.displayValue).toBe("10-1");
    expect(buffalo?.odds.conference.displayValue).toBe("+500");
    expect(buffalo?.odds.division.displayValue).toBe("-125");
    expect(buffalo?.statistics.offense[0].displayValue).toBe("28.3");
    expect(buffalo?.statistics.offense[0].rank).toBe(4);
  });
});

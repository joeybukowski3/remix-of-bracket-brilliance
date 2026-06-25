import { describe, it, expect } from "vitest";
import {
  WS_TEAMS_2026,
  WS_TEAM_MAP,
  getWarrenSharpProfile,
  getPositionalRankTone,
  POSITIONAL_RATING_LABELS,
} from "@/data/nflWarrenSharpTeams2026";
import { NFL_GUIDE_TEAM_BY_ABBR } from "@/lib/nfl/guide2026";
import { POSITIONAL_ORDER } from "@/lib/nfl/warrenSharpTeams2026";

const EXPECTED_ABBRS = [
  "ari","atl","bal","buf","car","chi","cin","cle","dal","den",
  "det","gb","hou","ind","jax","kc","lv","lac","lar","mia",
  "min","ne","no","nyg","nyj","phi","pit","sf","sea","tb","ten","wsh",
];

// ── Team count and uniqueness ─────────────────────────────────────────────────

describe("WS_TEAMS_2026 basic structure", () => {
  it("contains exactly 32 teams", () => {
    expect(WS_TEAMS_2026.length).toBe(32);
  });

  it("has no duplicate abbreviations", () => {
    const abbrs = WS_TEAMS_2026.map((t) => t.abbr);
    expect(new Set(abbrs).size).toBe(32);
  });

  it("contains all expected abbreviations", () => {
    const abbrs = new Set(WS_TEAMS_2026.map((t) => t.abbr));
    for (const abbr of EXPECTED_ABBRS) {
      expect(abbrs.has(abbr)).toBe(true);
    }
  });

  it("WS_TEAM_MAP has 32 entries", () => {
    expect(WS_TEAM_MAP.size).toBe(32);
  });
});

// ── Positional ratings ────────────────────────────────────────────────────────

describe("Positional rankings validity", () => {
  const FIELDS = POSITIONAL_ORDER;

  it("every team has all 7 positional rankings", () => {
    for (const team of WS_TEAMS_2026) {
      for (const field of FIELDS) {
        const val = team.positionalRatings[field as keyof typeof team.positionalRatings];
        if (field === "sourcePage") continue;
        expect(typeof val, `${team.abbr}.${field}`).toBe("number");
      }
    }
  });

  it("all ranks are integers 1–32", () => {
    for (const team of WS_TEAMS_2026) {
      for (const field of FIELDS) {
        const val = team.positionalRatings[field as keyof typeof team.positionalRatings] as number;
        expect(val, `${team.abbr}.${field}`).toBeGreaterThanOrEqual(1);
        expect(val, `${team.abbr}.${field}`).toBeLessThanOrEqual(32);
        expect(Number.isInteger(val), `${team.abbr}.${field} is integer`).toBe(true);
      }
    }
  });

  it("each category covers 1–32 (allowing ties)", () => {
    for (const field of FIELDS) {
      const values = WS_TEAMS_2026.map(
        (t) => t.positionalRatings[field as keyof typeof t.positionalRatings] as number
      );
      // All values should be in range
      expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...values)).toBeLessThanOrEqual(32);
      // Should have at least 24 unique values (the PDF contains legitimate ties;
      // Secondary has 26 unique due to multiple 3-way and 2-way ties)
      expect(new Set(values).size).toBeGreaterThanOrEqual(24);
    }
  });

  it("source page is present for all teams", () => {
    for (const team of WS_TEAMS_2026) {
      expect(team.positionalRatings.sourcePage, `${team.abbr}`).toBeGreaterThan(0);
    }
  });

  // Spot-check known values against page 50 visual verification
  it("ATL positional rankings match page 50 and page 96", () => {
    const atl = getWarrenSharpProfile("atl")!;
    expect(atl.positionalRatings.quarterbacks).toBe(28);
    expect(atl.positionalRatings.offensiveLine).toBe(10);
    expect(atl.positionalRatings.receivers).toBe(15);
    expect(atl.positionalRatings.runningBacks).toBe(1);
    expect(atl.positionalRatings.front7).toBe(31);
    expect(atl.positionalRatings.secondary).toBe(22);
    expect(atl.positionalRatings.headCoach).toBe(20);
  });

  it("CLE positional rankings match page 50 and page 199", () => {
    const cle = getWarrenSharpProfile("cle")!;
    expect(cle.positionalRatings.quarterbacks).toBe(31);
    expect(cle.positionalRatings.offensiveLine).toBe(32);
    expect(cle.positionalRatings.receivers).toBe(30);
    expect(cle.positionalRatings.runningBacks).toBe(26);
    expect(cle.positionalRatings.front7).toBe(6);
    expect(cle.positionalRatings.secondary).toBe(10);
    expect(cle.positionalRatings.headCoach).toBe(29);
  });

  it("IND positional rankings match page 50 and page 299", () => {
    const ind = getWarrenSharpProfile("ind")!;
    expect(ind.positionalRatings.quarterbacks).toBe(23);
    expect(ind.positionalRatings.offensiveLine).toBe(11);
    expect(ind.positionalRatings.receivers).toBe(23);
    expect(ind.positionalRatings.runningBacks).toBe(4);
    expect(ind.positionalRatings.front7).toBe(25);
    expect(ind.positionalRatings.secondary).toBe(8);
    expect(ind.positionalRatings.headCoach).toBe(16);
  });

  it("NO positional rankings match page 50 and page 453", () => {
    const no = getWarrenSharpProfile("no")!;
    expect(no.positionalRatings.quarterbacks).toBe(22);
    expect(no.positionalRatings.offensiveLine).toBe(16);
    expect(no.positionalRatings.receivers).toBe(18);
    expect(no.positionalRatings.runningBacks).toBe(19);
    expect(no.positionalRatings.front7).toBe(28);
    expect(no.positionalRatings.secondary).toBe(20);
    expect(no.positionalRatings.headCoach).toBe(17);
  });

  // Spot-check eight additional teams
  it("LAR positional rankings (verified from page 384)", () => {
    const lar = getWarrenSharpProfile("lar")!;
    expect(lar.positionalRatings.quarterbacks).toBe(5);
    expect(lar.positionalRatings.offensiveLine).toBe(5);
    expect(lar.positionalRatings.headCoach).toBe(1);
    expect(lar.positionalRatings.front7).toBe(3);
    expect(lar.positionalRatings.secondary).toBe(4);
  });

  it("PHI positional rankings (verified from page 504)", () => {
    const phi = getWarrenSharpProfile("phi")!;
    expect(phi.positionalRatings.offensiveLine).toBe(2);
    expect(phi.positionalRatings.front7).toBe(2);
    expect(phi.positionalRatings.runningBacks).toBe(5);
    expect(phi.positionalRatings.secondary).toBe(6);
  });

  it("HOU positional rankings (verified from page 282)", () => {
    const hou = getWarrenSharpProfile("hou")!;
    expect(hou.positionalRatings.front7).toBe(1);
    expect(hou.positionalRatings.secondary).toBe(1);
    expect(hou.positionalRatings.offensiveLine).toBe(31);
  });

  it("DEN positional rankings (verified from page 233)", () => {
    const den = getWarrenSharpProfile("den")!;
    expect(den.positionalRatings.offensiveLine).toBe(1);
    expect(den.positionalRatings.secondary).toBe(2);
    expect(den.positionalRatings.front7).toBe(4);
  });

  it("BUF positional rankings (verified from page 129)", () => {
    const buf = getWarrenSharpProfile("buf")!;
    expect(buf.positionalRatings.quarterbacks).toBe(1);
    expect(buf.positionalRatings.offensiveLine).toBe(3);
    expect(buf.positionalRatings.runningBacks).toBe(3);
  });

  it("SEA positional rankings (verified from page 556)", () => {
    const sea = getWarrenSharpProfile("sea")!;
    expect(sea.positionalRatings.headCoach).toBe(4);
    expect(sea.positionalRatings.secondary).toBe(2);
    expect(sea.positionalRatings.front7).toBe(5);
    expect(sea.positionalRatings.runningBacks).toBe(31);
  });

  it("MIA positional rankings (verified from page 402)", () => {
    const mia = getWarrenSharpProfile("mia")!;
    expect(mia.positionalRatings.receivers).toBe(32);
    expect(mia.positionalRatings.front7).toBe(32);
    expect(mia.positionalRatings.secondary).toBe(32);
  });

  it("GB positional rankings (verified from page 266)", () => {
    const gb = getWarrenSharpProfile("gb")!;
    expect(gb.positionalRatings.offensiveLine).toBe(27);
    expect(gb.positionalRatings.secondary).toBe(11);
    expect(gb.positionalRatings.headCoach).toBe(11);
  });
});

// ── Coaching data ─────────────────────────────────────────────────────────────

describe("Coaching data", () => {
  it("every team has a head coach name", () => {
    for (const team of WS_TEAMS_2026) {
      expect(team.coaching.headCoach, `${team.abbr}`).toBeTruthy();
    }
  });

  it("headCoachNew is true iff priorYears === 0", () => {
    for (const team of WS_TEAMS_2026) {
      const isNew = team.coaching.headCoachPriorYears === 0;
      expect(team.coaching.headCoachNew, `${team.abbr}`).toBe(isNew);
    }
  });

  it("ATL coaching is Kevin Stefanski (new)", () => {
    const atl = getWarrenSharpProfile("atl")!;
    expect(atl.coaching.headCoach).toBe("Kevin Stefanski");
    expect(atl.coaching.headCoachNew).toBe(true);
    expect(atl.coaching.offensiveCoordinator).toBe("Tommy Rees");
    expect(atl.coaching.defensiveCoordinator).toBe("Jeff Ulbrich");
    expect(atl.coaching.defensiveCoordinatorPriorYears).toBe(1);
  });

  it("IND coaching tenure matches PDF labels (3 prior years = entering year 4)", () => {
    const ind = getWarrenSharpProfile("ind")!;
    expect(ind.coaching.headCoach).toBe("Shane Steichen");
    expect(ind.coaching.headCoachPriorYears).toBe(3);
    expect(ind.coaching.headCoachNew).toBe(false);
    expect(ind.coaching.offensiveCoordinatorPriorYears).toBe(3);
    expect(ind.coaching.defensiveCoordinatorPriorYears).toBe(1);
  });

  it("CLE all new staff for 2026", () => {
    const cle = getWarrenSharpProfile("cle")!;
    expect(cle.coaching.headCoachNew).toBe(true);
    expect(cle.coaching.offensiveCoordinatorNew).toBe(true);
    expect(cle.coaching.defensiveCoordinatorNew).toBe(true);
  });

  it("source pages are valid PDF page numbers", () => {
    for (const team of WS_TEAMS_2026) {
      expect(team.coaching.sourcePage, `${team.abbr}`).toBeGreaterThanOrEqual(75);
      expect(team.coaching.sourcePage, `${team.abbr}`).toBeLessThanOrEqual(619);
    }
  });
});

// ── Personnel data ────────────────────────────────────────────────────────────

describe("Personnel data", () => {
  it("no duplicate additions within a team", () => {
    for (const team of WS_TEAMS_2026) {
      const names = team.keyAdditions.map((a) => a.player);
      expect(new Set(names).size, `${team.abbr} additions`).toBe(names.length);
    }
  });

  it("no duplicate departures within a team", () => {
    for (const team of WS_TEAMS_2026) {
      const names = team.keyDepartures.map((d) => d.player);
      expect(new Set(names).size, `${team.abbr} departures`).toBe(names.length);
    }
  });

  it("all additions have player and position", () => {
    for (const team of WS_TEAMS_2026) {
      for (const add of team.keyAdditions) {
        expect(add.player, `${team.abbr}`).toBeTruthy();
        expect(add.position, `${team.abbr} ${add.player}`).toBeTruthy();
      }
    }
  });

  it("all departures have player and position", () => {
    for (const team of WS_TEAMS_2026) {
      for (const dep of team.keyDepartures) {
        expect(dep.player, `${team.abbr}`).toBeTruthy();
        expect(dep.position, `${team.abbr} ${dep.player}`).toBeTruthy();
      }
    }
  });
});

// ── Lookup utilities ──────────────────────────────────────────────────────────

describe("Lookup utilities", () => {
  it("getWarrenSharpProfile returns correct team", () => {
    const atl = getWarrenSharpProfile("atl");
    expect(atl).not.toBeNull();
    expect(atl!.team).toBe("Atlanta Falcons");
  });

  it("getWarrenSharpProfile returns null for unknown abbr", () => {
    expect(getWarrenSharpProfile("xyz")).toBeNull();
  });

  it("all 32 teams resolve via getWarrenSharpProfile", () => {
    for (const abbr of EXPECTED_ABBRS) {
      const profile = getWarrenSharpProfile(abbr);
      expect(profile, `abbr: ${abbr}`).not.toBeNull();
    }
  });

  it("every team abbr resolves in NFL_GUIDE_TEAM_BY_ABBR", () => {
    for (const team of WS_TEAMS_2026) {
      const guideTeam = NFL_GUIDE_TEAM_BY_ABBR.get(team.abbr);
      expect(guideTeam, `Sharp abbr '${team.abbr}' not in guide`).toBeDefined();
    }
  });
});

// ── Tone utility ──────────────────────────────────────────────────────────────

describe("getPositionalRankTone", () => {
  it("1–8 is green", () => {
    for (let i = 1; i <= 8; i++) expect(getPositionalRankTone(i)).toBe("green");
  });
  it("9–16 is light-green", () => {
    for (let i = 9; i <= 16; i++) expect(getPositionalRankTone(i)).toBe("light-green");
  });
  it("17–24 is amber", () => {
    for (let i = 17; i <= 24; i++) expect(getPositionalRankTone(i)).toBe("amber");
  });
  it("25–32 is red", () => {
    for (let i = 25; i <= 32; i++) expect(getPositionalRankTone(i)).toBe("red");
  });
});

// ── Outlook data ──────────────────────────────────────────────────────────────

describe("Outlook data", () => {
  it("every team has strengths, concerns, and jkbTakeaway", () => {
    for (const team of WS_TEAMS_2026) {
      expect(team.outlook.strengths.length, `${team.abbr} strengths`).toBeGreaterThan(0);
      expect(team.outlook.concerns.length, `${team.abbr} concerns`).toBeGreaterThan(0);
      expect(team.outlook.jkbTakeaway, `${team.abbr} jkbTakeaway`).toBeTruthy();
    }
  });
});

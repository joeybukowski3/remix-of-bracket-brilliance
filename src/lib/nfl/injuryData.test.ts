import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GAME_STATUS_LABELS,
  PRACTICE_STATUS_LABELS,
  createInjuryResolver,
  describeUnavailable,
  displayStatusLabel,
  formatSnapPct,
  isCurrentSeasonData,
  summaryParts,
  unitPct,
  type InjuriesArtifact,
} from "@/lib/nfl/injuryData";

const ROOT = resolve(__dirname, "../../..");
const ARTIFACT = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/matchup-injuries.json"), "utf8")
) as InjuriesArtifact;

const SLUGS = new Map([
  ["new-england-patriots", "ne"],
  ["seattle-seahawks", "sea"],
  ["kansas-city-chiefs", "kc"],
  ["philadelphia-eagles", "phi"],
]);

describe("snap percentage formatting", () => {
  it("renders null as N/A and zero as 0%", () => {
    expect(formatSnapPct(null)).toBe("N/A");
    expect(formatSnapPct(0)).toBe("0%");
  });

  it("never turns a missing value into a zero", () => {
    expect(formatSnapPct(null)).not.toBe("0%");
    expect(formatSnapPct(Number.NaN)).toBe("N/A");
  });

  it("rounds to a whole percent", () => {
    expect(formatSnapPct(78.7)).toBe("79%");
    expect(formatSnapPct(100)).toBe("100%");
  });
});

describe("unit percentage selection", () => {
  it("takes only the player's own unit and never combines the two", () => {
    const snaps = { offensePct: 0, defensePct: 74 };
    expect(unitPct("offense", snaps)).toBe(0);
    expect(unitPct("defense", snaps)).toBe(74);
  });

  it("returns null for a missing unit value", () => {
    expect(unitPct("offense", { offensePct: null, defensePct: 90 })).toBeNull();
  });
});

describe("status presentation", () => {
  it("labels the three game designations", () => {
    expect(GAME_STATUS_LABELS).toEqual({
      OUT: "Out",
      DOUBTFUL: "Doubtful",
      QUESTIONABLE: "Questionable",
    });
  });

  it("shows Reserve only when there is no game designation", () => {
    expect(displayStatusLabel({ gameStatus: "OUT", reserveStatus: "RESERVE" })).toBe("Out");
    expect(displayStatusLabel({ gameStatus: null, reserveStatus: "RESERVE" })).toBe("Reserve");
    expect(displayStatusLabel({ gameStatus: null, reserveStatus: null })).toBeNull();
  });

  it("keeps practice status as compact secondary context only", () => {
    expect(PRACTICE_STATUS_LABELS).toEqual({
      DID_NOT_PARTICIPATE: "DNP",
      LIMITED: "Limited",
      FULL: "Full",
    });
    // Practice status can never become the displayed designation.
    expect(displayStatusLabel({ gameStatus: null, reserveStatus: null })).toBeNull();
  });

  it("never labels reserve as IR, PUP or NFI", () => {
    expect(displayStatusLabel({ gameStatus: null, reserveStatus: "RESERVE" })).not.toMatch(/IR|PUP|NFI/);
  });
});

describe("team summary", () => {
  it("lists only non-zero designation counts", () => {
    expect(summaryParts({ out: 2, doubtful: 0, questionable: 3, reserve: 1 })).toEqual([
      "2 Out",
      "3 Questionable",
      "1 Reserve",
    ]);
    expect(summaryParts({ out: 0, doubtful: 0, questionable: 0, reserve: 0 })).toEqual([]);
  });
});

describe("historical-data guard", () => {
  it("refuses to present a prior season as the current week", () => {
    expect(ARTIFACT.isHistorical).toBe(true);
    expect(isCurrentSeasonData(ARTIFACT)).toBe(false);

    const resolver = createInjuryResolver(ARTIFACT, SLUGS);
    expect(resolver("new-england-patriots")).toBeNull();
  });

  it("explains that current-season data is not yet published", () => {
    expect(describeUnavailable(ARTIFACT)).toMatch(/has not published .*2026/i);
  });

  it("resolves current-season data normally", () => {
    const current = {
      ...ARTIFACT,
      isHistorical: false,
      availability: { ...ARTIFACT.availability, currentSeasonAvailable: true },
    };
    expect(isCurrentSeasonData(current)).toBe(true);
    expect(createInjuryResolver(current, SLUGS)("new-england-patriots")).not.toBeNull();
  });

  it("returns null for a missing artifact rather than throwing", () => {
    expect(createInjuryResolver(null, SLUGS)("new-england-patriots")).toBeNull();
    expect(describeUnavailable(null)).toBe("Injury report not connected.");
  });
});

describe("generated artifact", () => {
  const resolver = createInjuryResolver(ARTIFACT, SLUGS, { allowHistorical: true });

  it("declares its schema, attribution and data window", () => {
    expect(ARTIFACT.schemaVersion).toBe("nfl-matchup-injuries-v1");
    expect(ARTIFACT.attribution).toMatch(/nflverse/i);
    expect(ARTIFACT.attribution).toMatch(/Pro-Football-Reference/i);
    expect(ARTIFACT.dataSeason).toBe(2025);
    expect(ARTIFACT.dataWeek).toBe(12);
  });

  it("records that 2026 sources are not published without fabricating rows", () => {
    const y2026 = ARTIFACT.availability.seasons.find((row) => row.season === 2026)!;
    expect(y2026.injuries).toBe(false);
    expect(y2026.snapCounts).toBe(false);
    expect(y2026.complete).toBe(false);
    // Nothing in the artifact claims 2026 data.
    expect(Object.values(ARTIFACT.teams).flatMap((team) => team.entries).length).toBeGreaterThan(0);
  });

  it("excludes K, P and LS from every team", () => {
    const positions = Object.values(ARTIFACT.teams).flatMap((team) =>
      team.entries.map((entry) => entry.position)
    );
    expect(positions.length).toBeGreaterThan(50);
    for (const position of ["K", "P", "LS"]) {
      expect(positions, position).not.toContain(position);
    }
  });

  it("only contains records with a designation or reserve status", () => {
    for (const team of Object.values(ARTIFACT.teams)) {
      for (const entry of team.entries) {
        expect(
          entry.gameStatus != null || entry.reserveStatus === "RESERVE",
          `${entry.playerName} has neither a designation nor reserve status`
        ).toBe(true);
      }
    }
  });

  it("carries join provenance for every entry", () => {
    for (const team of Object.values(ARTIFACT.teams)) {
      for (const entry of team.entries) {
        expect(entry.gsisId, entry.playerName).toBeTruthy();
        expect(["offense", "defense"]).toContain(entry.unit);
      }
    }
  });

  it("reproduces the audited Week 12 examples exactly", () => {
    const cases = [
      { slug: "new-england-patriots", name: "Harold Landry III", gsisId: "00-0034828", pfrId: "LandHa00",
        position: "LB", gameStatus: "QUESTIONABLE", practiceStatus: "FULL", last: 74, season: 78.7 },
      { slug: "seattle-seahawks", name: "Ernest Jones", gsisId: "00-0036994", pfrId: "JoneEr01",
        position: "LB", gameStatus: "QUESTIONABLE", practiceStatus: "DID_NOT_PARTICIPATE", last: 100, season: 92.9 },
      { slug: "kansas-city-chiefs", name: "Xavier Worthy", gsisId: "00-0039894", pfrId: "WortXa00",
        position: "WR", gameStatus: "QUESTIONABLE", practiceStatus: "FULL", last: 76, season: 64.8 },
      { slug: "philadelphia-eagles", name: "Lane Johnson", gsisId: "00-0030561", pfrId: "JohnLa01",
        position: "T", gameStatus: "OUT", practiceStatus: "DID_NOT_PARTICIPATE", last: 19, season: 73.9 },
      { slug: "philadelphia-eagles", name: "Cam Jurgens", gsisId: "00-0038112", pfrId: "JurgCa01",
        position: "C", gameStatus: "QUESTIONABLE", practiceStatus: "FULL", last: 85, season: 90.6 },
    ];

    for (const expected of cases) {
      const profile = resolver(expected.slug)!;
      const entry = profile.entries.find((row) => row.playerName === expected.name);
      expect(entry, `${expected.name} missing`).toBeDefined();
      expect(entry!.playerId).toBe(expected.gsisId);
      expect(entry!.position).toBe(expected.position);
      expect(entry!.gameStatus).toBe(expected.gameStatus);
      expect(entry!.practiceStatus).toBe(expected.practiceStatus);
      expect(entry!.lastGameSnapPct, `${expected.name} last game`).toBeCloseTo(expected.last, 0);
      expect(entry!.seasonSnapPct, `${expected.name} season`).toBeCloseTo(expected.season, 1);
    }
  });

  it("omits a full-participation rest note with no designation", () => {
    // Christian Barmore had a blank report_status and "Not injury related" in
    // Week 12. He is not injured and must not appear.
    const ne = resolver("new-england-patriots")!;
    expect(ne.entries.find((entry) => entry.playerName === "Christian Barmore")).toBeUndefined();
  });

  it("sorts each team by designation severity then exposure", () => {
    const order = ["OUT", "DOUBTFUL", "QUESTIONABLE"];
    for (const team of Object.values(ARTIFACT.teams)) {
      const ranks = team.entries.map((entry) =>
        entry.gameStatus ? order.indexOf(entry.gameStatus) : order.length
      );
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    }
  });

  it("contains no injury impact score or spread adjustment anywhere", () => {
    const json = JSON.stringify(ARTIFACT);
    expect(json).not.toMatch(/impactScore|pointsLost|spreadAdjust|winProbability/i);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildMatchupSlug,
  buildWeekMatchups,
  getAvailableWeeks,
  getMatchupBySlug,
  buildMatchupFromGame,
} from "@/lib/nfl/matchups";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import type { NflGameRecord } from "@/lib/nfl/standings";

const ROOT = resolve(__dirname, "../../..");
const GAMES: NflGameRecord[] = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/2026/games.json"), "utf-8")
).games;
const GUIDE = getNflSeasonGuide(2026)!;

describe("buildMatchupSlug", () => {
  it("builds a deterministic lowercase `-at-` slug from canonical slugs", () => {
    expect(buildMatchupSlug("new-england-patriots", "seattle-seahawks")).toBe(
      "new-england-patriots-at-seattle-seahawks"
    );
  });

  it("supports a neutral `-vs-` format", () => {
    expect(buildMatchupSlug("san-francisco-49ers", "la-rams", true)).toBe(
      "san-francisco-49ers-vs-la-rams"
    );
  });
});

describe("getAvailableWeeks", () => {
  it("derives regular-season weeks ascending from real schedule data", () => {
    const weeks = getAvailableWeeks(GAMES);
    expect(weeks[0]).toBe(1);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    expect(weeks).toContain(18);
  });
});

describe("buildWeekMatchups (2026 Week 1)", () => {
  const matchups = buildWeekMatchups(GAMES, GUIDE, 1);

  it("derives all 16 Week 1 games from real schedule data", () => {
    expect(matchups).toHaveLength(16);
  });

  it("orders games chronologically by kickoff", () => {
    const times = matchups.map((m) => (m.kickoffUtc ? Date.parse(m.kickoffUtc) : Number.POSITIVE_INFINITY));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("gives every game a unique deterministic slug", () => {
    const slugs = matchups.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const m of matchups) {
      expect(m.slug).toBe(`${m.away.slug}-at-${m.home.slug}`);
      expect(m.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("resolves home and away canonical teams correctly", () => {
    const opener = matchups.find((m) => m.gameId === "2026_01_NE_SEA");
    expect(opener?.away.abbr).toBe("ne");
    expect(opener?.home.abbr).toBe("sea");
    expect(opener?.away.teamName).toBe("New England Patriots");
    expect(opener?.home.teamName).toBe("Seattle Seahawks");
  });

  it("joins power-rating data onto every team", () => {
    for (const m of matchups) {
      expect(Number.isFinite(m.away.powerRank)).toBe(true);
      expect(Number.isFinite(m.home.powerRank)).toBe(true);
      expect(Number.isFinite(m.away.overallPct)).toBe(true);
      expect(Number.isFinite(m.home.overallPct)).toBe(true);
    }
  });

  it("leaves the spread unavailable (repository ingests no betting lines)", () => {
    for (const m of matchups) {
      expect(m.spread).toBeNull();
    }
  });

  it("skips a malformed game with an unresolved team rather than throwing", () => {
    const bad: NflGameRecord = {
      gameId: "2026_01_XXX_YYY", season: 2026, week: 1, seasonType: "REG",
      dateUtc: "2026-09-10T00:20:00.000Z", homeTeam: "X", awayTeam: "Y",
      homeAbbr: "xxx", awayAbbr: "yyy", status: "scheduled", stadium: null,
    };
    const withBad = buildWeekMatchups([...GAMES, bad], GUIDE, 1);
    expect(withBad).toHaveLength(16); // bad game dropped, others intact
    expect(buildMatchupFromGame(bad, GUIDE)).toBeNull();
  });
});

describe("getMatchupBySlug", () => {
  it("resolves the correct game for a valid slug", () => {
    const m = getMatchupBySlug(GAMES, GUIDE, "new-england-patriots-at-seattle-seahawks");
    expect(m?.gameId).toBe("2026_01_NE_SEA");
  });

  it("returns null for an unknown/invalid slug", () => {
    expect(getMatchupBySlug(GAMES, GUIDE, "not-a-real-matchup")).toBeNull();
    expect(getMatchupBySlug(GAMES, GUIDE, "")).toBeNull();
  });

  it("links resolve to canonical team dashboard slugs", () => {
    const m = getMatchupBySlug(GAMES, GUIDE, "new-england-patriots-at-seattle-seahawks")!;
    expect(GUIDE.teamBySlug.get(m.away.slug)).toBeTruthy();
    expect(GUIDE.teamBySlug.get(m.home.slug)).toBeTruthy();
  });
});

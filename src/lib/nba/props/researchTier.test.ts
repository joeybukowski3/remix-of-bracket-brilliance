import { describe, expect, it } from "vitest";
import type { PlayerRecentGame } from "./recentForm";
import { CORE_MIN_MPG, MIN_GAMES_FOR_TIER, ROTATION_MIN_MPG, STABLE_BAND, medianOf, minutesConsistency, researchProfile, researchTierRank } from "./researchTier";
import type { SeasonAvailability, SeasonStatsView } from "./seasonStats";

const game = (i: number, minutes: number): PlayerRecentGame => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, opponent: "NYK", isHome: true, minutes, pts: 10, reb: 4, ast: 3 });
const games = (minutes: readonly number[]): PlayerRecentGame[] => minutes.map((m, i) => game(i, m));

const view = (minutes: readonly number[], over: Partial<SeasonStatsView> = {}): SeasonStatsView => {
  const total = minutes.reduce((a, b) => a + b, 0);
  return { current: minutes.length === 0 ? null : { season: "2026-27", games: minutes.length, minutes: total, pts: 0, reb: 0, ast: 0 }, previous: null, recentGames: games(minutes), ...over };
};
const availability = (over: Partial<SeasonAvailability> = {}): SeasonAvailability => ({ teamGames: 10, played: 10, returning: false, roleChange: false, teamChangedRecently: false, ...over });

describe("medianOf", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(medianOf([30, 10, 20])).toBe(20);
    expect(medianOf([10, 20, 30, 40])).toBe(25);
    expect(medianOf([])).toBeNull();
  });

  it("does not reorder its input", () => {
    const input = [3, 1, 2];
    medianOf(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("minutesConsistency: at least 4 of the last 5 games within +/-20% of the five-game median", () => {
  it("is stable when every one of the five is close to the median", () => {
    const c = minutesConsistency(games([30, 31, 29, 32, 30]));
    expect(c.last5).toMatchObject({ games: 5, median: 30, within: 5, stable: true });
  });

  it("allows exactly one game outside the band", () => {
    const c = minutesConsistency(games([30, 30, 30, 30, 12]));
    expect(c.last5).toMatchObject({ median: 30, within: 4, stable: true });
  });

  it("is unstable with two games outside the band", () => {
    const c = minutesConsistency(games([30, 30, 30, 12, 12]));
    expect(c.last5).toMatchObject({ median: 30, within: 3, stable: false });
  });

  it("counts a game exactly on the band edge as inside it", () => {
    // median 30 -> band 24..36
    const c = minutesConsistency(games([30, 30, 30, 24, 36]));
    expect(c.last5?.within).toBe(5);
    expect(STABLE_BAND).toBe(0.2);
  });

  it("uses only the five most recent games (the log is oldest to newest)", () => {
    const c = minutesConsistency(games([5, 6, 7, 8, 9, 30, 30, 30, 30, 30]));
    expect(c.last5).toMatchObject({ median: 30, stable: true });
  });

  it("has no verdict with fewer than five games", () => {
    const c = minutesConsistency(games([30, 30, 30, 30]));
    expect(c.last5).toBeNull();
    expect(c.games).toBe(4);
  });

  it("reports the ten-game window apart, with its own median and spread", () => {
    const c = minutesConsistency(games([20, 22, 24, 26, 28, 30, 32, 34, 36, 38]));
    expect(c.last10).toMatchObject({ games: 10, median: 29, min: 20, max: 38 });
    expect(c.last10?.sd).toBeGreaterThan(0);
  });

  it("has no ten-game reading with fewer than five games, and a shorter window says how many", () => {
    expect(minutesConsistency(games([30, 30, 30])).last10).toBeNull();
    expect(minutesConsistency(games([30, 30, 30, 30, 30, 30, 30])).last10?.games).toBe(7);
  });

  it("has no baseline median for an empty log", () => {
    expect(minutesConsistency([])).toMatchObject({ games: 0, last5: null, last10: null });
  });
});

describe("researchProfile: tiers", () => {
  it("puts a stable 25+ MPG player in Core", () => {
    const p = researchProfile(view([32, 33, 31, 34, 32, 30, 33]));
    expect(p?.tier).toBe("core");
    expect(p?.flags).toEqual([]);
    expect(p?.baselineMinutes).toBe(32);
  });

  it("puts a stable player between 20 and 25 MPG in Rotation", () => {
    expect(researchProfile(view([22, 23, 21, 24, 22, 22]))?.tier).toBe("rotation");
  });

  it("uses the thresholds exactly: 25.0 is Core, 20.0 is Rotation, just under 20 is Variable", () => {
    expect(researchProfile(view([25, 25, 25, 25, 25]))?.tier).toBe("core");
    expect(researchProfile(view([20, 20, 20, 20, 20]))?.tier).toBe("rotation");
    expect(researchProfile(view([19.8, 19.8, 19.8, 19.8, 19.8]))?.tier).toBe("variable");
    expect(CORE_MIN_MPG).toBe(25);
    expect(ROTATION_MIN_MPG).toBe(20);
  });

  it("keeps a 25+ MPG player with unstable minutes out of Core, and says why", () => {
    const p = researchProfile(view([40, 40, 40, 14, 14, 40, 40]));
    // season mpg ~32.6 but only 3 of the last 5 (14, 14 are out) -> unstable
    expect(p?.tier).toBe("rotation");
    expect(p?.flags).toContain("unstable-minutes");
  });

  it("keeps a recently changed role or a team change out of Core", () => {
    const base = view([32, 33, 31, 34, 32, 30, 33]);
    const shifted = researchProfile({ ...base, availability: availability({ roleChange: true }) });
    expect(shifted?.tier).toBe("rotation");
    expect(shifted?.flags).toContain("recent-role-change");
    const moved = researchProfile({ ...base, availability: availability({ teamChangedRecently: true }) });
    expect(moved?.tier).toBe("rotation");
    expect(moved?.flags).toContain("new-team");
  });

  it("keeps a player returning from an absence out of Core and reports the absence", () => {
    const p = researchProfile({ ...view([32, 33, 31, 34, 32, 30, 33]), availability: availability({ returning: true }) });
    expect(p?.tier).toBe("rotation");
    expect(p?.flags).toContain("returning-from-absence");
  });

  it("flags missed team games without blocking the tier, and does not call them injuries", () => {
    const p = researchProfile({ ...view([32, 33, 31, 34, 32, 30, 33]), availability: availability({ teamGames: 10, played: 8 }) });
    expect(p?.tier).toBe("core");
    expect(p?.flags).toContain("missed-games");
    expect(p?.missedTeamGames).toEqual({ missed: 2, of: 10 });
  });

  it("does not tier a player with fewer than five games: Variable with a low-sample flag, never Core", () => {
    const p = researchProfile(view([34, 35, 33, 36]));
    expect(MIN_GAMES_FOR_TIER).toBe(5);
    expect(p?.tier).toBe("variable");
    expect(p?.flags).toContain("low-sample");
    expect(p?.mpg).toBeCloseTo(34.5, 5);
  });

  it("treats a player with no games this season as Variable with a low-sample flag", () => {
    const p = researchProfile({ current: null, previous: { season: "2025-26", games: 70, minutes: 2200, pts: 0, reb: 0, ast: 0 }, recentGames: [] });
    expect(p).toMatchObject({ tier: "variable", mpg: null, games: 0 });
    expect(p?.flags).toContain("low-sample");
  });

  it("never reaches back into last season to rate a player", () => {
    const p = researchProfile({ current: { season: "2026-27", games: 3, minutes: 60, pts: 0, reb: 0, ast: 0 }, previous: { season: "2025-26", games: 80, minutes: 2800, pts: 0, reb: 0, ast: 0 }, recentGames: games([20, 20, 20]) });
    expect(p?.tier).toBe("variable");
  });

  it("cannot call a player stable without a minutes log (a board built before it existed)", () => {
    const p = researchProfile({ current: { season: "2026-27", games: 8, minutes: 260, pts: 0, reb: 0, ast: 0 }, previous: null });
    expect(p?.tier).toBe("rotation");
    expect(p?.flags).toContain("no-minutes-log");
    expect(p?.consistency.last5).toBeNull();
  });

  it("returns null when the board carries no season statistics (a public board)", () => {
    expect(researchProfile(undefined)).toBeNull();
  });

  it("is a pure function of the pregame log: the same input gives the same output, and the input is untouched", () => {
    const v = view([32, 33, 31, 34, 32]);
    const frozen = JSON.stringify(v);
    expect(researchProfile(v)).toEqual(researchProfile(v));
    expect(JSON.stringify(v)).toBe(frozen);
  });

  it("explains the placement in one sentence", () => {
    expect(researchProfile(view([32, 33, 31, 34, 32]))?.reason).toMatch(/Core/);
    expect(researchProfile(view([40, 40, 40, 14, 14, 40, 40]))?.reason).toMatch(/4 of the last 5/);
  });
});

describe("researchTierRank", () => {
  it("orders Core before Rotation before Variable, and unrated last", () => {
    expect([researchTierRank("variable"), researchTierRank("core"), researchTierRank(null), researchTierRank("rotation")].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(researchTierRank("core")).toBeLessThan(researchTierRank("rotation"));
    expect(researchTierRank("rotation")).toBeLessThan(researchTierRank("variable"));
    expect(researchTierRank("variable")).toBeLessThan(researchTierRank(null));
  });
});

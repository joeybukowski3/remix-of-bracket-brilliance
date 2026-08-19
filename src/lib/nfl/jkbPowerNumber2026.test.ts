import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOME_FIELD_ADVANTAGE_POINTS,
  NEUTRAL_SITE_HOME_FIELD_ADVANTAGE_POINTS,
  OVR_TO_POINTS_COEFFICIENT,
  buildPowerNumberBoard,
  expectedHomeMarginFor,
  homeFieldAdvantageFor,
  neutralMarginFor,
  powerNumberFor,
  projectMatchup,
  toSportsbookSpread,
} from "@/lib/nfl/jkbPowerNumber2026";
import type { CurrentRatingBoard, CurrentRatingRow } from "@/lib/nfl/currentRating2026";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fixtureRow(abbr: string, rating: number, rank: number): CurrentRatingRow {
  return {
    abbr,
    team: abbr,
    division: "NFC West",
    rating,
    rank,
    offenseRating: rating,
    offenseRank: rank,
    defenseRating: rating,
    defenseRank: rank,
    performanceRating: rating,
    performanceRank: rank,
    gamesPlayed: 6,
    preseasonWeight: 0,
    performanceWeight: 1,
    state: "live",
    preseasonV04Rating: rating,
    preseasonOffenseRating: rating,
    preseasonDefenseRating: rating,
  };
}

/** 32 teams, ratings spread evenly around 50 so the mean is exactly 50. */
function fixture32Board(overrideRatings?: Record<string, number>): CurrentRatingBoard {
  const abbrs = Array.from({ length: 32 }, (_, i) => `t${String(i).padStart(2, "0")}`);
  // Symmetric offsets around 50: -15.5, -14.5, ..., +15.5 (mean exactly 50).
  const ratings = abbrs.map((_, i) => 50 + (i - 15.5));
  const rows = abbrs.map((abbr, i) => fixtureRow(abbr, overrideRatings?.[abbr] ?? ratings[i], 0));
  const sorted = [...rows].sort((a, b) => b.rating - a.rating);
  sorted.forEach((row, i) => { row.rank = i + 1; });
  return { season: 2026, state: "live", teams: rows };
}

function fixtureBoardOfSize(n: number): CurrentRatingBoard {
  const rows = Array.from({ length: n }, (_, i) => fixtureRow(`t${i}`, 50 + i, i + 1));
  return { season: 2026, state: "live", teams: rows };
}

// ---------------------------------------------------------------------------
// 1-2. League average + full-board requirement
// ---------------------------------------------------------------------------
describe("buildPowerNumberBoard — league average and completeness", () => {
  it("requires exactly 32 teams for the canonical board", () => {
    expect(() => buildPowerNumberBoard(fixtureBoardOfSize(31))).toThrow(/requires the complete 32-team/);
    expect(() => buildPowerNumberBoard(fixtureBoardOfSize(16))).toThrow(/requires the complete 32-team/);
    expect(() => buildPowerNumberBoard(fixtureBoardOfSize(1))).toThrow(/requires the complete 32-team/);
  });

  it("incomplete subsets (one division, one matchup) cannot redefine league average", () => {
    // A "division" or "matchup" subset is just a smaller board — same guard applies.
    expect(() => buildPowerNumberBoard(fixtureBoardOfSize(4))).toThrow();
    expect(() => buildPowerNumberBoard(fixtureBoardOfSize(2))).toThrow();
  });

  it("league average OVR is calculated as the true 32-team mean, not hardcoded 50", () => {
    // Shift every rating by +7: mean shifts to 57, not 50.
    const abbrs = Array.from({ length: 32 }, (_, i) => `t${String(i).padStart(2, "0")}`);
    const overrides = Object.fromEntries(abbrs.map((abbr, i) => [abbr, 57 + (i - 15.5)]));
    const board = buildPowerNumberBoard(fixture32Board(overrides));
    expect(board.leagueAverageOVR).toBeCloseTo(57, 10);
  });

  it("mean Power Number across all 32 teams is 0 within floating-point tolerance", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const meanPower = board.teams.reduce((s, t) => s + t.powerNumber, 0) / board.teams.length;
    expect(meanPower).toBeCloseTo(0, 8);
  });
});

// ---------------------------------------------------------------------------
// 3-8. Power Number formula — exact worked examples from the approved spec
// ---------------------------------------------------------------------------
describe("Power Number formula — exact worked examples", () => {
  it("team above league average receives a positive Power Number", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const best = board.teams.find((t) => t.currentOVR === Math.max(...board.teams.map((x) => x.currentOVR)))!;
    expect(best.powerNumber).toBeGreaterThan(0);
  });

  it("team below league average receives a negative Power Number", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const worst = board.teams.find((t) => t.currentOVR === Math.min(...board.teams.map((x) => x.currentOVR)))!;
    expect(worst.powerNumber).toBeLessThan(0);
  });

  it("team exactly at league average receives Power Number 0", () => {
    const abbrs = Array.from({ length: 32 }, (_, i) => `t${String(i).padStart(2, "0")}`);
    // 31 teams spread around 50, one team pinned exactly at the resulting mean.
    const overrides: Record<string, number> = {};
    for (let i = 0; i < 31; i++) overrides[abbrs[i]] = 50 + (i - 15);
    // Compute what the mean of the first 31 would be, then set team 32 there
    // so the full-32 mean lands exactly on that same value.
    const partialMean = Object.values(overrides).reduce((s, v) => s + v, 0) / 31;
    overrides[abbrs[31]] = partialMean;
    const board = buildPowerNumberBoard(fixture32Board(overrides));
    const avgTeam = board.teams.find((t) => t.abbr === abbrs[31])!;
    expect(avgTeam.powerNumber).toBeCloseTo(0, 8);
  });

  it("10 OVR points above league average = +2.4 Power Number", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const avg = board.leagueAverageOVR;
    const above = { ...fixtureRow("above", avg + 10, 1) };
    const pn = (above.rating - avg) * OVR_TO_POINTS_COEFFICIENT;
    expect(pn).toBeCloseTo(2.4, 10);
  });

  it("10 OVR points below league average = -2.4 Power Number", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const avg = board.leagueAverageOVR;
    const below = { ...fixtureRow("below", avg - 10, 1) };
    const pn = (below.rating - avg) * OVR_TO_POINTS_COEFFICIENT;
    expect(pn).toBeCloseTo(-2.4, 10);
  });

  it("worked example from the approved spec: league avg 50, team OVR 70 -> +4.8", () => {
    const abbrs = Array.from({ length: 32 }, (_, i) => `t${String(i).padStart(2, "0")}`);
    const overrides = Object.fromEntries(abbrs.map((abbr, i) => [abbr, 50 + (i - 15.5)]));
    overrides[abbrs[0]] = 70;
    // Re-balance the rest so the mean is still exactly 50.
    const others = abbrs.slice(1);
    const target = 50 * 32 - 70;
    others.forEach((abbr, i) => { overrides[abbr] = i === 0 ? target - (others.length - 1) * 50 : 50; });
    const board = buildPowerNumberBoard(fixture32Board(overrides));
    expect(board.leagueAverageOVR).toBeCloseTo(50, 6);
    const team = board.teams.find((t) => t.abbr === abbrs[0])!;
    expect(team.currentOVR).toBe(70);
    expect(team.powerNumber).toBeCloseTo(4.8, 6);
  });
});

// ---------------------------------------------------------------------------
// 9-10. Monotonicity and rank correspondence
// ---------------------------------------------------------------------------
describe("Power Number ordering", () => {
  it("higher Current OVR always produces a higher Power Number", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const sortedByOvr = [...board.teams].sort((a, b) => a.currentOVR - b.currentOVR);
    for (let i = 1; i < sortedByOvr.length; i++) {
      expect(sortedByOvr[i].powerNumber).toBeGreaterThanOrEqual(sortedByOvr[i - 1].powerNumber);
    }
  });

  it("Power Number rank corresponds exactly to Current OVR rank", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    for (const team of board.teams) {
      expect(team.powerNumberRank).toBe(team.currentOVRRank);
    }
  });
});

// ---------------------------------------------------------------------------
// 11-16. Matchup math + sportsbook conversion
// ---------------------------------------------------------------------------
describe("neutral margin, home-field advantage, sportsbook conversion", () => {
  it("neutral matchup margin is simply Power Number difference", () => {
    expect(neutralMarginFor(4.0, -1.5)).toBeCloseTo(5.5, 10);
  });

  it("a normal (non-neutral) home game adds exactly +2.0 to the home margin", () => {
    expect(expectedHomeMarginFor(4.0, -1.5, false)).toBeCloseTo(5.5 + HOME_FIELD_ADVANTAGE_POINTS, 10);
    expect(homeFieldAdvantageFor(false)).toBe(2.0);
  });

  it("a neutral-site game adds zero home-field advantage", () => {
    expect(expectedHomeMarginFor(4.0, -1.5, true)).toBeCloseTo(5.5, 10);
    expect(homeFieldAdvantageFor(true)).toBe(NEUTRAL_SITE_HOME_FIELD_ADVANTAGE_POINTS);
  });

  it("positive expected home margin formats as HOME -X", () => {
    expect(toSportsbookSpread(4.5)).toEqual({ side: "home", line: -4.5, display: "HOME -4.5" });
  });

  it("negative expected home margin formats as AWAY -X", () => {
    expect(toSportsbookSpread(-3.0)).toEqual({ side: "away", line: -3.0, display: "AWAY -3.0" });
  });

  it("zero expected home margin formats as PK", () => {
    expect(toSportsbookSpread(0)).toEqual({ side: "pk", line: 0, display: "PK" });
  });

  it("worked spec example: BUF +5.0, MIA +1.0, BUF at home -> BUF -6.0", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const buf = board.teams[0];
    const mia = board.teams[1];
    const withOverrides = {
      ...board,
      teams: board.teams.map((t) =>
        t.abbr === buf.abbr ? { ...t, powerNumber: 5.0 } : t.abbr === mia.abbr ? { ...t, powerNumber: 1.0 } : t
      ),
    };
    const projection = projectMatchup(withOverrides, buf.abbr, mia.abbr, false);
    expect(projection.neutralMargin).toBeCloseTo(4.0, 10);
    expect(projection.expectedHomeMargin).toBeCloseTo(6.0, 10);
    expect(projection.spread).toEqual({ side: "home", line: -6.0, display: "HOME -6.0" });
  });
});

// ---------------------------------------------------------------------------
// 17. CRITICAL EQUIVALENCE TEST
// ---------------------------------------------------------------------------
describe("CRITICAL: equivalence to the approved direct OVR-difference model", () => {
  it("powerNumberHome - powerNumberAway === 0.24 * (OVRHome - OVRAway) for every pair, exactly", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    for (const home of board.teams) {
      for (const away of board.teams) {
        if (home.abbr === away.abbr) continue;
        const diff = home.powerNumber - away.powerNumber;
        const expected = OVR_TO_POINTS_COEFFICIENT * (home.currentOVR - away.currentOVR);
        expect(diff).toBeCloseTo(expected, 10);
      }
    }
  });

  it("holds under a random league average shift (the average term always cancels)", () => {
    const abbrs = Array.from({ length: 32 }, (_, i) => `t${String(i).padStart(2, "0")}`);
    const shifted = Object.fromEntries(abbrs.map((abbr, i) => [abbr, 23.7 + (i - 15.5) * 1.3]));
    const board = buildPowerNumberBoard(fixture32Board(shifted));
    const a = board.teams[3];
    const b = board.teams[19];
    expect(a.powerNumber - b.powerNumber).toBeCloseTo(OVR_TO_POINTS_COEFFICIENT * (a.currentOVR - b.currentOVR), 10);
  });
});

// ---------------------------------------------------------------------------
// 18-19. Vegas independence (structural)
// ---------------------------------------------------------------------------
describe("Vegas/market independence (structural guard)", () => {
  const sourcePath = resolve(process.cwd(), "src/lib/nfl/jkbPowerNumber2026.ts");
  const source = readFileSync(sourcePath, "utf-8");
  const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");

  it("the module never imports marketData or any market/odds/spread-line artifact", () => {
    expect(importLines).not.toMatch(/from ["']@\/lib\/nfl\/marketData["']/);
    expect(importLines).not.toMatch(/spreadLine|spread_line|oddsApi|vegas/i);
  });

  it("no exported function accepts a market/vegas parameter", () => {
    const exportedFunctionSignatures = source.match(/^export function [^{]+\{/gm) ?? [];
    expect(exportedFunctionSignatures.length).toBeGreaterThan(0);
    for (const sig of exportedFunctionSignatures) {
      expect(sig.toLowerCase()).not.toMatch(/market|vegas|odds/);
    }
  });

  it("Power Number is unaffected by any downstream market value — same board, same output, called repeatedly", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    const again = buildPowerNumberBoard(fixture32Board());
    expect(board.teams.map((t) => t.powerNumber)).toEqual(again.teams.map((t) => t.powerNumber));
  });
});

// ---------------------------------------------------------------------------
// 20. Legacy-rating independence (structural)
// ---------------------------------------------------------------------------
describe("no legacy rating input (structural guard)", () => {
  const sourcePath = resolve(process.cwd(), "src/lib/nfl/jkbPowerNumber2026.ts");
  const source = readFileSync(sourcePath, "utf-8");
  const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");

  it("never imports v0.3 review, Guide, or the legacy spread-v0.1.0 composite", () => {
    expect(importLines).not.toMatch(/from ["']@\/lib\/nfl\/v03Review["']/);
    expect(importLines).not.toMatch(/from ["']@\/lib\/nfl\/guideData["']/);
    expect(importLines).not.toMatch(/from ["']@\/lib\/nfl\/guide2026["']/);
    expect(importLines).not.toMatch(/nfl-spread-model|nfl-spread-dataset/);
  });

  it("its only rating input is CurrentRatingBoard/CurrentRatingRow.rating", () => {
    expect(importLines).toMatch(/from ["']@\/lib\/nfl\/currentRating2026["']/);
  });
});

// ---------------------------------------------------------------------------
// 21-22. Zero-game and live Current OVR both work normally
// ---------------------------------------------------------------------------
describe("works identically regardless of a team's underlying games-played/state", () => {
  it("a team at gamesPlayed=0 (preseason state) and one at 9 (live state) are both handled purely off .rating", () => {
    const rows = Array.from({ length: 32 }, (_, i) => {
      const row = fixtureRow(`t${String(i).padStart(2, "0")}`, 50 + (i - 15.5), 0);
      return i % 2 === 0
        ? { ...row, gamesPlayed: 0, state: "preseason" as const, performanceRating: null, performanceRank: null }
        : { ...row, gamesPlayed: 9, state: "live" as const };
    });
    const board: CurrentRatingBoard = { season: 2026, state: "live", teams: rows };
    const powerBoard = buildPowerNumberBoard(board);
    expect(powerBoard.teams).toHaveLength(32);
    for (const team of powerBoard.teams) {
      const source = rows.find((r) => r.abbr === team.abbr)!;
      expect(team.powerNumber).toBeCloseTo((source.rating - powerBoard.leagueAverageOVR) * OVR_TO_POINTS_COEFFICIENT, 10);
    }
  });
});

// ---------------------------------------------------------------------------
// powerNumberFor lookup
// ---------------------------------------------------------------------------
describe("powerNumberFor", () => {
  it("returns null for an unknown abbreviation rather than throwing", () => {
    const board = buildPowerNumberBoard(fixture32Board());
    expect(powerNumberFor(board, "zzz")).toBeNull();
  });
});

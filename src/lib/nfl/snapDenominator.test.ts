import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCsv } from "../../../scripts/lib/nfl-schedules-results-core.mjs";
import { parseSnapRows } from "../../../scripts/lib/nfl-injury-sources.mjs";
import {
  DENOMINATOR_TOLERANCE,
  aggregateSeasonSnaps,
  findLastTeamGame,
  lastGameSnapPct,
  resolveAllDenominators,
  solveTeamDenominator,
} from "../../../scripts/lib/nfl-snap-denominator.mjs";

const ROOT = resolve(__dirname, "../../..");
const SNAP_CACHE = join(ROOT, "data", "nfl", "nflverse", "snap-counts", "snap_counts_2025.csv");

/** Build synthetic player rows whose published percentages come from a known N. */
function rowsForDenominator(n, snapCounts, { unit = "offense" } = {}) {
  return snapCounts.map((snaps, index) => ({
    gameId: "G1",
    team: "AAA",
    week: 1,
    pfrId: `P${index}`,
    offenseSnaps: unit === "offense" ? snaps : 0,
    offensePct: unit === "offense" ? Math.round((snaps / n) * 100) / 100 : 0,
    defenseSnaps: unit === "defense" ? snaps : 0,
    defensePct: unit === "defense" ? Math.round((snaps / n) * 100) / 100 : 0,
    stSnaps: 0,
  }));
}

const OFF = { snapsKey: "offenseSnaps", pctKey: "offensePct" };
const DEF = { snapsKey: "defenseSnaps", pctKey: "defensePct" };

describe("team snap denominator solving", () => {
  it("recovers a unique integer denominator from published percentages", () => {
    const rows = rowsForDenominator(67, [67, 61, 53, 42, 31, 22, 14, 7, 3]);
    const result = solveTeamDenominator(rows, OFF);
    expect(result.status).toBe("resolved");
    expect(result.denominator).toBe(67);
    expect(result.candidates).toEqual([67]);
  });

  it("solves offense and defense independently in the same team-game", () => {
    const offense = rowsForDenominator(72, [72, 61, 48, 33, 19, 8]);
    const defense = rowsForDenominator(59, [59, 51, 45, 30, 17, 6], { unit: "defense" });
    const merged = offense.map((row, index) => ({ ...row, ...defense[index], offenseSnaps: row.offenseSnaps, offensePct: row.offensePct }));
    expect(solveTeamDenominator(merged, OFF).denominator).toBe(72);
    expect(solveTeamDenominator(merged, DEF).denominator).toBe(59);
  });

  it("resolves correctly when no player took every snap, where max(snaps) is short", () => {
    // Mirrors the audited BAL wk4 / MIA wk6 / SF wk11 shape: true N = 55 but the
    // busiest player only played 53, so max(player snaps) would report 53.
    const rows = rowsForDenominator(55, [53, 51, 47, 38, 26, 15, 9, 4]);
    const result = solveTeamDenominator(rows, OFF);
    expect(result.denominator).toBe(55);
    expect(Math.max(...rows.map((row) => row.offenseSnaps))).toBe(53);
    expect(result.denominator).not.toBe(Math.max(...rows.map((row) => row.offenseSnaps)));
  });

  it("handles the .005 rounding boundary that a strict tolerance would reject", () => {
    // 74/80 = 0.925 sits exactly on the boundary and can publish either way.
    const rows = [
      { offenseSnaps: 74, offensePct: 0.92 },
      { offenseSnaps: 80, offensePct: 1 },
      { offenseSnaps: 40, offensePct: 0.5 },
      { offenseSnaps: 20, offensePct: 0.25 },
    ];
    const result = solveTeamDenominator(rows, OFF);
    expect(result.status).toBe("resolved");
    expect(result.denominator).toBe(80);
    expect(DENOMINATOR_TOLERANCE).toBeGreaterThan(0.005);
  });

  it("reports ambiguity instead of picking a candidate", () => {
    // A single low-information constraint admits many denominators.
    const result = solveTeamDenominator([{ offenseSnaps: 1, offensePct: 0.01 }], OFF);
    expect(result.status).toBe("ambiguous");
    expect(result.denominator).toBeNull();
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it("reports unsolved when no denominator satisfies every constraint", () => {
    const result = solveTeamDenominator(
      [
        { offenseSnaps: 60, offensePct: 1 },
        { offenseSnaps: 30, offensePct: 0.25 },
      ],
      OFF
    );
    expect(result.status).toBe("unsolved");
    expect(result.denominator).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("ignores zero-snap rows, which constrain nothing", () => {
    const rows = [
      ...rowsForDenominator(70, [70, 55, 33]),
      { offenseSnaps: 0, offensePct: 0, defenseSnaps: 0, defensePct: 0 },
    ];
    const result = solveTeamDenominator(rows, OFF);
    expect(result.denominator).toBe(70);
    expect(result.constraintCount).toBe(3);
  });

  it("reports no-constraints when a unit was never on the field", () => {
    const result = solveTeamDenominator([{ defenseSnaps: 0, defensePct: 0 }], DEF);
    expect(result.status).toBe("no-constraints");
  });
});

describe("real 2025 snap data", () => {
  const rows = parseSnapRows(parseCsv(readFileSync(SNAP_CACHE, "utf-8")), { season: 2025 }).rows;
  const { denominators, failures, resolvedCount, teamGameCount } = resolveAllDenominators(rows);

  it("resolves every regular-season team-game uniquely for both units", () => {
    expect(failures).toEqual([]);
    expect(teamGameCount).toBe(544);
    expect(resolvedCount).toBe(1088);
  });

  it("differs from max(player snaps) on the audited edge cases", () => {
    const cases = [
      ["2025_04_BAL_KC", "BAL", 55],
      ["2025_06_LAC_MIA", "MIA", 59],
      ["2025_11_SF_ARI", "SF", 55],
    ];
    for (const [gameId, team, expected] of cases) {
      const solved = denominators.get(`${gameId}|${team}`);
      const maxSnaps = Math.max(
        ...rows.filter((row) => row.gameId === gameId && row.team === team).map((row) => row.offenseSnaps)
      );
      expect(solved.offense, `${gameId} ${team}`).toBe(expected);
      expect(solved.offense, `${gameId} ${team} vs max`).toBeGreaterThan(maxSnaps);
    }
  });

  it("reproduces published percentages from the solved denominator", () => {
    const sample = rows.find((row) => row.gameId === "2025_11_NYJ_NE" && row.pfrId === "LandHa00");
    const solved = denominators.get("2025_11_NYJ_NE|NE");
    expect(Math.round((sample.defenseSnaps / solved.defense) * 100) / 100).toBe(sample.defensePct);
  });
});

describe("season aggregation", () => {
  const denominators = new Map([
    ["G1|AAA", { gameId: "G1", team: "AAA", week: 1, offense: 60, defense: 55 }],
    ["G2|AAA", { gameId: "G2", team: "AAA", week: 2, offense: 80, defense: 70 }],
    ["G3|AAA", { gameId: "G3", team: "AAA", week: 3, offense: 70, defense: 65 }],
  ]);

  const playerRows = [
    { gameId: "G1", team: "AAA", week: 1, offenseSnaps: 60, offensePct: 1, defenseSnaps: 0, defensePct: 0 },
    { gameId: "G2", team: "AAA", week: 2, offenseSnaps: 20, offensePct: 0.25, defenseSnaps: 0, defensePct: 0 },
  ];

  it("sums numerators and denominators exactly rather than averaging weekly rates", () => {
    const result = aggregateSeasonSnaps(playerRows, denominators, { beforeWeek: 3 });
    // (60 + 20) / (60 + 80) = 57.14%, not the mean of 100% and 25% (62.5%).
    expect(result.offensePct).toBeCloseTo((100 * 80) / 140, 10);
    expect(result.offensePct).not.toBeCloseTo(62.5, 3);
    expect(result.offenseSnaps).toBe(80);
    expect(result.offenseTeamSnaps).toBe(140);
    expect(result.gamesIncluded).toBe(2);
  });

  it("excludes games at or after the analyzed week", () => {
    const result = aggregateSeasonSnaps(playerRows, denominators, { beforeWeek: 2 });
    expect(result.gamesIncluded).toBe(1);
    expect(result.offenseTeamSnaps).toBe(60);
  });

  it("ignores games the player did not dress for, in both numerator and denominator", () => {
    // The player has no G3 row; G3's 70 team snaps must not enter the denominator.
    const result = aggregateSeasonSnaps(playerRows, denominators, { beforeWeek: 4 });
    expect(result.gameIds).toEqual(["G1", "G2"]);
    expect(result.offenseTeamSnaps).toBe(140);
  });

  it("returns null when the unit was never played", () => {
    const result = aggregateSeasonSnaps(playerRows, denominators, { beforeWeek: 4 });
    expect(result.defensePct).toBe(0);
    expect(aggregateSeasonSnaps([], denominators, { beforeWeek: 4 }).offensePct).toBeNull();
  });
});

describe("last game selection", () => {
  const teamRows = [
    { gameId: "G1", week: 1 },
    { gameId: "G2", week: 2 },
    { gameId: "G4", week: 4 },
  ];

  it("picks the most recent completed game before the analyzed week", () => {
    expect(findLastTeamGame(teamRows, { beforeWeek: 5 })).toEqual({ week: 4, gameId: "G4" });
  });

  it("skips a bye naturally", () => {
    // Week 3 was a bye: no row exists, so week 2 is correctly the last game.
    expect(findLastTeamGame(teamRows, { beforeWeek: 4 })).toEqual({ week: 2, gameId: "G2" });
  });

  it("returns null before the first game", () => {
    expect(findLastTeamGame(teamRows, { beforeWeek: 1 })).toBeNull();
  });
});

describe("last game percentage", () => {
  it("uses the source-published percentage verbatim", () => {
    const row = { offensePct: 0.76, defensePct: 0 };
    expect(lastGameSnapPct(row, "offense")).toBeCloseTo(76, 10);
  });

  it("returns 0 for a player who dressed and took no unit snaps", () => {
    expect(lastGameSnapPct({ offensePct: 0, defensePct: 0.81 }, "offense")).toBe(0);
  });

  it("returns null for a player absent from the snap table", () => {
    expect(lastGameSnapPct(null, "offense")).toBeNull();
    expect(lastGameSnapPct(undefined, "defense")).toBeNull();
  });

  it("never falls back to the other unit", () => {
    expect(lastGameSnapPct({ offensePct: 0, defensePct: 0.9 }, "offense")).toBe(0);
  });
});

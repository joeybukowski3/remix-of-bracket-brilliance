import { describe, expect, it } from "vitest";
import { buildFantasyAllowedRows } from "./buildRows";
import { makeHistoricalPlayerWeek } from "./__fixtures__/historicalPlayerWeek";

const TEAMS = ["buf", "mia", "nyj"];

describe("buildFantasyAllowedRows", () => {
  it("builds independent 2026 and 2025 samples from season-tagged rows", () => {
    const rows = [
      makeHistoricalPlayerWeek({ position: "RB", opponent: "buf", season: 2025, week: 1, actualFantasyPoints: 10 }),
      makeHistoricalPlayerWeek({ position: "RB", opponent: "buf", season: 2026, week: 1, actualFantasyPoints: 40 }),
    ];
    const result = buildFantasyAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2025"].rb?.fantasyPointsAllowedPerGame).toBe(10);
    expect(buf.samples["2026"].rb?.fantasyPointsAllowedPerGame).toBe(40);
  });

  it("rolls the last5 sample backward from 2026 into 2025 when 2026 has fewer than 5 games", () => {
    const rows = [
      makeHistoricalPlayerWeek({ position: "QB", opponent: "buf", season: 2025, week: 15, actualFantasyPoints: 15 }),
      makeHistoricalPlayerWeek({ position: "QB", opponent: "buf", season: 2025, week: 16, actualFantasyPoints: 16 }),
      makeHistoricalPlayerWeek({ position: "QB", opponent: "buf", season: 2025, week: 17, actualFantasyPoints: 17 }),
      makeHistoricalPlayerWeek({ position: "QB", opponent: "buf", season: 2026, week: 1, actualFantasyPoints: 20 }),
      makeHistoricalPlayerWeek({ position: "QB", opponent: "buf", season: 2026, week: 2, actualFantasyPoints: 22 }),
    ];
    const result = buildFantasyAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples.last5.qb?.gamesSampled).toBe(5);
    expect(buf.samples.last5.qb?.fantasyPointsAllowedTotal).toBe(15 + 16 + 17 + 20 + 22);
  });

  it("leaves wideWr/slotWr null for 2025 and last5 (no historical alignment split), populated only for 2026 snapshot", () => {
    const result = buildFantasyAllowedRows({
      historicalRows: [],
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
      slotWideSnapshot: new Map([["buf", { slotPpgAllowed: 8, widePpgAllowed: 12 }]]),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2025"].wideWr).toBeNull();
    expect(buf.samples["2025"].slotWr).toBeNull();
    expect(buf.samples.last5.wideWr).toBeNull();
    expect(buf.samples["2026"].wideWr).toMatchObject({ fantasyPointsAllowedPerGame: 12, source: "razzball-slot-wide-snapshot" });
    expect(buf.samples["2026"].slotWr).toMatchObject({ fantasyPointsAllowedPerGame: 8, source: "razzball-slot-wide-snapshot" });
  });

  it("joins each team's current opponent and location from the opponents lookup", () => {
    const opponents = new Map([
      ["buf", { opponent: "mia" as const, location: "@" as const }],
      ["mia", { opponent: "buf" as const, location: "vs" as const }],
    ]);
    const result = buildFantasyAllowedRows({
      historicalRows: [],
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents,
    });
    expect(result.find((row) => row.team === "buf")).toMatchObject({ opponent: "mia", location: "@" });
    expect(result.find((row) => row.team === "mia")).toMatchObject({ opponent: "buf", location: "vs" });
    expect(result.find((row) => row.team === "nyj")).toMatchObject({ opponent: null, location: null });
  });

  it("emits exactly one row per requested team, in the given order", () => {
    const result = buildFantasyAllowedRows({
      historicalRows: [],
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    expect(result.map((row) => row.team)).toEqual(TEAMS);
  });
});

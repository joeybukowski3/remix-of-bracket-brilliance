import { describe, expect, it } from "vitest";
import { makeHistoricalPlayerWeek } from "@/lib/nfl/fantasyAllowed/__fixtures__/historicalPlayerWeek";
import { buildPositionMatchupRows } from "./buildRows";
import { computeEdge } from "./edge";
import { computeRating } from "./rating";

const TEAMS = ["buf", "mia", "nyj"];

function opponentLookup(entries: Record<string, { opponent: string | null; location: "@" | "vs" | null }>) {
  return new Map(Object.entries(entries));
}

describe("buildPositionMatchupRows", () => {
  it("aggregates FOR from the team's own offense and ALLOWED from the opponent defense", () => {
    const rows = [
      // BUF's WRs score 20 total vs MIA in week 1 2026 -> BUF FOR includes this, MIA ALLOWED includes this.
      makeHistoricalPlayerWeek({ team: "buf", opponent: "mia", season: 2026, week: 1, position: "WR", actualFantasyPoints: 12 }),
      makeHistoricalPlayerWeek({ team: "buf", opponent: "mia", season: 2026, week: 1, position: "WR", actualFantasyPoints: 8 }),
      // NYJ's WRs score less.
      makeHistoricalPlayerWeek({ team: "nyj", opponent: "mia", season: 2026, week: 1, position: "WR", actualFantasyPoints: 5 }),
    ];

    const result = buildPositionMatchupRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: opponentLookup({ buf: { opponent: "mia", location: "@" } }),
    });

    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.opponent).toBe("mia");
    expect(buf.location).toBe("@");
    // BUF scored 20, NYJ scored 5; MIA never appears as an offense so it has zero
    // sampled games and is excluded from ranking (never a fabricated rank).
    expect(buf.samples["2026"].wr.forRank).toBe(2);
    expect(buf.samples["2026"].wr.forPerGame).toBe(20);

    const mia = result.find((row) => row.team === "mia")!;
    // BUF and NYJ both nominally "play" MIA in week 1 in this fixture, so their WR
    // points collapse into the single (opponent=mia, 2026, wk1) game key -- 25 total,
    // and MIA is the only team with any sampled defensive games here.
    expect(mia.samples["2026"].wr.allowedRank).toBe(1);
    expect(mia.samples["2026"].wr.allowedPerGame).toBe(25);
  });

  it("produces a WR aggregate directly from raw WR rows, not a wide/slot blend", () => {
    const rows = [makeHistoricalPlayerWeek({ team: "buf", opponent: "mia", season: 2026, week: 1, position: "WR", actualFantasyPoints: 14 })];
    const result = buildPositionMatchupRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: opponentLookup({}),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2026"].wr.forGamesSampled).toBe(1);
    expect(buf.samples["2026"].wr.forPerGame).toBe(14);
  });

  it("computes edge and rating from the resolved FOR/ALLOWED ranks for every position", () => {
    const rows = [
      makeHistoricalPlayerWeek({ team: "buf", opponent: "mia", season: 2026, week: 1, position: "QB", actualFantasyPoints: 25 }),
      makeHistoricalPlayerWeek({ team: "nyj", opponent: "buf", season: 2026, week: 1, position: "QB", actualFantasyPoints: 10 }),
      makeHistoricalPlayerWeek({ team: "mia", opponent: "buf", season: 2026, week: 1, position: "QB", actualFantasyPoints: 5 }),
    ];
    const result = buildPositionMatchupRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: opponentLookup({}),
    });
    const buf = result.find((row) => row.team === "buf")!;
    const cell = buf.samples["2026"].qb;
    expect(cell.edge).toBe(computeEdge(cell.forRank, cell.allowedRank));
    expect(cell.rating).toBe(computeRating(cell.edge));
  });

  it("populates all four sample windows for each row", () => {
    const result = buildPositionMatchupRows({
      historicalRows: [],
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: opponentLookup({}),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(Object.keys(buf.samples).sort()).toEqual(["2025", "2026", "last5", "last8"]);
  });

  it("leaves FOR/ALLOWED/edge null for teams with zero sampled games rather than fabricating a rank", () => {
    const result = buildPositionMatchupRows({
      historicalRows: [],
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: opponentLookup({}),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2026"].te.forRank).toBeNull();
    expect(buf.samples["2026"].te.allowedRank).toBeNull();
    expect(buf.samples["2026"].te.edge).toBeNull();
    expect(buf.samples["2026"].te.rating).toBeNull();
  });

  it("rolls last8 backward into the prior season when fewer than 8 current-season games exist", () => {
    const rows = [
      makeHistoricalPlayerWeek({ team: "buf", opponent: "mia", season: 2025, week: 18, position: "RB", actualFantasyPoints: 10 }),
      makeHistoricalPlayerWeek({ team: "buf", opponent: "nyj", season: 2026, week: 1, position: "RB", actualFantasyPoints: 12 }),
    ];
    const result = buildPositionMatchupRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: opponentLookup({}),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples.last8.rb.forGamesSampled).toBe(2);
  });
});

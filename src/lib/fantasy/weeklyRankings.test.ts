import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWeekOpponentMap,
  buildWeeklyRankingRows,
  DEFAULT_WEEKLY_RANKING_POSITION,
  formatOpponentLabel,
  WEEKLY_RANKING_POSITIONS,
  WEEKLY_RANKINGS_WEEK,
  WEEKLY_STAT_COLUMNS,
  type TeamStatResolver,
  type WeeklyOpponent,
} from "@/lib/fantasy/weeklyRankings";
import { getPointsAllowedTeam } from "@/lib/fantasy/pointsAllowed2025";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";
import type { NflGameRecord } from "@/lib/nfl/standings";

/** The real committed 2026 schedule — never a second hand-written fixture. */
const GAMES: NflGameRecord[] = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/nfl/2026/games.json"), "utf-8"),
).games;

const WEEK_ONE = buildWeekOpponentMap(GAMES, WEEKLY_RANKINGS_WEEK);

/** Deterministic stub so row assembly is tested without the NFL artifacts. */
const stubStats: TeamStatResolver = (teamAbbr, column) => ({
  display: `${teamAbbr}:${column.id}`,
  raw: 1,
  rank: 1,
  percentile: 50,
});

/** Resolver that always fails, standing in for a missing artifact. */
const noStats: TeamStatResolver = () => null;

function rowsFor(position: (typeof WEEKLY_RANKING_POSITIONS)[number]) {
  return buildWeeklyRankingRows(position, WEEK_ONE, stubStats);
}

function findPlayer(position: (typeof WEEKLY_RANKING_POSITIONS)[number], player: string) {
  const row = rowsFor(position).find((entry) => entry.player === player);
  expect(row, `${player} should be in the ${position} board`).toBeTruthy();
  return row!;
}

describe("buildWeekOpponentMap", () => {
  it("maps all 32 teams for week 1 of the real schedule", () => {
    expect(WEEK_ONE.size).toBe(32);
  });

  it("records both sides of a game with opposite home/away", () => {
    // 2026_01_TB_CIN — Tampa Bay at Cincinnati.
    expect(WEEK_ONE.get("cin")).toMatchObject({ opponentAbbr: "tb", isHome: true });
    expect(WEEK_ONE.get("tb")).toMatchObject({ opponentAbbr: "cin", isHome: false });
  });

  it("carries the neutral-site flag from the schedule", () => {
    // 2026_01_SF_LA is played at Melbourne Cricket Ground.
    expect(WEEK_ONE.get("sf")?.neutralSite).toBe(true);
    expect(WEEK_ONE.get("lar")?.neutralSite).toBe(true);
    expect(WEEK_ONE.get("cin")?.neutralSite).toBe(false);
  });

  it("ignores other weeks and non-regular-season games", () => {
    const weekTwo = buildWeekOpponentMap(GAMES, 2);
    expect(weekTwo.get("cin")?.opponentAbbr).not.toBe("tb");

    const postseason: NflGameRecord[] = [
      { ...GAMES[0], gameId: "x", week: 1, seasonType: "WC", homeAbbr: "cin", awayAbbr: "buf" },
    ];
    expect(buildWeekOpponentMap(postseason, 1).size).toBe(0);
  });
});

describe("formatOpponentLabel", () => {
  const base: WeeklyOpponent = {
    gameId: "g",
    opponentAbbr: "tb",
    isHome: true,
    neutralSite: false,
  };

  it("renders home, away and neutral notation", () => {
    expect(formatOpponentLabel(base)).toBe("vs TB");
    expect(formatOpponentLabel({ ...base, isHome: false })).toBe("@ TB");
    expect(formatOpponentLabel({ ...base, neutralSite: true })).toBe("N TB");
  });

  it("renders a dash when there is no opponent", () => {
    expect(formatOpponentLabel(null)).toBe("—");
  });
});

describe("buildWeeklyRankingRows ordering", () => {
  it.each(WEEKLY_RANKING_POSITIONS)("orders %s by projected PPG descending", (position) => {
    const rows = rowsFor(position);
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].projectedPpg).toBeGreaterThanOrEqual(rows[i].projectedPpg);
    }
    expect(rows.map((row) => row.rank)).toEqual(rows.map((_, index) => index + 1));
  });

  // The core V1 contract: matchup context is display-only.
  it.each(WEEKLY_RANKING_POSITIONS)(
    "%s order is identical whether or not matchup data resolves",
    (position) => {
      const withMatchups = rowsFor(position);
      const withoutStats = buildWeeklyRankingRows(position, WEEK_ONE, noStats);
      const withoutSchedule = buildWeeklyRankingRows(position, new Map(), noStats);

      const order = (rows: ReturnType<typeof rowsFor>) => rows.map((row) => row.key);
      expect(order(withoutStats)).toEqual(order(withMatchups));
      expect(order(withoutSchedule)).toEqual(order(withMatchups));
    },
  );

  it("does not let a great matchup outrank a higher PPG player", () => {
    const rows = rowsFor("WR");
    const graded = rows.filter((row) => row.grade?.id === "great");
    expect(graded.length).toBeGreaterThan(0);
    for (const row of graded) {
      const ahead = rows.filter((other) => other.rank < row.rank);
      for (const better of ahead) {
        expect(better.projectedPpg).toBeGreaterThanOrEqual(row.projectedPpg);
      }
    }
  });

  it("opens on QB", () => {
    expect(DEFAULT_WEEKLY_RANKING_POSITION).toBe("QB");
    expect(WEEKLY_RANKING_POSITIONS).toEqual(["QB", "RB", "WR", "TE"]);
  });
});

describe("buildWeeklyRankingRows joins", () => {
  it("resolves week 1 opponents for known players", () => {
    expect(findPlayer("QB", "Josh Allen")).toMatchObject({
      teamAbbr: "buf",
      opponentLabel: "@ HOU",
    });
    expect(findPlayer("WR", "Ja'Marr Chase")).toMatchObject({
      teamAbbr: "cin",
      opponentLabel: "vs TB",
    });
    expect(findPlayer("RB", "Jahmyr Gibbs")).toMatchObject({
      teamAbbr: "det",
      opponentLabel: "vs NO",
    });
    expect(findPlayer("TE", "Brock Bowers")).toMatchObject({
      teamAbbr: "lv",
      opponentLabel: "vs MIA",
    });
  });

  it("renders neutral-site notation for the Week 1 international game", () => {
    expect(findPlayer("RB", "Christian McCaffrey").opponentLabel).toBe("N LAR");
    expect(findPlayer("WR", "Puka Nacua").opponentLabel).toBe("N SF");
  });

  it("reads fantasy points allowed for the row's own position, not a shared one", () => {
    // Both face Tampa Bay in week 1; each must read its own position's column.
    const chase = findPlayer("WR", "Ja'Marr Chase");
    const burrow = findPlayer("QB", "Joe Burrow");
    const tampa = getPointsAllowedTeam("tb")!;

    expect(chase.fpa).toEqual(tampa.byPosition.WR);
    expect(burrow.fpa).toEqual(tampa.byPosition.QB);
    expect(chase.fpa).not.toEqual(burrow.fpa);
  });

  it("grades from the opponent's own FPA rank", () => {
    for (const position of WEEKLY_RANKING_POSITIONS) {
      for (const row of rowsFor(position)) {
        if (!row.fpa) continue;
        expect(row.grade).not.toBeNull();
        expect(row.fpa.rank).toBeGreaterThanOrEqual(row.grade!.minRank);
        expect(row.fpa.rank).toBeLessThanOrEqual(row.grade!.maxRank);
      }
    }
  });

  it("resolves every player in the current universe to a week 1 matchup", () => {
    for (const position of WEEKLY_RANKING_POSITIONS) {
      const unresolved = rowsFor(position).filter((row) => row.unresolvedReason);
      expect(unresolved, `${position} unresolved`).toEqual([]);
    }
  });

  it("returns one stat slot per configured column for the position", () => {
    for (const position of WEEKLY_RANKING_POSITIONS) {
      const columns = WEEKLY_STAT_COLUMNS[position];
      for (const row of rowsFor(position)) {
        expect(row.stats).toHaveLength(columns.length);
        expect(row.stats[0]?.display).toBe(`${row.teamAbbr}:${columns[0].id}`);
      }
    }
  });

  it("declares an explicit direction on every column, matching the canonical catalogue", () => {
    for (const position of WEEKLY_RANKING_POSITIONS) {
      for (const column of WEEKLY_STAT_COLUMNS[position]) {
        expect(column.direction, `${position}.${column.id} must declare a direction`).toBeTruthy();
        const canonical = getMetricDef(column.metricKey);
        expect(canonical, `${column.metricKey} missing from the metric catalogue`).toBeTruthy();
        expect(column.direction, `${column.metricKey} direction drifted`).toBe(canonical!.direction);
      }
    }
  });

  it("gives QB, RB, WR and TE their own column sets", () => {
    expect(WEEKLY_STAT_COLUMNS.QB.map((c) => c.id)).toEqual(["passEpa", "rushEpa", "ypa"]);
    expect(WEEKLY_STAT_COLUMNS.RB.map((c) => c.id)).toEqual(["rushEpa", "ypc", "rushSuccess"]);
    expect(WEEKLY_STAT_COLUMNS.WR.map((c) => c.id)).toEqual(["passEpa", "ypa", "passYards"]);
    expect(WEEKLY_STAT_COLUMNS.TE.map((c) => c.id)).toEqual(["passEpa", "ypa"]);
  });
});

describe("unresolved players fail safely", () => {
  it("marks a player whose team has no game that week without dropping the row", () => {
    const scheduleWithoutBuffalo = new Map(WEEK_ONE);
    scheduleWithoutBuffalo.delete("buf");
    const rows = buildWeeklyRankingRows("QB", scheduleWithoutBuffalo, stubStats);
    const allen = rows.find((row) => row.player === "Josh Allen")!;

    expect(allen.rank).toBe(1);
    expect(allen.projectedPpg).toBeGreaterThan(0);
    expect(allen.unresolvedReason).toBe("no-game");
    expect(allen.opponent).toBeNull();
    expect(allen.opponentLabel).toBe("—");
    expect(allen.fpa).toBeNull();
    expect(allen.grade).toBeNull();
    // The team is still known, so team-context stats still resolve.
    expect(allen.stats[0]).not.toBeNull();
  });

  it("keeps every row and every rank when the whole schedule is missing", () => {
    const withSchedule = rowsFor("TE");
    const withoutSchedule = buildWeeklyRankingRows("TE", new Map(), stubStats);

    expect(withoutSchedule).toHaveLength(withSchedule.length);
    expect(withoutSchedule.every((row) => row.unresolvedReason === "no-game")).toBe(true);
    expect(withoutSchedule.every((row) => row.grade === null)).toBe(true);
    expect(withoutSchedule.map((row) => row.rank)).toEqual(withSchedule.map((row) => row.rank));
  });

  it("renders N/A-able nulls rather than throwing when the stat resolver fails", () => {
    const rows = buildWeeklyRankingRows("RB", WEEK_ONE, noStats);
    expect(rows[0].stats.every((stat) => stat === null)).toBe(true);
    expect(rows[0].projectedPpg).toBeGreaterThan(0);
  });
});

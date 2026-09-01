import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MATCHUP_METRIC_DEFS,
  MATCHUP_METRIC_KEYS,
  aggregateTeamWindow,
  buildCompletedGameIndex,
  computeRanks,
  passerRating,
  roundTo,
  selectWindowGames,
  windowId,
} from "../../../scripts/lib/nfl-matchup-metrics.mjs";
import { parseAdvancedTeamStatRows } from "../../../scripts/lib/nfl-advanced-stats.mjs";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";
import {
  DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS,
  resolveSampleComposition,
} from "@/lib/nfl/matchupSampleWindow";

const ROOT = resolve(__dirname, "../../..");
const TEAMS_JSON = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8"));

const CURRENT = 2026;
const PRIOR = 2025;

// ---------------------------------------------------------------------------
// Synthetic schedule helpers — full control over completion, byes and ordering.
// ---------------------------------------------------------------------------

function makeSeason(season: number, weeks: number[], opts: { team?: string; finalWeeks?: number[] } = {}) {
  const team = opts.team ?? "ne";
  const finalWeeks = opts.finalWeeks ?? weeks;
  const games = weeks.map((week) => ({
    gameId: `${season}_${String(week).padStart(2, "0")}_${team.toUpperCase()}_OPP`,
    season,
    week,
    seasonType: "REG",
    dateUtc: `${season}-09-${String(week).padStart(2, "0")}T17:00:00.000Z`,
  }));
  const results = weeks.map((week) => ({
    gameId: `${season}_${String(week).padStart(2, "0")}_${team.toUpperCase()}_OPP`,
    seasonType: "REG",
    final: finalWeeks.includes(week),
    homeAbbr: team,
    awayAbbr: "opp",
    homeScore: 20 + week,
    awayScore: 10,
  }));
  return { season, games, results };
}

function weeksOf(selected: { week: number; season: number }[]) {
  return selected.map((g) => `${g.season}w${g.week}`);
}

function select(priorWeeks: number[], currentWeeks: number[], mode: string, includePriorSeason: boolean) {
  const index = buildCompletedGameIndex([
    makeSeason(PRIOR, priorWeeks),
    makeSeason(CURRENT, currentWeeks),
  ]);
  return selectWindowGames(index.get("ne") ?? [], {
    mode,
    includePriorSeason,
    currentSeason: CURRENT,
    priorSeason: PRIOR,
  });
}

const FULL_PRIOR = [11, 12, 13, 14, 15, 16, 17, 18];

// ---------------------------------------------------------------------------

describe("rolling blend window selection", () => {
  it("uses the last 8 completed prior-season games before the current season starts", () => {
    const selected = select(FULL_PRIOR, [], "season", true);
    expect(selected).toHaveLength(8);
    expect(weeksOf(selected)).toEqual(FULL_PRIOR.map((w) => `2025w${w}`));
  });

  it.each([
    [1, 7, 1],
    [2, 6, 2],
    [3, 5, 3],
    [4, 4, 4],
    [5, 3, 5],
    [6, 2, 6],
    [7, 1, 7],
    [8, 0, 8],
  ])(
    "after %i completed current-season games the sample is %i prior + %i current",
    (played, expectPrior, expectCurrent) => {
      const currentWeeks = Array.from({ length: played }, (_, i) => i + 1);
      const selected = select(FULL_PRIOR, currentWeeks, "season", true);

      expect(selected).toHaveLength(8);
      expect(selected.filter((g) => g.season === PRIOR)).toHaveLength(expectPrior);
      expect(selected.filter((g) => g.season === CURRENT)).toHaveLength(expectCurrent);

      // Prior-season contribution is always the *latest* prior games.
      const priorWeeks = selected.filter((g) => g.season === PRIOR).map((g) => g.week);
      expect(priorWeeks).toEqual(FULL_PRIOR.slice(8 - expectPrior));
    }
  );

  it("drops the prior season entirely from the eighth current-season game onward", () => {
    for (const played of [8, 9, 12, 17]) {
      const currentWeeks = Array.from({ length: played }, (_, i) => i + 1);
      const selected = select(FULL_PRIOR, currentWeeks, "season", true);
      expect(selected.every((g) => g.season === CURRENT)).toBe(true);
      expect(selected).toHaveLength(8);
    }
  });

  it("matches the UI-side composition helper for every game count", () => {
    for (let played = 0; played <= 12; played += 1) {
      const currentWeeks = Array.from({ length: played }, (_, i) => i + 1);
      for (const mode of ["season", "last5"] as const) {
        for (const includePriorSeason of [true, false]) {
          const selected = select(FULL_PRIOR, currentWeeks, mode, includePriorSeason);
          const expected = resolveSampleComposition(played, { window: mode, includePriorSeason });
          expect(
            {
              current: selected.filter((g) => g.season === CURRENT).length,
              prior: selected.filter((g) => g.season === PRIOR).length,
            },
            `${mode}/${includePriorSeason}/${played}`
          ).toEqual({ current: expected.currentSeasonGames, prior: expected.priorSeasonGames });
        }
      }
    }
  });
});

describe("prior-season-full window (power-ratings 2025 tab)", () => {
  it("selects every completed prior-season game and no current-season game", () => {
    const selected = select(FULL_PRIOR, [1, 2, 3, 4], "priorSeasonFull", true);
    expect(selected).toHaveLength(FULL_PRIOR.length);
    expect(selected.every((g) => g.season === PRIOR)).toBe(true);
  });

  it("is empty when the prior season has no completed games", () => {
    expect(select([], [1, 2, 3], "priorSeasonFull", true)).toHaveLength(0);
  });

  it("has a stable window id", () => {
    expect(windowId("priorSeasonFull", true)).toBe("prior-season-full");
  });
});

describe("blend OFF", () => {
  it("uses only current-season games and is uncapped for the season window", () => {
    expect(select(FULL_PRIOR, [], "season", false)).toHaveLength(0);
    expect(select(FULL_PRIOR, [1, 2, 3], "season", false)).toHaveLength(3);
    const twelve = select(FULL_PRIOR, Array.from({ length: 12 }, (_, i) => i + 1), "season", false);
    expect(twelve).toHaveLength(12);
    expect(twelve.every((g) => g.season === CURRENT)).toBe(true);
  });

  it("never reaches into the prior season for Last 5", () => {
    expect(select(FULL_PRIOR, [], "last5", false)).toHaveLength(0);
    const two = select(FULL_PRIOR, [1, 2], "last5", false);
    expect(two).toHaveLength(2);
    expect(two.every((g) => g.season === CURRENT)).toBe(true);
  });
});

describe("Last 5 window", () => {
  it("crosses the season boundary while the blend is on", () => {
    expect(weeksOf(select(FULL_PRIOR, [], "last5", true))).toEqual([
      "2025w14", "2025w15", "2025w16", "2025w17", "2025w18",
    ]);
    expect(weeksOf(select(FULL_PRIOR, [1], "last5", true))).toEqual([
      "2025w15", "2025w16", "2025w17", "2025w18", "2026w1",
    ]);
    expect(weeksOf(select(FULL_PRIOR, [1, 2, 3], "last5", true))).toEqual([
      "2025w17", "2025w18", "2026w1", "2026w2", "2026w3",
    ]);
  });

  it("stops using the prior season once five current games exist", () => {
    const selected = select(FULL_PRIOR, [1, 2, 3, 4, 5], "last5", true);
    expect(selected.every((g) => g.season === CURRENT)).toBe(true);
  });
});

describe("schedule edge cases", () => {
  it("skips bye weeks naturally by counting completed games, not weeks", () => {
    // Week 14 missing entirely — the window reaches back to week 10 instead.
    const priorWeeks = [10, 11, 12, 13, 15, 16, 17, 18];
    const selected = select(priorWeeks, [], "season", true);
    expect(weeksOf(selected)).toEqual(priorWeeks.map((w) => `2025w${w}`));
    expect(selected.map((g) => g.week)).not.toContain(14);
  });

  it("excludes games that are scheduled but not final", () => {
    const index = buildCompletedGameIndex([
      makeSeason(PRIOR, [15, 16, 17, 18], { finalWeeks: [15, 16] }),
    ]);
    const games = index.get("ne") ?? [];
    expect(games.map((g) => g.week)).toEqual([15, 16]);
  });

  it("excludes the postseason", () => {
    const base = makeSeason(PRIOR, [17, 18]);
    base.games.push({
      gameId: "2025_19_NE_OPP", season: PRIOR, week: 19, seasonType: "POST",
      dateUtc: "2026-01-11T17:00:00.000Z",
    } as never);
    base.results.push({
      gameId: "2025_19_NE_OPP", seasonType: "POST", final: true,
      homeAbbr: "ne", awayAbbr: "opp", homeScore: 30, awayScore: 20,
    } as never);

    const games = buildCompletedGameIndex([base]).get("ne") ?? [];
    expect(games.map((g) => g.week)).toEqual([17, 18]);
  });

  it("returns a short window when fewer than eight prior games exist", () => {
    const selected = select([16, 17, 18], [], "season", true);
    expect(selected).toHaveLength(3);
  });

  it("orders games chronologically rather than by week number", () => {
    const index = buildCompletedGameIndex([makeSeason(PRIOR, [18, 16, 17])]);
    expect((index.get("ne") ?? []).map((g) => g.week)).toEqual([16, 17, 18]);
  });
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const HEADER = [
  "season", "week", "team", "season_type", "game_id", "opponent_team",
  "completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions",
  "sacks_suffered", "sack_yards_lost", "sack_fumbles", "sack_fumbles_lost",
  "passing_air_yards", "passing_yards_after_catch", "passing_first_downs", "passing_epa",
  "carries", "rushing_yards", "rushing_tds", "rushing_fumbles", "rushing_fumbles_lost",
  "rushing_first_downs", "rushing_epa", "receiving_fumbles_lost",
  "def_sacks", "def_interceptions", "fumble_recovery_opp",
];

type StatRow = Record<string, string | number>;

function csvRow(overrides: StatRow): string {
  const base: StatRow = {
    season: PRIOR, week: 1, team: "NE", season_type: "REG",
    game_id: "2025_01_NE_SEA", opponent_team: "SEA",
    completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, passing_interceptions: 0,
    sacks_suffered: 0, sack_yards_lost: 0, sack_fumbles: 0, sack_fumbles_lost: 0,
    passing_air_yards: 0, passing_yards_after_catch: 0, passing_first_downs: 0, passing_epa: 0,
    carries: 0, rushing_yards: 0, rushing_tds: 0, rushing_fumbles: 0, rushing_fumbles_lost: 0,
    rushing_first_downs: 0, rushing_epa: 0, receiving_fumbles_lost: 0,
    def_sacks: 0, def_interceptions: 0, fumble_recovery_opp: 0,
  };
  const merged = { ...base, ...overrides };
  return HEADER.map((h) => String(merged[h])).join(",");
}

function buildRows(rows: StatRow[]) {
  const csv = [HEADER.join(","), ...rows.map(csvRow)].join("\n");
  const parsed = parseAdvancedTeamStatRows(csv, TEAMS_JSON, { season: PRIOR, seasonType: "REG" });
  const byGameTeam = new Map<string, unknown>();
  for (const row of parsed) byGameTeam.set(`${row.source.game_id}|${row.team}`, row);
  return byGameTeam;
}

describe("aggregation", () => {
  // Two games with deliberately different rates so an unweighted mean of the
  // per-game rates would give a different (wrong) answer than the true ratio.
  const rowsByGameTeam = buildRows([
    {
      game_id: "2025_01_NE_SEA", week: 1, team: "NE", opponent_team: "SEA",
      completions: 20, attempts: 30, passing_yards: 300, passing_tds: 3, passing_interceptions: 1,
      sacks_suffered: 2, carries: 20, rushing_yards: 100, rushing_fumbles_lost: 1,
      def_sacks: 4, def_interceptions: 2, fumble_recovery_opp: 1,
    },
    {
      game_id: "2025_01_NE_SEA", week: 1, team: "SEA", opponent_team: "NE",
      completions: 10, attempts: 40, passing_yards: 200, passing_tds: 0, passing_interceptions: 2,
      sacks_suffered: 4, carries: 10, rushing_yards: 20,
    },
    {
      game_id: "2025_02_NE_SEA", week: 2, team: "NE", opponent_team: "SEA",
      completions: 10, attempts: 10, passing_yards: 100, passing_tds: 1, passing_interceptions: 0,
      sacks_suffered: 0, carries: 40, rushing_yards: 300,
      def_sacks: 0, def_interceptions: 0, fumble_recovery_opp: 1,
    },
    {
      game_id: "2025_02_NE_SEA", week: 2, team: "SEA", opponent_team: "NE",
      completions: 20, attempts: 20, passing_yards: 100, passing_tds: 1, passing_interceptions: 0,
      sacks_suffered: 0, carries: 30, rushing_yards: 130,
    },
  ]);

  const selected = [
    { gameId: "2025_01_NE_SEA", team: "ne", opponent: "sea", pointsFor: 30, pointsAgainst: 10, season: PRIOR, week: 1 },
    { gameId: "2025_02_NE_SEA", team: "ne", opponent: "sea", pointsFor: 20, pointsAgainst: 20, season: PRIOR, week: 2 },
  ];

  const { values, totals } = aggregateTeamWindow(selected, rowsByGameTeam);

  it("recomputes ratios from summed numerators and denominators", () => {
    // plays = (30+2+20) + (10+0+40) = 52 + 50 = 102; yards = 400 + 400 = 800
    expect(totals.offPlays).toBe(102);
    expect(totals.offYards).toBe(800);
    expect(values["off.yardsPerPlay"]).toBeCloseTo(800 / 102, 10);

    // A mean of per-game rates would be (400/52 + 400/50)/2 = 7.8462 — different.
    const meanOfRates = (400 / 52 + 400 / 50) / 2;
    expect(values["off.yardsPerPlay"]).not.toBeCloseTo(meanOfRates, 4);
  });

  it("computes play mix from summed plays and sums to 100%", () => {
    // pass plays = 32 + 10 = 42; rush plays = 20 + 40 = 60
    expect(values["off.passPlayRate"]).toBeCloseTo((42 / 102) * 100, 10);
    expect(values["off.rushPlayRate"]).toBeCloseTo((60 / 102) * 100, 10);
    expect(values["off.passPlayRate"]! + values["off.rushPlayRate"]!).toBeCloseTo(100, 10);
  });

  it("computes per-attempt and per-game offense values", () => {
    expect(values["off.yardsPerPassAttempt"]).toBeCloseTo(400 / 40, 10);
    expect(values["off.yardsPerRushAttempt"]).toBeCloseTo(400 / 60, 10);
    expect(values["off.passAttemptsPerGame"]).toBeCloseTo(40 / 2, 10);
    expect(values["off.rushAttemptsPerGame"]).toBeCloseTo(60 / 2, 10);
    expect(values["off.passYardsPerGame"]).toBeCloseTo(400 / 2, 10);
    expect(values["off.rushYardsPerGame"]).toBeCloseTo(400 / 2, 10);
    expect(values["off.sacksAllowedPerGame"]).toBeCloseTo(2 / 2, 10);
    expect(values["off.pointsPerGame"]).toBeCloseTo(50 / 2, 10);
  });

  it("counts turnovers and takeaways from the right columns", () => {
    // 1 INT thrown + 1 rushing fumble lost
    expect(values["off.turnoversPerGame"]).toBeCloseTo(2 / 2, 10);
    // def INT 2 + opponent fumble recoveries 1 + 1
    expect(values["def.takeawaysPerGame"]).toBeCloseTo(4 / 2, 10);
  });

  it("derives defensive values from the opponent rows in the same games", () => {
    // SEA plays = (40+4+10) + (20+0+30) = 54 + 50 = 104; yards = 220 + 230 = 450
    expect(values["def.yardsPerPlayAllowed"]).toBeCloseTo(450 / 104, 10);
    expect(values["def.opponentYardsPerPassAttempt"]).toBeCloseTo(300 / 60, 10);
    expect(values["def.opponentPassYardsPerGame"]).toBeCloseTo(300 / 2, 10);
    expect(values["def.opponentYardsPerRushAttempt"]).toBeCloseTo(150 / 40, 10);
    expect(values["def.opponentRushAttemptsPerGame"]).toBeCloseTo(40 / 2, 10);
    expect(values["def.opponentRushYardsPerGame"]).toBeCloseTo(150 / 2, 10);
    expect(values["def.pointsAllowedPerGame"]).toBeCloseTo(30 / 2, 10);
  });

  it("reads sacks generated off the opponent's sacks-taken column, matching def_sacks", () => {
    // Opponent took 4 + 0 sacks; NE's own def_sacks column also totals 4.
    expect(values["def.sacksPerGame"]).toBeCloseTo(4 / 2, 10);
    expect(totals.ownDefSacks).toBe(4);
    expect(values["def.sacksPerGame"]).toBeCloseTo(totals.ownDefSacks / 2, 10);
  });

  it("reports missing opponent rows instead of silently aggregating a partial join", () => {
    const orphan = [
      { gameId: "2025_09_NE_XXX", team: "ne", opponent: "sea", pointsFor: 10, pointsAgainst: 7, season: PRIOR, week: 9 },
    ];
    const result = aggregateTeamWindow(orphan, rowsByGameTeam);
    expect(result.missing).toHaveLength(1);
    expect(result.totals.games).toBe(0);
  });

  it("returns null rather than zero when a denominator is empty", () => {
    const empty = aggregateTeamWindow([], rowsByGameTeam);
    for (const key of MATCHUP_METRIC_KEYS) {
      expect(empty.values[key], key).toBeNull();
    }
  });
});

describe("passer rating", () => {
  it("computes the standard NFL formula from aggregate totals", () => {
    // A perfect-rating line: 158.3
    expect(passerRating(10, 10, 200, 5, 0)).toBeCloseTo(158.3, 1);
    // A zero-rating line: 0.0
    expect(passerRating(0, 20, 0, 0, 10)).toBeCloseTo(0, 5);
  });

  it("clamps each component to the 0-2.375 bounds", () => {
    // Absurd yardage cannot push the rating past the theoretical maximum.
    expect(passerRating(100, 100, 100000, 100, 0)).toBeCloseTo(158.3, 1);
  });

  it("matches a hand-computed ordinary line", () => {
    // 20/30, 300 yds, 3 TD, 1 INT
    const a = (20 / 30 - 0.3) * 5;
    const b = (300 / 30 - 3) * 0.25;
    const c = (3 / 30) * 20;
    const d = 2.375 - (1 / 30) * 25;
    const expected = ((a + Math.min(b, 2.375) + c + d) / 6) * 100;
    expect(passerRating(20, 30, 300, 3, 1)).toBeCloseTo(expected, 8);
  });

  it("returns null with no attempts rather than dividing by zero", () => {
    expect(passerRating(0, 0, 0, 0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

describe("ranking", () => {
  it("ranks higher-is-better metrics with the largest value first", () => {
    const ranks = computeRanks({ a: 6.5, b: 5.0, c: 7.2 }, "higher-is-better");
    expect(ranks).toEqual({ c: 1, a: 2, b: 3 });
  });

  it("ranks lower-is-better metrics with the smallest value first", () => {
    const ranks = computeRanks({ a: 6.5, b: 5.0, c: 7.2 }, "lower-is-better");
    expect(ranks).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("uses competition ranking so ties share a rank and the next rank is skipped", () => {
    const ranks = computeRanks({ a: 10, b: 9, c: 9, d: 8 }, "higher-is-better");
    expect(ranks).toEqual({ a: 1, b: 2, c: 2, d: 4 });
  });

  it("ranks on unrounded values so display rounding cannot change order", () => {
    // Both display as 5.12 but are genuinely different.
    const ranks = computeRanks({ a: 5.1249, b: 5.1151 }, "higher-is-better");
    expect(roundTo(5.1249, 2)).toBe(roundTo(5.1151, 2));
    expect(ranks).toEqual({ a: 1, b: 2 });
  });

  it("excludes null values instead of ranking them last", () => {
    const ranks = computeRanks({ a: 5, b: null, c: 3 } as never, "higher-is-better");
    expect(ranks).toEqual({ a: 1, c: 2 });
    expect(ranks).not.toHaveProperty("b");
  });

  it("returns no ranks when nothing has a value", () => {
    expect(computeRanks({ a: null, b: null } as never, "higher-is-better")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Catalogue consistency
// ---------------------------------------------------------------------------

describe("generator/UI catalogue consistency", () => {
  it("declares the same direction as the UI metric catalogue for every metric", () => {
    for (const key of MATCHUP_METRIC_KEYS) {
      const uiDef = getMetricDef(key);
      expect(uiDef, `${key} missing from the UI catalogue`).not.toBeNull();
      expect(MATCHUP_METRIC_DEFS[key].direction, key).toBe(uiDef!.direction);
    }
  });

  it("marks play-mix and volume metrics as context-only so they never get a quality tier", () => {
    for (const key of [
      "off.passPlayRate",
      "off.rushPlayRate",
      "off.passAttemptsPerGame",
      "off.rushAttemptsPerGame",
      "def.opponentRushAttemptsPerGame",
    ]) {
      expect(MATCHUP_METRIC_DEFS[key].direction, key).toBe("context-only");
    }
  });

  it("does not implement any explicitly deferred metric", () => {
    const deferred = [
      "off.epaPerPlay", "off.successRate", "off.firstDownsPerPlay", "off.thirdDownConversion",
      "off.timeOfPossession", "off.passBlockWinRate", "off.runBlockWinRate",
      "def.epaPerPlayAllowed", "def.successRateAllowed", "def.firstDownsPerPlayAllowed",
      "def.thirdDownConversionAllowed", "def.passRushWinRate", "def.runStopWinRate",
      "mkt.atsRecord", "mkt.overUnderRecord",
    ];
    for (const key of deferred) {
      expect(MATCHUP_METRIC_KEYS, `${key} must stay deferred`).not.toContain(key);
    }
  });

  it("builds the window id the resolver expects", () => {
    expect(windowId("season", true)).toBe("season-blend");
    expect(windowId("last5", false)).toBe("last5-current");
    expect(windowId(DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS.window, DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS.includePriorSeason)).toBe(
      "season-blend"
    );
  });
});

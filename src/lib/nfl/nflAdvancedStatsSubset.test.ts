import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  aggregateAdvancedTeamMetrics,
  computeAdvancedTeamMetrics,
  computeAdvancedTeamMetricsForTeamWeeks,
  parseAdvancedTeamStatRows,
} from "../../../scripts/lib/nfl-advanced-stats.mjs";

const ROOT = resolve(__dirname, "../../..");
const TEAMS_JSON = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")
);
const COMPLETED_SEASONS = [2022, 2023, 2024, 2025];
const REGULAR_WEEKS = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18];
const HEADER = [
  "season",
  "week",
  "team",
  "season_type",
  "opponent_team",
  "attempts",
  "sacks_suffered",
  "carries",
  "passing_yards",
  "rushing_yards",
  "passing_interceptions",
  "sack_fumbles_lost",
  "rushing_fumbles_lost",
  "receiving_fumbles_lost",
  "passing_epa",
  "rushing_epa",
  "def_interceptions",
  "fumble_recovery_opp",
].join(",");

type RowOverrides = Partial<{
  attempts: number;
  sacksSuffered: number;
  carries: number;
  passingYards: number;
  rushingYards: number;
  passingInterceptions: number;
  sackFumblesLost: number;
  rushingFumblesLost: number;
  receivingFumblesLost: number;
  passingEpa: number | string;
  rushingEpa: number;
  defensiveInterceptions: number;
  opponentFumbleRecoveries: number;
}>;

function weeklyRow(
  season: number,
  week: number,
  team: string,
  opponent: string,
  seasonType = "REG",
  overrides: RowOverrides = {}
) {
  const values = {
    attempts: 20 + (week % 4),
    sacksSuffered: 2,
    carries: 18 + (week % 5),
    passingYards: 180 + week * 3,
    rushingYards: 75 + week,
    passingInterceptions: week % 2,
    sackFumblesLost: week % 3 === 0 ? 1 : 0,
    rushingFumblesLost: 0,
    receivingFumblesLost: week % 5 === 0 ? 1 : 0,
    passingEpa: team === "BUF" ? week * 0.7 : week * -0.25,
    rushingEpa: team === "BUF" ? 1.5 : -0.5,
    defensiveInterceptions: week % 2,
    opponentFumbleRecoveries: week % 4 === 0 ? 1 : 0,
    ...overrides,
  };
  return [
    season,
    week,
    team,
    seasonType,
    opponent,
    values.attempts,
    values.sacksSuffered,
    values.carries,
    values.passingYards,
    values.rushingYards,
    values.passingInterceptions,
    values.sackFumblesLost,
    values.rushingFumblesLost,
    values.receivingFumblesLost,
    values.passingEpa,
    values.rushingEpa,
    values.defensiveInterceptions,
    values.opponentFumbleRecoveries,
  ].join(",");
}

const FIXTURE_CSV = [
  HEADER,
  ...COMPLETED_SEASONS.flatMap((season) => [
    ...REGULAR_WEEKS.flatMap((week) => [
      weeklyRow(season, week, "BUF", "MIA"),
      weeklyRow(season, week, "MIA", "BUF"),
    ]),
    weeklyRow(season, 19, "BUF", "MIA", "POST"),
    weeklyRow(season, 19, "MIA", "BUF", "POST"),
  ]),
].join("\n");

const LEGACY_KEYS = [
  "offensiveEpaPerPlay",
  "defensiveEpaPerPlay",
  "yardsPerPlay",
  "yardsAllowedPerPlay",
  "offensivePlays",
  "defensivePlays",
  "turnovers",
  "takeaways",
  "turnoverDifferential",
] as const;

type NormalizedRow = ReturnType<typeof parseAdvancedTeamStatRows>[number];

function regularRows(season: number) {
  return parseAdvancedTeamStatRows(FIXTURE_CSV, TEAMS_JSON, {
    season,
    seasonType: "REG",
  });
}

function keysFor(rows: NormalizedRow[], team: string | null = null) {
  return rows
    .filter((row) => team == null || row.team === team)
    .map((row) => ({ season: row.season, week: row.week, team: row.team }));
}

function legacyProjection(metrics: Map<string, Record<string, unknown>>) {
  return new Map(
    [...metrics].map(([team, values]) => [
      team,
      Object.fromEntries(LEGACY_KEYS.map((key) => [key, values[key]])),
    ])
  );
}

// This synthetic fixture proves equivalence to the legacy aggregation function.
// It cannot prove equality with checked-in team-stats.json artifacts because the
// original stats_team_week_2022.csv through stats_team_week_2025.csv inputs are not checked in.
describe("NFL advanced-stat full-season compatibility", () => {
  it.each(COMPLETED_SEASONS)(
    "%i all-REG team-week keys reproduce the legacy full-season contract",
    (season) => {
      const rows = regularRows(season);
      const subset = aggregateAdvancedTeamMetrics(rows, {
        season,
        teamsJson: TEAMS_JSON,
        teamWeekKeys: keysFor(rows),
      });
      const legacy = computeAdvancedTeamMetrics(FIXTURE_CSV, season, TEAMS_JSON)!;

      expect(legacyProjection(subset)).toEqual(legacy);
      expect(subset.get("buf")).toMatchObject({
        gamesRepresented: REGULAR_WEEKS.length,
        weeksRepresented: REGULAR_WEEKS,
      });
      expect(subset.get("mia")).toMatchObject({
        gamesRepresented: REGULAR_WEEKS.length,
        weeksRepresented: REGULAR_WEEKS,
      });
    }
  );
});

describe("NFL advanced-stat arbitrary team-week subsets", () => {
  const season = 2025;
  const rows = regularRows(season);

  function aggregateWeeks(weeks: number[]) {
    return aggregateAdvancedTeamMetrics(rows, {
      season,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: weeks.map((week) => ({ season, week, team: "buf" })),
    });
  }

  it("aggregates a one-week subset", () => {
    const metrics = aggregateWeeks([4]).get("buf")!;
    expect(metrics.gamesRepresented).toBe(1);
    expect(metrics.weeksRepresented).toEqual([4]);
  });

  it("aggregates multi-week and nonconsecutive subsets", () => {
    expect(aggregateWeeks([1, 2, 4]).get("buf")).toMatchObject({
      gamesRepresented: 3,
      weeksRepresented: [1, 2, 4],
    });
    expect(aggregateWeeks([2, 10, 18]).get("buf")).toMatchObject({
      gamesRepresented: 3,
      weeksRepresented: [2, 10, 18],
    });
  });

  it("accepts a final-eight-like explicit key set without fixed-week assumptions", () => {
    const finalEight = REGULAR_WEEKS.slice(-8);
    expect(aggregateWeeks(finalEight).get("buf")).toMatchObject({
      gamesRepresented: 8,
      weeksRepresented: finalEight,
    });
  });

  it("is independent of selector order", () => {
    const keys = keysFor(rows, "buf").slice(-8);
    const forward = aggregateAdvancedTeamMetrics(rows, {
      season,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: keys,
    });
    const reverse = aggregateAdvancedTeamMetrics(rows, {
      season,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: [...keys].reverse(),
    });
    expect(reverse).toEqual(forward);
  });
});

describe("NFL advanced-stat defensive join and aggregation math", () => {
  const season = 2025;
  const rows = regularRows(season);

  it("maps only the matching opponent offense to the selected team's defense", () => {
    const week = 8;
    const bufRow = rows.find((row) => row.team === "buf" && row.week === week)!;
    const miaRow = rows.find((row) => row.team === "mia" && row.week === week)!;
    const metrics = aggregateAdvancedTeamMetrics(rows, {
      season,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: [{ season, week, team: "buf" }],
    });
    const buf = metrics.get("buf")!;
    const expectedDefense =
      (miaRow.passingEpa + miaRow.rushingEpa) /
      (miaRow.attempts + miaRow.sacksSuffered + miaRow.carries);

    expect(buf.defensiveEpaPerPlay).toBeCloseTo(expectedDefense, 4);
    expect(buf.offensiveEpaPerPlay).not.toBeCloseTo(expectedDefense, 4);
    expect(metrics.has("mia")).toBe(false);
    expect(buf.offensivePlays).toBe(
      bufRow.attempts + bufRow.sacksSuffered + bufRow.carries
    );
  });

  it("keeps the defensive join symmetrical when both team rows are selected", () => {
    const week = 8;
    const selected = rows.filter((row) => row.week === week);
    const metrics = aggregateAdvancedTeamMetrics(rows, {
      season,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: keysFor(selected),
    });

    expect(metrics.get("buf")!.defensiveEpaPerPlay).toBe(
      metrics.get("mia")!.offensiveEpaPerPlay
    );
    expect(metrics.get("mia")!.defensiveEpaPerPlay).toBe(
      metrics.get("buf")!.offensiveEpaPerPlay
    );
  });

  it("preserves play-count weighting for total, passing, and rushing EPA", () => {
    const selected = rows.filter(
      (row) => row.team === "buf" && [2, 18].includes(row.week)
    );
    const metrics = aggregateAdvancedTeamMetrics(rows, {
      season,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: keysFor(selected),
    }).get("buf")!;
    const passingEpa = selected.reduce((sum, row) => sum + row.passingEpa, 0);
    const rushingEpa = selected.reduce((sum, row) => sum + row.rushingEpa, 0);
    const passingPlays = selected.reduce(
      (sum, row) => sum + row.attempts + row.sacksSuffered,
      0
    );
    const rushingPlays = selected.reduce((sum, row) => sum + row.carries, 0);

    expect(metrics.offensiveEpaPerPlay).toBeCloseTo(
      (passingEpa + rushingEpa) / (passingPlays + rushingPlays),
      4
    );
    expect(metrics.passingEpaPerPlay).toBeCloseTo(passingEpa / passingPlays, 4);
    expect(metrics.rushingEpaPerPlay).toBeCloseTo(rushingEpa / rushingPlays, 4);
    expect(metrics.netEpaPerPlay).toBeCloseTo(
      metrics.offensiveEpaPerPlay - metrics.defensiveEpaPerPlay,
      4
    );
  });

  it("keeps turnover aggregation consistent", () => {
    const selected = rows.filter(
      (row) => row.team === "buf" && [4, 10, 18].includes(row.week)
    );
    const metrics = aggregateAdvancedTeamMetrics(rows, {
      season,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: keysFor(selected),
    }).get("buf")!;
    const turnovers = selected.reduce(
      (sum, row) =>
        sum +
        row.passingInterceptions +
        row.sackFumblesLost +
        row.rushingFumblesLost +
        row.receivingFumblesLost,
      0
    );
    const takeaways = selected.reduce(
      (sum, row) => sum + row.defensiveInterceptions + row.opponentFumbleRecoveries,
      0
    );

    expect(metrics).toMatchObject({
      turnovers,
      takeaways,
      turnoverDifferential: takeaways - turnovers,
    });
  });
});

describe("NFL advanced-stat explicit failures", () => {
  it("reports every missing requested team-week key", () => {
    expect(() =>
      computeAdvancedTeamMetricsForTeamWeeks(FIXTURE_CSV, 2025, TEAMS_JSON, [
        { season: 2025, week: 3, team: "buf" },
        { season: 2025, week: 5, team: "mia" },
      ])
    ).toThrow(/2025:week-3:buf.*2025:week-5:mia/);
  });

  it("rejects empty selectors and unknown or missing teams", () => {
    expect(() =>
      computeAdvancedTeamMetricsForTeamWeeks(FIXTURE_CSV, 2025, TEAMS_JSON, [])
    ).toThrow(/non-empty/);
    expect(() =>
      computeAdvancedTeamMetricsForTeamWeeks(FIXTURE_CSV, 2025, TEAMS_JSON, [
        { season: 2025, week: 1, team: "zzz" },
      ])
    ).toThrow(/Unknown team abbreviation "zzz"/);
    expect(() =>
      computeAdvancedTeamMetricsForTeamWeeks("", 2025, TEAMS_JSON, [
        { season: 2025, week: 1, team: "buf" },
      ])
    ).toThrow(/source is empty/);
  });

  it("rejects duplicate selector keys instead of double-counting", () => {
    const key = { season: 2025, week: 1, team: "buf" };
    expect(() =>
      computeAdvancedTeamMetricsForTeamWeeks(FIXTURE_CSV, 2025, TEAMS_JSON, [key, key])
    ).toThrow(/Duplicate selector key 2025:week-1:buf/);
  });

  it("rejects duplicate source rows instead of silently overwriting", () => {
    const lines = FIXTURE_CSV.split("\n");
    const duplicateCsv = [...lines, lines[1]].join("\n");
    expect(() => computeAdvancedTeamMetrics(duplicateCsv, 2022, TEAMS_JSON)).toThrow(
      /Duplicate source row for 2022:week-1:buf/
    );
  });

  it("rejects malformed numeric EPA without coercing it to zero", () => {
    const malformedCsv = [
      HEADER,
      weeklyRow(2025, 1, "BUF", "MIA", "REG", { passingEpa: "NA" }),
      weeklyRow(2025, 1, "MIA", "BUF"),
    ].join("\n");
    expect(() => computeAdvancedTeamMetrics(malformedCsv, 2025, TEAMS_JSON)).toThrow(
      /Missing required numeric field "passing_epa"/
    );
  });

  it("does not let an unrelated malformed POST row block a REG subset", () => {
    const csv = [
      HEADER,
      weeklyRow(2025, 1, "BUF", "MIA"),
      weeklyRow(2025, 1, "MIA", "BUF"),
      weeklyRow(2025, 19, "BUF", "MIA", "POST", { passingEpa: "NA" }),
    ].join("\n");

    expect(
      computeAdvancedTeamMetricsForTeamWeeks(csv, 2025, TEAMS_JSON, [
        { season: 2025, week: 1, team: "buf" },
      ]).get("buf")
    ).toMatchObject({ gamesRepresented: 1, weeksRepresented: [1] });
  });

  it("rejects unknown source teams and opponents", () => {
    const unknownTeam = [
      HEADER,
      weeklyRow(2025, 1, "XXX", "MIA"),
      weeklyRow(2025, 1, "MIA", "XXX"),
    ].join("\n");
    const unknownOpponent = [
      HEADER,
      weeklyRow(2025, 1, "BUF", "XXX"),
      weeklyRow(2025, 1, "MIA", "BUF"),
    ].join("\n");

    expect(() => computeAdvancedTeamMetrics(unknownTeam, 2025, TEAMS_JSON)).toThrow(
      /Unknown nflverse team code "XXX"/
    );
    expect(() => computeAdvancedTeamMetrics(unknownOpponent, 2025, TEAMS_JSON)).toThrow(
      /Unknown opponent code "XXX"/
    );
  });

  it("rejects a missing or mismatched opponent row", () => {
    const missingOpponent = [HEADER, weeklyRow(2025, 1, "BUF", "MIA")].join("\n");
    const mismatchedOpponent = [
      HEADER,
      weeklyRow(2025, 1, "BUF", "MIA"),
      weeklyRow(2025, 1, "MIA", "NE"),
    ].join("\n");

    expect(() => computeAdvancedTeamMetrics(missingOpponent, 2025, TEAMS_JSON)).toThrow(
      /Missing opponent row for MIA week 1/
    );
    expect(() => computeAdvancedTeamMetrics(mismatchedOpponent, 2025, TEAMS_JSON)).toThrow(
      /Opponent row mismatch for BUF week 1/
    );
  });
});

describe("NFL advanced-stat data safety and postseason probe", () => {
  it("does not mutate parsed input and repeated calls are deterministic", () => {
    const parsed = regularRows(2025);
    const rows = Object.freeze([...parsed]);
    const snapshot = JSON.stringify(rows);
    const options = {
      season: 2025,
      teamsJson: TEAMS_JSON,
      teamWeekKeys: keysFor(parsed, "buf").slice(0, 3),
    };
    const first = aggregateAdvancedTeamMetrics(rows, options);

    expect(aggregateAdvancedTeamMetrics(rows, options)).toEqual(first);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(JSON.stringify(first)).not.toMatch(/NaN|Infinity/);
  });

  it("retains POST-shaped rows but never mixes them into default REG output", () => {
    // The repository has no cached upstream weekly CSV; its checked-in fixture
    // only proves REG availability. POST is therefore compatibility-tested as
    // a retained source shape, not claimed as an observed upstream value.
    const seasonRows = parseAdvancedTeamStatRows(FIXTURE_CSV, TEAMS_JSON, {
      season: 2025,
    });
    const regular = aggregateAdvancedTeamMetrics(seasonRows, {
      season: 2025,
      teamsJson: TEAMS_JSON,
    });
    const postseason = aggregateAdvancedTeamMetrics(seasonRows, {
      season: 2025,
      seasonType: "POST",
      teamsJson: TEAMS_JSON,
      teamWeekKeys: [{ season: 2025, week: 19, team: "buf" }],
    });

    expect(new Set(seasonRows.map((row) => row.seasonType))).toEqual(
      new Set(["REG", "POST"])
    );
    expect(regular.get("buf")).toMatchObject({
      gamesRepresented: REGULAR_WEEKS.length,
      weeksRepresented: REGULAR_WEEKS,
    });
    expect(postseason.get("buf")).toMatchObject({
      gamesRepresented: 1,
      weeksRepresented: [19],
    });
  });
});

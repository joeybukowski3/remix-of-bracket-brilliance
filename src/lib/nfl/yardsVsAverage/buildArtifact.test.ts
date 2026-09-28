import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { gameDelta } from "./aggregate";
import { buildYardsVsAverageArtifact } from "./buildArtifact";
import { playerWeek } from "./__fixtures__/playerWeek";
import { YARDS_VS_AVERAGE_METRIC_KEYS, YARDS_VS_AVERAGE_SCHEMA_VERSION, type YardsVsAverageArtifact } from "./types";
import { validateYardsVsAverageArtifact } from "./validate";

const TEAMS = ["aaa", "bbb", "ccc", "ddd"];
// Round-robin pairings, cycled by week.
const PAIRINGS: readonly (readonly [string, string])[][] = [
  [["aaa", "bbb"], ["ccc", "ddd"]],
  [["aaa", "ccc"], ["bbb", "ddd"]],
  [["aaa", "ddd"], ["bbb", "ccc"]],
];

/** Deterministic, team/season/week-dependent yardage so every baseline differs. */
function offenseRows(season: number, week: number, team: string, opponent: string): HistoricalPlayerWeek[] {
  const seed = TEAMS.indexOf(team) * 7 + week * 3 + (season - 2025) * 11;
  const common = { season, week, team, opponent };
  return [
    playerWeek({ ...common, position: "QB", pass: 180 + seed * 4, rush: (seed % 5) * 6, playerId: `${team}-qb` }),
    playerWeek({ ...common, position: "RB", rush: 70 + seed * 2, rec: 15 + (seed % 4) * 5, playerId: `${team}-rb` }),
    playerWeek({ ...common, position: "WR", rec: 70 + seed * 2, playerId: `${team}-wr1` }),
    playerWeek({ ...common, position: "WR", rec: 40 + seed, playerId: `${team}-wr2` }),
    // TE production only in even weeks: odd weeks exercise the zero-fill path.
    ...(week % 2 === 0 ? [playerWeek({ ...common, position: "TE", rec: 30 + seed, playerId: `${team}-te` })] : []),
  ];
}

function weekRows(season: number, week: number, skipLastGame = false): HistoricalPlayerWeek[] {
  const pairs = PAIRINGS[(week - 1) % PAIRINGS.length].slice(0, skipLastGame ? 1 : undefined);
  return pairs.flatMap(([home, away]) => [...offenseRows(season, week, home, away), ...offenseRows(season, week, away, home)]);
}

const SEASON_2025 = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((week) => weekRows(2025, week));
const FULL_2026 = [...SEASON_2025, ...weekRows(2026, 1), ...weekRows(2026, 2), ...weekRows(2026, 3)];
// Week 3's second game (bbb vs ccc) has not been published yet (e.g. MNF).
const PARTIAL_2026 = [...SEASON_2025, ...weekRows(2026, 1), ...weekRows(2026, 2), ...weekRows(2026, 3, true)];

function build(rows: HistoricalPlayerWeek[], generatedAt = "2026-09-28T00:00:00.000Z"): YardsVsAverageArtifact {
  return buildYardsVsAverageArtifact({ rows, teams: TEAMS, season: 2026, week: 3, opponents: new Map(), generatedAt });
}

describe("buildYardsVsAverageArtifact", () => {
  it("is deterministic: same cache = same values, no double counting on rebuild (G)", () => {
    const first = build(FULL_2026, "a");
    const second = build(FULL_2026, "b");
    expect({ ...second, generatedAt: "a" }).toEqual(first);
    expect(first.schemaVersion).toBe(YARDS_VS_AVERAGE_SCHEMA_VERSION);
    expect(first.baselinePolicy.version).toBe("nfl-comparison-blend-v1");
    expect(first.games).toHaveLength((9 + 3) * 4);
    expect(new Set(first.games.map((game) => game.key)).size).toBe(first.games.length);
  });

  it("only includes games present in the refreshed cache (H)", () => {
    const artifact = build(PARTIAL_2026);
    const current = (team: string) => artifact.rows.find((row) => row.team === team)!.samples["2026"].rush.gamesSampled;
    expect(TEAMS.map(current)).toEqual([3, 2, 2, 3]);
    expect(artifact.games.some((game) => game.season === 2026 && game.week === 3 && game.defense === "bbb")).toBe(false);
  });

  it("keeps zero-TE games in the sample instead of dropping them (J)", () => {
    const artifact = build(FULL_2026);
    const aaa2025 = artifact.rows.find((row) => row.team === "aaa")!.samples["2025"];
    expect(aaa2025.teRec.gamesSampled).toBe(9);
    expect(aaa2025.teRec.gamesSampled).toBe(aaa2025.pass.gamesSampled);
    expect(artifact.games.filter((game) => game.week % 2 === 1).every((game) => game.actual.teRec === 0)).toBe(true);
  });

  it("aggregates Last 8 across seasons using each game's own-season baseline (K)", () => {
    const artifact = build(FULL_2026);
    const games = artifact.games.filter((game) => game.defense === "aaa")
      .sort((a, b) => b.season - a.season || b.week - a.week).slice(0, 8);
    expect(games.filter((game) => game.season === 2025)).toHaveLength(5);
    // A 2025 game's baseline is the offense's other 2025 games only.
    const sample2025 = games.find((game) => game.season === 2025)!;
    const others = artifact.games.filter((game) => game.season === 2025 && game.offense === sample2025.offense && game.week !== sample2025.week);
    expect(sample2025.baseline!.pass).toBeCloseTo(others.reduce((sum, game) => sum + game.actual.pass, 0) / others.length, 1);

    const last8 = artifact.rows.find((row) => row.team === "aaa")!.samples.last8.pass;
    const mean = games.reduce((sum, game) => sum + gameDelta(game, "pass")!, 0) / games.length;
    expect(last8.gamesSampled).toBe(8);
    expect(last8.deltaYds).toBe(Math.round(mean * 10) / 10);
  });

  it("covers every metric for every team and sample, with QB RUSH % always null", () => {
    const artifact = build(FULL_2026);
    for (const row of artifact.rows) {
      for (const sample of Object.values(row.samples)) {
        expect(Object.keys(sample).sort()).toEqual([...YARDS_VS_AVERAGE_METRIC_KEYS].sort());
        expect(sample.qbRush.deltaPct).toBeNull();
        expect(sample.qbRush.rankPct).toBeNull();
      }
    }
  });
});

describe("validateYardsVsAverageArtifact", () => {
  const context = (rows: HistoricalPlayerWeek[]) => ({ expected: build(rows), rows, teams: TEAMS, season: 2026 });

  it("accepts a fresh build", () => {
    expect(validateYardsVsAverageArtifact(build(PARTIAL_2026), context(PARTIAL_2026))).toEqual([]);
  });

  it("flags a stale artifact that no longer matches the cache", () => {
    const problems = validateYardsVsAverageArtifact(build(PARTIAL_2026), context(FULL_2026));
    expect(problems.some((problem) => problem.includes("player-week cache has"))).toBe(true);
    expect(problems.some((problem) => problem.includes("does not match a rebuild"))).toBe(true);
  });

  it("flags duplicate games, dropped metric groups, non-finite numbers and unsuppressed QB RUSH %", () => {
    const artifact = structuredClone(build(FULL_2026)) as YardsVsAverageArtifact & { games: YardsVsAverageArtifact["games"][number][] };
    const games = [...artifact.games, artifact.games[0]];
    const { teRec: _dropped, ...withoutTe } = games[1].actual;
    games[1] = { ...games[1], actual: withoutTe as typeof games[1]["actual"] };
    games[2] = { ...games[2], baseline: { ...games[2].baseline!, pass: Number.NaN } };
    const rows = artifact.rows.map((row, index) => index === 0
      ? { ...row, samples: { ...row.samples, "2026": { ...row.samples["2026"], qbRush: { ...row.samples["2026"].qbRush, deltaPct: 5, rankPct: 1 } } } }
      : row);
    const problems = validateYardsVsAverageArtifact({ ...artifact, games, rows }, context(FULL_2026)).join("\n");
    expect(problems).toMatch(/duplicate game key/);
    expect(problems).toMatch(/actual\.teRec missing/);
    expect(problems).toMatch(/non-finite numbers/);
    expect(problems).toMatch(/% must be suppressed/);
  });

  it("flags missing team rows", () => {
    const artifact = build(FULL_2026);
    const problems = validateYardsVsAverageArtifact({ ...artifact, rows: artifact.rows.slice(1) }, context(FULL_2026));
    expect(problems).toContain("missing team rows: aaa");
  });
});

import { describe, it, expect } from "vitest";
import {
  aggregateDownsPlays,
  classifyDownsPlay,
  downsWindowMetrics,
  emptyDownsTotals,
  addDownsTotals,
  mirrorProblems,
  parseDownsCompactRow,
  serializeDownsCompact,
  validateDownsTeamGames,
} from "../../../scripts/lib/nfl-downs-core.mjs";
import { aggregateTeamWindow, computeRanks, MATCHUP_METRIC_DEFS } from "../../../scripts/lib/nfl-matchup-metrics.mjs";
import { indexDownsTeamGames } from "../../../scripts/lib/nfl-downs-core.mjs";

type Row = Record<string, string>;

/** A live rush/pass play with nflverse's string-typed columns; override per case. */
function play(overrides: Row = {}): Row {
  return {
    game_id: "2026_01_AAA_BBB",
    season: "2026",
    season_type: "REG",
    week: "1",
    posteam: "AAA",
    defteam: "BBB",
    epa: "0.1",
    pass: "0",
    rush: "1",
    two_point_attempt: "0",
    play_type: "run",
    down: "1",
    first_down: "0",
    third_down_converted: "NA",
    third_down_failed: "NA",
    ...overrides,
  };
}

const third = (overrides: Row = {}) => play({ down: "3", ...overrides });

describe("first-down classification", () => {
  it("counts a rush that gains a first down", () => {
    expect(classifyDownsPlay(play({ first_down: "1" }))).toMatchObject({ firstDown: 1 });
  });

  it("counts a completed pass that gains a first down", () => {
    expect(classifyDownsPlay(play({ pass: "1", rush: "0", play_type: "pass", first_down: "1" }))).toMatchObject({ firstDown: 1 });
  });

  it("keeps a non-first-down play in the denominator with no first down", () => {
    expect(classifyDownsPlay(play({ first_down: "0" }))).toMatchObject({ firstDown: 0 });
  });

  it("treats a sack as an eligible pass play without a first down", () => {
    expect(classifyDownsPlay(play({ pass: "1", rush: "0", play_type: "pass", first_down: "0" }))).toMatchObject({ firstDown: 0 });
  });

  it("excludes a no_play penalty row from numerator and denominator", () => {
    expect(classifyDownsPlay(play({ play_type: "no_play", first_down: "0" }))).toBeNull();
  });

  it("excludes a nullified no_play row even when it awarded a penalty first down", () => {
    expect(classifyDownsPlay(play({ play_type: "no_play", first_down: "1" }))).toBeNull();
  });

  it("counts a first down from an accepted defensive penalty on a play that stands once", () => {
    const row = play({ pass: "1", rush: "0", play_type: "pass", first_down: "1", first_down_pass: "1", first_down_penalty: "1" });
    expect(classifyDownsPlay(row)).toMatchObject({ firstDown: 1 });
  });

  it("excludes kneels, spikes, special teams, two-point tries and rows missing first_down", () => {
    expect(classifyDownsPlay(play({ pass: "0", rush: "0", play_type: "qb_kneel" }))).toBeNull();
    expect(classifyDownsPlay(play({ pass: "0", rush: "0", play_type: "punt" }))).toBeNull();
    expect(classifyDownsPlay(play({ two_point_attempt: "1" }))).toBeNull();
    expect(classifyDownsPlay(play({ first_down: "NA" }))).toBeNull();
    expect(classifyDownsPlay(play({ epa: "NA" }))).toBeNull();
  });
});

describe("third-down classification", () => {
  it("counts a converted rush", () => {
    expect(classifyDownsPlay(third({ first_down: "1", third_down_converted: "1", third_down_failed: "0" })))
      .toEqual({ firstDown: 1, thirdAttempt: 1, thirdConversion: 1 });
  });

  it("counts a converted pass", () => {
    expect(classifyDownsPlay(third({ pass: "1", rush: "0", play_type: "pass", first_down: "1", third_down_converted: "1", third_down_failed: "0" })))
      .toEqual({ firstDown: 1, thirdAttempt: 1, thirdConversion: 1 });
  });

  it("counts a failed pass as an attempt without a conversion", () => {
    expect(classifyDownsPlay(third({ pass: "1", rush: "0", play_type: "pass", third_down_converted: "0", third_down_failed: "1" })))
      .toEqual({ firstDown: 0, thirdAttempt: 1, thirdConversion: 0 });
  });

  it("counts a third-down sack as a failed attempt", () => {
    expect(classifyDownsPlay(third({ pass: "1", rush: "0", play_type: "pass", third_down_converted: "0", third_down_failed: "1" })))
      .toMatchObject({ thirdAttempt: 1, thirdConversion: 0 });
  });

  it("counts a scramble (pass=1, play_type run) by the native flags", () => {
    expect(classifyDownsPlay(third({ pass: "1", rush: "0", play_type: "run", first_down: "1", third_down_converted: "1", third_down_failed: "0" })))
      .toMatchObject({ thirdAttempt: 1, thirdConversion: 1 });
  });

  it("counts a live-play penalty first down that nflfastR flags converted", () => {
    expect(classifyDownsPlay(third({ pass: "1", rush: "0", play_type: "pass", first_down: "1", first_down_penalty: "1", third_down_converted: "1", third_down_failed: "0" })))
      .toMatchObject({ thirdAttempt: 1, thirdConversion: 1 });
  });

  it("never counts a no_play row as an attempt, even with a penalty first down", () => {
    expect(classifyDownsPlay(third({ play_type: "no_play", first_down: "1", first_down_penalty: "1" }))).toBeNull();
  });

  it("does not count a live third-down play with neither native flag as an attempt", () => {
    expect(classifyDownsPlay(third({ third_down_converted: "0", third_down_failed: "0" }))).toMatchObject({ thirdAttempt: 0, thirdConversion: 0 });
  });

  it("excludes fourth-down plays from third-down counts", () => {
    expect(classifyDownsPlay(play({ down: "4", first_down: "1", third_down_converted: "NA", third_down_failed: "NA" })))
      .toMatchObject({ firstDown: 1, thirdAttempt: 0, thirdConversion: 0 });
  });

  it("ignores stray third-down flags on a non-third-down play", () => {
    expect(classifyDownsPlay(play({ down: "2", third_down_converted: "1" }))).toMatchObject({ thirdAttempt: 0 });
  });
});

const TEAM_MAP = new Map([
  ["AAA", { abbr: "aaa" }],
  ["BBB", { abbr: "bbb" }],
]);

function synthetic(): Row[] {
  return [
    // AAA offense: 4 plays, 2 first downs, 2 third-down attempts, 1 conversion
    play({ first_down: "1" }),
    play({ pass: "1", rush: "0", play_type: "pass", first_down: "0" }),
    third({ first_down: "1", third_down_converted: "1", third_down_failed: "0" }),
    third({ pass: "1", rush: "0", play_type: "pass", third_down_converted: "0", third_down_failed: "1" }),
    play({ play_type: "no_play", first_down: "1" }), // excluded
    play({ season_type: "POST", first_down: "1" }), // excluded (postseason)
    // BBB offense: 2 plays, 0 first downs, 1 third-down attempt, 0 conversions
    play({ posteam: "BBB", defteam: "AAA", first_down: "0" }),
    third({ posteam: "BBB", defteam: "AAA", third_down_converted: "0", third_down_failed: "1" }),
  ];
}

describe("team-game aggregation", () => {
  const { teamGames, sourceRows, eligiblePlays } = aggregateDownsPlays(synthetic(), { season: 2026, teamMap: TEAM_MAP });
  const byTeam = Object.fromEntries(teamGames.map((r: { team: string }) => [r.team, r]));

  it("aggregates offense per team-game from posteam rows", () => {
    expect(sourceRows).toBe(8);
    expect(eligiblePlays).toBe(6);
    expect(byTeam.aaa).toMatchObject({ plays: 4, firstDowns: 2, thirdAttempts: 2, thirdConversions: 1, opponent: "bbb" });
    expect(byTeam.bbb).toMatchObject({ plays: 2, firstDowns: 0, thirdAttempts: 1, thirdConversions: 0, opponent: "aaa" });
  });

  it("passes structural validation and round-trips through the compact cache", () => {
    expect(validateDownsTeamGames(teamGames)).toEqual([]);
    const lines = serializeDownsCompact(teamGames).trim().split("\n");
    const header = lines[0].split(",");
    const parsed = lines.slice(1).map((line: string) => {
      const cells = line.split(",");
      return parseDownsCompactRow(Object.fromEntries(header.map((h: string, i: number) => [h, cells[i]])));
    });
    expect(parsed).toEqual([...teamGames].sort((a: { team: string }, b: { team: string }) => a.team.localeCompare(b.team)));
  });

  it("rejects an unknown team code and impossible counts", () => {
    expect(() => aggregateDownsPlays([play({ posteam: "ZZZ" })], { season: 2026, teamMap: TEAM_MAP })).toThrow(/Unknown nflverse posteam/);
    const bad = [{ ...byTeam.aaa, thirdConversions: 9 }, byTeam.bbb];
    expect(validateDownsTeamGames(bad).join(" ")).toMatch(/exceed attempts/);
  });
});

describe("offense / defense mirror and percentages", () => {
  const { teamGames } = aggregateDownsPlays(synthetic(), { season: 2026, teamMap: TEAM_MAP });
  const index = indexDownsTeamGames(teamGames);
  const own = index.get("2026_01_AAA_BBB|aaa");
  const opp = index.get("2026_01_AAA_BBB|bbb");

  it("computes offense from own rows and defense from the opponent's rows", () => {
    const offense = addDownsTotals(emptyDownsTotals(), own);
    const defense = addDownsTotals(emptyDownsTotals(), opp);
    expect(downsWindowMetrics(offense, defense)).toEqual({
      "off.firstDownsPerPlay": 50,
      "def.firstDownsPerPlayAllowed": 0,
      "off.thirdDownConversion": 50,
      "def.thirdDownConversionAllowed": 0,
    });
  });

  it("returns null percentages when a denominator is zero", () => {
    const zero = emptyDownsTotals();
    expect(Object.values(downsWindowMetrics(zero, zero))).toEqual([null, null, null, null]);
    const noThirds = { plays: 10, firstDowns: 3, thirdAttempts: 0, thirdConversions: 0 };
    expect(downsWindowMetrics(noThirds, noThirds)).toMatchObject({ "off.firstDownsPerPlay": 30, "off.thirdDownConversion": null });
  });

  it("league offense totals equal league defense totals when both sides read the same plays", () => {
    const offense = { aaa: addDownsTotals(emptyDownsTotals(), own), bbb: addDownsTotals(emptyDownsTotals(), opp) };
    const defense = { aaa: addDownsTotals(emptyDownsTotals(), opp), bbb: addDownsTotals(emptyDownsTotals(), own) };
    expect(mirrorProblems(offense, defense)).toEqual([]);
    expect(mirrorProblems(offense, { aaa: emptyDownsTotals(), bbb: emptyDownsTotals() })).not.toEqual([]);
  });

  it("ranks offense higher-is-better and defense lower-is-better", () => {
    const values = { aaa: 50, bbb: 0 };
    expect(computeRanks(values, MATCHUP_METRIC_DEFS["off.firstDownsPerPlay"].direction)).toEqual({ aaa: 1, bbb: 2 });
    expect(computeRanks(values, MATCHUP_METRIC_DEFS["def.firstDownsPerPlayAllowed"].direction)).toEqual({ bbb: 1, aaa: 2 });
  });
});

describe("window aggregation wiring", () => {
  const { teamGames } = aggregateDownsPlays(synthetic(), { season: 2026, teamMap: TEAM_MAP });
  const downs = indexDownsTeamGames(teamGames);
  const game = { gameId: "2026_01_AAA_BBB", team: "aaa", opponent: "bbb", pointsFor: 20, pointsAgainst: 10 };
  const stats = (team: string) => ({
    team,
    source: { completions: "0", passing_tds: "0", def_sacks: "0" },
    attempts: 1, sacksSuffered: 0, carries: 1, passingYards: 0, rushingYards: 0, passingInterceptions: 0,
    sackFumblesLost: 0, rushingFumblesLost: 0, receivingFumblesLost: 0, defensiveInterceptions: 0, opponentFumbleRecoveries: 0,
    season: 2026, week: 1,
  });
  const rows = new Map([["2026_01_AAA_BBB|aaa", stats("aaa")], ["2026_01_AAA_BBB|bbb", stats("bbb")]]);

  it("produces the four down metrics from the cache for a completed game", () => {
    const { values, downs: summary } = aggregateTeamWindow([game], rows, downs);
    expect(summary.complete).toBe(true);
    expect(values["off.firstDownsPerPlay"]).toBe(50);
    expect(values["def.thirdDownConversionAllowed"]).toBe(0);
  });

  it("leaves the four metrics null, never partial, when the cache lacks a game or is absent", () => {
    const missing = aggregateTeamWindow([game], rows, new Map());
    expect(missing.values["off.thirdDownConversion"]).toBeNull();
    const absent = aggregateTeamWindow([game], rows, null);
    expect(absent.values["def.firstDownsPerPlayAllowed"]).toBeNull();
    expect(absent.values["off.yardsPerPlay"]).not.toBeNull();
  });
});

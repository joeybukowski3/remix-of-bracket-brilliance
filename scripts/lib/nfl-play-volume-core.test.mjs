import { describe, expect, it } from "vitest";
import {
  aggregatePlayVolume,
  isNeutralSituation,
  parsePlayVolumeCompactRow,
  serializePlayVolumeCompact,
  validatePlayVolumeTeamGames,
} from "./nfl-play-volume-core.mjs";

function play(overrides = {}) {
  return {
    game_id: "2025_01_ARI_NO", season: "2025", season_type: "REG", week: "1",
    posteam: "ARI", defteam: "NO", epa: "0.5", pass: "0", rush: "1",
    two_point_attempt: "0", down: "1", wp: "0.5", half_seconds_remaining: "1000",
    pass_oe: "-10.5",
    ...overrides,
  };
}

describe("isNeutralSituation", () => {
  it("accepts 1st/2nd down, wp in [0.2,0.8], more than 2:00 left in the half", () => {
    expect(isNeutralSituation(play({ down: "1", wp: "0.5", half_seconds_remaining: "1000" }))).toBe(true);
    expect(isNeutralSituation(play({ down: "2", wp: "0.79", half_seconds_remaining: "121" }))).toBe(true);
  });

  it("rejects 3rd/4th down", () => {
    expect(isNeutralSituation(play({ down: "3" }))).toBe(false);
    expect(isNeutralSituation(play({ down: "4" }))).toBe(false);
  });

  it("rejects wp outside [0.2, 0.8]", () => {
    expect(isNeutralSituation(play({ wp: "0.19" }))).toBe(false);
    expect(isNeutralSituation(play({ wp: "0.81" }))).toBe(false);
    expect(isNeutralSituation(play({ wp: "0.2" }))).toBe(true);
    expect(isNeutralSituation(play({ wp: "0.8" }))).toBe(true);
  });

  it("rejects the final two minutes of a half", () => {
    expect(isNeutralSituation(play({ half_seconds_remaining: "120" }))).toBe(false);
    expect(isNeutralSituation(play({ half_seconds_remaining: "119" }))).toBe(false);
  });

  it("rejects when down/wp/time is missing", () => {
    expect(isNeutralSituation(play({ down: "" }))).toBe(false);
    expect(isNeutralSituation(play({ wp: "" }))).toBe(false);
    expect(isNeutralSituation(play({ half_seconds_remaining: "" }))).toBe(false);
  });
});

describe("aggregatePlayVolume", () => {
  it("aggregates pass/rush/neutral/pass_oe counters per (game, team), regular season only", () => {
    const rows = [
      play({ pass: "1", rush: "0", down: "2", wp: "0.6", half_seconds_remaining: "500", pass_oe: "20" }),
      play({ pass: "0", rush: "1", down: "1", wp: "0.5", half_seconds_remaining: "500", pass_oe: "-15" }),
      play({ pass: "0", rush: "1", down: "3", wp: "0.5", half_seconds_remaining: "500", pass_oe: "-5" }), // 3rd down: not neutral
      play({ season_type: "POST" }), // excluded: postseason
      play({ two_point_attempt: "1" }), // excluded: two-point
    ];
    const { teamGames, sourceRows, eligiblePlays } = aggregatePlayVolume(rows, { season: 2025 });
    expect(sourceRows).toBe(5);
    expect(eligiblePlays).toBe(3);
    const ari = teamGames.find((g) => g.team === "ARI");
    expect(ari).toMatchObject({
      eligiblePlays: 3, passPlays: 1, rushPlays: 2,
      neutralEligiblePlays: 2, neutralPassPlays: 1,
      passOeCount: 3,
    });
    expect(ari.passOeSum).toBeCloseTo(20 - 15 - 5, 10);
  });

  it("tallies a scramble (pass=1, qb_scramble implied by pass indicator) as a pass play", () => {
    const rows = [play({ pass: "1", rush: "0" })];
    const { teamGames } = aggregatePlayVolume(rows, { season: 2025 });
    expect(teamGames[0].passPlays).toBe(1);
    expect(teamGames[0].rushPlays).toBe(0);
  });

  it("excludes a kneel/spike (pass=0, rush=0) from eligible plays entirely", () => {
    const rows = [play({ pass: "0", rush: "0" })];
    const { teamGames, eligiblePlays } = aggregatePlayVolume(rows, { season: 2025 });
    expect(eligiblePlays).toBe(0);
    expect(teamGames).toEqual([]);
  });

  it("throws when a play's season does not match the requested season", () => {
    expect(() => aggregatePlayVolume([play({ season: "2024" })], { season: 2025 })).toThrow(/does not match requested/);
  });
});

describe("validatePlayVolumeTeamGames", () => {
  it("flags neutral counts exceeding total eligible counts", () => {
    const bad = [{
      gameId: "g1", season: 2025, week: 1, team: "ARI", opponent: "NO",
      eligiblePlays: 2, passPlays: 1, rushPlays: 1,
      neutralEligiblePlays: 5, neutralPassPlays: 1,
      passOeSum: 0, passOeCount: 0,
    }];
    const problems = validatePlayVolumeTeamGames(bad);
    expect(problems.some((p) => p.includes("neutral eligible plays exceed"))).toBe(true);
  });

  it("passes for a well-formed reciprocal two-team game", () => {
    const good = [
      { gameId: "g1", season: 2025, week: 1, team: "ARI", opponent: "NO", eligiblePlays: 2, passPlays: 1, rushPlays: 1, neutralEligiblePlays: 1, neutralPassPlays: 1, passOeSum: 1, passOeCount: 1 },
      { gameId: "g1", season: 2025, week: 1, team: "NO", opponent: "ARI", eligiblePlays: 2, passPlays: 1, rushPlays: 1, neutralEligiblePlays: 1, neutralPassPlays: 0, passOeSum: -1, passOeCount: 1 },
    ];
    expect(validatePlayVolumeTeamGames(good)).toEqual([]);
  });
});

describe("serializePlayVolumeCompact / parsePlayVolumeCompactRow round-trip", () => {
  it("round-trips a record through CSV serialization", () => {
    const record = {
      gameId: "2025_01_ARI_NO", season: 2025, week: 1, team: "ari", opponent: "no",
      eligiblePlays: 66, passPlays: 41, rushPlays: 25,
      neutralEligiblePlays: 28, neutralPassPlays: 16,
      passOeSum: 167.29358881711963, passOeCount: 66,
    };
    const csv = serializePlayVolumeCompact([record]);
    const [header, dataLine] = csv.trim().split("\n");
    const cols = header.split(",");
    const values = dataLine.split(",");
    const row = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
    const parsed = parsePlayVolumeCompactRow(row);
    expect(parsed).toEqual(record);
  });
});

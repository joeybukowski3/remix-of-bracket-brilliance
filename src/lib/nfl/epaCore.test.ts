import { describe, it, expect } from "vitest";
import {
  EPA_ELIGIBLE_PLAY_FILTER,
  EPA_METRIC_DIRECTIONS,
  aggregatePlays,
  classifyPlay,
  indexTeamGames,
  isEligiblePlay,
  opponentRecord,
  parseCompactRow,
  serializeCompact,
  sumWindow,
  validateTeamGames,
  windowMetrics,
} from "../../../scripts/lib/nfl-epa-core.mjs";

/**
 * One play-by-play row. Defaults are an ordinary completed pass; each test
 * overrides only the indicators under examination.
 *
 * `play_type` is present on purpose and is NEVER what the filter reads — the
 * scramble and kneel fixtures below would classify wrongly if it were.
 */
function play(overrides: Record<string, unknown> = {}) {
  return {
    game_id: "2025_01_NE_SEA",
    season: "2025",
    season_type: "REG",
    week: "1",
    posteam: "NE",
    defteam: "SEA",
    epa: "0.5",
    pass: "1",
    rush: "0",
    two_point_attempt: "0",
    play_type: "pass",
    ...overrides,
  };
}

describe("eligible-play filter", () => {
  it("states the approved filter once", () => {
    expect(EPA_ELIGIBLE_PLAY_FILTER).toBe(
      "(pass == 1 OR rush == 1) AND epa is present AND posteam is present AND two_point_attempt != 1"
    );
  });

  it("classifies an ordinary pass and an ordinary rush", () => {
    expect(classifyPlay(play())).toBe("pass");
    expect(classifyPlay(play({ pass: "0", rush: "1", play_type: "run" }))).toBe("rush");
  });

  it("counts a sack as PASS", () => {
    // nflfastR sets pass=1 on sacks.
    expect(classifyPlay(play({ pass: "1", rush: "0", play_type: "pass", epa: "-1.8" }))).toBe("pass");
  });

  it("counts a QB scramble as PASS even though play_type is run", () => {
    // The single most important classification detail: reading play_type here
    // would wrongly bucket 1,221 scrambles as rushes.
    const scramble = play({ pass: "1", rush: "0", play_type: "run", epa: "0.9" });
    expect(scramble.play_type).toBe("run");
    expect(classifyPlay(scramble)).toBe("pass");
  });

  it("counts an aborted rush as RUSH", () => {
    expect(classifyPlay(play({ pass: "0", rush: "1", play_type: "run" }))).toBe("rush");
  });

  it("excludes a kneel via the indicators alone", () => {
    expect(classifyPlay(play({ pass: "0", rush: "0", play_type: "qb_kneel", epa: "-0.4" }))).toBeNull();
  });

  it("excludes a spike via the indicators alone", () => {
    expect(classifyPlay(play({ pass: "0", rush: "0", play_type: "qb_spike", epa: "-0.9" }))).toBeNull();
  });

  it("excludes special teams via the indicators alone", () => {
    for (const type of ["punt", "kickoff", "field_goal", "extra_point"]) {
      expect(classifyPlay(play({ pass: "0", rush: "0", play_type: type })), type).toBeNull();
    }
  });

  it("INCLUDES an accepted-penalty play carrying a pass indicator", () => {
    // Counter-intuitive but correct: dropping these moved league EPA 470x
    // further from RBSDM's published values.
    expect(classifyPlay(play({ pass: "1", rush: "0", play_type: "no_play" }))).toBe("pass");
  });

  it("INCLUDES an accepted-penalty play carrying a rush indicator", () => {
    expect(classifyPlay(play({ pass: "0", rush: "1", play_type: "no_play" }))).toBe("rush");
  });

  it("excludes a no_play row with no pass or rush indicator", () => {
    expect(classifyPlay(play({ pass: "0", rush: "0", play_type: "no_play" }))).toBeNull();
  });

  it("excludes a two-point pass and a two-point rush", () => {
    expect(classifyPlay(play({ two_point_attempt: "1", pass: "1", rush: "0" }))).toBeNull();
    expect(classifyPlay(play({ two_point_attempt: "1", pass: "0", rush: "1" }))).toBeNull();
  });

  it("excludes a play with no EPA", () => {
    for (const epa of ["", "NA"]) {
      expect(classifyPlay(play({ epa })), epa).toBeNull();
    }
  });

  it("excludes a play with no posteam", () => {
    expect(classifyPlay(play({ posteam: "" }))).toBeNull();
    expect(classifyPlay(play({ posteam: "NA" }))).toBe("pass"); // literal team code, not a null marker
  });

  it("never classifies one play as both pass and rush", () => {
    // pass is checked first, matching nflfastR's own precedence.
    expect(classifyPlay(play({ pass: "1", rush: "1" }))).toBe("pass");
  });

  it("exposes a boolean helper consistent with the classifier", () => {
    expect(isEligiblePlay(play())).toBe(true);
    expect(isEligiblePlay(play({ two_point_attempt: "1" }))).toBe(false);
  });
});

describe("team-game aggregation", () => {
  const TEAM_MAP = new Map([
    ["NE", { abbr: "ne" }],
    ["SEA", { abbr: "sea" }],
  ]);

  function aggregate(rows: Record<string, unknown>[], teamMap: Map<string, { abbr: string }> | null = TEAM_MAP) {
    return aggregatePlays(rows, { season: 2025, teamMap });
  }

  it("sums EPA and counts plays per team-game", () => {
    const { teamGames, eligiblePlays, sourceRows } = aggregate([
      play({ epa: "1.0", pass: "1", rush: "0" }),
      play({ epa: "-0.5", pass: "1", rush: "0" }),
      play({ epa: "0.25", pass: "0", rush: "1" }),
    ]);
    expect(sourceRows).toBe(3);
    expect(eligiblePlays).toBe(3);
    expect(teamGames).toHaveLength(1);
    expect(teamGames[0]).toMatchObject({
      team: "ne", opponent: "sea",
      offEpa: 0.75, offPlays: 3,
      passEpa: 0.5, passPlays: 2,
      rushEpa: 0.25, rushPlays: 1,
    });
  });

  it("keeps off_plays equal to pass + rush", () => {
    const { teamGames } = aggregate([
      play({ pass: "1", rush: "0" }),
      play({ pass: "0", rush: "1" }),
      play({ pass: "0", rush: "0", play_type: "punt" }),
      play({ two_point_attempt: "1" }),
    ]);
    const g = teamGames[0];
    expect(g.offPlays).toBe(2);
    expect(g.passPlays + g.rushPlays).toBe(g.offPlays);
  });

  it("excludes postseason plays entirely", () => {
    const { teamGames, eligiblePlays } = aggregate([
      play({ season_type: "POST", epa: "9" }),
      play({ epa: "1" }),
    ]);
    expect(eligiblePlays).toBe(1);
    expect(teamGames[0].offEpa).toBe(1);
  });

  it("resolves nflverse codes to canonical abbreviations", () => {
    const { teamGames } = aggregate([play()]);
    expect(teamGames[0].team).toBe("ne");
    expect(teamGames[0].opponent).toBe("sea");
  });

  it("fails loudly on an unknown team code", () => {
    expect(() => aggregate([play({ posteam: "XXX" })])).toThrow(/Unknown nflverse posteam/);
    expect(() => aggregate([play({ defteam: "XXX" })])).toThrow(/Unknown nflverse defteam/);
  });

  it("fails when a row belongs to another season", () => {
    expect(() => aggregate([play({ season: "2024" })])).toThrow(/does not match requested/);
  });

  it("separates the two sides of the same game", () => {
    const { teamGames } = aggregate([
      play({ epa: "1" }),
      play({ posteam: "SEA", defteam: "NE", epa: "-2" }),
    ]);
    expect(teamGames).toHaveLength(2);
    const byTeam = Object.fromEntries(teamGames.map((g) => [g.team, g.offEpa]));
    expect(byTeam).toEqual({ ne: 1, sea: -2 });
  });
});

describe("structural validation", () => {
  const base = {
    gameId: "G1", season: 2025, week: 1, team: "ne", opponent: "sea",
    offEpa: 1, offPlays: 2, passEpa: 1, passPlays: 1, rushEpa: 0, rushPlays: 1,
  };
  const mirror = { ...base, team: "sea", opponent: "ne" };

  it("accepts a reciprocal, internally consistent pair", () => {
    expect(validateTeamGames([base, mirror])).toEqual([]);
  });

  it("rejects a duplicate team-game row", () => {
    expect(validateTeamGames([base, mirror, { ...base }]).join()).toMatch(/duplicate team-game row/);
  });

  it("rejects a game without exactly two team rows", () => {
    expect(validateTeamGames([base]).join()).toMatch(/expected exactly 2 team rows/);
  });

  it("rejects non-reciprocal opponents", () => {
    const wrong = { ...mirror, opponent: "kc" };
    expect(validateTeamGames([base, wrong]).join()).toMatch(/not reciprocal/);
  });

  it("rejects impossible play counts", () => {
    const bad = { ...base, passPlays: 5 };
    expect(validateTeamGames([bad, mirror]).join()).toMatch(/pass 5 \+ rush 1 != off 2/);
  });

  it("rejects zero eligible plays and non-finite EPA", () => {
    expect(validateTeamGames([{ ...base, offPlays: 0, passPlays: 0, rushPlays: 0 }, mirror]).join())
      .toMatch(/no eligible plays/);
    expect(validateTeamGames([{ ...base, offEpa: Number.NaN }, mirror]).join()).toMatch(/not finite/);
  });

  it("rejects unknown canonical teams when a map is supplied", () => {
    const map = new Map([["ne", {}]]);
    expect(validateTeamGames([base, mirror], { teamMap: map }).join()).toMatch(/unknown (team|opponent) code/);
  });
});

describe("compact cache round trip", () => {
  it("serializes unrounded values and parses them back", () => {
    const record = {
      gameId: "2025_01_ARI_NO", season: 2025, week: 1, team: "ari", opponent: "no",
      offEpa: 4.077001769189074, offPlays: 66,
      passEpa: 5.392743648386583, passPlays: 41,
      rushEpa: -1.3157418791975068, rushPlays: 25,
    };
    const csv = serializeCompact([record]);
    expect(csv).toContain("4.077001769189074");
    const [header, row] = csv.trim().split("\n");
    expect(header.split(",")[0]).toBe("game_id");
    const cells = row.split(",");
    const parsed = parseCompactRow(
      Object.fromEntries(header.split(",").map((h, idx) => [h, cells[idx]]))
    );
    expect(parsed).toEqual(record);
  });

  it("rejects malformed compact rows rather than coercing", () => {
    const good = {
      game_id: "G1", season: "2025", week: "1", team: "ne", opponent: "sea",
      off_epa: "1", off_plays: "2", pass_epa: "1", pass_plays: "1", rush_epa: "0", rush_plays: "1",
    };
    expect(() => parseCompactRow({ ...good, game_id: "" })).toThrow(/without game_id/);
    expect(() => parseCompactRow({ ...good, off_epa: "x" })).toThrow(/is not finite/);
    expect(() => parseCompactRow({ ...good, off_plays: "2.5" })).toThrow(/must be an integer/);
    expect(() => parseCompactRow({ ...good, week: "" })).toThrow(/missing week/);
  });
});

describe("window math", () => {
  const g = (offEpa: number, offPlays: number, passEpa: number, passPlays: number, rushEpa: number, rushPlays: number) =>
    ({ offEpa, offPlays, passEpa, passPlays, rushEpa, rushPlays });

  it("sums numerators and denominators, dividing only once", () => {
    const totals = sumWindow([g(10, 50, 8, 30, 2, 20), g(-4, 70, -6, 40, 2, 30)]);
    expect(totals).toEqual({ offEpa: 6, offPlays: 120, passEpa: 2, passPlays: 70, rushEpa: 4, rushPlays: 50 });
    const m = windowMetrics(totals, totals);
    expect(m["off.epaPerPlay"]).toBeCloseTo(6 / 120, 12);
    expect(m["off.epaPerPass"]).toBeCloseTo(2 / 70, 12);
    expect(m["off.epaPerRush"]).toBeCloseTo(4 / 50, 12);
  });

  it("differs visibly from an equal-weight mean of per-game rates", () => {
    // A high-volume flat game and a low-volume great game. Averaging the two
    // rates over-weights the small sample and changes the third decimal.
    const games = [g(0, 80, 0, 50, 0, 30), g(6, 20, 6, 12, 0, 8)];
    const exact = sumWindow(games).offEpa / sumWindow(games).offPlays;
    const naive = (games[0].offEpa / games[0].offPlays + games[1].offEpa / games[1].offPlays) / 2;
    expect(exact.toFixed(3)).toBe("0.060");
    expect(naive.toFixed(3)).toBe("0.150");
    expect(exact.toFixed(3)).not.toBe(naive.toFixed(3));
  });

  it("returns null for a unit with no plays rather than zero", () => {
    const m = windowMetrics(g(5, 10, 5, 10, 0, 0), g(5, 10, 5, 10, 0, 0));
    expect(m["off.epaPerRush"]).toBeNull();
    expect(m["def.epaPerRushAllowed"]).toBeNull();
    expect(m["off.epaPerPlay"]).toBeCloseTo(0.5, 12);
  });

  it("takes defensive values from the supplied opponent totals", () => {
    const offense = g(10, 50, 10, 30, 0, 20);
    const defense = g(-8, 60, -6, 35, -2, 25);
    const m = windowMetrics(offense, defense);
    expect(m["off.epaPerPlay"]).toBeCloseTo(10 / 50, 12);
    expect(m["def.epaPerPlayAllowed"]).toBeCloseTo(-8 / 60, 12);
    expect(m["def.epaPerPassAllowed"]).toBeCloseTo(-6 / 35, 12);
    expect(m["def.epaPerRushAllowed"]).toBeCloseTo(-2 / 25, 12);
  });

  it("directs offense higher-is-better and defense lower-is-better", () => {
    expect(EPA_METRIC_DIRECTIONS["off.epaPerPlay"]).toBe("higher-is-better");
    expect(EPA_METRIC_DIRECTIONS["off.epaPerPass"]).toBe("higher-is-better");
    expect(EPA_METRIC_DIRECTIONS["off.epaPerRush"]).toBe("higher-is-better");
    expect(EPA_METRIC_DIRECTIONS["def.epaPerPlayAllowed"]).toBe("lower-is-better");
    expect(EPA_METRIC_DIRECTIONS["def.epaPerPassAllowed"]).toBe("lower-is-better");
    expect(EPA_METRIC_DIRECTIONS["def.epaPerRushAllowed"]).toBe("lower-is-better");
  });
});

describe("opponent join", () => {
  const a = { gameId: "G1", season: 2025, week: 1, team: "ne", opponent: "sea", offEpa: 5, offPlays: 60, passEpa: 5, passPlays: 35, rushEpa: 0, rushPlays: 25 };
  const b = { ...a, team: "sea", opponent: "ne", offEpa: -3, passEpa: -3 };

  it("resolves the opponent by exact game id", () => {
    const index = indexTeamGames([a, b]);
    expect(opponentRecord(index, a).team).toBe("sea");
    expect(opponentRecord(index, b).team).toBe("ne");
    expect(opponentRecord(index, a).offEpa).toBe(-3);
  });

  it("never falls back to another game with the same teams", () => {
    // Same two teams, different game id: must not satisfy the G1 join.
    const other = { ...b, gameId: "G2" };
    const index = indexTeamGames([a, other]);
    expect(() => opponentRecord(index, a)).toThrow(/No opponent row for ne in G1/);
  });

  it("fails rather than producing partial defensive EPA", () => {
    const index = indexTeamGames([a]);
    expect(() => opponentRecord(index, a)).toThrow(/refusing to produce partial defensive EPA/);
  });
});

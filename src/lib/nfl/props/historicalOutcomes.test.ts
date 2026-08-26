import { describe, expect, it } from "vitest";
import {
  buildGameJoinIndex,
  gameJoinKey,
  normalizeYardageOutcomeRow,
  outcomeRowKey,
  type NflPropRawGameRecord,
  type NflYardageOutcomeSourceRow,
} from "./historicalOutcomes";

const WEEK1_GAME: NflPropRawGameRecord = {
  gameId: "2025_01_DAL_PHI",
  season: 2025,
  week: 1,
  seasonType: "REG",
  homeAbbr: "phi",
  awayAbbr: "dal",
  dateUtc: "2025-09-05T00:20:00.000Z",
};

const WEEK2_GAME: NflPropRawGameRecord = {
  gameId: "2025_02_PHI_KC",
  season: 2025,
  week: 2,
  seasonType: "REG",
  homeAbbr: "kc",
  awayAbbr: "phi",
  dateUtc: "2025-09-14T17:00:00.000Z",
};

const POST_GAME: NflPropRawGameRecord = {
  gameId: "2025_POST1_PHI_X",
  season: 2025,
  week: 19,
  seasonType: "WC",
  homeAbbr: "phi",
  awayAbbr: "gb",
  dateUtc: "2026-01-11T18:00:00.000Z",
};

function qbSourceRow(overrides: Partial<NflYardageOutcomeSourceRow> = {}): NflYardageOutcomeSourceRow {
  return {
    player_id: "00-0036389",
    player_name: "J.Hurts",
    player_display_name: "Jalen Hurts",
    position: "QB",
    position_group: "QB",
    recent_team: "PHI",
    season: 2025,
    week: 1,
    season_type: "REG",
    opponent_team: "DAL",
    completions: "24",
    attempts: "34",
    passing_yards: "278",
    passing_tds: "3",
    interceptions: "0",
    carries: "8",
    rushing_yards: "45",
    rushing_tds: "1",
    receptions: "0",
    targets: "0",
    receiving_yards: "0",
    receiving_tds: "0",
    receiving_air_yards: "0",
    target_share: "",
    air_yards_share: "",
    ...overrides,
  };
}

describe("buildGameJoinIndex", () => {
  it("indexes both sides of a regular-season game", () => {
    const index = buildGameJoinIndex([WEEK1_GAME]);
    expect(index.get(gameJoinKey(2025, 1, "phi"))).toEqual({
      gameId: "2025_01_DAL_PHI",
      homeAway: "home",
      gameDateUtc: "2025-09-05T00:20:00.000Z",
    });
    expect(index.get(gameJoinKey(2025, 1, "dal"))).toEqual({
      gameId: "2025_01_DAL_PHI",
      homeAway: "away",
      gameDateUtc: "2025-09-05T00:20:00.000Z",
    });
  });

  it("excludes postseason games from the join", () => {
    const index = buildGameJoinIndex([WEEK1_GAME, POST_GAME]);
    expect(index.size).toBe(2);
    expect(index.has(gameJoinKey(2025, 19, "phi"))).toBe(false);
  });

  it("never lets one week's game satisfy a different week's lookup (no cross-week leakage)", () => {
    const index = buildGameJoinIndex([WEEK1_GAME, WEEK2_GAME]);
    expect(index.get(gameJoinKey(2025, 1, "phi"))?.gameId).toBe("2025_01_DAL_PHI");
    expect(index.get(gameJoinKey(2025, 2, "phi"))?.gameId).toBe("2025_02_PHI_KC");
  });

  it("throws loudly on an unresolvable team code rather than guessing", () => {
    expect(() => buildGameJoinIndex([{ ...WEEK1_GAME, homeAbbr: "" }])).toThrow(/Unresolved team code/);
  });
});

describe("normalizeYardageOutcomeRow", () => {
  const index = buildGameJoinIndex([WEEK1_GAME]);

  it("produces a schema-valid row with known values for a sample QB row", () => {
    const result = normalizeYardageOutcomeRow(qbSourceRow(), index);
    expect(result.skipReason).toBeNull();
    if (result.row == null) throw new Error("expected a row");
    expect(result.row.schemaVersion).toBe("nfl-yardage-outcome-row-v1");
    expect(result.row.context).toMatchObject({
      season: 2025,
      week: 1,
      gameId: "2025_01_DAL_PHI",
      playerId: "gsis:00-0036389",
      playerName: "Jalen Hurts",
      team: "phi",
      opponent: "dal",
      position: "QB",
      homeAway: "home",
      gameDateUtc: "2025-09-05T00:20:00.000Z",
      spread: null,
      total: null,
      impliedTeamTotal: null,
      availabilityStatus: null,
    });
    expect(result.row.outcomes).toEqual({
      passAttempts: 34,
      passingYards: 278,
      carries: 8,
      rushingYards: 45,
      targets: 0,
      receptions: 0,
      receivingYards: 0,
    });
    expect(result.gameContextResolved).toBe(true);
  });

  it("is deterministic: identical input produces a deep-equal row", () => {
    const a = normalizeYardageOutcomeRow(qbSourceRow(), index);
    const b = normalizeYardageOutcomeRow(qbSourceRow(), index);
    expect(a).toEqual(b);
  });

  it("preserves null rather than coercing a blank stat cell to zero", () => {
    const result = normalizeYardageOutcomeRow(qbSourceRow({ receiving_yards: "" }), index);
    if (result.row == null) throw new Error("expected a row");
    expect(result.row.outcomes.receivingYards).toBeNull();
  });

  it("leaves gameId/homeAway/gameDateUtc null (not fabricated) when the schedule join does not resolve", () => {
    const result = normalizeYardageOutcomeRow(qbSourceRow({ week: 5 }), index);
    if (result.row == null) throw new Error("expected a row");
    expect(result.row.context.gameId).toBeNull();
    expect(result.row.context.homeAway).toBeNull();
    expect(result.row.context.gameDateUtc).toBeNull();
    expect(result.row.provenance.gameContextSource).toBeNull();
    expect(result.gameContextResolved).toBe(false);
  });

  it("skips (does not throw on) a non-regular-season row", () => {
    const result = normalizeYardageOutcomeRow(qbSourceRow({ season_type: "POST" }), index);
    expect(result.row).toBeNull();
    expect(result.skipReason).toBe("non-regular-season");
  });

  it("skips a row with no gsis player id", () => {
    const result = normalizeYardageOutcomeRow(qbSourceRow({ player_id: "" }), index);
    expect(result.row).toBeNull();
    expect(result.skipReason).toBe("missing-gsis-id");
  });

  it("skips a row with an unsupported position", () => {
    const result = normalizeYardageOutcomeRow(qbSourceRow({ position: "K" }), index);
    expect(result.row).toBeNull();
    expect(result.skipReason).toBe("unsupported-position");
  });

  it("skips a row with no resolvable player name", () => {
    const result = normalizeYardageOutcomeRow(
      qbSourceRow({ player_display_name: "", player_name: "" }),
      index,
    );
    expect(result.row).toBeNull();
    expect(result.skipReason).toBe("invalid-name");
  });

  it("throws loudly on an unresolvable team code rather than dropping the row silently", () => {
    expect(() => normalizeYardageOutcomeRow(qbSourceRow({ recent_team: "" }), index)).toThrow(
      /unresolved team or opponent/,
    );
  });

  it("throws on a non-finite outcome value rather than coercing it", () => {
    expect(() => normalizeYardageOutcomeRow(qbSourceRow({ passing_yards: "not-a-number" }), index)).toThrow(
      /finite number/,
    );
  });

  it("rejects a negative value on a non-negative-only field", () => {
    expect(() => normalizeYardageOutcomeRow(qbSourceRow({ attempts: "-1" }), index)).toThrow(
      /finite non-negative number/,
    );
  });

  it("preserves a negative signed field (e.g. sack-affected rushing yards) rather than clamping it", () => {
    const result = normalizeYardageOutcomeRow(qbSourceRow({ rushing_yards: "-3" }), index);
    if (result.row == null) throw new Error("expected a row");
    expect(result.row.outcomes.rushingYards).toBe(-3);
  });
});

describe("outcomeRowKey", () => {
  it("is stable across identical rows and distinct across a differing field", () => {
    const index = buildGameJoinIndex([WEEK1_GAME]);
    const a = normalizeYardageOutcomeRow(qbSourceRow(), index);
    const b = normalizeYardageOutcomeRow(qbSourceRow({ week: 2, recent_team: "KC", opponent_team: "PHI" }), index);
    if (a.row == null || b.row == null) throw new Error("expected rows");
    expect(outcomeRowKey(a.row)).toBe("2025|1|gsis:00-0036389");
    expect(outcomeRowKey(a.row)).not.toBe(outcomeRowKey(b.row));
  });
});

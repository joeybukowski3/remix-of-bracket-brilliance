import { describe, expect, it } from "vitest";
import {
  buildOpponentLastFiveGames,
  buildPitcherLastFiveStarts,
  buildStrikeoutPropDetail,
  buildStrikeoutPropDetailKey,
  // @ts-expect-error -- plain JS module, no type declarations
} from "../../../scripts/lib/mlb-strikeout-prop-details-core.mjs";

describe("buildStrikeoutPropDetailKey", () => {
  it("builds a stable, normalized key from pitcher/team/opponent/date", () => {
    const key = buildStrikeoutPropDetailKey({
      pitcher: "Dean Kremer",
      team: "BAL",
      opponent: "CHC",
      gameDate: "2026-07-08",
    });
    expect(key).toBe("dean-kremer|bal|chc|2026-07-08");
  });

  it("normalizes case, punctuation and accents so lookups can't drift", () => {
    const a = buildStrikeoutPropDetailKey({ pitcher: "José Berríos", team: "TOR", opponent: "NYY", gameDate: "2026-07-08" });
    const b = buildStrikeoutPropDetailKey({ pitcher: "Jose Berrios", team: "tor", opponent: "nyy", gameDate: "2026-07-08" });
    expect(a).toBe(b);
    expect(a).toBe("jose-berrios|tor|nyy|2026-07-08");
  });

  it("produces different keys for different games (no accidental collisions)", () => {
    const base = { pitcher: "Dean Kremer", team: "BAL", opponent: "CHC", gameDate: "2026-07-08" };
    const diffOpponent = buildStrikeoutPropDetailKey({ ...base, opponent: "NYY" });
    const diffDate = buildStrikeoutPropDetailKey({ ...base, gameDate: "2026-07-09" });
    const original = buildStrikeoutPropDetailKey(base);
    expect(new Set([original, diffOpponent, diffDate]).size).toBe(3);
  });

  it("handles missing/undefined fields without throwing", () => {
    expect(() => buildStrikeoutPropDetailKey({})).not.toThrow();
    expect(buildStrikeoutPropDetailKey({ pitcher: null, team: undefined, opponent: "", gameDate: "2026-07-08" })).toBe(
      "|||2026-07-08"
    );
  });
});

describe("buildPitcherLastFiveStarts", () => {
  it("maps raw starts into the detail shape", () => {
    const rows = buildPitcherLastFiveStarts([
      { date: "2026-07-03", opponentAbbr: "NYY", inningsPitched: "6.1", strikeouts: 7 },
      { date: "2026-06-27", opponentAbbr: "BOS", inningsPitched: "5.0", strikeouts: 4 },
    ]);
    expect(rows).toEqual([
      { date: "2026-07-03", opponent: "NYY", inningsPitched: "6.1", strikeouts: 7 },
      { date: "2026-06-27", opponent: "BOS", inningsPitched: "5.0", strikeouts: 4 },
    ]);
  });

  it("returns an empty array (never throws) for missing input", () => {
    expect(buildPitcherLastFiveStarts(undefined)).toEqual([]);
    expect(buildPitcherLastFiveStarts(null)).toEqual([]);
  });

  it("nulls out fields it cannot resolve instead of fabricating them", () => {
    const rows = buildPitcherLastFiveStarts([{ date: "2026-07-03", opponentAbbr: null, inningsPitched: null, strikeouts: null }]);
    expect(rows[0]).toEqual({ date: "2026-07-03", opponent: null, inningsPitched: null, strikeouts: null });
  });
});

describe("buildOpponentLastFiveGames", () => {
  it("maps raw opponent-game summaries into the detail shape", () => {
    const rows = buildOpponentLastFiveGames([
      {
        date: "2026-07-05",
        opponent: "MIL",
        opposingStartingPitcher: "Freddy Peralta",
        opposingStarterInningsPitched: "6.0",
        opposingStarterStrikeouts: 8,
        teamTotalStrikeouts: 11,
      },
    ]);
    expect(rows).toEqual([
      {
        date: "2026-07-05",
        opponent: "MIL",
        opposingStartingPitcher: "Freddy Peralta",
        opposingStarterInningsPitched: "6.0",
        opposingStarterStrikeouts: 8,
        teamTotalStrikeouts: 11,
      },
    ]);
  });

  it("produces a clear per-game unavailable row instead of dropping the game", () => {
    const rows = buildOpponentLastFiveGames([
      { date: "2026-07-05", opponent: null, opposingStartingPitcher: null, opposingStarterInningsPitched: null, opposingStarterStrikeouts: null, teamTotalStrikeouts: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].opposingStartingPitcher).toBeNull();
    expect(rows[0].date).toBe("2026-07-05");
  });

  it("returns an empty array for missing input", () => {
    expect(buildOpponentLastFiveGames(undefined)).toEqual([]);
  });
});

describe("buildStrikeoutPropDetail", () => {
  it("assembles the full detail record with a matching key", () => {
    const detail = buildStrikeoutPropDetail({
      pitcher: "Dean Kremer",
      team: "BAL",
      opponent: "CHC",
      gameDate: "2026-07-08",
      pitcherLastFiveStarts: [{ date: "2026-07-03", opponentAbbr: "NYY", inningsPitched: "6.1", strikeouts: 7 }],
      opponentLastFiveGames: [],
      generatedAt: "2026-07-08T12:00:00.000Z",
      source: "mlb_stats_api",
    });
    expect(detail.key).toBe(buildStrikeoutPropDetailKey({ pitcher: "Dean Kremer", team: "BAL", opponent: "CHC", gameDate: "2026-07-08" }));
    expect(detail.pitcher).toBe("Dean Kremer");
    expect(detail.pitcherLastFiveStarts).toHaveLength(1);
    expect(detail.opponentLastFiveGames).toEqual([]);
    expect(detail.generatedAt).toBe("2026-07-08T12:00:00.000Z");
    expect(detail.source).toBe("mlb_stats_api");
  });
});

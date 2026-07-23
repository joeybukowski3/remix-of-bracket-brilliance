import { describe, expect, it } from "vitest";
import {
  buildOpponentLastFiveGames,
  buildPitcherDetails,
  buildPitcherLastFiveStarts,
  buildStrikeoutPropDetail,
  buildStrikeoutPropDetailKey,
  buildStrikeoutPropStableKeys,
  normalizePitcherStart,
  // @ts-expect-error -- plain JS module, no type declarations
} from "../../../scripts/lib/mlb-strikeout-prop-details-core.mjs";
import {
  buildTeamAbbrById,
  normalizePitcherGameLogSplit,
  // @ts-expect-error -- plain JS module, no type declarations
} from "../../../scripts/lib/mlb-strikeout-prop-details-fetch.mjs";
import { pitcherGameLogSplitsFixture } from "@/lib/mlb/fixtures/mlbPitcherGameLog.fixture";

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

describe("enriched pitcher start details", () => {
  const teamAbbrById = buildTeamAbbrById([
    { id: 111, abbreviation: "BAL" },
    { id: 147, abbreviation: "NYY" },
  ]);
  const preSlateStarts = pitcherGameLogSplitsFixture
    .map((split) => normalizePitcherGameLogSplit(split, 2026, teamAbbrById))
    .filter((start: { date: string | null }) => start.date && start.date < "2026-07-23");

  it("converts MLB innings notation to outs", () => {
    expect(normalizePitcherStart({ inningsPitched: "5.2" }).outsRecorded).toBe(17);
    expect(normalizePitcherStart({ inningsPitched: "6.1" }).outsRecorded).toBe(19);
  });

  it("calculates recent H/9 and K/9 after duplicate game removal", () => {
    const details = buildPitcherDetails(preSlateStarts, { pitcherId: 669456, season: 2026 });
    expect(details.recentStarts.map((start: { gamePk: number | null }) => start.gamePk)).toEqual([1001, 1002, 1003, 1004, 1005]);
    expect(details.recentSummary.totalOuts).toBe(91);
    expect(details.recentSummary.hitsPerNine).toBeCloseTo((21 * 27) / 91, 8);
    expect(details.recentSummary.strikeoutsPerNine).toBeCloseTo((34 * 27) / 91, 8);
    expect(details.recentSummary.averagePitchCount).toBeCloseTo(94.2, 8);
    expect(details.diagnostics.duplicateGameLogs).toBe(1);
  });

  it("builds season and five-most-recent Home/Away totals independently", () => {
    const { venueSplits, diagnostics } = buildPitcherDetails(preSlateStarts, { pitcherId: 669456, season: 2026 });
    expect(venueSplits.home.season).toMatchObject({ gamesUsed: 6, totalOuts: 104, inningsPitched: "34.2", strikeouts: 38, hitsAllowed: 29 });
    expect(venueSplits.home.lastFiveAtSite).toMatchObject({ gamesUsed: 5, totalOuts: 90, inningsPitched: "30.0", strikeouts: 35, hitsAllowed: 22 });
    expect(venueSplits.away.season).toMatchObject({ gamesUsed: 6, totalOuts: 111, inningsPitched: "37.0", strikeouts: 40, hitsAllowed: 27 });
    expect(venueSplits.away.lastFiveAtSite).toMatchObject({ gamesUsed: 5, totalOuts: 91, inningsPitched: "30.1", strikeouts: 32, hitsAllowed: 23 });
    expect(diagnostics).toMatchObject({ homeLastFiveGames: 5, awayLastFiveGames: 5 });
  });
});

describe("stable detail keys", () => {
  it("returns game/pitcher first and team/opponent identity second", () => {
    expect(buildStrikeoutPropStableKeys({
      slateDate: "2026-07-23",
      gamePk: 822785,
      pitcherId: 669456,
      teamId: 141,
      opponentId: 139,
    })).toEqual([
      "2026-07-23|822785|669456",
      "2026-07-23|669456|141|139",
    ]);
  });

  it("does not turn missing ids into synthetic zero ids", () => {
    expect(buildStrikeoutPropStableKeys({
      slateDate: "2026-07-23",
      gamePk: null,
      pitcherId: 669456,
      teamId: null,
      opponentId: null,
    })).toEqual([]);
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

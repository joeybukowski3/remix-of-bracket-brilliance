import { describe, expect, it } from "vitest";
import {
  buildOpponentLastFiveGames,
  buildPitcherDetails,
  buildPitcherLastFiveStarts,
  buildPitcherVenueSplit,
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

  it("computes season and last-five K%/Hit% from batters faced (fixture uses 24 BF/game)", () => {
    const { venueSplits } = buildPitcherDetails(preSlateStarts, { pitcherId: 669456, season: 2026 });
    // Season Home: 38 K / (6 * 24 BF), 29 H / (6 * 24 BF)
    expect(venueSplits.home.season.battersFaced).toBe(144);
    expect(venueSplits.home.season.strikeoutRate).toBeCloseTo((38 / 144) * 100, 8);
    expect(venueSplits.home.season.hitRate).toBeCloseTo((29 / 144) * 100, 8);
    // Season Away: 40 K / (6 * 24 BF), 27 H / (6 * 24 BF)
    expect(venueSplits.away.season.battersFaced).toBe(144);
    expect(venueSplits.away.season.strikeoutRate).toBeCloseTo((40 / 144) * 100, 8);
    expect(venueSplits.away.season.hitRate).toBeCloseTo((27 / 144) * 100, 8);
    // Last 5 at Home: 35 K / (5 * 24 BF), 22 H / (5 * 24 BF)
    expect(venueSplits.home.lastFiveAtSite.battersFaced).toBe(120);
    expect(venueSplits.home.lastFiveAtSite.strikeoutRate).toBeCloseTo((35 / 120) * 100, 8);
    expect(venueSplits.home.lastFiveAtSite.hitRate).toBeCloseTo((22 / 120) * 100, 8);
    // Last 5 Away: 32 K / (5 * 24 BF), 23 H / (5 * 24 BF)
    expect(venueSplits.away.lastFiveAtSite.battersFaced).toBe(120);
    expect(venueSplits.away.lastFiveAtSite.strikeoutRate).toBeCloseTo((32 / 120) * 100, 8);
    expect(venueSplits.away.lastFiveAtSite.hitRate).toBeCloseTo((23 / 120) * 100, 8);
  });

  it("does not mix a previous-season start into the current-season venue splits", () => {
    const startsWithPriorSeason = [
      ...preSlateStarts,
      { ...preSlateStarts[0], gamePk: 999, season: 2025, date: "2025-09-30", strikeouts: 99, hitsAllowed: 99 },
    ];
    const currentSeason = buildPitcherDetails(startsWithPriorSeason, { pitcherId: 669456, season: 2026 });
    const allSeasons = buildPitcherDetails(startsWithPriorSeason, { pitcherId: 669456, season: null });
    expect(currentSeason.venueSplits.home.season.strikeouts).toBe(38);
    expect(currentSeason.venueSplits.home.season.gamesUsed).toBe(6);
    // Sanity check: without the season filter the 2025 row would be included, proving the filter is load-bearing.
    expect(allSeasons.venueSplits.home.season.gamesUsed).toBe(7);
  });
});

describe("pitcher venue split K%/Hit% edge cases", () => {
  it("returns N/A-worthy null rates when batters faced is zero", () => {
    const split = buildPitcherVenueSplit("home", [
      { gamePk: 1, season: 2026, date: "2026-07-01", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 0 },
    ]);
    expect(split.season.strikeoutRate).toBeNull();
    expect(split.season.hitRate).toBeNull();
  });

  it("returns null rates when batters faced is missing entirely, without dropping strikeout/hits totals", () => {
    const split = buildPitcherVenueSplit("home", [
      { gamePk: 1, season: 2026, date: "2026-07-01", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3 },
    ]);
    expect(split.season.strikeoutRate).toBeNull();
    expect(split.season.hitRate).toBeNull();
    expect(split.season.battersFaced).toBeNull();
    expect(split.season.strikeouts).toBe(6);
    expect(split.season.hitsAllowed).toBe(3);
  });

  it("uses batters faced as the denominator, not innings pitched", () => {
    // A short 1-inning outing with a high BF (long inning) should not distort the rate versus a longer, cleaner outing.
    const split = buildPitcherVenueSplit("home", [
      { gamePk: 1, season: 2026, date: "2026-07-01", isHome: true, inningsPitched: "1.0", strikeouts: 3, hitsAllowed: 0, battersFaced: 10 },
    ]);
    expect(split.season.strikeoutRate).toBeCloseTo(30, 8);
    expect(split.season.hitRate).toBeCloseTo(0, 8);
  });

  it("keeps a K%/Hit% sample with fewer than five starts at a site", () => {
    const split = buildPitcherVenueSplit("home", [
      { gamePk: 1, season: 2026, date: "2026-07-10", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 24 },
      { gamePk: 2, season: 2026, date: "2026-07-03", isHome: true, inningsPitched: "5.0", strikeouts: 4, hitsAllowed: 5, battersFaced: 20 },
    ]);
    expect(split.season.gamesUsed).toBe(2);
    expect(split.lastFiveAtSite.gamesUsed).toBe(2);
    expect(split.season.strikeoutRate).toBeCloseTo((10 / 44) * 100, 8);
    expect(split.season.hitRate).toBeCloseTo((8 / 44) * 100, 8);
  });

  it("selects the five most recent starts at each site independently, not a global last five filtered by site", () => {
    // Six home starts (most recent five should be used) interleaved with away starts that are individually more recent
    // than the oldest home start -- a naive "global last five filtered by site" would drop the oldest-but-still-top-5 home start.
    const starts = [
      { gamePk: 10, season: 2026, date: "2026-07-20", isHome: false, inningsPitched: "6.0", strikeouts: 5, hitsAllowed: 4, battersFaced: 24 },
      { gamePk: 9, season: 2026, date: "2026-07-19", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 24 },
      { gamePk: 8, season: 2026, date: "2026-07-16", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 24 },
      { gamePk: 7, season: 2026, date: "2026-07-13", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 24 },
      { gamePk: 6, season: 2026, date: "2026-07-10", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 24 },
      { gamePk: 5, season: 2026, date: "2026-07-07", isHome: true, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 24 },
      { gamePk: 4, season: 2026, date: "2026-07-04", isHome: true, inningsPitched: "6.0", strikeouts: 1, hitsAllowed: 9, battersFaced: 24 },
    ];
    const home = buildPitcherVenueSplit("home", starts);
    const away = buildPitcherVenueSplit("away", starts);
    expect(home.lastFiveAtSite.gamesUsed).toBe(5);
    // The oldest home start (gamePk 4, 2026-07-04) must be excluded -- only the five most recent HOME starts count.
    expect(home.lastFiveAtSite.strikeouts).toBe(30);
    expect(away.season.gamesUsed).toBe(1);
    expect(away.lastFiveAtSite.gamesUsed).toBe(1);
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

  it("attaches the canonical opponentLastFiveVsStartersSummary computed from the same games it stores as opponentLastFiveGames", () => {
    const detail = buildStrikeoutPropDetail({
      pitcher: "Shane Bieber",
      team: "TOR",
      opponent: "TB",
      gameDate: "2026-07-23",
      pitcherLastFiveStarts: [],
      opponentLastFiveGames: [
        { date: "2026-07-22", opponent: "TOR", opposingStartingPitcher: "Braydon Fisher", opposingStarterInningsPitched: "1.1", opposingStarterStrikeouts: 1, teamTotalStrikeouts: 9 },
        { date: "2026-07-21", opponent: "TOR", opposingStartingPitcher: "Kevin Gausman", opposingStarterInningsPitched: "3.1", opposingStarterStrikeouts: 1, teamTotalStrikeouts: 7 },
        { date: "2026-07-20", opponent: "TOR", opposingStartingPitcher: "Dylan Cease", opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 7, teamTotalStrikeouts: 9 },
        { date: "2026-07-19", opponent: "BOS", opposingStartingPitcher: "Sonny Gray", opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 5, teamTotalStrikeouts: 8 },
        { date: "2026-07-18", opponent: "BOS", opposingStartingPitcher: "Patrick Sandoval", opposingStarterInningsPitched: "5.0", opposingStarterStrikeouts: 5, teamTotalStrikeouts: 7 },
      ],
      generatedAt: "2026-07-23T13:00:00.000Z",
      source: "mlb_stats_api",
    });
    const summary = detail.opponentLastFiveVsStartersSummary;
    expect(summary.gamesUsed).toBe(5);
    // 1.1 + 3.1 + 6.0 + 6.0 + 5.0 innings => 4 + 10 + 18 + 18 + 15 = 65 outs
    expect(summary.totalOpposingStarterOuts).toBe(65);
    expect(summary.averageOpposingStarterStrikeouts).toBeCloseTo((1 + 1 + 7 + 5 + 5) / 5, 8);
    expect(summary.averageTeamStrikeouts).toBeCloseTo((9 + 7 + 9 + 8 + 7) / 5, 8);
  });

  it("does not invalidate the SP IP/K average when one game is missing Game K, or vice versa", () => {
    const detail = buildStrikeoutPropDetail({
      pitcher: "Test Pitcher",
      team: "TOR",
      opponent: "TB",
      gameDate: "2026-07-23",
      pitcherLastFiveStarts: [],
      opponentLastFiveGames: [
        { date: "2026-07-22", opponent: "TOR", opposingStartingPitcher: "A", opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 6, teamTotalStrikeouts: null },
        { date: "2026-07-21", opponent: "TOR", opposingStartingPitcher: "B", opposingStarterInningsPitched: "5.0", opposingStarterStrikeouts: 5, teamTotalStrikeouts: 8 },
      ],
      generatedAt: "2026-07-23T13:00:00.000Z",
      source: "mlb_stats_api",
    });
    const summary = detail.opponentLastFiveVsStartersSummary;
    expect(summary.gamesUsed).toBe(2);
    expect(summary.averageOpposingStarterStrikeouts).toBeCloseTo((6 + 5) / 2, 8);
    expect(summary.averageTeamStrikeouts).toBe(8);
  });

  it("returns null averages (not zero) when the opponent has no games at all", () => {
    const detail = buildStrikeoutPropDetail({
      pitcher: "Test Pitcher",
      team: "TOR",
      opponent: "TB",
      gameDate: "2026-07-23",
      pitcherLastFiveStarts: [],
      opponentLastFiveGames: [],
      generatedAt: "2026-07-23T13:00:00.000Z",
      source: "mlb_stats_api",
    });
    const summary = detail.opponentLastFiveVsStartersSummary;
    expect(summary.gamesUsed).toBe(0);
    expect(summary.totalOpposingStarterOuts).toBeNull();
    expect(summary.averageOpposingStarterStrikeouts).toBeNull();
    expect(summary.averageTeamStrikeouts).toBeNull();
  });
});

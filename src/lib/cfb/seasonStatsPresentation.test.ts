import { describe, expect, it } from "vitest";
import { selectMatchupSeasonStatsContext } from "./seasonStatsPresentation";
import type { CfbSeasonStats } from "../../data/cfb/types";

function stats(teamId: string, overrides: Partial<CfbSeasonStats> = {}): CfbSeasonStats {
  return {
    teamId,
    gamesPlayed: 0,
    pointsPerGame: null,
    yardsPerPlay: null,
    pointsPerPlay: null,
    rushYardsPerGame: null,
    yardsPerRush: null,
    passYardsPerGame: null,
    yardsPerPass: null,
    thirdDownPct: null,
    completionPct: null,
    turnovers: null,
    pointsAllowedPerGame: null,
    yardsPerPlayAllowed: null,
    opponentPointsPerPlay: null,
    rushYardsAllowedPerGame: null,
    yardsPerRushAllowed: null,
    passYardsAllowedPerGame: null,
    yardsPerPassAllowed: null,
    opponentThirdDownPct: null,
    opponentCompletionPct: null,
    takeaways: null,
    ...overrides,
  };
}

const ZERO_CURRENT = { current: stats("away"), currentRanks: {} };
const NO_PREVIOUS = { previous: undefined, previousRanks: undefined };

describe("selectMatchupSeasonStatsContext", () => {
  it("activates current-season mode only once BOTH teams have played", () => {
    const result = selectMatchupSeasonStatsContext({
      currentSeason: 2026,
      previousSeason: 2025,
      away: {
        current: stats("away", { gamesPlayed: 1, pointsPerGame: 35 }),
        currentRanks: { pointsPerGame: 5 },
        ...NO_PREVIOUS,
      },
      home: {
        current: stats("home", { gamesPlayed: 1, pointsPerGame: 20 }),
        currentRanks: { pointsPerGame: 40 },
        ...NO_PREVIOUS,
      },
    });
    expect(result?.isCurrentSeason).toBe(true);
    expect(result?.season).toBe(2026);
    expect(result?.seasonLabel).toBe("2026 Season");
    expect(result?.away.pointsPerGame).toBe(35);
    expect(result?.awayRanks.pointsPerGame).toBe(5);
  });

  it("does NOT activate current-season mode when only one team has played (falls back to previous season)", () => {
    const result = selectMatchupSeasonStatsContext({
      currentSeason: 2026,
      previousSeason: 2025,
      away: {
        current: stats("away", { gamesPlayed: 1, pointsPerGame: 35 }),
        currentRanks: {},
        previous: stats("away", { gamesPlayed: 12, pointsPerGame: 30 }),
        previousRanks: { pointsPerGame: 10 },
      },
      home: { ...ZERO_CURRENT, current: stats("home", { gamesPlayed: 0 }), ...NO_PREVIOUS },
    });
    expect(result?.isCurrentSeason).toBe(false);
    expect(result?.season).toBe(2025);
    // Neither side shows 2026 values even though away has real current-season data.
    expect(result?.away.pointsPerGame).toBe(30);
  });

  it("labels the fallback explicitly as 'Last Season · <year>'", () => {
    const result = selectMatchupSeasonStatsContext({
      currentSeason: 2026,
      previousSeason: 2025,
      away: { ...ZERO_CURRENT, previous: stats("away", { gamesPlayed: 12 }), previousRanks: {} },
      home: { current: stats("home"), currentRanks: {}, ...NO_PREVIOUS },
    });
    expect(result?.seasonLabel).toBe("Last Season · 2025");
  });

  it("never mixes seasons: previous-season mode always returns both sides from the same season", () => {
    const result = selectMatchupSeasonStatsContext({
      currentSeason: 2026,
      previousSeason: 2025,
      away: {
        current: stats("away", { gamesPlayed: 1 }),
        currentRanks: {},
        previous: stats("away", { gamesPlayed: 12, pointsPerGame: 40 }),
        previousRanks: {},
      },
      home: { current: stats("home", { gamesPlayed: 0 }), currentRanks: {}, ...NO_PREVIOUS },
    });
    // away has real current-season data, but since home hasn't played, the
    // whole table falls back to 2025 for BOTH — away's 2026 values must not leak in.
    expect(result?.season).toBe(2025);
    expect(result?.away.pointsPerGame).toBe(40);
    expect(result?.home.pointsPerGame).toBeNull();
  });

  it("shows the available side and an honest null row for the side with no prior-season data (NDSU-like)", () => {
    const result = selectMatchupSeasonStatsContext({
      currentSeason: 2026,
      previousSeason: 2025,
      away: { current: stats("away"), currentRanks: {}, previous: stats("away", { gamesPlayed: 12, pointsPerGame: 28 }), previousRanks: { pointsPerGame: 33 } },
      home: { current: stats("home"), currentRanks: {}, previous: undefined, previousRanks: undefined }, // e.g. NDSU: no 2025 FBS data
    });
    expect(result?.seasonLabel).toBe("Last Season · 2025");
    expect(result?.away.pointsPerGame).toBe(28);
    expect(result?.awayRanks.pointsPerGame).toBe(33);
    expect(result?.home.pointsPerGame).toBeNull();
    expect(result?.home.gamesPlayed).toBe(0);
    expect(Object.keys(result?.homeRanks ?? {})).toHaveLength(0);
  });

  it("returns null (compact placeholder) when neither season has usable data for either team", () => {
    const result = selectMatchupSeasonStatsContext({
      currentSeason: 2026,
      previousSeason: 2025,
      away: { ...ZERO_CURRENT, ...NO_PREVIOUS },
      home: { current: stats("home"), currentRanks: {}, ...NO_PREVIOUS },
    });
    expect(result).toBeNull();
  });

  it("returns null when previousSeason is null and no current-season data exists", () => {
    const result = selectMatchupSeasonStatsContext({
      currentSeason: 2026,
      previousSeason: null,
      away: { ...ZERO_CURRENT, ...NO_PREVIOUS },
      home: { current: stats("home"), currentRanks: {}, ...NO_PREVIOUS },
    });
    expect(result).toBeNull();
  });
});

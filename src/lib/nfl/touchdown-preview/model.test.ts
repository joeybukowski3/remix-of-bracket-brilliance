import { describe, expect, it } from "vitest";
import { aggregateScorerTouchdownsByPosition, buildAllTouchdownWindows, buildTouchdownScores, defaultTouchdownSort, isTouchdownOpportunity, opponentPositionTdAllowedRates, selectPlayerGames, TD_SUCCESS_PRIOR_OPPORTUNITIES } from "./model";
import type { TouchdownCandidateInput, TouchdownOpponentGame, TouchdownPlayerGame, TouchdownPosition } from "./types";

function game(overrides: Partial<TouchdownPlayerGame> = {}): TouchdownPlayerGame {
  return { gameId: "2025_01_AAA_BBB", season: 2025, week: 1, date: null, team: "aaa", opponent: "bbb", homeAway: "home", teamScore: 24, opponentScore: 17,
    carries: 10, targets: 4, scorerOpportunities: 14, teamScorerOpportunities: 50, teamRzOpportunities: 8, teamGoalLineOpportunities: 3, rushingTds: 1, receivingTds: 0, touchdowns: 1,
    rzOpportunities: 3, inside10Opportunities: 2, goalLineOpportunities: 1, ...overrides };
}
function defense(overrides: Partial<TouchdownOpponentGame> = {}): TouchdownOpponentGame {
  return { gameId: "2025_01_CCC_BBB", season: 2025, week: 1, date: null, defense: "bbb", opponent: "ccc", homeAway: "away", defenseScore: 17, opponentScore: 24,
    offensiveTdsAllowed: 3, rzOpportunitiesAllowed: 5, inside10OpportunitiesAllowed: 3, goalLineOpportunitiesAllowed: 2,
    touchdownsAllowedByPosition: { QB: 0, RB: 1, WR: 2, TE: 0 }, ...overrides };
}
function candidate(id: string, multiplier: number, position: TouchdownPosition = "RB"): TouchdownCandidateInput {
  return { playerId: id, playerName: `Player ${id}`, team: "aaa", opponent: "bbb", homeAway: "home", position, gameId: "2026_01_AAA_BBB", kickoff: null,
    impliedTeamPoints: 20 + multiplier, playerGames: [game({ scorerOpportunities: 8 + multiplier, carries: 8 + multiplier, targets: 0, teamScorerOpportunities: 50,
      touchdowns: multiplier > 1 ? 1 : 0, rushingTds: multiplier > 1 ? 1 : 0, rzOpportunities: multiplier, inside10Opportunities: multiplier, goalLineOpportunities: multiplier })],
    opponentGames: [defense({ rzOpportunitiesAllowed: 3 + multiplier, inside10OpportunitiesAllowed: 2 + multiplier, goalLineOpportunitiesAllowed: 1 + multiplier,
      touchdownsAllowedByPosition: { QB: 0, RB: multiplier, WR: 1, TE: 0 } })] };
}

describe("JKB TD Score V1", () => {
  it("calculates deterministically, normalizes the fixed population, and sorts descending by default", () => {
    const population = [candidate("a", 1), candidate("b", 2), candidate("c", 3)];
    const first = buildTouchdownScores(population, "2025");
    const second = buildTouchdownScores(population, "2025");
    expect(first).toEqual(second);
    expect(first.map((row) => row.windows["2025"].jkbTdScore)).toEqual([0, 38.33, 61.67]);
    expect(defaultTouchdownSort(first, "2025").map((row) => row.playerId)).toEqual(["c", "b", "a"]);
  });

  it("keeps scores fixed when consumers filter the already-scored population", () => {
    const scored = buildTouchdownScores([candidate("a", 1), candidate("b", 2), candidate("c", 3)], "2025");
    const before = scored.find((row) => row.playerId === "b")!.windows["2025"].jkbTdScore;
    const filtered = scored.filter((row) => row.playerId === "b");
    expect(filtered[0].windows["2025"].jkbTdScore).toBe(before);
    expect(filtered[0].windows["2025"].scorePoolSize).toBe(3);
  });

  it("uses the 25/35/40 normalized TD opportunity blend", () => {
    const scored = buildTouchdownScores([candidate("low", 1), candidate("high", 2)], "2025");
    expect(scored[1].windows["2025"].components.tdOpportunities.value).toBe(50);
  });

  it("uses inclusive scoring-area boundaries", () => {
    expect(isTouchdownOpportunity(20, 20)).toBe(true);
    expect(isTouchdownOpportunity(10, 10)).toBe(true);
    expect(isTouchdownOpportunity(5, 5)).toBe(true);
    expect(isTouchdownOpportunity(21, 20)).toBe(false);
  });

  it("shrinks tiny-sample TD conversion toward the population rate", () => {
    const lucky = candidate("lucky", 1); lucky.playerGames = [game({ scorerOpportunities: 1, carries: 1, targets: 0, touchdowns: 1, rushingTds: 1 })];
    const normal = candidate("normal", 2); normal.playerGames = [game({ scorerOpportunities: 19, carries: 19, targets: 0, touchdowns: 1, rushingTds: 1 })];
    const rows = buildTouchdownScores([lucky, normal], "2025");
    expect(TD_SUCCESS_PRIOR_OPPORTUNITIES).toBe(20);
    expect(rows[0].windows["2025"].tdSuccessRate).toBeLessThan(0.2);
  });

  it("selects season windows and Last 8 across a season boundary", () => {
    const games = [1, 2, 3].map((week) => game({ season: 2026, week, gameId: `2026_${week}` }))
      .concat([14, 15, 16, 17, 18, 13].map((week) => game({ season: 2025, week, gameId: `2025_${week}` })));
    expect(selectPlayerGames(games, "2026")).toHaveLength(3);
    expect(selectPlayerGames(games, "2025")).toHaveLength(6);
    expect(selectPlayerGames(games, "last8").map((row) => row.gameId)).toEqual(["2026_3", "2026_2", "2026_1", "2025_18", "2025_17", "2025_16", "2025_15", "2025_14"]);
  });

  it("distinguishes missing from a real zero-game current-season sample", () => {
    const missing = candidate("missing", 1); missing.playerGames = null; missing.opponentGames = null;
    const zero = candidate("zero", 2); zero.playerGames = [game()]; zero.opponentGames = [defense()];
    const rows = buildAllTouchdownWindows([missing, zero]);
    expect(rows[0].windows["2026"].sampleState).toBe("missing");
    expect(rows[1].windows["2026"].sampleState).toBe("zero");
    expect(rows[1].windows["2026"].tdPerGame).toBeNull();
  });

  it("fails the score closed when any required component is unavailable", () => {
    const row = candidate("missing-rz", 1); row.playerGames = [game({ rzOpportunities: null })];
    expect(buildTouchdownScores([row], "2025")[0].windows["2025"].jkbTdScore).toBeNull();
  });

  it("integrates actual implied team points and positional TD allowed rates", () => {
    const rows = buildTouchdownScores([candidate("low", 1), candidate("high", 3)], "2025");
    expect(rows[1].windows["2025"].components.impliedTeamPoints.percentile).toBe(50);
    expect(rows[1].windows["2025"].opponentPositionTdsAllowedPerGame).toBe(3);
  });

  it("aggregates scorer TDs by position without passing or special-teams double counts", () => {
    expect(aggregateScorerTouchdownsByPosition([
      { position: "QB", rushingTds: 1, receivingTds: 0, passingTds: 4, specialTeamsTds: 0 },
      { position: "WR", rushingTds: 0, receivingTds: 1, passingTds: 0, specialTeamsTds: 1 },
    ])).toEqual({ QB: 1, RB: 0, WR: 1, TE: 0 });
  });

  it("aggregates opponent scoring opportunities with closer chances weighted more", () => {
    const row = buildTouchdownScores([candidate("only", 2)], "2025")[0].windows["2025"];
    expect(row.opponentTdOpportunitiesPerGame).toBe(3.85);
  });
});

describe("opponent position TD allowed — SZN and trailing-5", () => {
  // Opponent "sea" defensive games, one per (season, week). WR TDs allowed vary.
  const seasonGames = (weeks: { season: number; week: number; wr: number }[]) =>
    weeks.map(({ season, week, wr }) => defense({
      gameId: `${season}_${String(week).padStart(2, "0")}_XXX_SEA`, season, week, defense: "sea",
      touchdownsAllowedByPosition: { QB: 0, RB: 0, WR: wr, TE: 0 },
    }));

  it("computes current-season position TD/game from YTD games only", () => {
    const games = seasonGames([
      { season: 2025, week: 16, wr: 5 }, { season: 2025, week: 17, wr: 5 },
      { season: 2026, week: 1, wr: 2 }, { season: 2026, week: 2, wr: 4 },
    ]);
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    expect(rates.season).toBe(3); // (2 + 4) / 2 current-season games — 2025 games excluded
  });

  it("2026 Week 1: trailing five is the final five 2025 opponent games", () => {
    const games = seasonGames([13, 14, 15, 16, 17, 18].map((week) => ({ season: 2025, week, wr: week === 18 ? 6 : 1 })));
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    // Latest five 2025 weeks: 14,15,16,17,18 -> (1+1+1+1+6)/5 = 2. Week 13 dropped.
    expect(rates.last5).toBe(2);
    // No 2026 games yet -> SZN falls back to the FULL 2025 regular season, all six
    // weeks: (1+1+1+1+1+6)/6 = 1.8333. Never null, never a blend.
    expect(rates.season).toBeCloseTo(1.833333, 5);
    expect(rates.seasonSource).toBe("prior_season_fallback");
  });

  it("SZN fallback: 0 current-season opponent games -> full prior regular-season rate", () => {
    const games = seasonGames([
      { season: 2025, week: 1, wr: 2 }, { season: 2025, week: 2, wr: 4 }, { season: 2025, week: 3, wr: 0 },
    ]);
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    expect(rates.season).toBe(2); // (2 + 4 + 0) / 3 full 2025 season
    expect(rates.seasonSource).toBe("prior_season_fallback");
  });

  it("SZN fallback: switches to current-season YTD the moment the opponent has one 2026 game", () => {
    const games = seasonGames([
      { season: 2025, week: 16, wr: 5 }, { season: 2025, week: 17, wr: 5 },
      { season: 2026, week: 1, wr: 1 },
    ]);
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    expect(rates.season).toBe(1); // only the single 2026 game
    expect(rates.seasonSource).toBe("current_season");
  });

  it("SZN fallback: later current-season games keep using current-season YTD only", () => {
    const games = seasonGames([
      { season: 2025, week: 17, wr: 9 },
      { season: 2026, week: 1, wr: 2 }, { season: 2026, week: 2, wr: 4 }, { season: 2026, week: 3, wr: 0 },
    ]);
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    expect(rates.season).toBe(2); // (2 + 4 + 0) / 3, 2025 excluded
    expect(rates.seasonSource).toBe("current_season");
  });

  it("SZN fallback: null source only when neither current nor prior season has a game", () => {
    const empty = opponentPositionTdAllowedRates([], "WR", 2026);
    expect(empty.season).toBeNull();
    expect(empty.seasonSource).toBeNull();
    const staleOnly = opponentPositionTdAllowedRates(seasonGames([{ season: 2024, week: 1, wr: 3 }]), "WR", 2026);
    expect(staleOnly.season).toBeNull();
    expect(staleOnly.seasonSource).toBeNull();
  });

  it("SZN fallback: Last 5 stays the cross-season rolling metric, unchanged by the fallback", () => {
    const games = seasonGames([13, 14, 15, 16, 17, 18].map((week) => ({ season: 2025, week, wr: week === 18 ? 6 : 1 })));
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    expect(rates.last5).toBe(2); // latest five 2025 games, identical to prior behavior
    expect(rates.seasonSource).toBe("prior_season_fallback");
  });

  it("SZN fallback: build output carries current_season provenance for real YTD data", () => {
    const c = candidate("y", 2, "WR");
    c.opponentGames = seasonGames([
      { season: 2025, week: 18, wr: 9 },
      { season: 2026, week: 1, wr: 3 },
    ]);
    const rows = buildAllTouchdownWindows([c], 2026);
    for (const key of ["2025", "2026", "last8"] as const) {
      expect(rows[0].windows[key].opponentPositionTdsAllowedPerGameSeason).toBe(3);
      expect(rows[0].windows[key].opponentPositionTdsAllowedPerGameSeasonSource).toBe("current_season");
    }
  });

  it("SZN fallback: build output carries prior_season_fallback provenance in Week 1 state", () => {
    const c = candidate("z", 2, "WR");
    c.opponentGames = seasonGames([
      { season: 2025, week: 17, wr: 1 }, { season: 2025, week: 18, wr: 3 },
    ]);
    const rows = buildAllTouchdownWindows([c], 2026);
    expect(rows[0].windows.last8.opponentPositionTdsAllowedPerGameSeason).toBe(2);
    expect(rows[0].windows.last8.opponentPositionTdsAllowedPerGameSeasonSource).toBe("prior_season_fallback");
  });

  it("2026 Week 3: trailing five is 3 prior-season games + 2 current-season games", () => {
    const games = seasonGames([
      { season: 2025, week: 16, wr: 0 }, { season: 2025, week: 17, wr: 0 }, { season: 2025, week: 18, wr: 0 },
      { season: 2026, week: 1, wr: 5 }, { season: 2026, week: 2, wr: 5 },
    ]);
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    expect(rates.last5).toBe(2); // (0+0+0+5+5)/5
    expect(rates.season).toBe(5); // (5+5)/2
  });

  it("once five current-season games exist, trailing five is current-season only", () => {
    const games = seasonGames([
      ...[1, 2, 3].map((week) => ({ season: 2025, week: 15 + week, wr: 9 })),
      ...[1, 2, 3, 4, 5].map((week) => ({ season: 2026, week, wr: 1 })),
    ]);
    const rates = opponentPositionTdAllowedRates(games, "WR", 2026);
    expect(rates.last5).toBe(1); // five 2026 games at 1 each; no 2025 leakage
  });

  it("ranks each opponent metric's own favorable percentile over the full candidate population", () => {
    const mk = (id: string, seasonWr: number, last5Wr: number) => {
      const c = candidate(id, 2, "WR");
      c.opponentGames = [
        defense({ gameId: `2026_01_X_${id}`, season: 2026, week: 1, defense: id, touchdownsAllowedByPosition: { QB: 0, RB: 0, WR: seasonWr, TE: 0 } }),
        defense({ gameId: `2025_18_X_${id}`, season: 2025, week: 18, defense: id, touchdownsAllowedByPosition: { QB: 0, RB: 0, WR: last5Wr, TE: 0 } }),
      ];
      return c;
    };
    // SZN uses only the 2026 game; Last5 averages both. Distinct raw values -> distinct percentiles.
    const rows = buildTouchdownScores([mk("lo", 0, 0), mk("mid", 2, 2), mk("hi", 5, 5)], "last8", 2026);
    const szn = rows.map((r) => r.windows.last8.opponentPositionTdsAllowedPerGameSeasonPercentile);
    const l5 = rows.map((r) => r.windows.last8.opponentPositionTdsAllowedPerGameLast5Percentile);
    expect(szn[0]).toBe(0);
    expect(szn[2]).toBeGreaterThan(szn[1]!);
    // Higher allowance -> higher (more favorable) percentile on both metrics.
    expect(l5[2]).toBeGreaterThan(l5[0]!);
  });

  it("exposes both figures on every window, unaffected by the Last 8 selection", () => {
    const c = candidate("x", 2, "WR");
    c.opponentGames = seasonGames([
      { season: 2025, week: 17, wr: 3 }, { season: 2025, week: 18, wr: 3 },
      { season: 2026, week: 1, wr: 1 },
    ]);
    const rows = buildAllTouchdownWindows([c], 2026);
    for (const key of ["2025", "2026", "last8"] as const) {
      expect(rows[0].windows[key].opponentPositionTdsAllowedPerGameSeason).toBe(1);
      expect(rows[0].windows[key].opponentPositionTdsAllowedPerGameLast5).toBeCloseTo(2.3333, 3);
    }
  });
});

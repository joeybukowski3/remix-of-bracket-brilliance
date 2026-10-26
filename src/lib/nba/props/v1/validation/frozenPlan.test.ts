import { describe, expect, it } from "vitest";
import { computePregameFeatures } from "../../features";
import { BASELINE_V0_PUBLIC_PARAMS, projectBaseline } from "../../projection";
import type { NbaPlayerGame } from "../../types";
import { CANDIDATE_IDS, CANDIDATE_RATE_SHRINK_MINUTES, MATERIAL_MIN_ROWS, MATERIAL_RELATIVE_WORSENING, PLAN_FROZEN_ON, PRIMARY_MEASURES, projectCandidate, usesFixedMinutesPrior } from "./frozenPlan";

const league = { leagueRate: { pts: 0.5, reb: 0.2, ast: 0.1 } };

function game(season: string, date: string, minutes: number, over: Partial<NbaPlayerGame> = {}): NbaPlayerGame {
  return {
    schemaVersion: "nba-player-game-v1", playerId: 1, playerName: "Demo", minutes, gameId: `${season}-${date}`, gameDate: date, season, seasonType: "regular", teamId: 1, teamAbbr: "BOS",
    opponentTeamId: 2, opponentAbbr: "NYK", isHome: true, sourceSnapshotId: "test", pts: Math.round(minutes * 0.6), reb: Math.round(minutes * 0.2), ast: Math.round(minutes * 0.1),
    oreb: 0, dreb: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, stl: 0, blk: 0, tov: 0, pf: 0, plusMinus: null, ...over,
  };
}

const featuresFor = (history: NbaPlayerGame[], season = "2025-26", date = "2026-03-01") =>
  computePregameFeatures(history, { gameId: "target", cutoffDate: date, season, teamId: 1 }, new Map());

const seasonGames = (season: string, n: number, minutes: number, startMonth: string, ptsRate = 0.6) =>
  Array.from({ length: n }, (_, i) => game(season, `${startMonth}-${String(i + 1).padStart(2, "0")}`, minutes, { pts: Math.round(minutes * ptsRate * 10) / 10 }));

describe("the frozen plan", () => {
  it("pins the candidates exactly as chosen before any evaluation", () => {
    expect(PLAN_FROZEN_ON).toBe("2026-10-26");
    expect(CANDIDATE_RATE_SHRINK_MINUTES).toBe(25);
    expect(BASELINE_V0_PUBLIC_PARAMS.newPlayerMinutes).toBe(14);
    expect(BASELINE_V0_PUBLIC_PARAMS.minutesShrinkGames).toBe(2);
    expect(BASELINE_V0_PUBLIC_PARAMS.rateShrinkMinutes).toEqual({ pts: 100, reb: 100, ast: 100 });
    expect(CANDIDATE_IDS).toEqual(["baseline", "A", "B", "AB"]);
    expect(PRIMARY_MEASURES).toEqual({ A: ["minutes", "pts"], B: ["pts", "reb", "ast"], AB: ["minutes", "pts", "reb", "ast"] });
    expect(MATERIAL_MIN_ROWS).toBe(200);
    expect(MATERIAL_RELATIVE_WORSENING).toBe(0.02);
  });
});

describe("projectCandidate", () => {
  const rookie = featuresFor(seasonGames("2025-26", 6, 30, "2026-01"));
  const veteran = featuresFor([...seasonGames("2024-25", 40, 30, "2025-01", 0.3), ...seasonGames("2025-26", 6, 20, "2026-01", 0.6)]);

  it("reproduces the public baseline exactly for the baseline candidate", () => {
    for (const f of [rookie, veteran]) expect(projectCandidate("baseline", f, league)).toEqual(projectBaseline(f, league, BASELINE_V0_PUBLIC_PARAMS));
  });

  it("A removes the shrink toward the fixed 14-minute prior for a player with no qualifying previous season and in-season games", () => {
    expect(usesFixedMinutesPrior(rookie)).toBe(true);
    const base = projectCandidate("baseline", rookie, league).minutes as number;
    const a = projectCandidate("A", rookie, league).minutes as number;
    expect(a).toBeCloseTo(30, 9);
    expect(base).toBeLessThan(a);
  });

  it("A leaves a player with a qualifying previous season untouched, and a first game of the season too", () => {
    expect(usesFixedMinutesPrior(veteran)).toBe(false);
    expect(projectCandidate("A", veteran, league)).toEqual(projectCandidate("baseline", veteran, league));
    const opener = featuresFor(seasonGames("2024-25", 5, 25, "2025-01"), "2025-26", "2025-10-25");
    expect(opener.seasonPriorGames).toBe(0);
    expect(usesFixedMinutesPrior(opener)).toBe(false);
    expect(projectCandidate("A", opener, league)).toEqual(projectCandidate("baseline", opener, league));
  });

  it("B changes only the rates, with a 25-minute weight, and leaves minutes alone", () => {
    const b = projectCandidate("B", veteran, league);
    const base = projectCandidate("baseline", veteran, league);
    expect(b.minutes).toBe(base.minutes);
    expect(b.pts).not.toBe(base.pts);
    const last20Rate = (veteran.last[20]?.totals.pts ?? 0) / (veteran.last[20]?.totals.minutes ?? 1);
    const prevRate = (veteran.previousRegularSeason?.totals.pts ?? 0) / (veteran.previousRegularSeason?.totals.minutes ?? 1);
    const expectedRate = ((veteran.last[20]?.totals.pts ?? 0) + 25 * prevRate) / ((veteran.last[20]?.totals.minutes ?? 0) + 25);
    expect(b.pts).toBeCloseTo((b.minutes as number) * expectedRate, 9);
    expect(Math.abs(last20Rate - expectedRate)).toBeLessThan(Math.abs(last20Rate - prevRate) + 1e-9);
  });

  it("AB is A's minutes with B's rates", () => {
    const ab = projectCandidate("AB", rookie, league);
    expect(ab.minutes).toBe(projectCandidate("A", rookie, league).minutes);
    expect(ab.pts).toBeCloseTo((ab.minutes as number) * ((projectCandidate("B", rookie, league).pts as number) / (projectCandidate("B", rookie, league).minutes as number)), 9);
  });

  it("depends only on pregame features: it takes no outcome", () => {
    expect(projectCandidate.length).toBe(3);
  });
});

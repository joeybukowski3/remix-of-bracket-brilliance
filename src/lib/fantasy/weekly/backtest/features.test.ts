import { describe, expect, it } from "vitest";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { normalizeWeeklyUsage } from "@/lib/fantasy/weekly/usage";
import { buildPregameFeatureDataset, buildPregameFeatureSnapshot, type HistoricalTeamWeek } from "./features";

function row(overrides: Partial<HistoricalPlayerWeek> & { season: number; week: number }): HistoricalPlayerWeek {
  const position = overrides.position ?? "RB" as FantasyPosition;
  return {
    season: overrides.season,
    week: overrides.week,
    playerId: overrides.playerId ?? "gsis:p1",
    playerName: overrides.playerName ?? "Player One",
    position,
    team: overrides.team ?? "det",
    opponent: overrides.opponent ?? "gb",
    externalIds: { gsis: "p1", pfr: null, espn: null },
    actualFantasyPoints: overrides.actualFantasyPoints ?? 10,
    stats: {
      passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
      rushAttempts: 0, rushingYards: 0, rushingTouchdowns: 0, receptions: 0, targets: 0,
      receivingYards: 0, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0,
      receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0,
      rushingTwoPointConversions: 0, receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0,
      ...overrides.stats,
    },
    usage: overrides.usage ?? normalizeWeeklyUsage({ rushAttempts: 10, targets: 2, receptions: 1 }),
    provenance: {
      source: "nflverse stats_player weekly",
      sourceSeason: overrides.season,
      sourceWeek: overrides.week,
      scoringVersion: "jkb-full-ppr-v1.0.0",
      snapSource: null,
    },
  };
}

describe("leakage-safe pregame feature snapshots", () => {
  it("excludes target-week and future player outcomes from every rolling window", () => {
    const target = row({ season: 2024, week: 4, actualFantasyPoints: 99 });
    const history = [
      row({ season: 2024, week: 1, actualFantasyPoints: 3 }),
      row({ season: 2024, week: 2, actualFantasyPoints: 6 }),
      row({ season: 2024, week: 3, actualFantasyPoints: 9 }),
      target,
      row({ season: 2024, week: 5, actualFantasyPoints: 200 }),
    ];
    const snapshot = buildPregameFeatureSnapshot(target, history);
    expect(snapshot.baseline.rollingPpg).toMatchObject({ last1: 9, last3: 6, last5: 6, seasonToDate: 6 });
    expect(snapshot.cutoffs.playerHistoryLatest).toEqual({ season: 2024, week: 3 });
  });

  it("uses target-week team identity while retaining pre-trade history by stable player ID", () => {
    const target = row({ season: 2024, week: 9, team: "buf", opponent: "mia" });
    const snapshot = buildPregameFeatureSnapshot(target, [
      row({ season: 2024, week: 7, team: "det", opponent: "min", actualFantasyPoints: 8 }),
      row({ season: 2024, week: 8, team: "buf", opponent: "nyj", actualFantasyPoints: 12 }),
      target,
    ]);
    expect(snapshot.team).toBe("buf");
    expect(snapshot.baseline.rollingPpg.last3).toBe(10);
  });

  it("never fabricates missing usage shares", () => {
    const target = row({ season: 2024, week: 2 });
    const snapshot = buildPregameFeatureSnapshot(target, [
      row({ season: 2024, week: 1, usage: normalizeWeeklyUsage({ targets: 5 }) }),
      target,
    ]);
    expect(snapshot.usage.targets.last1).toBe(5);
    expect(snapshot.usage.targetShare.last1).toBeNull();
    expect(snapshot.missingFeatures).toContain("usage.targetShare.last3");
  });

  it("builds current FPA only from opponent games before the target week", () => {
    const target = row({ season: 2024, week: 4, opponent: "gb" });
    const history = [
      row({ season: 2024, week: 1, playerId: "gsis:a", team: "chi", opponent: "gb", actualFantasyPoints: 10 }),
      row({ season: 2024, week: 1, playerId: "gsis:b", team: "chi", opponent: "gb", actualFantasyPoints: 5 }),
      row({ season: 2024, week: 2, playerId: "gsis:c", team: "atl", opponent: "gb", actualFantasyPoints: 25 }),
      target,
      row({ season: 2024, week: 5, playerId: "gsis:d", team: "min", opponent: "gb", actualFantasyPoints: 100 }),
    ];
    expect(buildPregameFeatureSnapshot(target, history).matchup.currentSeasonFpaPerGame).toBe(20);
  });

  it("uses only prior team games for EPA and play-volume context", () => {
    const target = row({ season: 2024, week: 3, team: "det", opponent: "gb" });
    const teamHistory: HistoricalTeamWeek[] = [
      { season: 2024, week: 1, team: "det", opponent: "chi", offensiveEpa: 6, offensivePlays: 60, passingEpa: 4, passingPlays: 40, rushingEpa: 2, rushingPlays: 20 },
      { season: 2024, week: 2, team: "det", opponent: "min", offensiveEpa: 8, offensivePlays: 70, passingEpa: 5, passingPlays: 45, rushingEpa: 3, rushingPlays: 25 },
      { season: 2024, week: 3, team: "det", opponent: "gb", offensiveEpa: 100, offensivePlays: 100, passingEpa: 50, passingPlays: 50, rushingEpa: 50, rushingPlays: 50 },
    ];
    const snapshot = buildPregameFeatureSnapshot(target, [target], { teamHistory });
    expect(snapshot.teamEnvironment.offensiveEpaPerPlay).toBeCloseTo(14 / 130);
    expect(snapshot.teamEnvironment.playsPerGame).toBe(65);
    expect(snapshot.cutoffs.teamHistoryLatest).toEqual({ season: 2024, week: 2 });
  });

  it("rejects market rows without verified pregame timing", () => {
    const target = row({ season: 2024, week: 3, team: "det", opponent: "gb" });
    const market = {
      season: 2024, week: 3, homeTeam: "det", awayTeam: "gb", homeSpread: -3,
      total: 48, neutralSite: false, capturedAt: "2024-09-20T12:00:00.000Z",
      kickoffAt: "2024-09-22T17:00:00.000Z", source: "test", timestampVerifiedPregame: false,
    };
    const excluded = buildPregameFeatureSnapshot(target, [target], { markets: [market] });
    expect(excluded.market).toMatchObject({ teamImpliedTotal: null, excludedReason: "unverified-pregame" });
    const accepted = buildPregameFeatureSnapshot(target, [target], {
      markets: [{ ...market, timestampVerifiedPregame: true }],
    });
    expect(accepted.market).toMatchObject({ teamImpliedTotal: 25.5, opponentImpliedTotal: 22.5 });
  });

  it("generates the same canonically ordered dataset regardless of input order", () => {
    const first = row({ season: 2024, week: 1, playerId: "gsis:b" });
    const second = row({ season: 2024, week: 2, playerId: "gsis:a" });
    expect(buildPregameFeatureDataset([second, first])).toEqual(buildPregameFeatureDataset([first, second]));
  });
});

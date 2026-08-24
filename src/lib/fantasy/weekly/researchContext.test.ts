import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildWeeklyFantasyResearchContexts } from "@/lib/fantasy/weekly/researchContext";

function row(input: {
  playerId: string;
  season: number;
  week: number;
  position?: HistoricalPlayerWeek["position"];
  opponent?: string;
  points?: number;
  played?: boolean;
  carries?: number;
  receptions?: number;
  targets?: number;
  rushingYards?: number;
  targetShare?: number | null;
  airYards?: number | null;
}): HistoricalPlayerWeek {
  const position = input.position ?? "RB";
  const played = input.played ?? true;
  return {
    season: input.season,
    week: input.week,
    playerId: input.playerId,
    playerName: input.playerId,
    position,
    team: "buf",
    opponent: input.opponent ?? "mia",
    externalIds: { gsisId: input.playerId.replace("gsis:", ""), pfrId: null, sleeperId: null, espnId: null },
    actualFantasyPoints: input.points ?? 10,
    stats: {
      passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
      rushAttempts: input.carries ?? 10, rushingYards: input.rushingYards ?? 50, rushingTouchdowns: 0,
      receptions: input.receptions ?? 2, targets: input.targets ?? 3, receivingYards: 20, receivingTouchdowns: 0,
      sackFumblesLost: 0, rushingFumblesLost: 0, receivingFumblesLost: 0, fumblesLost: 0,
      passingTwoPointConversions: 0, rushingTwoPointConversions: 0, receivingTwoPointConversions: 0,
      specialTeamsTouchdowns: 0,
    },
    usage: {
      offensiveSnaps: null, snapShare: null, passAttempts: 0, completions: 0,
      rushAttempts: input.carries ?? 10, targets: input.targets ?? 3, receptions: input.receptions ?? 2,
      receivingAirYards: input.airYards ?? 30, targetShare: input.targetShare ?? 0.2, airYardsShare: 0.1,
      routes: null, routeParticipation: null, redZoneTouches: null, goalLineTouches: null, redZoneTargets: null,
    },
    provenance: {
      source: played ? "nflverse stats_player weekly" : "nflverse weekly roster eligible zero",
      sourceSeason: input.season,
      sourceWeek: input.week,
      scoringVersion: "jkb-full-ppr-v1.0.0",
      snapSource: null,
    },
  };
}

const candidate = { playerId: "gsis:player", position: "RB" as const, opponent: "mia" };

function addDefenseGame(history: HistoricalPlayerWeek[], season: number, week: number, rbPoints: number) {
  history.push(
    row({ playerId: `gsis:rb-${season}-${week}`, season, week, position: "RB", opponent: "mia", points: rbPoints }),
    row({ playerId: `gsis:qb-${season}-${week}`, season, week, position: "QB", opponent: "mia", points: 20 }),
  );
}

describe("weekly fantasy research windows", () => {
  it("Week 1 uses 2025 Weeks 1-17 for season PPG/FPA and the final five eligible games for L5", () => {
    const history: HistoricalPlayerWeek[] = [];
    for (let week = 12; week <= 18; week += 1) {
      history.push(row({ playerId: candidate.playerId, season: 2025, week, points: week }));
      addDefenseGame(history, 2025, week, week);
    }

    const context = buildWeeklyFantasyResearchContexts([candidate], history, 2026, 1).get(candidate.playerId)!;
    expect(context.seasonPpg.games.map((game) => game.week)).toEqual([12, 13, 14, 15, 16, 17]);
    expect(context.seasonPpg.value).toBe(14.5);
    expect(context.last5Ppg.games.map((game) => game.week)).toEqual([13, 14, 15, 16, 17]);
    expect(context.last5Ppg.value).toBe(15);
    expect(context.opponentFpaSeason.games.map((game) => game.week)).toEqual([12, 13, 14, 15, 16, 17]);
    expect(context.opponentFpaLast5.games.map((game) => game.week)).toEqual([13, 14, 15, 16, 17]);
  });

  it("Week 2 uses 2026 Week 1 for season values and carries L5 backward into 2025", () => {
    const history: HistoricalPlayerWeek[] = [];
    for (let week = 13; week <= 17; week += 1) {
      history.push(row({ playerId: candidate.playerId, season: 2025, week, points: week }));
      addDefenseGame(history, 2025, week, week);
    }
    history.push(row({ playerId: candidate.playerId, season: 2026, week: 1, points: 21 }));
    addDefenseGame(history, 2026, 1, 31);

    const context = buildWeeklyFantasyResearchContexts([candidate], history, 2026, 2).get(candidate.playerId)!;
    expect(context.seasonPpg.value).toBe(21);
    expect(context.seasonPpg.games).toEqual([{ season: 2026, week: 1 }]);
    expect(context.last5Ppg.games).toEqual([
      { season: 2025, week: 14 }, { season: 2025, week: 15 }, { season: 2025, week: 16 },
      { season: 2025, week: 17 }, { season: 2026, week: 1 },
    ]);
    expect(context.opponentFpaSeason.value).toBe(52);
    expect(context.opponentFpaLast5.games.at(-1)).toEqual({ season: 2026, week: 1 });
  });

  it("drops all 2025 samples after five eligible 2026 appearances", () => {
    const history: HistoricalPlayerWeek[] = [row({ playerId: candidate.playerId, season: 2025, week: 17, points: 99 })];
    for (let week = 1; week <= 5; week += 1) history.push(row({ playerId: candidate.playerId, season: 2026, week, points: week }));

    const context = buildWeeklyFantasyResearchContexts([candidate], history, 2026, 6).get(candidate.playerId)!;
    expect(context.last5Ppg.games).toEqual([1, 2, 3, 4, 5].map((week) => ({ season: 2026, week })));
    expect(context.last5Ppg.value).toBe(3);
  });

  it("player L5 uses appearances while defensive L5 uses team games across byes and missed games", () => {
    const history: HistoricalPlayerWeek[] = [];
    history.push(row({ playerId: candidate.playerId, season: 2026, week: 1, points: 10 }));
    history.push(row({ playerId: candidate.playerId, season: 2026, week: 2, points: 0, played: false }));
    history.push(row({ playerId: candidate.playerId, season: 2026, week: 4, points: 14 }));
    for (const week of [1, 2, 4, 5, 6]) addDefenseGame(history, 2026, week, week);

    const context = buildWeeklyFantasyResearchContexts([candidate], history, 2026, 7).get(candidate.playerId)!;
    expect(context.last5Ppg.games).toEqual([{ season: 2026, week: 1 }, { season: 2026, week: 4 }]);
    expect(context.opponentFpaLast5.games.map((game) => game.week)).toEqual([1, 2, 4, 5, 6]);
  });

  it("never reads target-week, future, playoff, or 2025 Week 18 rows", () => {
    const history = [
      row({ playerId: candidate.playerId, season: 2025, week: 17, points: 17 }),
      row({ playerId: candidate.playerId, season: 2025, week: 18, points: 180 }),
      row({ playerId: candidate.playerId, season: 2026, week: 1, points: 1 }),
      row({ playerId: candidate.playerId, season: 2026, week: 2, points: 200 }),
      row({ playerId: candidate.playerId, season: 2026, week: 3, points: 300 }),
    ];
    const context = buildWeeklyFantasyResearchContexts([candidate], history, 2026, 2).get(candidate.playerId)!;
    expect(context.seasonPpg.value).toBe(1);
    expect(context.last5Ppg.value).toBe(9);
    expect(context.last5Ppg.games).toEqual([{ season: 2025, week: 17 }, { season: 2026, week: 1 }]);
  });

  it("keeps unavailable red-zone touches missing instead of fabricating zero", () => {
    const context = buildWeeklyFantasyResearchContexts(
      [candidate],
      [row({ playerId: candidate.playerId, season: 2025, week: 1 })],
      2026,
      1,
    ).get(candidate.playerId)!;
    expect(context.evidence.redZoneTouches.value).toBeNull();
    expect(context.evidence.redZoneTouches.rank).toBeNull();
  });
});

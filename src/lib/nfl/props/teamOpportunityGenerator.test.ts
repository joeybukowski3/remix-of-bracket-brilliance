import { describe, expect, it } from "vitest";
import type { NflPropRawGameRecord } from "./historicalOutcomes";
import type { NflTeamGameLogEntry } from "./teamPlayVolume";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { marketKey } from "./qbOpportunityFeatures";
import { generateTeamOpportunityArtifact, type NflTeamOpportunitySources } from "./teamOpportunityGenerator";
import { buildTeamOpportunityFeatureRow } from "./teamOpportunityFeatures";
import type { NflTeamOpportunityFeatureRow } from "./types/teamOpportunity";

type Pv = NflTeamGameLogEntry;

function pv(season: number, week: number, team: string, opponent: string, passPlays: number, rushPlays: number, dateUtc: string): Pv {
  return {
    gameId: `${season}_${String(week).padStart(2, "0")}_${team.toUpperCase()}_${opponent.toUpperCase()}`,
    season, week, team, opponent,
    eligiblePlays: passPlays + rushPlays, passPlays, rushPlays,
    neutralEligiblePlays: Math.round((passPlays + rushPlays) * 0.6), neutralPassPlays: Math.round(passPlays * 0.6),
    passOeSum: 0, passOeCount: passPlays + rushPlays, gameDateUtc: dateUtc,
  } as Pv;
}

const TEAMS = ["aaa", "bbb", "ccc", "ddd"];

// Two full prior seasons (2024, 2025) of history for all four teams.
function historySeason(season: number): Pv[] {
  const out: Pv[] = [];
  for (let week = 1; week <= 8; week += 1) {
    const date = `${season}-10-${String(week).padStart(2, "0")}T17:00:00.000Z`;
    out.push(pv(season, week, "aaa", "bbb", 38 + (week % 4), 24 - (week % 3), date));
    out.push(pv(season, week, "bbb", "aaa", 34 + (week % 3), 26 - (week % 4), date));
    out.push(pv(season, week, "ccc", "ddd", 40 - (week % 3), 22 + (week % 4), date));
    out.push(pv(season, week, "ddd", "ccc", 30 + (week % 5), 28 - (week % 3), date));
  }
  return out;
}

const history: Pv[] = [...historySeason(2024), ...historySeason(2025)];

const targetGames: NflPropRawGameRecord[] = [
  { gameId: "2026_01_BBB_AAA", season: 2026, week: 1, seasonType: "REG", homeAbbr: "aaa", awayAbbr: "bbb", dateUtc: "2026-09-10T17:00:00.000Z" },
  { gameId: "2026_01_DDD_CCC", season: 2026, week: 1, seasonType: "REG", homeAbbr: "ccc", awayAbbr: "ddd", dateUtc: "2026-09-10T20:00:00.000Z" },
];

// Schedule records the join index needs for the history seasons too.
function scheduleFromLog(log: readonly Pv[]): NflPropRawGameRecord[] {
  const seen = new Set<string>();
  const out: NflPropRawGameRecord[] = [];
  for (const e of log) {
    if (seen.has(e.gameId)) continue;
    seen.add(e.gameId);
    const home = e.team < e.opponent ? e.team : e.opponent;
    const away = e.team < e.opponent ? e.opponent : e.team;
    out.push({ gameId: e.gameId, season: e.season, week: e.week, seasonType: "REG", homeAbbr: home, awayAbbr: away, dateUtc: e.gameDateUtc });
  }
  return out;
}

const games = [...scheduleFromLog(history), ...targetGames];
const gameJoinIndexForHistory = new Map(
  scheduleFromLog(history).flatMap((g) => [
    [`${g.season}|${g.week}|${g.homeAbbr}`, { gameId: g.gameId, homeAway: "home" as const, gameDateUtc: g.dateUtc }],
    [`${g.season}|${g.week}|${g.awayAbbr}`, { gameId: g.gameId, homeAway: "away" as const, gameDateUtc: g.dateUtc }],
  ]),
);
const neutralByGame = new Map(history.map((e) => [e.gameId, false]));
const market = new Map<string, NflHistoricalMarketRow>([
  [marketKey(2026, 1, "aaa"), { season: 2026, week: 1, team: "aaa", homeAway: "home", spread: -3, total: 45, impliedTeamTotal: 24 }],
  [marketKey(2026, 1, "bbb"), { season: 2026, week: 1, team: "bbb", homeAway: "away", spread: 3, total: 45, impliedTeamTotal: 21 }],
  [marketKey(2026, 1, "ccc"), { season: 2026, week: 1, team: "ccc", homeAway: "home", spread: -6, total: 41, impliedTeamTotal: 23.5 }],
  [marketKey(2026, 1, "ddd"), { season: 2026, week: 1, team: "ddd", homeAway: "away", spread: 6, total: 41, impliedTeamTotal: 17.5 }],
]);

const historicalRows: NflTeamOpportunityFeatureRow[] = history.map((e) =>
  buildTeamOpportunityFeatureRow(e, gameJoinIndexForHistory, { fullTeamGameLog: history, marketByKey: market }, neutralByGame),
);

function baseSources(overrides: Partial<NflTeamOpportunitySources> = {}): NflTeamOpportunitySources {
  return {
    season: 2026, week: 1, generatedAt: "2026-09-02T12:00:00.000Z",
    games, fullTeamGameLog: history, marketByKey: market, marketAvailable: true,
    historicalRows, trainingSeasons: [2024, 2025],
    ...overrides,
  };
}

describe("generateTeamOpportunityArtifact", () => {
  it("emits exactly one row per team per game, both teams present", () => {
    const artifact = generateTeamOpportunityArtifact(baseSources());
    expect(artifact.rows).toHaveLength(4);
    expect(artifact.qa.gamesExpected).toBe(2);
    expect(artifact.qa.bothTeamsPresentForEveryGame).toBe(true);
    const keys = artifact.rows.map((r) => `${r.gameId}|${r.team}`);
    expect(new Set(keys).size).toBe(4);
    for (const team of TEAMS) expect(artifact.rows.some((r) => r.team === team)).toBe(true);
  });

  it("keeps the pass/rush split coherent with team plays for every row", () => {
    const artifact = generateTeamOpportunityArtifact(baseSources());
    for (const r of artifact.rows) {
      expect(r.projectedPassAttempts + r.projectedRushAttempts).toBeCloseTo(r.projectedTeamPlays, 6);
      expect(r.projectedDropbackRate).toBeGreaterThan(0);
      expect(r.projectedDropbackRate).toBeLessThan(1);
      expect(r.projectedTeamPlays).toBeGreaterThan(0);
      expect(r.projectedRushAttempts).toBeGreaterThanOrEqual(0);
    }
    expect(artifact.qa.coherenceViolations).toBe(0);
  });

  it("is deterministic for identical sources", () => {
    const a = generateTeamOpportunityArtifact(baseSources());
    const b = generateTeamOpportunityArtifact(baseSources());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("drops the target week from training even if it leaks into historicalRows", () => {
    const leaked = [
      ...historicalRows,
      { ...historicalRows[0], season: 2026, week: 1, target: { offensivePlays: 999, dropbackRate: 0.99, passAttempts: 989, rushAttempts: 10 } },
    ];
    const artifact = generateTeamOpportunityArtifact(baseSources({ historicalRows: leaked, trainingSeasons: [2024, 2025, 2026] }));
    for (const r of artifact.rows) expect(r.projectedTeamPlays).toBeLessThan(85);
  });

  it("resolves canonical team aliases from the schedule (LA -> lar)", () => {
    // Self-contained: 'lar' and 'aaa' meet in 2026 wk1, both carry 2025 history.
    const larLog: Pv[] = [];
    for (let week = 1; week <= 8; week += 1) {
      const date = `2025-10-${String(week).padStart(2, "0")}T17:00:00.000Z`;
      larLog.push(pv(2025, week, "aaa", "lar", 37 + (week % 4), 25 - (week % 3), date));
      larLog.push(pv(2025, week, "lar", "aaa", 35 + (week % 3), 27 - (week % 4), date));
    }
    const larSchedule = scheduleFromLog(larLog);
    const larJoin = new Map(
      larSchedule.flatMap((g) => [
        [`${g.season}|${g.week}|${g.homeAbbr}`, { gameId: g.gameId, homeAway: "home" as const, gameDateUtc: g.dateUtc }],
        [`${g.season}|${g.week}|${g.awayAbbr}`, { gameId: g.gameId, homeAway: "away" as const, gameDateUtc: g.dateUtc }],
      ]),
    );
    const larNeutral = new Map(larLog.map((e) => [e.gameId, false]));
    const larRows = larLog.map((e) => buildTeamOpportunityFeatureRow(e, larJoin, { fullTeamGameLog: larLog, marketByKey: market }, larNeutral));
    const aliasGames: NflPropRawGameRecord[] = [
      ...larSchedule,
      { gameId: "2026_01_LA_AAA", season: 2026, week: 1, seasonType: "REG", homeAbbr: "aaa", awayAbbr: "LA", dateUtc: "2026-09-13T17:00:00.000Z" },
    ];
    const artifact = generateTeamOpportunityArtifact(
      baseSources({ games: aliasGames, fullTeamGameLog: larLog, historicalRows: larRows, trainingSeasons: [2025] }),
    );
    expect(artifact.qa.gamesExpected).toBe(1);
    expect(artifact.rows.map((r) => r.team).sort()).toEqual(["aaa", "lar"]);
    expect(artifact.rows.find((r) => r.team === "aaa")!.opponent).toBe("lar");
  });

  it("reports football-plausible QA ranges", () => {
    const artifact = generateTeamOpportunityArtifact(baseSources());
    expect(artifact.qa.playsRange.min).toBeGreaterThan(45);
    expect(artifact.qa.playsRange.max).toBeLessThan(82);
    expect(artifact.qa.dropbackRateRange.min).toBeGreaterThan(0.3);
    expect(artifact.qa.dropbackRateRange.max).toBeLessThan(0.85);
    expect(artifact.qa.largestPlaysOutliers.length).toBeGreaterThan(0);
  });

  it("throws when a training-season filter leaves no rows", () => {
    expect(() => generateTeamOpportunityArtifact(baseSources({ trainingSeasons: [1999] }))).toThrow(/no training rows/);
  });

  it("fails closed on a duplicate schedule row for the same team/game (no silent duplicate team rows)", () => {
    const dupGames = [...games, targetGames[0]];
    expect(() => generateTeamOpportunityArtifact(baseSources({ games: dupGames }))).toThrow(/duplicate team row/);
  });
});

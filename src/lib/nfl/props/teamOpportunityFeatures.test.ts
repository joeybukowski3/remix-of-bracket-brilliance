import { describe, expect, it } from "vitest";
import type { NflTeamGameLogEntry } from "./teamPlayVolume";
import type { NflGameJoinRecord } from "./historicalOutcomes";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { marketKey } from "./qbOpportunityFeatures";
import {
  buildTeamOpportunityFeatureRow,
  buildTeamOpportunityFeatureRowForTarget,
} from "./teamOpportunityFeatures";
import { coalesceScalar } from "./teamOpportunityModel";

type Pv = {
  gameId: string; season: number; week: number; team: string; opponent: string;
  eligiblePlays: number; passPlays: number; rushPlays: number;
  neutralEligiblePlays: number; neutralPassPlays: number; passOeSum: number; passOeCount: number;
  gameDateUtc: string;
};

function pv(partial: Partial<Pv> & { season: number; week: number; team: string; opponent: string; passPlays: number; rushPlays: number }): Pv {
  const eligible = partial.passPlays + partial.rushPlays;
  return {
    gameId: partial.gameId ?? `${partial.season}_${String(partial.week).padStart(2, "0")}_${partial.team.toUpperCase()}_${partial.opponent.toUpperCase()}`,
    season: partial.season, week: partial.week, team: partial.team, opponent: partial.opponent,
    eligiblePlays: partial.eligiblePlays ?? eligible, passPlays: partial.passPlays, rushPlays: partial.rushPlays,
    neutralEligiblePlays: partial.neutralEligiblePlays ?? Math.round(eligible * 0.6),
    neutralPassPlays: partial.neutralPassPlays ?? Math.round(partial.passPlays * 0.6),
    passOeSum: partial.passOeSum ?? 0, passOeCount: partial.passOeCount ?? eligible,
    gameDateUtc: partial.gameDateUtc ?? `${partial.season}-09-${String(partial.week * 7).padStart(2, "0")}T17:00:00.000Z`,
  };
}

function joinIndex(log: readonly Pv[]): Map<string, NflGameJoinRecord> {
  const map = new Map<string, NflGameJoinRecord>();
  for (const e of log) {
    map.set(`${e.season}|${e.week}|${e.team}`, {
      gameId: e.gameId,
      homeAway: e.team < e.opponent ? "home" : "away",
      gameDateUtc: e.gameDateUtc,
    });
  }
  return map;
}

const emptyMarket = new Map<string, NflHistoricalMarketRow>();

// AAA: weeks 1-3 of 2025 + a full prior 2024 season (2 games).
const log: Pv[] = [
  pv({ season: 2024, week: 1, team: "aaa", opponent: "zzz", passPlays: 30, rushPlays: 30 }),
  pv({ season: 2024, week: 2, team: "aaa", opponent: "yyy", passPlays: 40, rushPlays: 20 }),
  pv({ season: 2024, week: 1, team: "bbb", opponent: "yyy", passPlays: 38, rushPlays: 24 }),
  pv({ season: 2025, week: 1, team: "aaa", opponent: "bbb", passPlays: 35, rushPlays: 25 }),
  pv({ season: 2025, week: 2, team: "aaa", opponent: "ccc", passPlays: 45, rushPlays: 15 }),
  pv({ season: 2025, week: 3, team: "aaa", opponent: "bbb", passPlays: 50, rushPlays: 10 }),
  pv({ season: 2025, week: 1, team: "bbb", opponent: "aaa", passPlays: 33, rushPlays: 27 }),
  pv({ season: 2025, week: 2, team: "bbb", opponent: "zzz", passPlays: 36, rushPlays: 26 }),
  pv({ season: 2025, week: 3, team: "bbb", opponent: "aaa", passPlays: 39, rushPlays: 25 }),
];
const gameJoinIndex = joinIndex(log);
const fullTeamGameLog = log as unknown as NflTeamGameLogEntry[];
const neutralByGame = new Map(log.map((e) => [e.gameId, false]));

describe("team opportunity features — point-in-time isolation", () => {
  it("uses only the team's own games strictly before the target kickoff (N-1)", () => {
    const week3 = log.find((e) => e.season === 2025 && e.week === 3 && e.team === "aaa")!;
    const built = buildTeamOpportunityFeatureRow(week3, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutralByGame);
    // seasonPrior window = weeks 1-2 only: plays (60+60)/2 = 60, dropbacks (35+45)/(60+60)=0.6667
    expect(coalesceScalar(built.features.teamOffense.offensivePlaysPerGame)).toBeCloseTo(60, 6);
    expect(coalesceScalar(built.features.teamOffense.dropbackRate)).toBeCloseTo(80 / 120, 6);
    expect(built.diagnostics.gamesPlayedPriorThisSeason).toBe(2);
  });

  it("never reads any counter from the target game itself", () => {
    const week3 = log.find((e) => e.season === 2025 && e.week === 3 && e.team === "aaa")!;
    const clean = buildTeamOpportunityFeatureRow(week3, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutralByGame);
    const tampered = { ...week3, passPlays: 5, rushPlays: 5, eligiblePlays: 10 };
    const tamperedLog = fullTeamGameLog.map((e) => (e === (week3 as unknown as NflTeamGameLogEntry) ? (tampered as unknown as NflTeamGameLogEntry) : e));
    const after = buildTeamOpportunityFeatureRow(
      { ...week3, passPlays: 50, rushPlays: 10, eligiblePlays: 60 },
      gameJoinIndex,
      { fullTeamGameLog: tamperedLog, marketByKey: emptyMarket },
      neutralByGame,
    );
    expect(JSON.stringify(after.features)).toBe(JSON.stringify(clean.features));
    // ...but the resolved target does reflect the actual game.
    expect(after.target).toEqual({ offensivePlays: 60, dropbackRate: 50 / 60, passAttempts: 50, rushAttempts: 10 });
  });

  it("falls back to the prior season window when there are no prior in-season games", () => {
    const week1 = log.find((e) => e.season === 2025 && e.week === 1 && e.team === "aaa")!;
    const built = buildTeamOpportunityFeatureRow(week1, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutralByGame);
    expect(built.features.teamOffense.offensivePlaysPerGame.seasonPrior).toBeNull();
    // prior season = 2024 weeks 1-2: (60+60)/2 = 60
    expect(built.features.teamOffense.offensivePlaysPerGame.priorSeason).toBeCloseTo(60, 6);
    expect(coalesceScalar(built.features.teamOffense.offensivePlaysPerGame)).toBeCloseTo(60, 6);
    expect(built.diagnostics.hasPriorSeason).toBe(true);
  });

  it("reads opponent-allowed windows off the same records via the opponent field", () => {
    // AAA week 3 opponent is BBB. BBB allowed = games where opponent === 'bbb'
    // strictly before AAA's week-3 kickoff: AAA wk1 (60 plays vs bbb) + AAA wk2? no (vs ccc).
    // Actually opponent-as 'bbb': 2024 aaa-wk? none vs bbb; 2025 aaa wk1 vs bbb (60), plus any others.
    const week3 = log.find((e) => e.season === 2025 && e.week === 3 && e.team === "aaa")!;
    const built = buildTeamOpportunityFeatureRow(week3, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutralByGame);
    expect(built.features.opponentDefense.offensivePlaysPerGameAllowed.seasonPrior).not.toBeNull();
  });

  it("passes neutral-site status through untouched", () => {
    const week3 = log.find((e) => e.season === 2025 && e.week === 3 && e.team === "aaa")!;
    const neutral = new Map(neutralByGame);
    neutral.set(week3.gameId, true);
    const built = buildTeamOpportunityFeatureRow(week3, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutral);
    expect(built.neutralSite).toBe(true);
    expect(built.features.market.isNeutralSite).toBe(1);
  });

  it("attaches market context by season/week/team key", () => {
    const week3 = log.find((e) => e.season === 2025 && e.week === 3 && e.team === "aaa")!;
    const market = new Map<string, NflHistoricalMarketRow>([
      [marketKey(2025, 3, "aaa"), { season: 2025, week: 3, team: "aaa", homeAway: "home", spread: -6, total: 44, impliedTeamTotal: 25 }],
    ]);
    const built = buildTeamOpportunityFeatureRow(week3, gameJoinIndex, { fullTeamGameLog, marketByKey: market }, neutralByGame);
    expect(built.features.market).toMatchObject({ spread: -6, total: 44, impliedTeamTotal: 25 });
  });

  it("rejects a malformed play-volume record where eligible != pass + rush", () => {
    const bad = { gameId: "x", season: 2025, week: 4, team: "aaa", opponent: "bbb", eligiblePlays: 99, passPlays: 40, rushPlays: 20 };
    expect(() => buildTeamOpportunityFeatureRow(bad, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutralByGame)).toThrow(/Malformed/);
  });

  it("throws when the target game has no schedule join", () => {
    const orphan = { gameId: "x", season: 2025, week: 9, team: "aaa", opponent: "bbb", eligiblePlays: 60, passPlays: 40, rushPlays: 20 };
    expect(() => buildTeamOpportunityFeatureRow(orphan, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutralByGame)).toThrow(/No schedule entry/);
  });

  it("the live ForTarget builder produces the same features and no target", () => {
    const week3 = log.find((e) => e.season === 2025 && e.week === 3 && e.team === "aaa")!;
    const historical = buildTeamOpportunityFeatureRow(week3, gameJoinIndex, { fullTeamGameLog, marketByKey: emptyMarket }, neutralByGame);
    const live = buildTeamOpportunityFeatureRowForTarget(
      { season: 2025, week: 3, gameId: week3.gameId, team: "aaa", opponent: "bbb", homeAway: "home", neutralSite: false, gameDateUtc: week3.gameDateUtc },
      { fullTeamGameLog, marketByKey: emptyMarket },
    );
    expect(JSON.stringify(live.features)).toBe(JSON.stringify(historical.features));
    expect(live.target).toBeUndefined();
  });
});

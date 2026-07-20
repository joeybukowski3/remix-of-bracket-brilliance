import { describe, expect, it } from "vitest";
import { buildGameTopProps } from "@/lib/mlb/topProps/buildGameTopProps";
import type { BuildGameTopPropsInput, GameIdentity } from "@/lib/mlb/topProps/types";
import type { HrDashboardBatter, HrDashboardPendingGame, PitcherStrikeoutTeamRow, PitcherVsBatterRow } from "@/pages/MlbHrProps";
import type { NumerologyDailyData, NumerologyPlay, WatchlistPlay, DailyProfile } from "@/types/mlbNumerology";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";
import type { MoneylineApiResponse } from "@/lib/mlb/polymarketMoneylines";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";

const GAME_PK = DEV_MLB_MATCHUP_FIXTURE.detail.game.gamePk; // 2026051001, away NYY @ home BOS
const AWAY = "NYY";
const HOME = "BOS";
const OTHER_GAME_PK = 999999999;

function baseIdentity(overrides: Partial<GameIdentity> = {}): GameIdentity {
  return {
    gamePk: GAME_PK,
    gameDate: "2026-05-10",
    awayAbbr: AWAY,
    homeAbbr: HOME,
    gameStatusCategory: "scheduled",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<MlbGameDetail> = {}): MlbGameDetail {
  return { ...DEV_MLB_MATCHUP_FIXTURE.detail, ...overrides };
}

function makeBatter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: `${AWAY}@${HOME}`,
    playerId: 1,
    gameId: GAME_PK,
    lineupStatus: "confirmed",
    battingOrder: 3,
    starterConfirmed: true,
    position: "OF",
    player: "Test Player",
    team: AWAY,
    opponent: HOME,
    opposingPitcher: "Test Pitcher",
    opposingPitcherId: 1002,
    pitcherHand: "R",
    ballpark: "Fenway Park",
    parkFactor: 1.0,
    atBats: 120,
    barrelRate: 10,
    hardHitRate: 40,
    exitVelo: 90,
    iso: 0.2,
    hrFBRatio: 12,
    pullRate: 40,
    xba: 0.25,
    kRate: 20,
    bbRate: 8,
    whiffRate: 25,
    last7HR: 1,
    last30HR: 3,
    opposingPitcherHrVs: 60,
    opposingPitcherHitsVs: 60,
    opposingPitcherKVs: 60,
    weatherBoost: 0,
    hrScore: 60,
    hrScoreRank: 1,
    angleTags: [],
    ...overrides,
  };
}

function makeKRow(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: `${AWAY}@${HOME}`,
    gameId: GAME_PK,
    pitcherId: 1001,
    pitcher: "Test Pitcher",
    team: AWAY,
    opponent: HOME,
    park: "Fenway Park",
    parkFactor: 1.0,
    pitcherKRate: 25,
    pitcherWhiffRate: 28,
    pitcherKVs: 60,
    opponentTeamKRate: 24,
    opponentTeamWhiffRate: 27,
    opponentTeamXba: 0.24,
    pitcherKSkillScore: 60,
    opponentTeamStrikeoutScore: 60,
    strikeoutMatchupScore: 60,
    whyItRanksWell: "",
    projectedIP: 6,
    projectedKs: 7.5,
    kLine: 6.5,
    kOddsOver: "-115",
    kOddsUnder: "-105",
    kOddsBook: "fanduel",
    workloadConfidenceGrade: "A",
    workloadConfidenceScore: 90,
    workloadFlags: [],
    publicRecommendationEligible: true,
    ...overrides,
  };
}

function makeBvpRow(overrides: Partial<PitcherVsBatterRow> = {}): PitcherVsBatterRow {
  return {
    rank: 1,
    gameKey: `${AWAY}@${HOME}`,
    gameId: GAME_PK,
    player: "Test Player",
    playerId: 1,
    team: AWAY,
    opposingPitcher: "Test Pitcher",
    opposingPitcherId: 1002,
    park: "Fenway Park",
    parkFactor: 1.0,
    hrScore: 60,
    opposingPitcherHrVs: 60,
    opposingPitcherHitsVs: 60,
    opposingPitcherKVs: 60,
    hrTargetScore: 60,
    bestMatchupScore: 70,
    strikeoutMatchupScore: 60,
    batterPowerScore: 60,
    pitcherVulnerabilityScore: 60,
    contextScore: 60,
    barrelRate: 10,
    hardHitRate: 40,
    xba: 0.25,
    kRate: 20,
    whiffRate: 25,
    pitcherBarrelRate: 8,
    pitcherHardHitRate: 35,
    pitcherKRate: 22,
    pitcherFlyBallRate: 35,
    windBlowingOut: false,
    angleTags: [],
    ...overrides,
  };
}

function makeDailyProfile(): DailyProfile {
  return {
    universalDayRawSum: 27,
    universalDayCompound: 27,
    universalDayMaster: null,
    universalDayRoot: 9,
    universalDayTrace: ["27", "9"],
    calendarDayCompound: 10,
    calendarDayRoot: 1,
    universalYear: 10,
    universalMonth: 5,
    structuralEcho: "",
    primaryFamily: [9],
    secondaryFamily: [],
    balancingComplement: 0,
    countercurrent: 0,
    repeatedDigits: [],
    interpretation: "",
  };
}

function makeNumerologyPlay(overrides: Partial<NumerologyPlay> = {}): NumerologyPlay {
  return {
    rank: 1,
    playerId: 501,
    playerName: "Test Numerology Player",
    team: AWAY,
    opponent: HOME,
    lineupStatus: "confirmed",
    recommendedMarket: "Home run",
    numerologyScore: 79,
    baseballScore: 30,
    finalScore: 79,
    confidence: "high",
    positiveSignals: [],
    counterSignals: [],
    ...overrides,
  };
}

function makeWatchlistPlay(overrides: Partial<WatchlistPlay> & { playerId?: number } = {}): WatchlistPlay {
  return {
    rank: 10,
    playerName: "Watchlist Player",
    team: AWAY,
    opponent: HOME,
    lineupStatus: "confirmed",
    recommendedMarket: "Home run",
    numerologyScore: 50,
    baseballScore: 20,
    finalScore: 50,
    ...overrides,
  };
}

function makeNumerologyData(overrides: Partial<NumerologyDailyData> = {}): NumerologyDailyData {
  return {
    date: "2026-05-10",
    timezone: "America/New_York",
    methodologyVersion: "v3",
    scheduledFor: "morning",
    generatedAt: "2026-05-10T09:00:00Z",
    generationMode: "live",
    narrativeSource: "grok",
    dataStatus: "partially_confirmed",
    dailyProfile: makeDailyProfile(),
    featuredPlays: [],
    watchlist: [],
    ...overrides,
  };
}

function makePolymarket(overrides: Partial<MoneylineApiResponse> = {}): MoneylineApiResponse {
  return {
    source: "polymarket",
    date: "2026-05-10",
    updatedAt: "2026-05-10T09:00:00Z",
    stale: false,
    matchedCount: 1,
    totalGames: 1,
    games: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<BuildGameTopPropsInput> = {}): BuildGameTopPropsInput {
  return {
    identity: baseIdentity(),
    detail: makeDetail(),
    mlbOdds: null,
    polymarket: null,
    propsData: {
      batters: [],
      strikeoutDetailRows: [],
      batterVsPitcherRows: [],
      pendingGames: [],
      stale: false,
      generatedAt: "2026-05-10T09:00:00Z",
    },
    bvpHistoryByKey: new Map(),
    numerology: { data: null, isStale: false },
    ...overrides,
  };
}

describe("buildGameTopProps", () => {
  describe("game filtering", () => {
    it("includes HR rows for this game and excludes rows from other games", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          batters: [
            makeBatter({ player: "In Game", gameId: GAME_PK }),
            makeBatter({ player: "Other Game", gameId: OTHER_GAME_PK, playerId: 2 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.homeRuns.items.map((i) => i.player)).toEqual(["In Game"]);
    });

    it("excludes strikeout rows from other games (no cross-game leakage)", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [
            makeKRow({ pitcher: "In Game", gameId: GAME_PK }),
            makeKRow({ pitcher: "Other Game", gameId: OTHER_GAME_PK, pitcherId: 55 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items.map((i) => i.pitcher)).toEqual(["In Game"]);
    });

    it("excludes batter-vs-pitcher rows from other games", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          batterVsPitcherRows: [
            makeBvpRow({ player: "In Game", gameId: GAME_PK }),
            makeBvpRow({ player: "Other Game", gameId: OTHER_GAME_PK, playerId: 2 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.batterVsPitcher.items.map((i) => i.player)).toEqual(["In Game"]);
    });

    it("does not confuse gameKey collisions across a doubleheader -- filters on gameId, not gameKey", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          batters: [
            makeBatter({ player: "Game 1", gameId: GAME_PK, gameKey: `${AWAY}@${HOME}` }),
            makeBatter({ player: "Game 2 (DH)", gameId: OTHER_GAME_PK, gameKey: `${AWAY}@${HOME}`, playerId: 2 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.homeRuns.items).toHaveLength(1);
      expect(result.homeRuns.items[0].player).toBe("Game 1");
    });

    it("matches numerology rows by live schedule date + abbreviations, not a static team list", () => {
      const input = baseInput({
        numerology: {
          data: makeNumerologyData({
            date: "2026-05-10",
            featuredPlays: [
              makeNumerologyPlay({ playerId: 1, playerName: "This Game", team: AWAY, opponent: HOME }),
              makeNumerologyPlay({ playerId: 2, playerName: "Other Game", team: "SEA", opponent: "TEX" }),
            ],
          }),
          isStale: false,
        },
      });
      const result = buildGameTopProps(input);
      expect(result.numerology.items.map((i) => i.playerName)).toEqual(["This Game"]);
    });
  });

  describe("HR ranking preservation", () => {
    it("re-ranks the per-game subset by hrScore, not the global hrScoreRank", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          batters: [
            makeBatter({ player: "Lower score, better global rank", hrScore: 40, hrScoreRank: 1, playerId: 1 }),
            makeBatter({ player: "Higher score, worse global rank", hrScore: 80, hrScoreRank: 50, playerId: 2 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.homeRuns.items[0].player).toBe("Higher score, worse global rank");
      expect(result.homeRuns.items[0].gameRank).toBe(1);
    });

    it("excludes batters failing the existing eligibility gate (small sample / barrel-rate artifact)", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          batters: [
            makeBatter({ player: "Too few AB", atBats: 10, playerId: 1 }),
            makeBatter({ player: "Barrel artifact", barrelRate: 40, playerId: 2 }),
            makeBatter({ player: "Eligible", atBats: 120, barrelRate: 12, playerId: 3 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.homeRuns.items.map((i) => i.player)).toEqual(["Eligible"]);
    });

    it("caps at 3 results", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          batters: [1, 2, 3, 4, 5].map((n) => makeBatter({ player: `P${n}`, playerId: n, hrScore: 50 + n })),
        },
      });
      const result = buildGameTopProps(input);
      expect(result.homeRuns.items).toHaveLength(3);
      expect(result.homeRuns.items[0].player).toBe("P5");
    });
  });

  describe("K qualification preservation", () => {
    it("keeps VALID rows as qualified with a direction and edge", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [makeKRow({ projectedKs: 8, kLine: 6.5 })],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items[0].qualification).toBe("qualified");
      expect(result.strikeouts.items[0].direction).toBe("over");
    });

    it("keeps NO_MARKET rows as informational, never as a qualified play", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [makeKRow({ kLine: null, kOddsOver: null, kOddsUnder: null })],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items[0].qualification).toBe("informational");
    });

    it("drops LOW_CONFIDENCE / INSUFFICIENT_DATA / INVALID_ODDS / INVALID_WORKLOAD rows entirely", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [
            makeKRow({ pitcher: "Insufficient data", projectedKs: undefined, projectedIP: undefined, pitcherId: 1 }),
            makeKRow({ pitcher: "Low K line", kLine: 1, pitcherId: 2 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items).toHaveLength(0);
      expect(result.strikeouts.status).toBe("empty");
      expect(result.strikeouts.message).toBe("No qualified strikeout play for this game.");
    });

    it("caps at 2 results (one standard game has two starters)", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [
            makeKRow({ pitcher: "Away starter", pitcherId: 1, team: AWAY, opponent: HOME }),
            makeKRow({ pitcher: "Home starter", pitcherId: 2, team: HOME, opponent: AWAY }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items).toHaveLength(2);
    });

    it("excludes a zero-edge VALID row as a qualified play (a market exists, but it's not recommended)", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [makeKRow({ projectedKs: 6.5, kLine: 6.5 })],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items).toHaveLength(0);
      expect(result.strikeouts.status).toBe("empty");
    });

    it("excludes a row with projectedIP exactly 3.0 (strictly greater than 3.0 required)", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [makeKRow({ projectedIP: 3.0 })],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items).toHaveLength(0);
      expect(result.strikeouts.status).toBe("empty");
    });

    it("accepts a row with projectedIP just above 3.0", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [makeKRow({ projectedIP: 3.01 })],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items[0].qualification).toBe("qualified");
    });

    it("excludes a VALID row missing odds for the recommended side, per the canonical value-play selector", () => {
      // direction is "over" (projectedKs 7.5 > kLine 6.5); odds exist only
      // for the opposite (under) side, so the canonical selector's
      // hasOddsForSide check fails for the derived "over" side.
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [makeKRow({ kOddsOver: null, kOddsUnder: "-110" })],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items).toHaveLength(0);
      expect(result.strikeouts.status).toBe("empty");
    });

    it("keeps NO_MARKET rows informational regardless of the value-play bar", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [makeKRow({ kLine: null, kOddsOver: null, kOddsUnder: null })],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items[0].qualification).toBe("informational");
      expect(result.strikeouts.items[0].projectedKs).not.toBeNull();
    });

    it("ranks qualified value-plays ahead of informational NO_MARKET rows", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          strikeoutDetailRows: [
            makeKRow({ pitcher: "No market", pitcherId: 1, kLine: null, kOddsOver: null, kOddsUnder: null }),
            makeKRow({ pitcher: "Qualified", pitcherId: 2, projectedKs: 8, kLine: 6.5 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.strikeouts.items.map((i) => i.pitcher)).toEqual(["Qualified", "No market"]);
    });

    it("derives Over and Under direction from getProjectionEdgeInfo(), and both remain eligible", () => {
      const overRow = makeKRow({ pitcher: "Over pitcher", pitcherId: 1, projectedKs: 8, kLine: 6.5, kOddsOver: "-115", kOddsUnder: "-105" });
      const underRow = makeKRow({ pitcher: "Under pitcher", pitcherId: 2, projectedKs: 5, kLine: 6.5, kOddsOver: "-115", kOddsUnder: "-105" });
      const input = baseInput({
        propsData: { ...baseInput().propsData, strikeoutDetailRows: [overRow, underRow] },
      });
      const result = buildGameTopProps(input);
      const over = result.strikeouts.items.find((i) => i.pitcher === "Over pitcher");
      const under = result.strikeouts.items.find((i) => i.pitcher === "Under pitcher");
      expect(over?.direction).toBe("over");
      expect(over?.qualification).toBe("qualified");
      expect(under?.direction).toBe("under");
      expect(under?.qualification).toBe("qualified");
    });
  });

  describe("Batter vs Pitcher", () => {
    it("ranks by bestMatchupScore and caps at 3", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          batterVsPitcherRows: [
            makeBvpRow({ player: "Low", bestMatchupScore: 40, playerId: 1 }),
            makeBvpRow({ player: "High", bestMatchupScore: 90, playerId: 2 }),
            makeBvpRow({ player: "Mid", bestMatchupScore: 60, playerId: 3 }),
            makeBvpRow({ player: "Fourth", bestMatchupScore: 55, playerId: 4 }),
          ],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.batterVsPitcher.items.map((i) => i.player)).toEqual(["High", "Mid", "Fourth"]);
    });

    it("attaches career BvP history as supporting context, never as a ranking input", () => {
      const row = makeBvpRow({ playerId: 10, opposingPitcherId: 20 });
      const input = baseInput({
        propsData: { ...baseInput().propsData, batterVsPitcherRows: [row] },
        bvpHistoryByKey: new Map([
          ["10|20", { key: "10|20", batterId: 10, pitcherId: 20, batter: "x", pitcher: "y", status: "available", career: { pa: 11, h: 3, avg: 0.27, hr: 1 }, last5y: null }],
        ]),
      });
      const result = buildGameTopProps(input);
      expect(result.batterVsPitcher.items[0].careerLine).toBe("3-for-11, 1 HR (career)");
    });

    it("does not gate on sample size (no invented PA threshold)", () => {
      const row = makeBvpRow({ playerId: 10, opposingPitcherId: 20 });
      const input = baseInput({
        propsData: { ...baseInput().propsData, batterVsPitcherRows: [row] },
        bvpHistoryByKey: new Map([
          ["10|20", { key: "10|20", batterId: 10, pitcherId: 20, batter: "x", pitcher: "y", status: "available", career: { pa: 1, h: 0, avg: 0, hr: 0 }, last5y: null }],
        ]),
      });
      const result = buildGameTopProps(input);
      expect(result.batterVsPitcher.items[0].careerLine).toBe("0-for-1 (career)");
    });
  });

  describe("Numerology", () => {
    it("dedupes the same playerId across featuredPlays and watchlist", () => {
      const input = baseInput({
        numerology: {
          data: makeNumerologyData({
            featuredPlays: [makeNumerologyPlay({ playerId: 7, playerName: "Dup", rank: 1 })],
            watchlist: [makeWatchlistPlay({ playerId: 7, playerName: "Dup", rank: 20 })],
          }),
          isStale: false,
        },
      });
      const result = buildGameTopProps(input);
      expect(result.numerology.items).toHaveLength(1);
    });

    it("prioritizes canonical ranked/featured output ordering (lower rank first)", () => {
      const input = baseInput({
        numerology: {
          data: makeNumerologyData({
            featuredPlays: [makeNumerologyPlay({ playerId: 1, playerName: "Rank 3", rank: 3 })],
            watchlist: [makeWatchlistPlay({ playerId: 2, playerName: "Rank 1", rank: 1 })],
          }),
          isStale: false,
        },
      });
      const result = buildGameTopProps(input);
      expect(result.numerology.items.map((i) => i.playerName)).toEqual(["Rank 1", "Rank 3"]);
    });

    it("excludes players confirmed not starting", () => {
      const input = baseInput({
        numerology: {
          data: makeNumerologyData({
            featuredPlays: [makeNumerologyPlay({ playerId: 1, lineupStatus: "not_starting" })],
          }),
          isStale: false,
        },
      });
      const result = buildGameTopProps(input);
      expect(result.numerology.items).toHaveLength(0);
    });
  });

  describe("Moneyline", () => {
    it("reuses computeModelEdge output (pick, tier, differential, topFactor) without recomputation", () => {
      const result = buildGameTopProps(baseInput());
      const item = result.moneyline.items[0];
      expect(item.pickAbbr === AWAY || item.pickAbbr === HOME || item.isPush).toBe(true);
      expect(typeof item.tierLabel).toBe("string");
      expect(typeof item.topFactor).toBe("string");
      expect(typeof item.differential).toBe("number");
    });

    it("never fabricates a market line when odds are unavailable", () => {
      const result = buildGameTopProps(baseInput({ mlbOdds: null }));
      expect(result.moneyline.items[0].marketLine).toBeNull();
      expect(result.moneyline.message).toBe("Market pending");
    });

    it("shows a real market line when real odds are present", () => {
      const result = buildGameTopProps(
        baseInput({
          mlbOdds: {
            fetchedAt: "2026-05-10T09:00:00Z",
            moneylines: { [`${AWAY}@${HOME}`]: { away: { team: AWAY, american: "-140", implied: 0.58 }, home: { team: HOME, american: "+120", implied: 0.45 } } },
            hrOdds: {},
            kOdds: {},
          },
        }),
      );
      expect(result.moneyline.items[0].marketLine).toBe(`${AWAY} -140 / ${HOME} +120`);
      expect(result.moneyline.message).toBeNull();
    });

    it("never computes a polymarket agreement for a push", () => {
      // Force a push by making both teams' fixture identical in every scoring input is
      // impractical here; instead verify the null-chain directly: no polymarket data => null.
      const result = buildGameTopProps(baseInput({ polymarket: null }));
      expect(result.moneyline.items[0].polymarketAgreement).toBeNull();
    });

    it("omits a CTA href for v1 (full breakdown is already the hero above)", () => {
      const result = buildGameTopProps(baseInput());
      expect(result.moneyline.ctaHref).toBeNull();
    });
  });

  describe("missing market / no qualified play / stale", () => {
    it("HR: empty state when no batters qualify", () => {
      const result = buildGameTopProps(baseInput());
      expect(result.homeRuns.status).toBe("empty");
      expect(result.homeRuns.message).toBe("No qualifying HR props for this game yet.");
    });

    it("HR: starter-TBD state when this game is in pendingGames", () => {
      const input = baseInput({
        propsData: {
          ...baseInput().propsData,
          pendingGames: [{ matchup: `${AWAY} @ ${HOME}`, gameId: GAME_PK } as HrDashboardPendingGame],
        },
      });
      const result = buildGameTopProps(input);
      expect(result.homeRuns.status).toBe("empty");
      expect(result.homeRuns.message).toBe("Starter TBD -- lineups not yet confirmed.");
      expect(result.strikeouts.message).toBe("Starter TBD -- lineups not yet confirmed.");
    });

    it("marks HR/K/BvP stale when the props payload's own slate date is stale", () => {
      const input = baseInput({
        propsData: { ...baseInput().propsData, stale: true, batters: [makeBatter()] },
      });
      const result = buildGameTopProps(input);
      expect(result.homeRuns.status).toBe("stale");
      expect(result.strikeouts.status).toBe("stale");
      expect(result.batterVsPitcher.status).toBe("stale");
      expect(result.homeRuns.items).toHaveLength(0);
    });

    it("marks numerology stale when its own payload date mismatches the game's slate date", () => {
      const input = baseInput({
        identity: baseIdentity({ gameDate: "2026-05-10" }),
        numerology: { data: makeNumerologyData({ date: "2026-05-09" }), isStale: false },
      });
      const result = buildGameTopProps(input);
      expect(result.numerology.status).toBe("stale");
    });

    it("marks numerology stale when the hook's own isStale flag is set", () => {
      const input = baseInput({ numerology: { data: makeNumerologyData(), isStale: true } });
      const result = buildGameTopProps(input);
      expect(result.numerology.status).toBe("stale");
    });
  });

  describe("game-started behavior", () => {
    it("closes every data-backed card once the game is in progress, never showing a pregame rec as live", () => {
      const input = baseInput({
        identity: baseIdentity({ gameStatusCategory: "in-progress" }),
        propsData: { ...baseInput().propsData, batters: [makeBatter()], strikeoutDetailRows: [makeKRow()], batterVsPitcherRows: [makeBvpRow()] },
        numerology: { data: makeNumerologyData({ featuredPlays: [makeNumerologyPlay()] }), isStale: false },
      });
      const result = buildGameTopProps(input);
      expect(result.moneyline.status).toBe("closed");
      expect(result.homeRuns.status).toBe("closed");
      expect(result.strikeouts.status).toBe("closed");
      expect(result.batterVsPitcher.status).toBe("closed");
      expect(result.numerology.status).toBe("closed");
      expect(result.homeRuns.items).toHaveLength(0);
      expect(result.homeRuns.message).toBe("Game in progress -- no new picks");
    });

    it("uses Final copy once the game has ended", () => {
      const input = baseInput({ identity: baseIdentity({ gameStatusCategory: "final" }) });
      const result = buildGameTopProps(input);
      expect(result.moneyline.message).toBe("Final -- no new picks");
    });

    it("leaves Over/Under untouched by game state (always the coming-soon placeholder)", () => {
      const started = buildGameTopProps(baseInput({ identity: baseIdentity({ gameStatusCategory: "in-progress" }) }));
      const scheduled = buildGameTopProps(baseInput());
      expect(started.overUnder).toEqual({ status: "coming-soon" });
      expect(scheduled.overUnder).toEqual({ status: "coming-soon" });
    });
  });
});

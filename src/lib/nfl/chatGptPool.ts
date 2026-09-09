import { z } from "zod";

export const CHATGPT_POOL_DATA_PATH = "/data/nfl/chatgpt-pool-2026.json";

export const mainPoolStatuses = ["LEAN", "OFFICIAL", "LOCKED", "FINAL"] as const;
export const wagerResults = ["WIN", "LOSS", "PUSH", "PENDING"] as const;
export const sidePoolStatuses = ["ACTIVE", "ADVANCED", "ELIMINATED", "PENDING"] as const;

export type MainPoolStatus = (typeof mainPoolStatuses)[number];
export type WagerResult = (typeof wagerResults)[number];
export type SidePoolStatus = (typeof sidePoolStatuses)[number];

export interface MainPoolSummary {
  startingBankroll: number;
  currentBankroll: number;
  currentRank: number | null;
  totalEntries: number | null;
  leaderBankroll: number | null;
  tenthPlaceBankroll: number | null;
  distanceFromLeader: number | null;
  distanceFromTop10: number | null;
  totalPointsWagered: number;
  netPoints: number;
  atsWins: number;
  atsLosses: number;
  atsPushes: number;
  atsWinPct: number | null;
  roiOnPointsWagered: number | null;
}

export interface MainPoolWager {
  week: number;
  date: string;
  matchup: string;
  selection: string;
  poolLine: number;
  marketLineAtDecision: number | null;
  closingMarketLine: number | null;
  jkbProjectedSpread: number | null;
  chatgptEstimatedCoverProbability: number | null;
  confidence: string;
  wager: number;
  bankrollBefore: number;
  bankrollAfter: number | null;
  bankrollPctRisked: number;
  status: MainPoolStatus;
  result: WagerResult;
  pointsResult: number | null;
  finalScore: string | null;
  notes: string | null;
  decisionReason: string;
  poolLineValue: number | null;
  selectionRole: "FAVORITE" | "UNDERDOG" | "PICKEM";
  venue: "HOME" | "AWAY" | "NEUTRAL";
  beatClosingLine: boolean | null;
  agreesWithJkb: boolean | null;
}

export interface SidePoolSummary {
  status: SidePoolStatus;
  cumulativeScore: number;
  currentRank: number | null;
  totalRemaining: number | null;
  nextCutWeek: number | null;
  currentCutLine: number | null;
  distanceFromCut: number | null;
  eliminated: boolean;
}

export interface SidePoolWeek {
  week: number;
  matchup: string;
  postedPoolSpread: number;
  favorite: string;
  underdog: string;
  marketSpreadAtDecision: number | null;
  jkbProjectedMargin: number | null;
  chatgptPredictedWinner: string;
  chatgptPredictedMargin: number;
  actualWinner: string | null;
  actualMargin: number | null;
  rawPredictionError: number | null;
  underdogBonus: number;
  weeklyScore: number | null;
  cumulativeScore: number | null;
  rankAfterWeek: number | null;
  cutLineAfterWeek: number | null;
  status: SidePoolStatus;
  notes: string | null;
}

export interface PerformanceBreakdownRow {
  label: string;
  wagers: number;
  wins: number;
  losses: number;
  pushes: number;
  netPoints: number;
  roi: number | null;
}

export interface StrategyChange {
  version: string;
  weekImplemented: number;
  reason: string;
  evidence: string;
  exactChanges: string[];
}

export interface ChatGptPoolData {
  season: number;
  entryName: string;
  currentWeek: number;
  strategyVersion: string;
  lastUpdated: string;
  mainPool: MainPoolSummary;
  mainPoolWagers: MainPoolWager[];
  sidePool: SidePoolSummary;
  sidePoolWeeks: SidePoolWeek[];
  performanceBreakdowns: {
    byConfidence: PerformanceBreakdownRow[];
    favoriteVsUnderdog: PerformanceBreakdownRow[];
    homeVsAway: PerformanceBreakdownRow[];
    closingLineValue: PerformanceBreakdownRow[];
    jkbAlignment: PerformanceBreakdownRow[];
  };
  strategyChangelog: StrategyChange[];
  poolRules: {
    mainPool: string[];
    sidePool: string[];
  };
}

const nullableFiniteNumber = z.number().finite().nullable();
const nonNegativeInteger = z.number().int().nonnegative();

const mainPoolSummarySchema: z.ZodType<MainPoolSummary> = z.object({
  startingBankroll: z.number().finite().nonnegative(),
  currentBankroll: z.number().finite().nonnegative(),
  currentRank: nonNegativeInteger.positive().nullable(),
  totalEntries: nonNegativeInteger.positive().nullable(),
  leaderBankroll: nullableFiniteNumber,
  tenthPlaceBankroll: nullableFiniteNumber,
  distanceFromLeader: nullableFiniteNumber,
  distanceFromTop10: nullableFiniteNumber,
  totalPointsWagered: z.number().finite().nonnegative(),
  netPoints: z.number().finite(),
  atsWins: nonNegativeInteger,
  atsLosses: nonNegativeInteger,
  atsPushes: nonNegativeInteger,
  atsWinPct: z.number().finite().min(0).max(1).nullable(),
  roiOnPointsWagered: z.number().finite().nullable(),
}).strict();

const mainPoolWagerSchema: z.ZodType<MainPoolWager> = z.object({
  week: z.number().int().min(1).max(22),
  date: z.string().min(1),
  matchup: z.string().min(1),
  selection: z.string().min(1),
  poolLine: z.number().finite(),
  marketLineAtDecision: nullableFiniteNumber,
  closingMarketLine: nullableFiniteNumber,
  jkbProjectedSpread: nullableFiniteNumber,
  chatgptEstimatedCoverProbability: z.number().finite().min(0).max(1).nullable(),
  confidence: z.string().min(1),
  wager: z.number().int().positive(),
  bankrollBefore: z.number().finite().nonnegative(),
  bankrollAfter: nullableFiniteNumber,
  bankrollPctRisked: z.number().finite().min(0).max(1),
  status: z.enum(mainPoolStatuses),
  result: z.enum(wagerResults),
  pointsResult: nullableFiniteNumber,
  finalScore: z.string().min(1).nullable(),
  notes: z.string().min(1).nullable(),
  decisionReason: z.string().min(1),
  poolLineValue: nullableFiniteNumber,
  selectionRole: z.enum(["FAVORITE", "UNDERDOG", "PICKEM"]),
  venue: z.enum(["HOME", "AWAY", "NEUTRAL"]),
  beatClosingLine: z.boolean().nullable(),
  agreesWithJkb: z.boolean().nullable(),
}).strict();

const sidePoolSummarySchema: z.ZodType<SidePoolSummary> = z.object({
  status: z.enum(sidePoolStatuses),
  cumulativeScore: z.number().finite(),
  currentRank: nonNegativeInteger.positive().nullable(),
  totalRemaining: nonNegativeInteger.nullable(),
  nextCutWeek: z.number().int().min(1).max(22).nullable(),
  currentCutLine: nullableFiniteNumber,
  distanceFromCut: nullableFiniteNumber,
  eliminated: z.boolean(),
}).strict();

const sidePoolWeekSchema: z.ZodType<SidePoolWeek> = z.object({
  week: z.number().int().min(1).max(22),
  matchup: z.string().min(1),
  postedPoolSpread: z.number().finite(),
  favorite: z.string().min(1),
  underdog: z.string().min(1),
  marketSpreadAtDecision: nullableFiniteNumber,
  jkbProjectedMargin: nullableFiniteNumber,
  chatgptPredictedWinner: z.string().min(1),
  chatgptPredictedMargin: z.number().int().nonnegative(),
  actualWinner: z.string().min(1).nullable(),
  actualMargin: nullableFiniteNumber,
  rawPredictionError: nullableFiniteNumber,
  underdogBonus: z.number().finite(),
  weeklyScore: nullableFiniteNumber,
  cumulativeScore: nullableFiniteNumber,
  rankAfterWeek: nonNegativeInteger.positive().nullable(),
  cutLineAfterWeek: nullableFiniteNumber,
  status: z.enum(sidePoolStatuses),
  notes: z.string().min(1).nullable(),
}).strict();

const performanceBreakdownRowSchema: z.ZodType<PerformanceBreakdownRow> = z.object({
  label: z.string().min(1),
  wagers: nonNegativeInteger,
  wins: nonNegativeInteger,
  losses: nonNegativeInteger,
  pushes: nonNegativeInteger,
  netPoints: z.number().finite(),
  roi: z.number().finite().nullable(),
}).strict();

const strategyChangeSchema: z.ZodType<StrategyChange> = z.object({
  version: z.string().min(1),
  weekImplemented: z.number().int().min(1).max(22),
  reason: z.string().min(1),
  evidence: z.string().min(1),
  exactChanges: z.array(z.string().min(1)).min(1),
}).strict();

export const chatGptPoolDataSchema: z.ZodType<ChatGptPoolData> = z.object({
  season: z.literal(2026),
  entryName: z.string().min(1),
  currentWeek: z.number().int().min(1).max(22),
  strategyVersion: z.string().min(1),
  lastUpdated: z.string().datetime({ offset: true }),
  mainPool: mainPoolSummarySchema,
  mainPoolWagers: z.array(mainPoolWagerSchema),
  sidePool: sidePoolSummarySchema,
  sidePoolWeeks: z.array(sidePoolWeekSchema),
  performanceBreakdowns: z.object({
    byConfidence: z.array(performanceBreakdownRowSchema),
    favoriteVsUnderdog: z.array(performanceBreakdownRowSchema),
    homeVsAway: z.array(performanceBreakdownRowSchema),
    closingLineValue: z.array(performanceBreakdownRowSchema),
    jkbAlignment: z.array(performanceBreakdownRowSchema),
  }).strict(),
  strategyChangelog: z.array(strategyChangeSchema),
  poolRules: z.object({
    mainPool: z.array(z.string().min(1)),
    sidePool: z.array(z.string().min(1)),
  }).strict(),
}).strict();

export function parseChatGptPoolData(value: unknown): ChatGptPoolData | null {
  const parsed = chatGptPoolDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

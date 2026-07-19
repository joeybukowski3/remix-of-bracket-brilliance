import type { EdgeTierKey } from "@/lib/mlb/mlbModelEdge";
import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";
import type {
  HrDashboardBatter,
  HrDashboardPendingGame,
  PitcherStrikeoutTeamRow,
  PitcherVsBatterRow,
} from "@/pages/MlbHrProps";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";
import type { MlbOddsData } from "@/hooks/useMlbOdds";
import type { MoneylineApiResponse } from "@/lib/mlb/polymarketMoneylines";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

/** Same categories MlbGameDetail.tsx's own getSlateStatusCategory() already produces. */
export type GameStatusCategory = "in-progress" | "pre-game" | "scheduled" | "final";

export interface GameIdentity {
  gamePk: number;
  /** The slate date this game belongs to, e.g. "2026-07-19" (ET). */
  gameDate: string;
  awayAbbr: string;
  homeAbbr: string;
  gameStatusCategory: GameStatusCategory;
}

/**
 * Per-card status. "closed" always wins once the game has started/finished --
 * pregame recommendations must never be presented as still-live after that.
 * "stale" reflects the underlying payload's own staleness (wrong slate date),
 * never a fabricated freshness signal.
 */
export type TopPropsCardStatus = "ok" | "empty" | "stale" | "closed";

export interface TopPropsCard<T> {
  status: TopPropsCardStatus;
  items: T[];
  /**
   * Freshness/qualification copy shown to the user -- e.g. "Waiting for
   * confirmed lineup", "Starter TBD", "No qualified play", "Stale data",
   * "Game in progress -- no new picks". Can be non-null even when status is
   * "ok" (an informational caveat alongside real items). Never fabricated:
   * null when there is nothing true to say.
   */
  message: string | null;
  ctaHref: string | null;
}

export interface MoneylineSummaryItem {
  isPush: boolean;
  pickAbbr: string | null;
  tierKey: EdgeTierKey;
  tierLabel: string;
  topFactor: string;
  differential: number;
  marketLine: string | null;
  polymarketAgreement: "aligned" | "contrarian" | null;
  polymarketPrice: number | null;
}

export interface HrPropItem {
  player: string;
  team: string;
  opponent: string;
  hrScore: number;
  /** 1-based rank within this game's qualifying subset -- never the global slate-wide hrScoreRank. */
  gameRank: number;
  hrOddsYes: string | null;
  hrOddsBook: string | null;
  confidenceLevel: "high" | "medium" | "low" | "incomplete" | null;
}

export type KPropQualification = "qualified" | "informational";

export interface KPropItem {
  pitcher: string;
  team: string;
  opponent: string;
  /** "qualified" = VALID status (real market + confident projection). "informational" = NO_MARKET (real projection, no line yet). */
  qualification: KPropQualification;
  direction: "over" | "under" | "neutral";
  projectedKs: number | null;
  kLine: number | null;
  projectionEdge: number | null;
  kOddsOver: string | null;
  kOddsUnder: string | null;
}

export interface BvpItem {
  player: string;
  team: string;
  opponent: string;
  bestMatchupScore: number;
  tierLabel: string;
  /** e.g. "2-for-7, 1 HR (career)" -- supporting context only, never a ranking input. Null when no BvP history is available. */
  careerLine: string | null;
}

export interface NumerologyItem {
  playerId: number | string | null;
  playerName: string;
  team: string;
  opponent: string;
  numerologyScore: number;
  finalScore: number;
  recommendedMarket: string;
}

export interface GameTopProps {
  moneyline: TopPropsCard<MoneylineSummaryItem>;
  homeRuns: TopPropsCard<HrPropItem>;
  strikeouts: TopPropsCard<KPropItem>;
  batterVsPitcher: TopPropsCard<BvpItem>;
  numerology: TopPropsCard<NumerologyItem>;
  overUnder: { status: "coming-soon" };
}

export interface BuildGameTopPropsInput {
  identity: GameIdentity;
  detail: MlbGameDetail;
  mlbOdds: MlbOddsData | null;
  polymarket: MoneylineApiResponse | null | undefined;
  propsData: {
    batters: HrDashboardBatter[];
    strikeoutDetailRows: PitcherStrikeoutTeamRow[];
    batterVsPitcherRows: PitcherVsBatterRow[];
    pendingGames: HrDashboardPendingGame[];
    /** useMlbPropsData()'s own `stale` flag (payload date !== today's ET slate date). */
    stale: boolean;
    generatedAt: string | null;
  };
  bvpHistoryByKey: Map<string, BvpHistoryEntry>;
  numerology: {
    data: NumerologyDailyData | null;
    isStale: boolean;
  };
}

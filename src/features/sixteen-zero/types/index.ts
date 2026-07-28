export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"] as const;

export type FantasyPosition = (typeof FANTASY_POSITIONS)[number];
export type FlexPosition = Extract<FantasyPosition, "RB" | "WR" | "TE">;

export type SimulationPlayer = {
  id: string;
  name: string;
  team: string;
  position: FantasyPosition;
  byeWeek: number | null;
  consensusOverallRank: number;
  consensusPositionRank: number;
  projectedSeasonPoints: number;
  projectedPPG: number;
  projectionPositionRank: number;
  blendedSeasonPoints: number;
  blendedPPG: number;
  blendedPositionRank: number;
  fullSeasonSOSRank: number | null;
  playoffSOSRank: number | null;
  weeklyOpponents: Record<number, string | null>;
  opponentFantasyPointsAllowed: Record<number, number | null>;
  dataCompleteness: number;
  active: boolean;
};

export type PlayerTier = "elite" | "high-end" | "mid-tier" | "low-tier";

export type DraftSource = "user" | "auto" | "cpu";

export type DraftSelection = {
  overallPick: number;
  round: number;
  slot: number;
  playerId: string;
  source: DraftSource;
};

export type CpuStrategyProfile =
  | "balanced"
  | "rb-heavy"
  | "wr-heavy"
  | "early-qb"
  | "elite-te"
  | "best-player-available"
  | "zero-rb"
  | "late-qb"
  | "value-drafter";

export type LineupSlot = "QB" | "RB1" | "RB2" | "WR1" | "WR2" | "TE" | "FLEX" | "K" | "DST";

export type OptimizedLineup = Record<LineupSlot, SimulationPlayer>;
export type WeeklyLineup = Record<LineupSlot, SimulationPlayer | null>;

/**
 * Immutable snapshot of one starter's contribution to a played matchup.
 * Captured once during season simulation and never recomputed by the UI.
 */
export type MatchupLineupEntry = {
  slot: LineupSlot;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  nflTeam: string;
  /** Normalized (no "@") NFL opponent code for that week, or null if unavailable/bye. */
  nflOpponent: string | null;
  /** True = home ("vs. X"), false = away ("at X"), null when unknown. */
  isHome: boolean | null;
  points: number;
  isTemporaryReplacement: boolean;
};

export type MatchupBoxScore = {
  userLineup: MatchupLineupEntry[];
  opponentLineup: MatchupLineupEntry[];
  /** Draft slot (1-12) of the CPU roster that was actually faced this week. */
  opponentRosterSlot: number;
};

export type ScheduleGame = {
  fantasyWeek: number;
  nflWeek: number;
  opponentName: string;
  userScore: number | null;
  opponentScore: number | null;
  result: "W" | "L" | null;
  isBye?: boolean;
  /** Saved box score for played (non-bye) matchups. Presentation-only; never recomputed. */
  boxScore?: MatchupBoxScore;
};

export type PlayoffQualification = {
  qualified: boolean;
  seed: 1 | 2 | 3 | 4 | 5 | 6 | null;
  hasBye: boolean;
};

export type PlayoffResult =
  | "Missed Playoffs"
  | "Eliminated in First Round"
  | "Eliminated in Semifinal"
  | "Lost Championship"
  | "League Champion";

export type SeasonResult = {
  schedule: ScheduleGame[];
  regularWins: number;
  regularLosses: number;
  playoffWins: number;
  playoffLosses: number;
  finalWins: number;
  finalLosses: number;
  averageWeeklyScore: number;
  qualification: PlayoffQualification;
  playoffResult: PlayoffResult;
  startingRoster: OptimizedLineup;
};

export type GamePhase =
  | "landing"
  | "initializing"
  | "cpu_drafting"
  | "user_on_clock"
  | "draft_complete"
  | "regular_season_simulating"
  | "playoff_processing"
  | "season_complete";

export type OpponentNameCategory =
  | "player-pun"
  | "rookie-pun"
  | "classic"
  | "football"
  | "pop-culture"
  | "trash-talk"
  | "original";

export type OpponentName = {
  id: string;
  name: string;
  category: OpponentNameCategory;
  seasonAdded: number;
  active: boolean;
  sourceLabel?: string;
};

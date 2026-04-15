export type MlbRouteState =
  | { view: "home" }
  | { view: "game"; gamePk: string };

export type MlbTeamSide = {
  id: number | null;
  name: string;
  abbreviation: string;
  record: string;
  probablePitcher?: {
    id?: number;
    fullName?: string;
  } | null;
};

export type MlbScheduleGame = {
  gamePk: number;
  gameDate: string;
  status: string;
  venue: string;
  away: MlbTeamSide;
  home: MlbTeamSide;
};

export type MlbTeamContext = {
  seasonRecord: string;
  lastFiveRecord: string;
  homeRecord: string;
  awayRecord: string;
  seriesRecord: string;
};

export type MlbPitcherVsTeamStats = {
  inningsPitched?: string | number | null;
  strikeOuts?: number | null;
  baseOnBalls?: number | null;
  plateAppearances?: number | null;
  battersFaced?: number | null;
  avg?: string | number | null;
  obp?: string | number | null;
  slg?: string | number | null;
  ops?: string | number | null;
};

export type MlbStarterProfile = {
  id: number | null;
  name: string;
  hand: string;
  record: string;
  era: string | number | null;
  whip: string | number | null;
  strikeOuts: number | null;
  inningsPitched: string | number | null;
  homeRuns: number | null;
  battersFaced: number | null;
  baseOnBalls: number | null;
  vsTeam: MlbPitcherVsTeamStats | null;
};

export type MlbTeamPitchingStats = {
  era?: string | number | null;
  whip?: string | number | null;
  strikeOuts?: number | null;
  battersFaced?: number | null;
  homeRuns?: number | null;
  inningsPitched?: string | number | null;
  baseOnBalls?: number | null;
} | null;

export type MlbOpponentSplit = {
  plateAppearances?: number | null;
  strikeOuts?: number | null;
  baseOnBalls?: number | null;
  avg?: string | number | null;
  obp?: string | number | null;
  slg?: string | number | null;
  ops?: string | number | null;
  leftOnBase?: number | null;
} | null;

export type MlbLineupRow = {
  id?: number;
  name: string;
  avg: string | number | null;
  obp: string | number | null;
  slg: string | number | null;
  ops: string | number | null;
  kPct: number | null;
  hr: number | null;
};

export type MlbLineupSummary = {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  kPct: number | null;
};

export type MlbGameDetail = {
  game: MlbScheduleGame;
  weather: string;
  homeContext: MlbTeamContext;
  awayContext: MlbTeamContext;
  starters: {
    home: MlbStarterProfile;
    away: MlbStarterProfile;
  };
  pitching: {
    home: MlbTeamPitchingStats;
    away: MlbTeamPitchingStats;
  };
  opponentSplits: {
    awayBattingVsHomeStarter: MlbOpponentSplit;
    homeBattingVsAwayStarter: MlbOpponentSplit;
  };
  lineupSummaries: {
    home: MlbLineupSummary;
    away: MlbLineupSummary;
  };
  lineups: {
    home: MlbLineupRow[];
    away: MlbLineupRow[];
  };
};

export type MlbSummaryCardData = {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "positive" | "warning";
};

export type MlbPropAngleData = {
  title: string;
  rationale: string;
  signals: string[];
  tag?: string;
};

export type MlbComparisonMetric = {
  key: string;
  label: string;
  leftValue: number | null;
  rightValue: number | null;
  leagueAverage: number | null;
  format: "era" | "whip" | "k9" | "percent" | "rate3" | "ops" | "avg" | "factor" | "ip";
  scaleKey:
    | "era"
    | "whip"
    | "k9"
    | "percent"
    | "bbPercent"
    | "hr9"
    | "obp"
    | "slg"
    | "ops"
    | "avg"
    | "factor";
};

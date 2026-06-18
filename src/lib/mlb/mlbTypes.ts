export type MlbRouteState =
  | { view: "home" }
  | { view: "game"; gamePk: string };

export type MlbTeamSide = {
  id: number | null;
  name: string;
  abbreviation: string;
  record: string;
  score?: number | null;
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
  currentInning: number | null;
  inningHalf: "top" | "bottom" | null;
  away: MlbTeamSide;
  home: MlbTeamSide;
};

export type MlbTeamContext = {
  seasonRecord: string;
  lastFiveRecord: string;
  homeRecord: string;
  awayRecord: string;
  seriesRecord: string;
  seasonWrcPlus: number | null;
  seasonWrcPlusRank: string | null;
  recentWrcPlus: number | null;
  recentWrcPlusRank: string | null;
  vsLhpWrcPlus: number | null;
  vsLhpWrcPlusRank: string | null;
  vsRhpWrcPlus: number | null;
  vsRhpWrcPlusRank: string | null;
};

export type MlbTeamWrcEntry = {
  id: number;
  abbreviation: string;
  name: string;
  seasonWrcPlus: number | null;
  seasonRank: number | null;
  seasonRankLabel: string | null;
  recentWrcPlus: number | null;
  recentRank: number | null;
  recentRankLabel: string | null;
  vsLhpWrcPlus: number | null;
  vsLhpRank: number | null;
  vsLhpRankLabel: string | null;
  vsRhpWrcPlus: number | null;
  vsRhpRank: number | null;
  vsRhpRankLabel: string | null;
  vsLhpOps: number | null;
  vsLhpOpsRank: number | null;
  vsRhpOps: number | null;
  vsRhpOpsRank: number | null;
  recentSlg: number | null;
  seasonXba: number | null;
  seasonAvg: number | null;
  recentAvg: number | null;
  last14Record: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
};

export type MlbTeamWrcData = {
  date: string;
  generatedAt: string;
  season: number;
  teams: MlbTeamWrcEntry[];
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
  xfip?: number | null;          // Expected FIP
  siera?: number | null;         // Skill-Interactive ERA
  strandRate?: number | null;    // LOB%
  hrfb?: number | null;          // HR/FB%
  babip?: number | null;         // BABIP
  regressionScore?: number | null; // -10 to +10
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
  leftPct?: number | null;   // 0-100 true percentile (optional — falls back to scale)
  rightPct?: number | null;  // 0-100 true percentile (optional — falls back to scale)
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

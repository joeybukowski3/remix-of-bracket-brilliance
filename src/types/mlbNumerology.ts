export interface NumerologySignal {
  label: string;
  type: "exact" | "reduced" | "family" | "master" | "secondary";
  explanation: string;
  points?: number;
}

export interface NumerologyCounterSignal {
  label: string;
  explanation: string;
  points?: number;
}

export interface NumerologyPlay {
  rank: number;
  playerId?: string | number | null;
  playerName: string;
  team: string;
  opponent: string;
  playerImage?: string | null;
  gameTime?: string | null;
  lineupStatus: "confirmed" | "projected" | "not_starting" | "unknown";
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  recommendedMarket: string;
  line?: string | number | null;
  odds?: string | number | null;
  numerologyScore: number;
  baseballScore: number;
  finalScore: number;
  confidence: "high" | "medium" | "low";
  summary: string;
  positiveSignals: NumerologySignal[];
  counterSignals: NumerologyCounterSignal[];
}

export interface NumerologyDailyData {
  date: string;
  lastUpdated: string;
  dailyProfile: {
    primaryNumber: number;
    compoundNumber?: number | null;
    masterNumber?: number | null;
    calendarDay: number;
    numberFamily: number[];
    balancingNumber: number;
    shadowNumber: number;
    interpretation: string;
  };
  featuredPlays: NumerologyPlay[];
  watchlist: NumerologyPlay[];
  methodology?: {
    numerologyWeight: number;
    baseballWeight: number;
    version: string;
  };
}

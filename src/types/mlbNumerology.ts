export type SignalType =
  | "primary_exact_master"
  | "primary_exact_root"
  | "primary_root"
  | "secondary_exact"
  | "secondary_root"
  | "family_support"
  | "personal_cycle"
  | "name_resonance"
  | "contextual_echo"
  | "countercurrent"
  | "baseball_opportunity"
  | "data_caution";

export interface NumerologySignal {
  field: string;
  label: string;
  type: SignalType;
  points: number;
  description: string;
}

export interface NumerologyPlay {
  rank: number;
  playerId?: string | number | null;
  playerName: string;
  team: string;
  opponent: string;
  opposingPitcher?: string | null;
  lineupStatus: "confirmed" | "projected" | "morning_projected" | "not_starting" | "unknown";
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  recommendedMarket: string;
  odds?: string | number | null;
  numerologyScore: number;
  baseballScore: number;
  finalScore: number;
  formula?: string;
  confidence: "high" | "medium" | "low";
  positiveSignals: NumerologySignal[];
  counterSignals: NumerologySignal[];
  missingData?: string[];
  summary?: string | null;
  primaryPatternLabel?: string | null;
  countercurrentExplanation?: string | null;
  marketExplanation?: string | null;
}

export interface WatchlistPlay {
  rank: number;
  playerName: string;
  team: string;
  opponent: string;
  lineupStatus: NumerologyPlay["lineupStatus"];
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  recommendedMarket: string;
  numerologyScore: number;
  baseballScore: number;
  finalScore: number;
  primarySignal?: string | null;
  missingData?: string[];
  summary?: string | null;
}

export interface RepeatedDigit {
  digit: number;
  count: number;
  reinforces: "primary" | "secondary" | "neither";
}

export interface DailyProfile {
  universalDayRawSum: number;
  universalDayCompound: number;
  universalDayMaster: number | null;
  universalDayRoot: number;
  universalDayTrace: string[];
  calendarDayCompound: number;
  calendarDayRoot: number;
  universalYear: number;
  universalMonth: number;
  structuralEcho: string;
  primaryFamily: number[];
  secondaryFamily: number[];
  balancingComplement: number;
  countercurrent: number;
  repeatedDigits: RepeatedDigit[];
  interpretation: string;
}

export interface NumerologyDailyData {
  date: string;
  timezone: string;
  methodologyVersion: string;
  scheduledFor: string;
  generatedAt: string;
  generationMode: "live" | "dry_run" | "fixture" | "fallback";
  narrativeSource: "grok" | "fallback";
  dataStatus: "morning_projected" | "partially_confirmed" | "confirmed" | "stale" | "fallback" | "unavailable";
  dailyProfile: DailyProfile;
  featuredPlays: NumerologyPlay[];
  watchlist: WatchlistPlay[];
  countercurrents?: { playerName: string; team: string; numerologyScore: number; baseballScore: number; finalScore: number; countercurrentSignals: NumerologySignal[] }[];
  scoringConfiguration?: { weights: Record<string, number>; methodologyVersion: string };
  sources?: Record<string, string>;
  narrative?: { closingObservation?: string | null };
  // Legacy demo support
  _note?: string;
}

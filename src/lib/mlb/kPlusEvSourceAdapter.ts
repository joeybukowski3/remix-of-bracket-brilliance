import { evaluateKPlusEv, type KPlusEvSource, type KPlusEvValuation, type OpponentKRatioSource } from "./kPlusEvModel";

/** Shape of one row in public/data/mlb/k-plus-ev.json's `pitchers` array. */
export type KPlusEvArtifactRow = {
  pitcher: string;
  team: string;
  opponent: string;
  pitcherHand: "L" | "R" | null;
  isHome: boolean | null;
  starterConfirmed: boolean;
  season: { strikeouts: number | null; outs: number | null; pitches: number | null; starts: number | null } | null;
  last8: { strikeouts: number | null; outs: number | null; pitches: number | null; starts: number | null } | null;
  last4: { strikeouts: number | null; outs: number | null; pitches: number | null; starts: number | null } | null;
  home: { strikeouts: number | null; outs: number | null; starts: number | null } | null;
  away: { strikeouts: number | null; outs: number | null; starts: number | null } | null;
  opponentKRatio: number | null;
  opponentKRatioSource: OpponentKRatioSource;
  opponentKRateVsHand: number | null;
  leagueKRateVsHand: number | null;
  kLine: number | null;
  kOddsOverRaw: string | null;
  kOddsUnderRaw: string | null;
  kOddsBook: string | null;
};

export type KPlusEvArtifact = {
  schemaVersion: number;
  generatorVersion: string;
  date: string;
  generatedAt: string;
  pitchers: KPlusEvArtifactRow[];
};

const EMPTY_WINDOW = { strikeouts: null, outs: null, pitches: null, starts: null };

function toSource(row: KPlusEvArtifactRow): KPlusEvSource {
  return {
    pitcher: row.pitcher,
    team: row.team,
    opponent: row.opponent,
    pitcherHand: row.pitcherHand,
    isHome: row.isHome,
    starterConfirmed: row.starterConfirmed,
    season: row.season ?? EMPTY_WINDOW,
    last8: row.last8,
    last4: row.last4,
    home: row.home,
    away: row.away,
    opponentKRatio: row.opponentKRatio,
    opponentKRatioSource: row.opponentKRatioSource,
    opponentKRateVsHand: row.opponentKRateVsHand,
    leagueKRateVsHand: row.leagueKRateVsHand,
    kLine: row.kLine,
    kOddsOverRaw: row.kOddsOverRaw,
    kOddsUnderRaw: row.kOddsUnderRaw,
    kOddsBook: row.kOddsBook,
  };
}

export function evaluateKPlusEvArtifact(artifact: KPlusEvArtifact | null | undefined): KPlusEvValuation[] {
  if (!artifact?.pitchers?.length) return [];
  return artifact.pitchers.map((row) => evaluateKPlusEv(toSource(row)));
}

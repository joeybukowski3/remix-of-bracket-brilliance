import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { PregameFeatureSnapshot } from "./features";

export type BacktestFeatureKey =
  | "priorSeasonPpg"
  | "seasonToDatePpg"
  | "last3Ppg"
  | "last3SnapShare"
  | "last3PassAttempts"
  | "last3RushAttempts"
  | "last3Targets"
  | "last3TargetShare"
  | "last3AirYardsShare"
  | "priorSeasonFpaPerGame"
  | "currentSeasonFpaPerGame"
  | "offensiveEpaPerPlay"
  | "passingEpaPerPlay"
  | "rushingEpaPerPlay"
  | "playsPerGame"
  | "opponentEpaAllowedPerPlay"
  | "teamImpliedTotal"
  | "gameTotal";

export type CandidateFamily =
  | "baseline-a"
  | "baseline-prior-season"
  | "baseline-b-16-0"
  | "matchup-only"
  | "prior-fpa-only"
  | "baseline-matchup"
  | "baseline-usage"
  | "baseline-team"
  | "combined"
  | "market-environment";

export const CORE_FEATURES_BY_POSITION: Readonly<Record<
  FantasyPosition,
  Readonly<Record<Exclude<CandidateFamily, "baseline-prior-season" | "baseline-b-16-0" | "matchup-only" | "prior-fpa-only" | "market-environment">, readonly BacktestFeatureKey[]>>
>> = {
  QB: {
    "baseline-a": ["seasonToDatePpg"],
    "baseline-matchup": ["seasonToDatePpg", "currentSeasonFpaPerGame", "opponentEpaAllowedPerPlay"],
    "baseline-usage": ["seasonToDatePpg", "last3PassAttempts", "last3RushAttempts"],
    "baseline-team": ["seasonToDatePpg", "passingEpaPerPlay", "playsPerGame"],
    combined: ["seasonToDatePpg", "last3PassAttempts", "last3RushAttempts", "currentSeasonFpaPerGame", "passingEpaPerPlay", "playsPerGame"],
  },
  RB: {
    "baseline-a": ["seasonToDatePpg"],
    "baseline-matchup": ["seasonToDatePpg", "currentSeasonFpaPerGame", "opponentEpaAllowedPerPlay"],
    "baseline-usage": ["seasonToDatePpg", "last3RushAttempts", "last3Targets", "last3TargetShare"],
    "baseline-team": ["seasonToDatePpg", "rushingEpaPerPlay", "playsPerGame"],
    combined: ["seasonToDatePpg", "last3SnapShare", "last3RushAttempts", "last3Targets", "currentSeasonFpaPerGame", "rushingEpaPerPlay", "playsPerGame"],
  },
  WR: {
    "baseline-a": ["seasonToDatePpg"],
    "baseline-matchup": ["seasonToDatePpg", "currentSeasonFpaPerGame", "opponentEpaAllowedPerPlay"],
    "baseline-usage": ["seasonToDatePpg", "last3Targets", "last3TargetShare", "last3AirYardsShare"],
    "baseline-team": ["seasonToDatePpg", "passingEpaPerPlay", "playsPerGame"],
    combined: ["seasonToDatePpg", "last3Targets", "last3TargetShare", "last3AirYardsShare", "currentSeasonFpaPerGame", "passingEpaPerPlay", "playsPerGame"],
  },
  TE: {
    "baseline-a": ["seasonToDatePpg"],
    "baseline-matchup": ["seasonToDatePpg", "currentSeasonFpaPerGame", "opponentEpaAllowedPerPlay"],
    "baseline-usage": ["seasonToDatePpg", "last3Targets", "last3TargetShare"],
    "baseline-team": ["seasonToDatePpg", "passingEpaPerPlay", "playsPerGame"],
    combined: ["seasonToDatePpg", "last3Targets", "last3TargetShare", "currentSeasonFpaPerGame", "passingEpaPerPlay", "playsPerGame"],
  },
};

export function featureValue(row: PregameFeatureSnapshot, key: BacktestFeatureKey): number | null {
  switch (key) {
    case "priorSeasonPpg": return row.baseline.priorSeasonPpg;
    case "seasonToDatePpg": return row.baseline.rollingPpg.seasonToDate;
    case "last3Ppg": return row.baseline.rollingPpg.last3;
    case "last3SnapShare": return row.usage.snapShare.last3;
    case "last3PassAttempts": return row.usage.passAttempts.last3;
    case "last3RushAttempts": return row.usage.rushAttempts.last3;
    case "last3Targets": return row.usage.targets.last3;
    case "last3TargetShare": return row.usage.targetShare.last3;
    case "last3AirYardsShare": return row.usage.airYardsShare.last3;
    case "priorSeasonFpaPerGame": return row.matchup.priorSeasonFpaPerGame;
    case "currentSeasonFpaPerGame": return row.matchup.currentSeasonFpaPerGame;
    case "offensiveEpaPerPlay": return row.teamEnvironment.offensiveEpaPerPlay;
    case "passingEpaPerPlay": return row.teamEnvironment.passingEpaPerPlay;
    case "rushingEpaPerPlay": return row.teamEnvironment.rushingEpaPerPlay;
    case "playsPerGame": return row.teamEnvironment.playsPerGame;
    case "opponentEpaAllowedPerPlay": return row.teamEnvironment.opponentEpaAllowedPerPlay;
    case "teamImpliedTotal": return row.market.teamImpliedTotal;
    case "gameTotal": return row.market.gameTotal;
  }
}

export function featuresForFamily(position: FantasyPosition, family: CandidateFamily): readonly BacktestFeatureKey[] {
  if (family === "baseline-prior-season") return ["priorSeasonPpg"];
  if (family === "baseline-b-16-0") return ["seasonToDatePpg", "currentSeasonFpaPerGame"];
  if (family === "matchup-only") return ["currentSeasonFpaPerGame"];
  if (family === "prior-fpa-only") return ["priorSeasonFpaPerGame"];
  if (family === "market-environment") return ["seasonToDatePpg", "teamImpliedTotal", "gameTotal"];
  return CORE_FEATURES_BY_POSITION[position][family];
}

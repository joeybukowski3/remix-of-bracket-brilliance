import type { BettingLeague, BettingSplitSnapshot } from "./bettingSplitsTypes";

export const DEFAULT_BETTING_SPLIT_KICKOFF_TOLERANCE_MS = 6 * 60 * 60 * 1_000;

export type BettingProviderGameCrosswalk = {
  league: BettingLeague;
  provider: string;
  providerGameId: string;
  jkbGameId: string;
};

/** Explicit provider-team identity supplied by a verified adapter or future persistence layer. */
export type BettingProviderTeamIdentity = {
  league: BettingLeague;
  provider: string;
  providerTeamId: string;
  jkbTeamId: string;
};

export type CanonicalBettingGame = {
  league: BettingLeague;
  season: number;
  week: number | null;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  neutralSite: boolean;
};

export type BettingSplitGameJoinEvidence = {
  providerGameId: string;
  league: BettingLeague;
  season: number;
  providerHomeTeam: string | null;
  providerAwayTeam: string | null;
  normalizedHomeTeam: string | null;
  normalizedAwayTeam: string | null;
  providerKickoff: string | null;
  candidateGameIds: string[];
  candidateKickoffDeltas: Array<{ gameId: string; kickoffDeltaMinutes: number }>;
  kickoffDeltaMinutes: number | null;
  usedCrosswalk: boolean;
  neutralSiteOrientationOverride: boolean;
  weekMismatch: boolean | null;
};

export type BettingSplitGameJoinUnmatchedReason =
  | "UNMATCHED_GAME"
  | "KICKOFF_OUTSIDE_TOLERANCE";

export type BettingSplitGameJoinRejectedReason =
  | "CROSSWALK_TARGET_NOT_FOUND"
  | "CROSSWALK_IDENTITY_MISMATCH"
  | "CROSSWALK_CONFLICT"
  | "DUPLICATE_CANONICAL_GAME_ID"
  | "TEAM_MAPPING_FAILED"
  | "HOME_AWAY_MISMATCH"
  | "INVALID_FINAL_SNAPSHOT"
  | "LEAGUE_MISMATCH";

export type BettingSplitGameJoinResult =
  | {
      status: "matched";
      snapshot: BettingSplitSnapshot;
      crosswalkCandidate: BettingProviderGameCrosswalk;
      evidence: BettingSplitGameJoinEvidence;
    }
  | {
      status: "unmatched";
      reason: BettingSplitGameJoinUnmatchedReason;
      evidence: BettingSplitGameJoinEvidence;
    }
  | {
      status: "ambiguous";
      reason: "AMBIGUOUS_GAME";
      candidateGameIds: string[];
      evidence: BettingSplitGameJoinEvidence;
    }
  | {
      status: "rejected";
      reason: BettingSplitGameJoinRejectedReason;
      evidence: BettingSplitGameJoinEvidence;
      validationIssues?: string[];
    };

export type BettingSplitGameJoinOptions = {
  crosswalks?: readonly BettingProviderGameCrosswalk[];
  providerTeamIdentities?: readonly BettingProviderTeamIdentity[];
  kickoffToleranceMs?: number;
};

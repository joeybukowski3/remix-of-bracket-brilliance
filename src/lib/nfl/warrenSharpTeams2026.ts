/**
 * warrenSharpTeams2026.ts
 * Utilities for the Warren Sharp 2026 team profiles.
 * Source: Warren Sharp 2026 Football Preview
 */

export {
  getWarrenSharpProfile,
  getPositionalRankTone,
  POSITIONAL_RATING_LABELS,
  WS_TEAM_MAP,
  WS_TEAMS_2026,
  type WarrenSharpTeamProfile2026,
  type WsPositionalRatings,
  type WsCoachingStaff,
  type WsPersonnelMove,
  type WsDraftAddition,
  type WsTeamOutlook,
} from "@/data/nflWarrenSharpTeams2026";

/** The seven positional categories, in display order */
export const POSITIONAL_ORDER = [
  "quarterbacks",
  "offensiveLine",
  "receivers",
  "runningBacks",
  "front7",
  "secondary",
  "headCoach",
] as const;

export type PositionalKey = (typeof POSITIONAL_ORDER)[number];

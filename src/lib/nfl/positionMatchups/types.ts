/**
 * Shared data contract for the "Fantasy Position Matchup Comparison" page:
 * a team's own fantasy production by position (FOR) vs. the opponent
 * defense's fantasy points allowed by that position (ALLOWED), combined
 * into a signed matchup EDGE and a categorical RATING.
 *
 * Reuses the sample-window vocabulary from fantasyAllowed/types.ts (2026 /
 * 2025 / last5 / last8) so both pages stay on one rolling-window contract --
 * see fantasyAllowed/types.ts for the definitions.
 *
 * Positions here are the plain fantasy positions (QB/RB/WR/TE), NOT the
 * Wide WR / Slot WR split used by the Fantasy Points Allowed page: both FOR
 * and ALLOWED are aggregated directly from per-game player rows at the raw
 * "WR" position, so there is no wide/slot ambiguity to carry into this page.
 */

import type { FantasyAllowedSampleKey } from "@/lib/nfl/fantasyAllowed/types";

export type { FantasyAllowedSampleKey as PositionMatchupSampleKey } from "@/lib/nfl/fantasyAllowed/types";
export { FANTASY_ALLOWED_SAMPLE_KEYS as POSITION_MATCHUP_SAMPLE_KEYS } from "@/lib/nfl/fantasyAllowed/types";

export type PositionMatchupPositionKey = "qb" | "rb" | "wr" | "te";

export const POSITION_MATCHUP_POSITION_KEYS: readonly PositionMatchupPositionKey[] = ["qb", "rb", "wr", "te"];

/**
 * Categorical read of the EDGE metric. See rating.ts for the exact
 * thresholds and how they were derived from the EDGE distribution.
 */
export type PositionMatchupRating = "very-strong" | "strong" | "neutral" | "weak" | "very-weak";

/**
 * One position's full matchup comparison for one team, in one sample
 * window. `forRank`/`allowedRank` both run 1 (fewest fantasy points) to 32
 * (most fantasy points) -- see aggregate.ts. `edge` is null whenever either
 * rank is unavailable (insufficient sample), never a fabricated zero.
 */
export type PositionMatchupCell = {
  forRank: number | null;
  forPerGame: number | null;
  forGamesSampled: number;
  allowedRank: number | null;
  allowedPerGame: number | null;
  allowedGamesSampled: number;
  /** Signed matchup edge: FOR rank + ALLOWED rank - 33. Positive = favorable to the offense. */
  edge: number | null;
  rating: PositionMatchupRating | null;
};

export type PositionMatchupCells = Record<PositionMatchupPositionKey, PositionMatchupCell>;

export type PositionMatchupRow = {
  team: string;
  opponent: string | null;
  location: "@" | "vs" | null;
  samples: Record<FantasyAllowedSampleKey, PositionMatchupCells>;
};

export const POSITION_MATCHUP_ARTIFACT_PATH = "/data/nfl/fantasy-position-matchups.json";

export type PositionMatchupArtifact = {
  schemaVersion: "nfl-fantasy-position-matchups-v1";
  generatedAt: string;
  /** Season/week the "current opponent" column and the "2026" sample are anchored to. */
  season: number;
  week: number | null;
  scoringVersion: string;
  rows: readonly PositionMatchupRow[];
};

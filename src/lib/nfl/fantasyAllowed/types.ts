/**
 * Shared data contract for the "Fantasy Points Allowed by Position" family
 * of pages (defense rank tables). Deliberately generic so a future
 * "TDs Allowed by Position" metric or a player-matchup table can reuse the
 * same row/sample/rank shell -- see docs/features/nfl-fantasy-points-allowed.md.
 *
 * Position keys are UI-facing labels, not raw nflverse positions: "wr" is
 * aggregated from player-week WR rows, while "wideWr" and "slotWr" are
 * separate current-season defense snapshot measures.
 */

export type FantasyAllowedSampleKey = "2026" | "2025" | "last5" | "last8";

export const FANTASY_ALLOWED_SAMPLE_KEYS: readonly FantasyAllowedSampleKey[] = ["2026", "2025", "last5", "last8"];

export type FantasyAllowedPositionKey = "qb" | "rb" | "wr" | "wideWr" | "slotWr" | "te";

export const FANTASY_ALLOWED_POSITION_KEYS: readonly FantasyAllowedPositionKey[] = [
  "qb",
  "rb",
  "wr",
  "wideWr",
  "slotWr",
  "te",
];

/**
 * Provenance of a single position-sample cell. "jkb-full-ppr-player-week"
 * means it was aggregated here from per-game nflverse player stats using the
 * site's JKB Full PPR scoring (src/lib/fantasy/weekly/scoring.ts).
 * "razzball-slot-wide-snapshot" means it was carried over from the
 * defense-level Razzball slot/wide scrape
 * (src/lib/nfl/slotWideDefenseContext.ts) instead, because no per-game
 * historical slot/wide split exists -- see AGENTS notes on this gap.
 */
export type FantasyAllowedSource = "jkb-full-ppr-player-week" | "razzball-slot-wide-snapshot";

/**
 * Auditable rank cell: keeps the raw games/points behind the rank so the
 * artifact never exposes a bare number nobody can check.
 */
export type FantasyAllowedPositionSample = {
  rank: number | null;
  gamesSampled: number;
  fantasyPointsAllowedTotal: number | null;
  fantasyPointsAllowedPerGame: number | null;
  source: FantasyAllowedSource;
};

export type FantasyAllowedPositionRanks = Record<FantasyAllowedPositionKey, FantasyAllowedPositionSample | null>;

export type FantasyAllowedRow = {
  team: string;
  opponent: string | null;
  location: "@" | "vs" | null;
  samples: Record<FantasyAllowedSampleKey, FantasyAllowedPositionRanks>;
};

export const FANTASY_ALLOWED_ARTIFACT_PATH = "/data/nfl/fantasy-points-allowed.json";

export type FantasyAllowedArtifact = {
  schemaVersion: "nfl-fantasy-points-allowed-v2";
  generatedAt: string;
  /** Season/week the "current opponent" column and the "2026" sample are anchored to. */
  season: number;
  week: number | null;
  scoringVersion: string;
  rows: readonly FantasyAllowedRow[];
};

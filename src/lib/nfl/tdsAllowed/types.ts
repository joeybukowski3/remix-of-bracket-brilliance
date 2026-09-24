/**
 * Shared data contract for "Touchdowns Allowed by Position" (defense rank
 * table), a sibling of the Fantasy Points Allowed family --
 * see src/lib/nfl/fantasyAllowed/types.ts for the shape this mirrors and
 * docs/research/nfl-fantasy-points-allowed for the audit this contract
 * extends to touchdown counts.
 *
 * Columns are scoring-method categories (scorer position + touchdown type),
 * not raw nflverse positions:
 *   qbPass  = passing TDs thrown by QBs        (QB row, passing_tds)
 *   qbRush  = rushing TDs scored by QBs        (QB row, rushing_tds)
 *   rbRush  = rushing TDs scored by RBs        (RB row, rushing_tds)
 *   rbRec   = receiving TDs scored by RBs      (RB row, receiving_tds)
 *   wrRec   = receiving TDs scored by WRs      (WR row, receiving_tds)
 *   teRec   = receiving TDs scored by TEs      (TE row, receiving_tds)
 * Each category reads exactly one stat field of exactly one position, so a
 * single stat can never land in two categories. A completed touchdown pass is
 * intentionally represented on BOTH sides -- qbPass (passer) and one of
 * rbRec/wrRec/teRec (receiver) -- because the columns answer "how many TDs of
 * this kind does this defense allow", not "how many scoring plays"; the
 * columns must never be summed into a single offense-TD total.
 * WR/TE rushing, non-QB passing and QB receiving TDs (a few per season) are
 * outside all six categories. Two-point conversions, special-teams and
 * defensive TDs are separate nflverse columns and never enter any category.
 *
 * There is no trustworthy alignment-split (wide/slot) touchdown source (the
 * Razzball slot/wide snapshot only carries PPG-allowed; re-audited against
 * every public nflverse release plus NGS/PFF/Fantasy Points/SIS), so WR REC is
 * one combined column.
 *
 * `rank` is always computed from touchdownsAllowedPerGame (comparable across
 * samples with different game counts); the table's Raw display mode instead
 * shows touchdownsAllowedTotal as a whole number -- see presentation.ts.
 */

export type TdsAllowedSampleKey = "2026" | "2025" | "last5" | "last8";

export const TDS_ALLOWED_SAMPLE_KEYS: readonly TdsAllowedSampleKey[] = ["2026", "2025", "last5", "last8"];

export type TdsAllowedCategoryKey = "qbPass" | "qbRush" | "rbRush" | "rbRec" | "wrRec" | "teRec";

/** Desktop column order. */
export const TDS_ALLOWED_CATEGORY_KEYS: readonly TdsAllowedCategoryKey[] = ["qbPass", "qbRush", "rbRush", "rbRec", "wrRec", "teRec"];

/** Provenance of a single category-sample cell. Only one source exists today. */
export type TdsAllowedSource = "nflverse-player-week";

/**
 * Auditable rank cell: keeps the raw games/touchdowns behind the rank so the
 * artifact never exposes a bare number nobody can check.
 */
export type TdsAllowedPositionSample = {
  rank: number | null;
  gamesSampled: number;
  touchdownsAllowedTotal: number | null;
  touchdownsAllowedPerGame: number | null;
  source: TdsAllowedSource;
};

export type TdsAllowedCategoryRanks = Record<TdsAllowedCategoryKey, TdsAllowedPositionSample | null>;

export type TdsAllowedRow = {
  team: string;
  opponent: string | null;
  location: "@" | "vs" | null;
  samples: Record<TdsAllowedSampleKey, TdsAllowedCategoryRanks>;
};

export const TDS_ALLOWED_ARTIFACT_PATH = "/data/nfl/tds-allowed-by-position.json";

export type TdsAllowedArtifact = {
  schemaVersion: "nfl-tds-allowed-by-position-v2";
  generatedAt: string;
  /** Season/week the "current opponent" column and the "2026" sample are anchored to. */
  season: number;
  week: number | null;
  rows: readonly TdsAllowedRow[];
};

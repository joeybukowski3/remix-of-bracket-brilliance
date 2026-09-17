/**
 * Shared data contract for "Touchdowns Allowed by Position" (defense rank
 * table), a sibling of the Fantasy Points Allowed family --
 * see src/lib/nfl/fantasyAllowed/types.ts for the shape this mirrors and
 * docs/research/nfl-fantasy-points-allowed for the audit this contract
 * extends to touchdown counts.
 *
 * Position keys are UI-facing labels, not raw nflverse positions: "wideWr"
 * and "slotWr" both source from nflverse position "WR". Unlike Fantasy
 * Points Allowed, there is no trustworthy alignment-split touchdown source
 * (the Razzball slot/wide snapshot only carries PPG-allowed, not TD counts),
 * so wideWr/slotWr are always null here -- see presentation.ts.
 */

export type TdsAllowedSampleKey = "2026" | "2025" | "last5";

export const TDS_ALLOWED_SAMPLE_KEYS: readonly TdsAllowedSampleKey[] = ["2026", "2025", "last5"];

export type TdsAllowedPositionKey = "qb" | "rb" | "wideWr" | "slotWr" | "te";

export const TDS_ALLOWED_POSITION_KEYS: readonly TdsAllowedPositionKey[] = [
  "qb",
  "rb",
  "wideWr",
  "slotWr",
  "te",
];

/** Provenance of a single position-sample cell. Only one source exists today. */
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

export type TdsAllowedPositionRanks = Record<TdsAllowedPositionKey, TdsAllowedPositionSample | null>;

export type TdsAllowedRow = {
  team: string;
  opponent: string | null;
  location: "@" | "vs" | null;
  samples: Record<TdsAllowedSampleKey, TdsAllowedPositionRanks>;
};

export const TDS_ALLOWED_ARTIFACT_PATH = "/data/nfl/tds-allowed-by-position.json";

export type TdsAllowedArtifact = {
  schemaVersion: "nfl-tds-allowed-by-position-v1";
  generatedAt: string;
  /** Season/week the "current opponent" column and the "2026" sample are anchored to. */
  season: number;
  week: number | null;
  rows: readonly TdsAllowedRow[];
};

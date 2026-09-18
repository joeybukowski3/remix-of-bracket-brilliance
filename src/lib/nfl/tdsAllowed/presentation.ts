/**
 * Presentation-only mapping from the Touchdowns Allowed artifact onto the
 * generic AllowedByPositionTable shapes, plus this metric's heat-tone
 * direction. No ranks are recomputed here -- see aggregate.ts/buildRows.ts
 * for the pipeline that produced them. Mirrors
 * src/lib/nfl/fantasyAllowed/presentation.ts.
 */

import type { AllowedByPositionColumn, AllowedByPositionRow } from "@/components/nfl/allowed-by-position/types";
import type { RankTone } from "@/components/nfl/allowed-by-position/AllowedByPositionTable";
import { ALLOWED_BY_POSITION_HEADER_CLASSNAMES } from "@/components/nfl/allowed-by-position/headerColors";
import { jkbHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";
import { TDS_ALLOWED_POSITION_KEYS, type TdsAllowedArtifact, type TdsAllowedPositionKey, type TdsAllowedSampleKey } from "./types";

export const TDS_ALLOWED_COLUMNS: readonly AllowedByPositionColumn<TdsAllowedPositionKey>[] = [
  { key: "qb", label: "QB", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.qb },
  { key: "rb", label: "RB", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.rb },
  { key: "wr", label: "WR", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.wr },
  { key: "te", label: "TE", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.te },
];

/**
 * Direct (un-inverted) reading of the shared 32-team JKB Heat rank scale:
 * rank 1 (fewest touchdowns allowed) reads green/gold, rank 32 (most
 * touchdowns allowed) reads red -- the same defense's-own-performance
 * direction as Fantasy Points Allowed (fantasyAllowedRankTone), reusing the
 * same tone/color values without introducing a new palette.
 */
export function tdsAllowedRankTone(rank: number | null): RankTone {
  const tone = weeklyRankHeatTone(rank, 32);
  if (tone === "missing") return {};
  const style = jkbHeatStyle(tone);
  return { style: { backgroundColor: style.backgroundColor, color: style.color } };
}

/** Raw display uses total touchdowns allowed for the selected sample, as a whole number (never toFixed(1) -- rank alone carries the per-game rate). */
function formatTouchdownsAllowedTotal(total: number | null | undefined): string | null {
  if (total == null) return null;
  return String(total);
}

export function buildTdsAllowedTableRows(
  artifact: TdsAllowedArtifact | null,
  sample: TdsAllowedSampleKey,
): AllowedByPositionRow<TdsAllowedPositionKey>[] {
  if (!artifact) return [];
  return artifact.rows.map((row): AllowedByPositionRow<TdsAllowedPositionKey> => {
    const positionSamples = row.samples[sample];
    const cells = {} as AllowedByPositionRow<TdsAllowedPositionKey>["cells"];
    for (const key of TDS_ALLOWED_POSITION_KEYS) {
      const positionSample = positionSamples[key];
      // Rank always reflects touchdownsAllowedPerGame (see aggregate.ts) so it stays comparable
      // across samples with different game counts; only the displayed raw value/sort key is the total.
      const total = positionSample?.touchdownsAllowedTotal ?? null;
      cells[key] = {
        rank: positionSample?.rank ?? null,
        rawValue: total,
        rawDisplay: formatTouchdownsAllowedTotal(total),
      };
    }
    return {
      id: row.team,
      team: row.team,
      opponent: row.opponent,
      location: row.location,
      cells,
    };
  });
}

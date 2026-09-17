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
  { key: "wideWr", label: "Wide WR", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.wideWr },
  { key: "slotWr", label: "Slot WR", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.slotWr },
  { key: "te", label: "TE", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.te },
];

/** No trustworthy per-game slot/wide touchdown split exists -- see buildRows.ts. Shown once at page level, never per cell. */
export const TDS_ALLOWED_WIDE_SLOT_NOTICE = "Wide/Slot WR touchdown splits are not currently available.";

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

function formatTouchdownsAllowedPerGame(perGame: number | null | undefined): string | null {
  if (perGame == null) return null;
  return perGame.toFixed(1);
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
      const perGame = positionSample?.touchdownsAllowedPerGame ?? null;
      cells[key] = {
        rank: positionSample?.rank ?? null,
        rawValue: perGame,
        rawDisplay: formatTouchdownsAllowedPerGame(perGame),
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

/**
 * Presentation-only mapping from the Fantasy Points Allowed artifact onto
 * the generic AllowedByPositionTable shapes, plus this metric's heat-tone
 * direction. No ranks are recomputed here -- see aggregate.ts/buildRows.ts
 * for the pipeline that produced them.
 */

import type { AllowedByPositionColumn, AllowedByPositionRow } from "@/components/nfl/allowed-by-position/types";
import type { RankTone } from "@/components/nfl/allowed-by-position/AllowedByPositionTable";
import { ALLOWED_BY_POSITION_HEADER_CLASSNAMES } from "@/components/nfl/allowed-by-position/headerColors";
import { jkbHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";
import {
  FANTASY_ALLOWED_POSITION_KEYS,
  type FantasyAllowedArtifact,
  type FantasyAllowedPositionKey,
  type FantasyAllowedSampleKey,
} from "./types";

const COLUMN = {
  qb: { key: "qb", label: "QB", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.qb },
  rb: { key: "rb", label: "RB", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.rb },
  wr: { key: "wr", label: "WR", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.wr },
  wideWr: { key: "wideWr", label: "Wide WR", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.wideWr },
  slotWr: { key: "slotWr", label: "Slot WR", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.slotWr },
  te: { key: "te", label: "TE", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.te },
} satisfies Record<FantasyAllowedPositionKey, AllowedByPositionColumn<FantasyAllowedPositionKey>>;

export function fantasyAllowedColumns(artifact: FantasyAllowedArtifact | null, sample: FantasyAllowedSampleKey): readonly AllowedByPositionColumn<FantasyAllowedPositionKey>[] {
  const hasSplit = sample === "2026" && artifact != null && artifact.rows.length > 0 && artifact.rows.every((row) =>
    row.samples["2026"].wideWr?.fantasyPointsAllowedPerGame != null && row.samples["2026"].slotWr?.fantasyPointsAllowedPerGame != null,
  );
  return hasSplit
    ? [COLUMN.qb, COLUMN.rb, COLUMN.wideWr, COLUMN.slotWr, COLUMN.te]
    : [COLUMN.qb, COLUMN.rb, COLUMN.wr, COLUMN.te];
}

/**
 * Direct (un-inverted) reading of the shared 32-team JKB Heat rank scale:
 * rank 1 (stingiest defense) reads green/gold, rank 32 (most fantasy
 * production allowed) reads red. This is the DEFENSE's-own-performance
 * perspective, deliberately not the "opponent-defense" offense-exploitability
 * perspective used elsewhere on the site (weeklyMatchupComponentHeatTone),
 * per this page's explicit design spec. No new palette/thresholds are
 * introduced -- only the existing tone/color values are reused directly.
 */
export function fantasyAllowedRankTone(rank: number | null): RankTone {
  const tone = weeklyRankHeatTone(rank, 32);
  if (tone === "missing") return {};
  const style = jkbHeatStyle(tone);
  return { style: { backgroundColor: style.backgroundColor, color: style.color } };
}

/** Raw display uses fantasy points allowed PER GAME (never the sample total), one decimal place. */
function formatFantasyPointsAllowedPerGame(perGame: number | null | undefined): string | null {
  if (perGame == null) return null;
  return perGame.toFixed(1);
}

export function buildFantasyAllowedTableRows(
  artifact: FantasyAllowedArtifact | null,
  sample: FantasyAllowedSampleKey,
): AllowedByPositionRow<FantasyAllowedPositionKey>[] {
  if (!artifact) return [];
  return artifact.rows.map((row): AllowedByPositionRow<FantasyAllowedPositionKey> => {
    const positionSamples = row.samples[sample];
    const cells = {} as AllowedByPositionRow<FantasyAllowedPositionKey>["cells"];
    for (const key of FANTASY_ALLOWED_POSITION_KEYS) {
      const positionSample = positionSamples[key];
      const perGame = positionSample?.fantasyPointsAllowedPerGame ?? null;
      cells[key] = {
        rank: positionSample?.rank ?? null,
        rawValue: perGame,
        rawDisplay: formatFantasyPointsAllowedPerGame(perGame),
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

/**
 * Presentation-only mapping from the Yards vs Avg artifact onto the generic
 * AllowedByPositionTable shapes. Nothing is recomputed here: deltas, ranks and
 * consistency counts all come from the artifact (see buildArtifact.ts).
 */

import type { AllowedByPositionCell, AllowedByPositionColumn, AllowedByPositionRow } from "@/components/nfl/allowed-by-position/types";
import type { RankTone } from "@/components/nfl/allowed-by-position/AllowedByPositionTable";
import { ALLOWED_BY_POSITION_HEADER_CLASSNAMES } from "@/components/nfl/allowed-by-position/headerColors";
import { fantasyAllowedRankTone } from "@/lib/nfl/fantasyAllowed/presentation";
import { SMALL_SAMPLE_STYLE } from "@/lib/shared/jkbHeat";
import {
  YARDS_VS_AVERAGE_METRIC_KEYS,
  YARDS_VS_AVERAGE_SMALL_SAMPLE_GAMES,
  type YardsVsAverageArtifact,
  type YardsVsAverageMetricKey,
  type YardsVsAverageMetricSample,
  type YardsVsAverageSampleKey,
} from "./types";

export type YardsVsAverageUnit = "yds" | "pct";

export const YARDS_VS_AVERAGE_COLUMNS: readonly AllowedByPositionColumn<YardsVsAverageMetricKey>[] = [
  { key: "pass", label: "PASS", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.teamPass },
  { key: "rush", label: "RUSH", headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.teamRush },
  { key: "qbRush", label: "QB RUSH", stackLabel: true, headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.qbRush },
  { key: "rbRush", label: "RB RUSH", stackLabel: true, headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.rbRush },
  { key: "rbRec", label: "RB REC", stackLabel: true, headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.rbRec },
  { key: "wrRec", label: "WR REC", stackLabel: true, headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.wrRec },
  { key: "teRec", label: "TE REC", stackLabel: true, headerClassName: ALLOWED_BY_POSITION_HEADER_CLASSNAMES.teRec },
];

/** Signed one-decimal display: "+18.9", "-4.0", "0.0"; "%" suffix in % mode. */
export function formatYardsVsAverageDelta(value: number | null, unit: YardsVsAverageUnit): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  // Triple-digit percentages drop the decimal so "+122.7% (32)" does not overflow an 80px column.
  const digits = unit === "pct" && Math.abs(value) >= 100 ? 0 : 1;
  return `${sign}${Math.abs(value).toFixed(digits)}${unit === "pct" ? "%" : ""}`;
}

/** Whole-number mobile display ("+68", "+55%") for the 32px columns, where "+68.4 (32)" cannot fit. */
export function formatYardsVsAverageDeltaCompact(value: number | null, unit: YardsVsAverageUnit): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(Math.abs(value)) * Math.sign(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded)}${unit === "pct" ? "%" : ""}`;
}

export function yardsVsAverageConsistency(sample: YardsVsAverageMetricSample): string {
  if (sample.gamesSampled === 0) return "No games sampled";
  const games = `${sample.gamesSampled} game${sample.gamesSampled === 1 ? "" : "s"}`;
  return `${sample.gamesAbove}/${sample.gamesSampled} opponents above avg, ${sample.gamesBelow} below (${games})`;
}

function toCell(sample: YardsVsAverageMetricSample, unit: YardsVsAverageUnit): AllowedByPositionCell {
  const value = unit === "pct" ? sample.deltaPct : sample.deltaYds;
  const rank = unit === "pct" ? sample.rankPct : sample.rankYds;
  return {
    rank,
    rawValue: value,
    rawDisplay: formatYardsVsAverageDelta(value, unit),
    rawDisplayCompact: formatYardsVsAverageDeltaCompact(value, unit),
    title: `${rank == null ? "Unranked" : `Rank ${rank} of 32`} · ${yardsVsAverageConsistency(sample)}`,
    smallSample: sample.gamesSampled > 0 && sample.gamesSampled < YARDS_VS_AVERAGE_SMALL_SAMPLE_GAMES,
  };
}

export function buildYardsVsAverageTableRows(
  artifact: YardsVsAverageArtifact | null,
  sample: YardsVsAverageSampleKey,
  unit: YardsVsAverageUnit,
): AllowedByPositionRow<YardsVsAverageMetricKey>[] {
  if (!artifact) return [];
  return artifact.rows.map((row) => ({
    id: row.team,
    team: row.team,
    opponent: row.opponent,
    location: row.location,
    cells: Object.fromEntries(YARDS_VS_AVERAGE_METRIC_KEYS.map((metric) => [metric, toCell(row.samples[sample][metric], unit)])) as AllowedByPositionRow<YardsVsAverageMetricKey>["cells"],
  }));
}

/**
 * Same direction and palette as Fantasy Points Allowed (rank 1 = most
 * negative delta = best defense reads green/gold; rank 32 reads red). Small
 * samples use the shared muted small-sample tint instead of rank heat.
 */
export function yardsVsAverageRankTone(rank: number | null, cell?: AllowedByPositionCell): RankTone {
  if (cell?.smallSample && rank != null) {
    return { style: { backgroundColor: SMALL_SAMPLE_STYLE.backgroundColor, color: SMALL_SAMPLE_STYLE.color } };
  }
  return fantasyAllowedRankTone(rank);
}

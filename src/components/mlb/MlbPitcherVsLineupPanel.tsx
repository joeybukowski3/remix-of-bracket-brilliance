import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { computeHr9, computeK9, computePercent, formatAvgLike, formatDecimal } from "@/lib/mlb/mlbFormatters";
import { getBarScalePosition, type MlbScaleKey } from "@/lib/mlb/mlbBarScale";
import { getStatToneFromPercentile } from "@/lib/mlb/mlbDisplayHelpers";
import type { MlbLineupSummary, MlbOpponentSplit, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

type EdgeResult = "pitcher" | "lineup" | "even";

function getEdge(pitcherVal: number | null, lineupVal: number | null, category: string): EdgeResult {
  if (pitcherVal == null || lineupVal == null) return "even";
  if (category === "k9") return "pitcher";
  if (category === "bb") return pitcherVal <= 7 ? "pitcher" : lineupVal >= 0.32 ? "lineup" : "even";
  if (category === "hr9") return pitcherVal <= 0.9 ? "pitcher" : pitcherVal >= 1.2 ? "lineup" : "even";
  if (category === "era") return pitcherVal <= 3.5 ? "pitcher" : pitcherVal >= 5.0 ? "lineup" : "even";
  return "even";
}

function getNormalizedPercentile(value: number | null, scaleKey: MlbScaleKey, higherIsBetter: boolean) {
  if (value == null) return null;
  const raw = getBarScalePosition(value, scaleKey);
  return Math.max(1, Math.min(99, Math.round(higherIsBetter ? raw : 100 - raw)));
}

function CompactBar({
  label, value, barPct, color,
}: {
  label: string; value: string; barPct: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-14 shrink-0 truncate text-right text-[10px] font-bold text-muted-foreground">{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
        {/* avg tick at 50th percentile */}
        <span className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-amber-400" style={{ left: "50%" }} />
        <span className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 shrink-0 text-[10px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function MlbPitcherVsLineupPanel({
  pitcher,
  split,
  lineupSummary,
  pitcherTeamAbbreviation,
  lineupTeamAbbreviation,
}: {
  title: string;
  pitcher: MlbStarterProfile;
  lineupLabel: string;
  split: MlbOpponentSplit;
  lineupSummary: MlbLineupSummary;
  pitcherTeamAbbreviation: string;
  lineupTeamAbbreviation: string;
}) {
  const pitcherColors = getMlbTeamColors(pitcherTeamAbbreviation);
  const lineupColors = getMlbTeamColors(lineupTeamAbbreviation);
  const pitcherLastName = pitcher.name.split(" ").pop() ?? pitcher.name;

  const k9Val = computeK9(pitcher.strikeOuts, pitcher.inningsPitched);
  const bbVal = computePercent(pitcher.baseOnBalls, pitcher.battersFaced);
  const hr9Val = computeHr9(pitcher.homeRuns, pitcher.inningsPitched);
  const eraVal = pitcher.era != null ? Number(pitcher.era) : null;
  const lineupKVal = computePercent(split?.strikeOuts ?? null, split?.plateAppearances ?? null);
  const obpVal = split?.obp ?? lineupSummary.obp ?? null;
  const slgVal = split?.slg ?? lineupSummary.slg ?? null;
  const opsVal = split?.ops ?? lineupSummary.ops ?? null;

  const rows = [
    {
      category: "K/9 / K%", edgeKey: "k9",
      pitcherStat: `${k9Val?.toFixed(1) ?? "-"} K/9`, pitcherVal: k9Val,
      pitcherPct: getNormalizedPercentile(k9Val, "k9", true),
      lineupStat: `${lineupKVal?.toFixed(1) ?? "-"}% K`, lineupVal: lineupKVal,
      lineupPct: getNormalizedPercentile(lineupKVal, "percent", false),
    },
    {
      category: "BB% / OBP", edgeKey: "bb",
      pitcherStat: `${bbVal?.toFixed(1) ?? "-"}% BB`, pitcherVal: bbVal,
      pitcherPct: getNormalizedPercentile(bbVal, "bbPercent", false),
      lineupStat: formatAvgLike(obpVal), lineupVal: obpVal != null ? Number(obpVal) : null,
      lineupPct: getNormalizedPercentile(obpVal != null ? Number(obpVal) : null, "obp", true),
    },
    {
      category: "HR/9 / SLG", edgeKey: "hr9",
      pitcherStat: `${hr9Val?.toFixed(2) ?? "-"} HR/9`, pitcherVal: hr9Val,
      pitcherPct: getNormalizedPercentile(hr9Val, "hr9", false),
      lineupStat: formatAvgLike(slgVal), lineupVal: slgVal != null ? Number(slgVal) : null,
      lineupPct: getNormalizedPercentile(slgVal != null ? Number(slgVal) : null, "slg", true),
    },
    {
      category: "ERA / OPS", edgeKey: "era",
      pitcherStat: formatDecimal(pitcher.era, 2), pitcherVal: eraVal,
      pitcherPct: getNormalizedPercentile(eraVal, "era", false),
      lineupStat: formatAvgLike(opsVal), lineupVal: opsVal != null ? Number(opsVal) : null,
      lineupPct: getNormalizedPercentile(opsVal != null ? Number(opsVal) : null, "ops", true),
    },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end gap-1 pr-1 text-[9px] text-muted-foreground">
        <span className="inline-block h-2.5 w-0.5 rounded-full bg-amber-400" />
        Avg = 50th pctl
      </div>
      {rows.map((row) => {
        const edge = getEdge(row.pitcherVal, row.lineupVal, row.edgeKey);
        const edgeTeam = edge === "pitcher" ? pitcherTeamAbbreviation : edge === "lineup" ? lineupTeamAbbreviation : null;
        const edgeColors = getMlbTeamColors(edgeTeam);
        return (
          <div key={row.category} className="space-y-1 rounded-lg bg-secondary/30 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{row.category}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: edgeTeam ? edgeColors.primary : "#94a3b8" }}
              >
                {edge === "pitcher" ? `${pitcherTeamAbbreviation} edge` : edge === "lineup" ? `${lineupTeamAbbreviation} edge` : "Even"}
              </span>
            </div>
            <CompactBar label={pitcherLastName} value={row.pitcherStat} barPct={row.pitcherPct ?? 0} color={pitcherColors.primary} />
            <CompactBar label={lineupTeamAbbreviation} value={row.lineupStat} barPct={row.lineupPct ?? 0} color={lineupColors.primary} />
          </div>
        );
      })}
    </div>
  );
}

import { computeHr9, computeK9, computePercent, formatAvgLike, formatDecimal } from "@/lib/mlb/mlbFormatters";
import type { MlbLineupSummary, MlbOpponentSplit, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

type EdgeResult = "pitcher" | "lineup" | "even";

function getEdge(pitcherVal: number | null, lineupVal: number | null, category: string): EdgeResult {
  if (pitcherVal == null || lineupVal == null) return "even";
  // K/9: high pitcher K/9 = pitcher edge
  if (category === "k9") return "pitcher";
  // BB%: low pitcher BB% is better for pitcher
  if (category === "bb") return pitcherVal <= 7 ? "pitcher" : lineupVal >= 0.32 ? "lineup" : "even";
  // HR/9: low = pitcher edge
  if (category === "hr9") return pitcherVal <= 0.9 ? "pitcher" : pitcherVal >= 1.2 ? "lineup" : "even";
  // ERA vs OPS: low ERA = pitcher edge
  if (category === "era") return pitcherVal <= 3.5 ? "pitcher" : pitcherVal >= 5.0 ? "lineup" : "even";
  return "even";
}

function EdgeBadge({ edge }: { edge: EdgeResult }) {
  const styles: Record<EdgeResult, string> = {
    pitcher: "bg-blue-50 text-blue-800 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-800",
    lineup:  "bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
    even:    "bg-secondary text-muted-foreground ring-1 ring-border/50",
  };
  const labels: Record<EdgeResult, string> = { pitcher: "Pitcher", lineup: "Lineup", even: "Even" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${styles[edge]}`}>
      {labels[edge]}
    </span>
  );
}

function MatchupTable({
  pitcherName,
  lineupName,
  rows,
}: {
  pitcherName: string;
  lineupName: string;
  rows: { category: string; pitcherStat: string; pitcherVal: number | null; lineupStat: string; lineupVal: number | null; edgeKey: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-secondary/50">
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{pitcherName}</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pitcher</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Edge</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lineup</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{lineupName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const edge = getEdge(row.pitcherVal, row.lineupVal, row.edgeKey);
            const pitcherCls = edge === "pitcher" ? "text-emerald-700 dark:text-emerald-400 font-semibold" : edge === "lineup" ? "text-red-600 dark:text-red-400" : "text-foreground";
            const lineupCls  = edge === "lineup"  ? "text-emerald-700 dark:text-emerald-400 font-semibold" : edge === "pitcher" ? "text-red-600 dark:text-red-400" : "text-foreground";
            return (
              <tr key={row.category} className={i % 2 === 1 ? "bg-secondary/30" : ""}>
                <td className={`px-4 py-3 text-right ${pitcherCls}`}>{row.pitcherStat}</td>
                <td className="px-3 py-3 text-center text-[11px] text-muted-foreground">{row.category.split("/")[0]}</td>
                <td className="px-3 py-3 text-center"><EdgeBadge edge={edge} /></td>
                <td className="px-3 py-3 text-center text-[11px] text-muted-foreground">{row.category.split("/")[1]}</td>
                <td className={`px-4 py-3 text-left ${lineupCls}`}>{row.lineupStat}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MlbPitcherVsLineupPanel({
  title,
  pitcher,
  lineupLabel,
  split,
  lineupSummary,
}: {
  title: string;
  pitcher: MlbStarterProfile;
  lineupLabel: string;
  split: MlbOpponentSplit;
  lineupSummary: MlbLineupSummary;
}) {
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
      category: "K/9 / K%",
      pitcherStat: `${k9Val?.toFixed(1) ?? "—"} K/9`,
      pitcherVal: k9Val,
      lineupStat: `${lineupKVal?.toFixed(1) ?? "—"}% K`,
      lineupVal: lineupKVal,
      edgeKey: "k9",
    },
    {
      category: "BB% / OBP",
      pitcherStat: `${bbVal?.toFixed(1) ?? "—"}% BB`,
      pitcherVal: bbVal,
      lineupStat: formatAvgLike(obpVal),
      lineupVal: obpVal != null ? Number(obpVal) : null,
      edgeKey: "bb",
    },
    {
      category: "HR/9 / SLG",
      pitcherStat: `${hr9Val?.toFixed(2) ?? "—"} HR/9`,
      pitcherVal: hr9Val,
      lineupStat: formatAvgLike(slgVal),
      lineupVal: slgVal != null ? Number(slgVal) : null,
      edgeKey: "hr9",
    },
    {
      category: "ERA / OPS",
      pitcherStat: formatDecimal(pitcher.era, 2),
      pitcherVal: eraVal,
      lineupStat: formatAvgLike(opsVal),
      lineupVal: opsVal != null ? Number(opsVal) : null,
      edgeKey: "era",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-sm text-muted-foreground">{lineupLabel}</span>
      </div>
      <MatchupTable pitcherName={pitcher.name.split(" ").pop() ?? pitcher.name} lineupName={lineupLabel} rows={rows} />
    </div>
  );
}

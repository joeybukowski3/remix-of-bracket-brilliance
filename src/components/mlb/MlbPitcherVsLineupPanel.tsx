import { computeHr9, computeK9, computePercent, formatAvgLike, formatDecimal } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
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

function EdgeBadge({
  edge,
  pitcherTeam,
  lineupTeam,
}: {
  edge: EdgeResult;
  pitcherTeam: string;
  lineupTeam: string;
}) {
  const team = edge === "pitcher" ? pitcherTeam : edge === "lineup" ? lineupTeam : null;
  const colors = getMlbTeamColors(team);

  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
      style={team ? { backgroundColor: colors.primary, color: "#ffffff" } : { backgroundColor: "#e2e8f0", color: "#475569" }}
    >
      {edge === "pitcher" ? `${pitcherTeam} edge` : edge === "lineup" ? `${lineupTeam} edge` : "Even"}
    </span>
  );
}

export default function MlbPitcherVsLineupPanel({
  title,
  pitcher,
  lineupLabel,
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
        <span className="text-sm" style={{ color: lineupColors.primary }}>{lineupLabel}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-secondary/50">
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: pitcherColors.primary }}>{pitcher.name.split(" ").pop() ?? pitcher.name}</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pitcher</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Edge</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lineup</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: lineupColors.primary }}>{lineupLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const edge = getEdge(row.pitcherVal, row.lineupVal, row.edgeKey);
              const pitcherCls = edge === "pitcher" ? "font-semibold" : edge === "lineup" ? "text-red-600" : "text-foreground";
              const lineupCls = edge === "lineup" ? "font-semibold" : edge === "pitcher" ? "text-red-600" : "text-foreground";
              return (
                <tr key={row.category} className={i % 2 === 1 ? "bg-secondary/30" : ""}>
                  <td className={`px-4 py-3 text-right ${pitcherCls}`} style={edge === "pitcher" ? { color: pitcherColors.primary } : undefined}>{row.pitcherStat}</td>
                  <td className="px-3 py-3 text-center text-[11px] text-muted-foreground">{row.category.split("/")[0]}</td>
                  <td className="px-3 py-3 text-center">
                    <EdgeBadge edge={edge} pitcherTeam={pitcherTeamAbbreviation} lineupTeam={lineupTeamAbbreviation} />
                  </td>
                  <td className="px-3 py-3 text-center text-[11px] text-muted-foreground">{row.category.split("/")[1]}</td>
                  <td className={`px-4 py-3 text-left ${lineupCls}`} style={edge === "lineup" ? { color: lineupColors.primary } : undefined}>{row.lineupStat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

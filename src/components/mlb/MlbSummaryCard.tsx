import type { MlbSummaryCardData } from "@/lib/mlb/mlbTypes";
import { getEdgeTeamFromLabel, getMlbTeamColors } from "@/lib/mlbTeamColors";

export default function MlbSummaryCard({
  card,
  awayAbbreviation,
  homeAbbreviation,
}: {
  card: MlbSummaryCardData;
  awayAbbreviation: string;
  homeAbbreviation: string;
}) {
  const edgeTeam = getEdgeTeamFromLabel(card.value, awayAbbreviation, homeAbbreviation);
  const colors = edgeTeam ? getMlbTeamColors(edgeTeam) : { primary: "#64748b", tint: "rgba(148,163,184,0.12)" };

  return (
    <div
      className="rounded-2xl p-4 ring-1 ring-border/60 shadow-[0_10px_24px_hsl(var(--foreground)/0.04)]"
      style={{ backgroundColor: colors.tint, borderLeft: `4px solid ${colors.primary}` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</div>
      <div className="mt-3">
        {edgeTeam ? (
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold text-white"
            style={{ backgroundColor: colors.primary }}
          >
            {card.value}
          </span>
        ) : (
          <div className="text-base font-semibold text-foreground">{card.value}</div>
        )}
        <div className="mt-2 text-sm text-muted-foreground">{card.note}</div>
      </div>
    </div>
  );
}

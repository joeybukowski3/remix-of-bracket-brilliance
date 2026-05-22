import type { LucideIcon } from "lucide-react";
import { Activity, Flame, Gauge, Landmark, Target, TrendingUp } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import type { MlbSummaryCardData } from "@/lib/mlb/mlbTypes";
import { getStatToneClasses } from "@/lib/mlb/mlbDisplayHelpers";
import { getEdgeTeamFromLabel, getMlbTeamColors } from "@/lib/mlbTeamColors";

const SUMMARY_CARD_ICONS: Record<string, LucideIcon> = {
  "Team Form Edge": TrendingUp,
  "Pitching Edge": Target,
  "Lineup Edge": Activity,
  "Park Context": Landmark,
  "Run Total Lean": Flame,
  "Strikeout Environment": Gauge,
};

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
  const Icon = SUMMARY_CARD_ICONS[card.label] ?? Activity;

  return (
    <div
      className="rounded-2xl p-3 ring-1 ring-border/60 shadow-[0_10px_24px_hsl(var(--foreground)/0.04)]"
      style={{ backgroundColor: colors.tint, borderLeft: `4px solid ${colors.primary}` }}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 ring-1 ring-black/5">
            <Icon className="h-4 w-4" style={{ color: colors.primary }} />
          </span>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</div>
        </div>
        {edgeTeam ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 ring-1 ring-black/5">
            <MlbTeamLogo team={edgeTeam} size={20} />
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        {edgeTeam ? (
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${getStatToneClasses("positive")}`}
          >
            {card.value}
          </span>
        ) : (
          <div className="text-sm font-semibold text-foreground">{card.value}</div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">{card.note}</div>
      </div>
    </div>
  );
}

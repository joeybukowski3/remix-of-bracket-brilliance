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
      className="rounded-xl p-3.5 ring-1 ring-border/70"
      style={{
        backgroundColor: colors.tint,
        borderLeft: `4px solid ${colors.primary}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 ring-1 ring-black/8 shadow-sm shrink-0">
            <Icon className="h-4 w-4" style={{ color: colors.primary }} />
          </span>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/60">{card.label}</div>
        </div>
        {edgeTeam ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 ring-1 ring-black/8 shadow-sm shrink-0">
            <MlbTeamLogo team={edgeTeam} size={20} />
          </span>
        ) : null}
      </div>
      <div className="mt-2.5">
        {edgeTeam ? (
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${getStatToneClasses("positive")}`}
          >
            {card.value}
          </span>
        ) : (
          <div className="text-sm font-bold text-foreground">{card.value}</div>
        )}
        <div className="mt-1 text-xs font-medium text-muted-foreground leading-snug">{card.note}</div>
      </div>
    </div>
  );
}

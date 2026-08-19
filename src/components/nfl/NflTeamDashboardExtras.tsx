import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import NflMarketValueSection from "@/components/nfl/team-dashboard/NflMarketValueSection";
import NflOffseasonSection from "@/components/nfl/team-dashboard/NflOffseasonSection";
import NflScheduleSection from "@/components/nfl/team-dashboard/NflScheduleSection";
import type { ScheduleOpponentOvr } from "@/components/nfl/team-dashboard/NflScheduleGameCard";
import NflWarrenSharpTeamProfile from "@/components/nfl/team-dashboard/NflWarrenSharpTeamProfile";
import NflWarrenSharpAdvancedMetrics from "@/components/nfl/team-dashboard/NflWarrenSharpAdvancedMetrics";

export default function NflTeamDashboardExtras({
  team,
  ovrByAbbr,
}: {
  team: NflGuideTeamNormalized;
  /** Universal current 2026 OVR/rank, keyed by abbr -- passed through to the schedule cards' "Opponent power" metric. */
  ovrByAbbr?: ReadonlyMap<string, ScheduleOpponentOvr>;
}) {
  return (
    <div className="space-y-5">
      <NflMarketValueSection team={team} />
      <NflScheduleSection team={team} ovrByAbbr={ovrByAbbr} />
      <NflOffseasonSection team={team} />
      <NflWarrenSharpTeamProfile team={team} />
      <NflWarrenSharpAdvancedMetrics team={team} />
    </div>
  );
}

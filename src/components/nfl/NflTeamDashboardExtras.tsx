import type { NflGuideTeam } from "@/lib/nfl/guide2026";
import NflMarketValueSection from "@/components/nfl/team-dashboard/NflMarketValueSection";
import NflOffseasonSection from "@/components/nfl/team-dashboard/NflOffseasonSection";
import NflScheduleSection from "@/components/nfl/team-dashboard/NflScheduleSection";
import NflWarrenSharpTeamProfile from "@/components/nfl/team-dashboard/NflWarrenSharpTeamProfile";
import NflWarrenSharpAdvancedMetrics from "@/components/nfl/team-dashboard/NflWarrenSharpAdvancedMetrics";

export default function NflTeamDashboardExtras({ team }: { team: NflGuideTeam }) {
  return (
    <div className="space-y-8">
      <NflMarketValueSection team={team} />
      <NflScheduleSection team={team} />
      <NflOffseasonSection team={team} />
      <NflWarrenSharpTeamProfile team={team} />
      <NflWarrenSharpAdvancedMetrics team={team} />
    </div>
  );
}

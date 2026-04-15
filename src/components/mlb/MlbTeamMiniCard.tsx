import MlbTeamBadge from "@/components/mlb/MlbTeamBadge";
import type { MlbScheduleGame, MlbTeamContext } from "@/lib/mlb/mlbTypes";

export default function MlbTeamMiniCard({
  team,
  context,
  venueMode,
}: {
  team: MlbScheduleGame["away"] | MlbScheduleGame["home"];
  context: MlbTeamContext;
  venueMode: "home" | "away";
}) {
  const splitRecord = venueMode === "home" ? context.homeRecord : context.awayRecord;

  return (
    <div className="rounded-2xl bg-secondary/40 p-4">
      <MlbTeamBadge abbreviation={team.abbreviation} name={team.name} record={team.record} size={30} />
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Season</dt>
          <dd className="font-medium text-foreground">{context.seasonRecord}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Last 5</dt>
          <dd className="font-medium text-foreground">{context.lastFiveRecord}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{venueMode === "home" ? "Home split" : "Away split"}</dt>
          <dd className="font-medium text-foreground">{splitRecord}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Season series</dt>
          <dd className="font-medium text-foreground">{context.seriesRecord}</dd>
        </div>
      </dl>
    </div>
  );
}

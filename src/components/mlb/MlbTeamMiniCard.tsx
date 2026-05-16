import { TrendingDown, TrendingUp } from "lucide-react";
import MlbTeamBadge from "@/components/mlb/MlbTeamBadge";
import { getStatToneClasses } from "@/lib/mlb/mlbDisplayHelpers";
import { getMlbTeamColors, getTrendArrow } from "@/lib/mlbTeamColors";
import type { MlbScheduleGame, MlbTeamContext } from "@/lib/mlb/mlbTypes";

function winsFromRecord(record: string) {
  const [wins] = record.split("-").map((value) => Number(value));
  return Number.isFinite(wins) ? wins : null;
}

function betterRecord(left: string, right: string) {
  const leftWins = winsFromRecord(left);
  const rightWins = winsFromRecord(right);
  if (leftWins == null || rightWins == null) return false;
  return leftWins > rightWins;
}

export default function MlbTeamMiniCard({
  team,
  context,
  venueMode,
  comparisonContext,
}: {
  team: MlbScheduleGame["away"] | MlbScheduleGame["home"];
  context: MlbTeamContext;
  venueMode: "home" | "away";
  comparisonContext: MlbTeamContext;
}) {
  const splitRecord = venueMode === "home" ? context.homeRecord : context.awayRecord;
  const comparisonSplitRecord = venueMode === "home" ? comparisonContext.homeRecord : comparisonContext.awayRecord;
  const colors = getMlbTeamColors(team.abbreviation);
  const trend = getTrendArrow(context.lastFiveRecord);

  const rows = [
    { label: "Season", value: context.seasonRecord, better: betterRecord(context.seasonRecord, comparisonContext.seasonRecord) },
    { label: "Last 5", value: context.lastFiveRecord, better: betterRecord(context.lastFiveRecord, comparisonContext.lastFiveRecord) },
    { label: venueMode === "home" ? "Home split" : "Away split", value: splitRecord, better: betterRecord(splitRecord, comparisonSplitRecord) },
    { label: "Season series", value: context.seriesRecord, better: false },
  ];

  return (
    <div className="rounded-2xl p-3.5" style={{ backgroundColor: colors.tint }}>
      <MlbTeamBadge abbreviation={team.abbreviation} name={team.name} record={team.record} size={30} compact />
      <dl className="mt-3 grid gap-2.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={`rounded-full border px-2.5 py-1 font-medium ${row.better ? getStatToneClasses("positive") : "border-transparent text-foreground"}`}
            >
              {row.label === "Last 5" && trend === "up" ? <TrendingUp className="mr-1 inline h-3 w-3" /> : null}
              {row.label === "Last 5" && trend === "down" ? <TrendingDown className="mr-1 inline h-3 w-3" /> : null}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

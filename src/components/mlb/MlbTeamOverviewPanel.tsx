import MlbTeamMiniCard from "@/components/mlb/MlbTeamMiniCard";
import { getMlbTeamColors, getStatusBadgeTheme } from "@/lib/mlbTeamColors";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

export default function MlbTeamOverviewPanel({ detail }: { detail: MlbGameDetail }) {
  const awayColors = getMlbTeamColors(detail.game.away.abbreviation);
  const homeColors = getMlbTeamColors(detail.game.home.abbreviation);
  const statusTheme = getStatusBadgeTheme(detail.game.status);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.8fr_1.15fr]">
      <MlbTeamMiniCard
        team={detail.game.away}
        context={detail.awayContext}
        venueMode="away"
        comparisonContext={detail.homeContext}
      />
      <div className="rounded-[24px] bg-secondary/30 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Game context</div>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">Date / time</dt>
            <dd className="text-right font-medium text-foreground">
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(detail.game.gameDate))}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">Venue</dt>
            <dd className="text-right font-medium text-foreground">{detail.game.venue}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">Weather</dt>
            <dd className="text-right font-medium text-foreground">{detail.weather}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="rounded-full px-2.5 py-1 text-right font-medium" style={statusTheme}>{detail.game.status}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-2xl p-3" style={{ backgroundColor: awayColors.tint }}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{detail.game.away.abbreviation}</div>
              <div className="mt-1 text-sm font-semibold" style={{ color: awayColors.primary }}>{detail.awayContext.seasonRecord}</div>
            </div>
            <div className="rounded-2xl p-3" style={{ backgroundColor: homeColors.tint }}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{detail.game.home.abbreviation}</div>
              <div className="mt-1 text-sm font-semibold" style={{ color: homeColors.primary }}>{detail.homeContext.seasonRecord}</div>
            </div>
          </div>
        </dl>
      </div>
      <MlbTeamMiniCard
        team={detail.game.home}
        context={detail.homeContext}
        venueMode="home"
        comparisonContext={detail.awayContext}
      />
    </div>
  );
}

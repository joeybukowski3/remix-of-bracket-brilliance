import MlbTeamBadge from "@/components/mlb/MlbTeamBadge";
import MlbValuePill from "@/components/mlb/MlbValuePill";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

export default function MlbMatchupHero({
  detail,
  quickChips,
}: {
  detail: MlbGameDetail;
  quickChips: Array<{ label: string; tone?: "neutral" | "positive" | "warning" }>;
}) {
  const { game } = detail;

  return (
    <div className="rounded-[32px] bg-card p-5 shadow-[0_16px_36px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Matchup Intelligence</div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <MlbTeamBadge abbreviation={game.away.abbreviation} name={game.away.name} record={game.away.record} size={34} />
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">@</div>
            <MlbTeamBadge abbreviation={game.home.abbreviation} name={game.home.name} record={game.home.record} size={34} />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              {game.away.name} at {game.home.name}
            </h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-base">
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(game.gameDate))}{" "}
              • {game.venue}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <MlbValuePill>{game.status}</MlbValuePill>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {quickChips.map((chip) => (
              <MlbValuePill key={chip.label} tone={chip.tone}>
                {chip.label}
              </MlbValuePill>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-secondary/45 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Away starter</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{detail.starters.away.name}</div>
          <div className="text-xs text-muted-foreground">{detail.starters.away.hand} • {detail.starters.away.record}</div>
        </div>
        <div className="rounded-2xl bg-secondary/45 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Home starter</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{detail.starters.home.name}</div>
          <div className="text-xs text-muted-foreground">{detail.starters.home.hand} • {detail.starters.home.record}</div>
        </div>
        <div className="rounded-2xl bg-secondary/45 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Weather</div>
          <div className="mt-2 text-sm font-medium text-foreground">{detail.weather}</div>
        </div>
        <div className="rounded-2xl bg-secondary/45 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Series context</div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {game.away.abbreviation} {detail.awayContext.seriesRecord} • {game.home.abbreviation} {detail.homeContext.seriesRecord}
          </div>
        </div>
      </div>
    </div>
  );
}

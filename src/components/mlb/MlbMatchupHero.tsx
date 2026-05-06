import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import MlbValuePill from "@/components/mlb/MlbValuePill";
import { getMlbTeamColors, getStatusBadgeTheme } from "@/lib/mlbTeamColors";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

export default function MlbMatchupHero({
  detail,
  quickChips,
}: {
  detail: MlbGameDetail;
  quickChips: Array<{ label: string; tone?: "neutral" | "positive" | "warning" }>;
}) {
  const { game } = detail;
  const awayColors = getMlbTeamColors(game.away.abbreviation);
  const homeColors = getMlbTeamColors(game.home.abbreviation);
  const statusTheme = getStatusBadgeTheme(game.status);

  return (
    <div className="overflow-hidden rounded-[32px] bg-card shadow-[0_16px_36px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
      <div className="grid gap-0 lg:grid-cols-[1fr_auto_1fr]">
        <div className="p-6 lg:p-8" style={{ backgroundColor: awayColors.tint }}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: awayColors.primary }}>
                Away Team
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/80 ring-1 ring-black/5">
                  <MlbTeamLogo team={game.away.abbreviation} size={50} />
                </div>
                <div>
                  <div className="text-2xl font-semibold tracking-[-0.04em]" style={{ color: awayColors.primary }}>{game.away.name}</div>
                  <span
                    className="mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: awayColors.primary }}
                  >
                    {game.away.abbreviation} • {game.away.record}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-[220px] flex-col items-center justify-center gap-3 bg-white px-5 py-6 text-center">
          <MlbValuePill className="font-semibold" style={statusTheme}>{game.status}</MlbValuePill>
          <div className="text-3xl font-semibold tracking-[0.18em] text-slate-400">@</div>
          <div className="text-sm font-semibold text-foreground">
            {new Intl.DateTimeFormat("en-US", {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            }).format(new Date(game.gameDate))}
          </div>
          <div className="text-xs text-muted-foreground">{game.venue}</div>
        </div>

        <div className="p-6 lg:p-8" style={{ backgroundColor: homeColors.tint }}>
          <div className="flex items-start justify-between gap-4">
            <div className="ml-auto space-y-4 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: homeColors.primary }}>
                Home Team
              </div>
              <div className="flex items-center justify-end gap-4">
                <div>
                  <div className="text-2xl font-semibold tracking-[-0.04em]" style={{ color: homeColors.primary }}>{game.home.name}</div>
                  <span
                    className="mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: homeColors.primary }}
                  >
                    {game.home.abbreviation} • {game.home.record}
                  </span>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/80 ring-1 ring-black/5">
                  <MlbTeamLogo team={game.home.abbreviation} size={50} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 bg-white px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Matchup Intelligence
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              {game.away.name} at {game.home.name}
            </h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-base">
              {detail.starters.away.name} vs {detail.starters.home.name} • {detail.weather}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {quickChips.map((chip) => (
              <MlbValuePill
                key={chip.label}
                tone={chip.tone}
                className="ring-1 ring-black/5"
                style={{ backgroundColor: chip.tone === "warning" ? homeColors.tint : awayColors.tint, color: "#0f172a" }}
              >
                {chip.label}
              </MlbValuePill>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Away starter", value: detail.starters.away.name, note: `${detail.starters.away.hand} • ${detail.starters.away.record}`, color: awayColors.primary, tint: awayColors.tint },
            { label: "Home starter", value: detail.starters.home.name, note: `${detail.starters.home.hand} • ${detail.starters.home.record}`, color: homeColors.primary, tint: homeColors.tint },
            { label: "Weather", value: detail.weather, note: null, color: "#64748b", tint: "rgba(148,163,184,0.12)" },
            { label: "Series context", value: `${game.away.abbreviation} ${detail.awayContext.seriesRecord} • ${game.home.abbreviation} ${detail.homeContext.seriesRecord}`, note: null, color: "#64748b", tint: "rgba(148,163,184,0.12)" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl border p-4" style={{ borderLeft: `4px solid ${tile.color}`, backgroundColor: tile.tint }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tile.label}</div>
              <div className="mt-2 text-sm font-semibold text-foreground">{tile.value}</div>
              {tile.note && <div className="text-xs text-muted-foreground">{tile.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

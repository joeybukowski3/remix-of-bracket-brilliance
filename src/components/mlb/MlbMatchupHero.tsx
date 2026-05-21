import type { ReactNode } from "react";
import { MapPinned, Sparkles } from "lucide-react";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import MlbValuePill from "@/components/mlb/MlbValuePill";
import { getWeatherIndicators } from "@/lib/mlb/mlbDisplayHelpers";
import { getMlbTeamColors, getStatusBadgeTheme } from "@/lib/mlbTeamColors";
import type { MlbGameDetail, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

type MatchupTile =
  | {
      label: string;
      value: string;
      note: string | null;
      color: string;
      tint: string;
      player: MlbStarterProfile;
      team: string;
    }
  | {
      label: string;
      value: string;
      note: string | null;
      color: string;
      tint: string;
      player?: never;
      team?: never;
    };

export default function MlbMatchupHero({
  detail,
  quickChips,
  summaryIndicators,
  spotlight,
}: {
  detail: MlbGameDetail;
  quickChips: Array<{ label: string; tone?: "neutral" | "positive" | "warning" }>;
  summaryIndicators: Array<{ label: string; value: string; icon: ReactNode }>;
  spotlight: { eyebrow: string; title: string; note: string; icon: ReactNode };
}) {
  const { game } = detail;
  const awayColors = getMlbTeamColors(game.away.abbreviation);
  const homeColors = getMlbTeamColors(game.home.abbreviation);
  const statusTheme = getStatusBadgeTheme(game.status);
  const weatherIndicators = getWeatherIndicators(detail.weather).join(" ");

  const tiles: MatchupTile[] = [
    {
      label: "Away starter",
      value: detail.starters.away.name,
      note: `${detail.starters.away.hand}HP • ${detail.starters.away.record}`,
      color: awayColors.primary,
      tint: awayColors.tint,
      player: detail.starters.away,
      team: game.away.abbreviation,
    },
    {
      label: "Home starter",
      value: detail.starters.home.name,
      note: `${detail.starters.home.hand}HP • ${detail.starters.home.record}`,
      color: homeColors.primary,
      tint: homeColors.tint,
      player: detail.starters.home,
      team: game.home.abbreviation,
    },
    {
      label: "Weather",
      value: `${weatherIndicators ? `${weatherIndicators} ` : ""}${detail.weather}`,
      note: null,
      color: "#64748b",
      tint: "rgba(148,163,184,0.12)",
    },
    {
      label: "Series context",
      value: `${game.away.abbreviation} ${detail.awayContext.seriesRecord} • ${game.home.abbreviation} ${detail.homeContext.seriesRecord}`,
      note: null,
      color: "#64748b",
      tint: "rgba(148,163,184,0.12)",
    },
  ];

  return (
    <div className="overflow-hidden rounded-[24px] bg-card shadow-[0_12px_28px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
      <div
        className="grid gap-0 lg:grid-cols-[1fr_auto_1fr]"
        style={{
          backgroundImage: `linear-gradient(135deg, ${awayColors.tint} 0%, rgba(255,255,255,0.96) 44%, rgba(255,255,255,0.98) 56%, ${homeColors.tint} 100%)`,
        }}
      >
        <div className="p-4 lg:p-5">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: awayColors.primary }}>
              Away Team
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-white/90 shadow-[0_8px_20px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
                <MlbTeamLogo team={game.away.abbreviation} size={42} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xl font-semibold tracking-[-0.02em] sm:text-2xl" style={{ color: awayColors.primary }}>
                  {game.away.name}
                </div>
                <span
                  className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: awayColors.primary }}
                >
                  {game.away.abbreviation} • {game.away.record}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-[210px] flex-col items-center justify-center gap-2.5 px-4 py-4 text-center">
          <MlbValuePill className="font-semibold" style={statusTheme}>{game.status}</MlbValuePill>
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-2xl font-semibold tracking-[0.18em] text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            @
          </div>
          <div className="text-sm font-semibold text-foreground">
            {new Intl.DateTimeFormat("en-US", {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            }).format(new Date(game.gameDate))}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs text-muted-foreground ring-1 ring-black/5">
            <MapPinned className="h-3.5 w-3.5 text-slate-500" />
            {game.venue}
          </div>
        </div>

        <div className="p-4 lg:p-5">
          <div className="ml-auto space-y-3 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: homeColors.primary }}>
              Home Team
            </div>
            <div className="flex items-center justify-end gap-3">
              <div className="min-w-0">
                <div className="truncate text-xl font-semibold tracking-[-0.02em] sm:text-2xl" style={{ color: homeColors.primary }}>
                  {game.home.name}
                </div>
                <span
                  className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: homeColors.primary }}
                >
                  {game.home.abbreviation} • {game.home.record}
                </span>
              </div>
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-white/90 shadow-[0_8px_20px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
                <MlbTeamLogo team={game.home.abbreviation} size={42} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 bg-white px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Matchup Intelligence
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
              {game.away.name} at {game.home.name}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {detail.starters.away.name} vs {detail.starters.home.name} • {weatherIndicators ? `${weatherIndicators} ` : ""}{detail.weather}
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

        <div className="mt-4 rounded-[22px] border border-border/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,1))] p-4 shadow-[0_12px_24px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-slate-700 ring-1 ring-border/70">
                  <Sparkles className="h-4 w-4" />
                </span>
                {spotlight.eyebrow}
              </div>
              <div className="mt-2 flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)]">
                  {spotlight.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-lg font-semibold tracking-[-0.03em] text-foreground sm:text-xl">{spotlight.title}</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{spotlight.note}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {summaryIndicators.map((item) => (
                <div key={item.label} className="rounded-2xl border border-border/70 bg-white/88 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-slate-700">
                      {item.icon}
                    </span>
                    {item.label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl border p-3" style={{ borderLeft: `4px solid ${tile.color}`, backgroundColor: tile.tint }}>
              <div className="flex items-center gap-2.5">
                {tile.player ? (
                  <MlbPlayerHeadshot playerId={tile.player.id} name={tile.player.name} size={42} teamAbbreviation={tile.team} />
                ) : null}
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tile.label}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{tile.value}</div>
                  {tile.note && <div className="text-xs text-muted-foreground">{tile.note}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

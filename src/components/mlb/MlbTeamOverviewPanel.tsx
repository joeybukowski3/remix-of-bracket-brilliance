import { getWeatherIndicators } from "@/lib/mlb/mlbDisplayHelpers";
import { getMlbTeamColors, getStatusBadgeTheme, getTrendArrow } from "@/lib/mlbTeamColors";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

function winsFromRecord(record: string) {
  const [wins] = record.split("-").map(Number);
  return Number.isFinite(wins) ? wins : null;
}

function better(a: string, b: string) {
  const aw = winsFromRecord(a);
  const bw = winsFromRecord(b);
  return aw != null && bw != null && aw > bw;
}

function WrcCell({ value, rankLabel, betterThan }: { value: number | null; rankLabel: string | null; betterThan: boolean }) {
  if (value === null) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const colorClass =
    value >= 110 ? "text-emerald-700" :
    value >= 95  ? "text-foreground" :
    "text-rose-600";

  return (
    <span className={`inline-flex flex-col items-center leading-tight ${betterThan ? "font-bold" : "font-semibold"}`}>
      <span className={`text-xs ${colorClass} ${betterThan ? "rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200" : ""}`}>
        wRC+ {value}
      </span>
      {rankLabel && (
        <span className="text-[10px] text-muted-foreground mt-0.5">{rankLabel}</span>
      )}
    </span>
  );
}

export default function MlbTeamOverviewPanel({ detail }: { detail: MlbGameDetail }) {
  const { game, awayContext, homeContext } = detail;
  const awayColors = getMlbTeamColors(game.away.abbreviation);
  const homeColors = getMlbTeamColors(game.home.abbreviation);
  const statusTheme = getStatusBadgeTheme(game.status);
  const weather = getWeatherIndicators(detail.weather).join(" ");
  const awayTrend = getTrendArrow(awayContext.lastFiveRecord);
  const homeTrend = getTrendArrow(homeContext.lastFiveRecord);

  const rows = [
    {
      label: "Season",
      away: awayContext.seasonRecord,
      home: homeContext.seasonRecord,
      awayBetter: better(awayContext.seasonRecord, homeContext.seasonRecord),
      homeBetter: better(homeContext.seasonRecord, awayContext.seasonRecord),
    },
    {
      label: "Last 5",
      away: awayContext.lastFiveRecord,
      home: homeContext.lastFiveRecord,
      awayBetter: better(awayContext.lastFiveRecord, homeContext.lastFiveRecord),
      homeBetter: better(homeContext.lastFiveRecord, awayContext.lastFiveRecord),
      awayIcon: awayTrend === "up" ? <TrendingUp className="inline mr-0.5 h-3 w-3" /> : awayTrend === "down" ? <TrendingDown className="inline mr-0.5 h-3 w-3" /> : null,
      homeIcon: homeTrend === "up" ? <TrendingUp className="inline mr-0.5 h-3 w-3" /> : homeTrend === "down" ? <TrendingDown className="inline mr-0.5 h-3 w-3" /> : null,
    },
    {
      label: "Away / Home",
      away: awayContext.awayRecord,
      home: homeContext.homeRecord,
      awayBetter: better(awayContext.awayRecord, homeContext.homeRecord),
      homeBetter: better(homeContext.homeRecord, awayContext.awayRecord),
    },
    {
      label: "Series",
      away: awayContext.seriesRecord,
      home: homeContext.seriesRecord,
      awayBetter: false,
      homeBetter: false,
    },
  ];

  const awaySeasonBetter = (awayContext.seasonWrcPlus ?? 0) > (homeContext.seasonWrcPlus ?? 0);
  const homeSeasonBetter = (homeContext.seasonWrcPlus ?? 0) > (awayContext.seasonWrcPlus ?? 0);
  const awayRecentBetter = (awayContext.recentWrcPlus ?? 0) > (homeContext.recentWrcPlus ?? 0);
  const homeRecentBetter = (homeContext.recentWrcPlus ?? 0) > (awayContext.recentWrcPlus ?? 0);

  return (
    <div className="space-y-2">
      {/* Game info bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-secondary/30 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">{game.venue}</span>
        {weather && <span>{weather} {detail.weather}</span>}
        <span style={statusTheme} className="rounded-full px-2 py-0.5 font-bold">{game.status}</span>
      </div>

      {/* Side-by-side comparison table */}
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="pb-1.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground w-1/3">Stat</th>
            <th className="pb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] w-1/3" style={{ color: awayColors.primary }}>{game.away.abbreviation}</th>
            <th className="pb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] w-1/3" style={{ color: homeColors.primary }}>{game.home.abbreviation}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-1.5 text-muted-foreground">{row.label}</td>
              <td className="py-1.5 text-center">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${row.awayBetter ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "text-foreground"}`}>
                  {"awayIcon" in row ? row.awayIcon : null}{row.away}
                </span>
              </td>
              <td className="py-1.5 text-center">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${row.homeBetter ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "text-foreground"}`}>
                  {"homeIcon" in row ? row.homeIcon : null}{row.home}
                </span>
              </td>
            </tr>
          ))}

          {/* Season wRC+ row */}
          <tr>
            <td className="py-1.5 text-muted-foreground">
              Season wRC+
              <span className="ml-1 text-[9px] text-muted-foreground/60">(offense vs avg)</span>
            </td>
            <td className="py-1.5 text-center">
              <WrcCell value={awayContext.seasonWrcPlus} rankLabel={awayContext.seasonWrcPlusRank} betterThan={awaySeasonBetter} />
            </td>
            <td className="py-1.5 text-center">
              <WrcCell value={homeContext.seasonWrcPlus} rankLabel={homeContext.seasonWrcPlusRank} betterThan={homeSeasonBetter} />
            </td>
          </tr>

          {/* Last 14 days wRC+ row — falls back to season if recent data unavailable */}
          <tr>
            <td className="py-1.5 text-muted-foreground">
              L14 wRC+
              <span className="ml-1 text-[9px] text-muted-foreground/60">
                {awayContext.recentWrcPlus != null || homeContext.recentWrcPlus != null ? "(last 2 weeks)" : "(unavailable, showing season)"}
              </span>
            </td>
            <td className="py-1.5 text-center">
              <WrcCell 
                value={awayContext.recentWrcPlus ?? awayContext.seasonWrcPlus} 
                rankLabel={awayContext.recentWrcPlusRank ?? awayContext.seasonWrcPlusRank} 
                betterThan={awayRecentBetter || awaySeasonBetter} 
              />
            </td>
            <td className="py-1.5 text-center">
              <WrcCell 
                value={homeContext.recentWrcPlus ?? homeContext.seasonWrcPlus} 
                rankLabel={homeContext.recentWrcPlusRank ?? homeContext.seasonWrcPlusRank} 
                betterThan={homeRecentBetter || homeSeasonBetter} 
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

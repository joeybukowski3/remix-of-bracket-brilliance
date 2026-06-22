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
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const colorClass = value >= 110 ? "text-emerald-700" : value >= 95 ? "text-foreground" : "text-rose-600";
  return (
    <span className={`inline-flex flex-col items-center leading-tight ${betterThan ? "font-bold" : "font-semibold"}`}>
      <span className={`text-xs ${colorClass} ${betterThan ? "rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200" : ""}`}>
        wRC+ {value}
      </span>
      {rankLabel && <span className="text-[10px] text-muted-foreground mt-0.5">{rankLabel}</span>}
    </span>
  );
}

/** Format a pitcher's home/away ERA split inline: "H 2.80 / A 4.10" */
function EraCell({
  homeEra,
  awayEra,
  homeIp,
  awayIp,
  isAtHome,           // true = this pitcher is starting AT HOME today
}: {
  homeEra: number | null;
  awayEra: number | null;
  homeIp: number;
  awayIp: number;
  isAtHome: boolean;
}) {
  const hasData = homeEra != null || awayEra != null;
  if (!hasData) return <span className="text-muted-foreground text-xs">—</span>;

  const hasSample = homeIp >= 10 && awayIp >= 10;
  const fmt = (v: number | null) => (v != null ? v.toFixed(2) : "—");

  // Compute ERA delta in context: positive = better today (e.g. home pitcher ERA lower at home)
  const contextEra   = isAtHome ? homeEra : awayEra;
  const nonContextEra = isAtHome ? awayEra : homeEra;
  const delta =
    hasSample && contextEra != null && nonContextEra != null
      ? nonContextEra - contextEra   // positive = pitcher is BETTER in today's context
      : null;

  const isFavorable   = delta != null && delta >  0.4;
  const isUnfavorable = delta != null && delta < -0.4;

  return (
    <span className="inline-flex flex-col items-center gap-0.5 leading-tight">
      <span className="text-xs font-semibold text-foreground tabular-nums">
        <span className={isAtHome && contextEra != null ? "font-bold" : ""}>{isAtHome ? "🏠" : "✈"} {fmt(contextEra)}</span>
        <span className="text-muted-foreground mx-0.5">/</span>
        <span className={!isAtHome && contextEra != null ? "font-bold" : ""}>{isAtHome ? "✈" : "🏠"} {fmt(nonContextEra)}</span>
      </span>
      {delta != null && Math.abs(delta) > 0.4 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          isFavorable   ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" :
          isUnfavorable ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : ""
        }`}>
          {isFavorable ? "↑" : "↓"} {Math.abs(delta).toFixed(1)} ERA {isAtHome ? "at home" : "away"}
        </span>
      )}
      {!hasSample && <span className="text-[9px] text-muted-foreground/50">low sample</span>}
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

  // Away team faces HOME pitcher; home team faces AWAY pitcher
  const awayFacesHand = detail.starters?.home?.hand?.toUpperCase().startsWith("L") ? "L" : "R";
  const homeFacesHand = detail.starters?.away?.hand?.toUpperCase().startsWith("L") ? "L" : "R";

  const awayVsHandWrc  = awayFacesHand === "L" ? awayContext.vsLhpWrcPlus  : awayContext.vsRhpWrcPlus;
  const awayVsHandRank = awayFacesHand === "L" ? awayContext.vsLhpWrcPlusRank : awayContext.vsRhpWrcPlusRank;
  const homeVsHandWrc  = homeFacesHand === "L" ? homeContext.vsLhpWrcPlus  : homeContext.vsRhpWrcPlus;
  const homeVsHandRank = homeFacesHand === "L" ? homeContext.vsLhpWrcPlusRank : homeContext.vsRhpWrcPlusRank;
  const awayVsHandBetter = (awayVsHandWrc ?? 0) > (homeVsHandWrc ?? 0);
  const homeVsHandBetter = (homeVsHandWrc ?? 0) > (awayVsHandWrc ?? 0);

  const splitRowLabel = awayFacesHand === homeFacesHand ? `vs ${awayFacesHand}HP` : "vs opp. hand";

  // Pitcher home/away ERA splits — already on the starters object from buildGameDetail
  const parseEra = (v: string | number | null | undefined) => { const n = parseFloat(String(v ?? "")); return isFinite(n) ? n : null; };
  const parseIp  = (v: string | number | null | undefined) => parseFloat(String(v ?? "")) || 0;

  // Home pitcher is at home; away pitcher is away
  const homePitcherHomeEra = parseEra(detail.starters.home.locationSplits?.home?.era);
  const homePitcherAwayEra = parseEra(detail.starters.home.locationSplits?.away?.era);
  const homePitcherHomeIp  = parseIp(detail.starters.home.locationSplits?.home?.inningsPitched);
  const homePitcherAwayIp  = parseIp(detail.starters.home.locationSplits?.away?.inningsPitched);

  const awayPitcherHomeEra = parseEra(detail.starters.away.locationSplits?.home?.era);
  const awayPitcherAwayEra = parseEra(detail.starters.away.locationSplits?.away?.era);
  const awayPitcherHomeIp  = parseIp(detail.starters.away.locationSplits?.home?.inningsPitched);
  const awayPitcherAwayIp  = parseIp(detail.starters.away.locationSplits?.away?.inningsPitched);

  const hasPitcherSplits =
    homePitcherHomeEra != null || homePitcherAwayEra != null ||
    awayPitcherHomeEra != null || awayPitcherAwayEra != null;

  const rows = [
    { label: "Season",      away: awayContext.seasonRecord,   home: homeContext.seasonRecord,   awayBetter: better(awayContext.seasonRecord, homeContext.seasonRecord),   homeBetter: better(homeContext.seasonRecord, awayContext.seasonRecord) },
    { label: "Last 5",      away: awayContext.lastFiveRecord, home: homeContext.lastFiveRecord, awayBetter: better(awayContext.lastFiveRecord, homeContext.lastFiveRecord), homeBetter: better(homeContext.lastFiveRecord, awayContext.lastFiveRecord),
      awayIcon: awayTrend === "up" ? <TrendingUp className="inline mr-0.5 h-3 w-3" /> : awayTrend === "down" ? <TrendingDown className="inline mr-0.5 h-3 w-3" /> : null,
      homeIcon: homeTrend === "up" ? <TrendingUp className="inline mr-0.5 h-3 w-3" /> : homeTrend === "down" ? <TrendingDown className="inline mr-0.5 h-3 w-3" /> : null,
    },
    { label: "Away / Home", away: awayContext.awayRecord,     home: homeContext.homeRecord,     awayBetter: better(awayContext.awayRecord, homeContext.homeRecord),       homeBetter: better(homeContext.homeRecord, awayContext.awayRecord) },
    { label: "Series",      away: awayContext.seriesRecord,   home: homeContext.seriesRecord,   awayBetter: false, homeBetter: false },
  ];

  const awaySeasonBetter = (awayContext.seasonWrcPlus ?? 0) > (homeContext.seasonWrcPlus ?? 0);
  const homeSeasonBetter = (homeContext.seasonWrcPlus ?? 0) > (awayContext.seasonWrcPlus ?? 0);
  const awayRecentBetter = (awayContext.recentWrcPlus ?? 0) > (homeContext.recentWrcPlus ?? 0);
  const homeRecentBetter = (homeContext.recentWrcPlus ?? 0) > (awayContext.recentWrcPlus ?? 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-secondary/30 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">{game.venue}</span>
        {weather && <span>{weather} {detail.weather}</span>}
        <span style={statusTheme} className="rounded-full px-2 py-0.5 font-bold">{game.status}</span>
      </div>

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

          {/* Season wRC+ */}
          <tr>
            <td className="py-1.5 text-muted-foreground">
              Season wRC+<span className="ml-1 text-[9px] text-muted-foreground/60">(offense vs avg)</span>
            </td>
            <td className="py-1.5 text-center"><WrcCell value={awayContext.seasonWrcPlus} rankLabel={awayContext.seasonWrcPlusRank} betterThan={awaySeasonBetter} /></td>
            <td className="py-1.5 text-center"><WrcCell value={homeContext.seasonWrcPlus} rankLabel={homeContext.seasonWrcPlusRank} betterThan={homeSeasonBetter} /></td>
          </tr>

          {/* L14 wRC+ */}
          <tr>
            <td className="py-1.5 text-muted-foreground">
              L14 wRC+<span className="ml-1 text-[9px] text-muted-foreground/60">
                {awayContext.recentWrcPlus != null || homeContext.recentWrcPlus != null ? "(last 2 weeks)" : "(unavailable, showing season)"}
              </span>
            </td>
            <td className="py-1.5 text-center">
              <WrcCell value={awayContext.recentWrcPlus ?? awayContext.seasonWrcPlus} rankLabel={awayContext.recentWrcPlusRank ?? awayContext.seasonWrcPlusRank} betterThan={awayRecentBetter || awaySeasonBetter} />
            </td>
            <td className="py-1.5 text-center">
              <WrcCell value={homeContext.recentWrcPlus ?? homeContext.seasonWrcPlus} rankLabel={homeContext.recentWrcPlusRank ?? homeContext.seasonWrcPlusRank} betterThan={homeRecentBetter || homeSeasonBetter} />
            </td>
          </tr>

          {/* vs Pitcher Handedness wRC+ */}
          <tr>
            <td className="py-1.5 text-muted-foreground">
              {splitRowLabel} wRC+<span className="ml-1 text-[9px] text-muted-foreground/60">(vs today's starter)</span>
            </td>
            <td className="py-1.5 text-center"><WrcCell value={awayVsHandWrc} rankLabel={awayVsHandRank} betterThan={awayVsHandBetter} /></td>
            <td className="py-1.5 text-center"><WrcCell value={homeVsHandWrc} rankLabel={homeVsHandRank} betterThan={homeVsHandBetter} /></td>
          </tr>

          {/* ── Home/Away ERA Split section ─────────────────────────────── */}
          {hasPitcherSplits && (
            <tr>
              <td colSpan={3} className="pt-3 pb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground/70">
                    Home / Away Context
                  </span>
                  <span className="text-[9px] text-muted-foreground/40 italic">🏠 = home context · ✈ = away context</span>
                </div>
                <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground/50">
                  Shows how much each pitcher's ERA and each team's record differ by context.
                  Bold = today's context. ↑ Green = better today. ↓ Blue = worse today (min. 10 IP per split).
                </p>
              </td>
            </tr>
          )}

          {hasPitcherSplits && (
            <tr>
              <td className="py-1.5 text-muted-foreground leading-snug">
                Pitcher ERA<br />
                <span className="text-[9px] text-muted-foreground/50">H ERA / A ERA</span>
              </td>
              {/* Away team column = away pitcher (pitching away today) */}
              <td className="py-1.5 text-center">
                <EraCell
                  homeEra={awayPitcherHomeEra}
                  awayEra={awayPitcherAwayEra}
                  homeIp={awayPitcherHomeIp}
                  awayIp={awayPitcherAwayIp}
                  isAtHome={false}
                />
              </td>
              {/* Home team column = home pitcher (pitching at home today) */}
              <td className="py-1.5 text-center">
                <EraCell
                  homeEra={homePitcherHomeEra}
                  awayEra={homePitcherAwayEra}
                  homeIp={homePitcherHomeIp}
                  awayIp={homePitcherAwayIp}
                  isAtHome={true}
                />
              </td>
            </tr>
          )}

          {/* Team batting home/away record split */}
          {(awayContext.awayRecord !== "—" || homeContext.homeRecord !== "—") && hasPitcherSplits && (() => {
            const parseWinPct = (r: string) => {
              const [w, l] = r.split("-").map(Number);
              return isFinite(w) && isFinite(l) && w + l > 0 ? w / (w + l) : null;
            };
            // Home team bats at home; away team bats away
            const homeBatHomeWinPct = parseWinPct(homeContext.homeRecord);
            const homeBatAwayWinPct = parseWinPct(homeContext.awayRecord);
            const awayBatAwayWinPct = parseWinPct(awayContext.awayRecord);
            const awayBatHomeWinPct = parseWinPct(awayContext.seasonRecord); // full season as proxy when split is same as homeRecord

            const homeBatDelta = homeBatHomeWinPct != null && homeBatAwayWinPct != null
              ? Math.round((homeBatHomeWinPct - homeBatAwayWinPct) * 100) : null;
            const awayBatDelta = awayBatAwayWinPct != null && awayBatHomeWinPct != null
              ? Math.round((awayBatAwayWinPct - awayBatHomeWinPct) * 100) : null;

            const ContextBadge = ({ delta, isAtHome }: { delta: number | null; isAtHome: boolean }) => {
              if (delta == null || Math.abs(delta) <= 4) return null;
              const favorable = delta > 0;
              return (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  favorable
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                }`}>
                  {favorable ? "↑" : "↓"} {Math.abs(delta)}% {isAtHome ? "at home" : "away"}
                </span>
              );
            };

            return (
              <tr>
                <td className="py-1.5 text-muted-foreground leading-snug">
                  Team bat split<br />
                  <span className="text-[9px] text-muted-foreground/50">H rec / A rec</span>
                </td>
                <td className="py-1.5 text-center">
                  <span className="inline-flex flex-col items-center gap-0.5 leading-tight">
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      <span>{awayContext.homeRecord}</span>
                      <span className="text-muted-foreground mx-0.5">/</span>
                      <span className="font-bold">{awayContext.awayRecord}</span>
                    </span>
                    <ContextBadge delta={awayBatDelta} isAtHome={false} />
                  </span>
                </td>
                <td className="py-1.5 text-center">
                  <span className="inline-flex flex-col items-center gap-0.5 leading-tight">
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      <span className="font-bold">{homeContext.homeRecord}</span>
                      <span className="text-muted-foreground mx-0.5">/</span>
                      <span>{homeContext.awayRecord}</span>
                    </span>
                    <ContextBadge delta={homeBatDelta} isAtHome={true} />
                  </span>
                </td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

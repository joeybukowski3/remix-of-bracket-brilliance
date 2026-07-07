import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import NflGuideNav from "@/components/nfl/NflGuideNav";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning from "@/components/nfl/StaleWarning";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import type { NflGameRecord, NflResultRecord } from "@/lib/nfl/standings";

const SEASONS = [2026, 2025, 2024, 2023, 2022];
const CURRENT_SEASON = 2026;

const SEASON_TYPE_LABEL: Record<string, string> = {
  REG: "Week", WC: "Wild Card", DIV: "Divisional", CON: "Conference Championship", SB: "Super Bowl",
};

export function weekLabel(game: NflGameRecord): string {
  return game.seasonType === "REG" ? `Week ${game.week}` : SEASON_TYPE_LABEL[game.seasonType] ?? `Week ${game.week}`;
}

export function kickoffLabel(dateUtc: string | null): string {
  if (!dateUtc) return "TBD";
  const d = new Date(dateUtc);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short",
  });
}

function GameRow({ game, result }: { game: NflGameRecord; result: NflResultRecord | undefined }) {
  const isFinal = game.status === "final" && result;
  return (
    <tr className="border-t border-slate-100 hover:bg-blue-50/40">
      <td className="whitespace-nowrap px-2 py-2 text-slate-500">{kickoffLabel(game.dateUtc)}</td>
      <td className="px-2 py-2">
        <span className="flex items-center gap-1.5 font-black text-slate-800">
          <img src={nflLogoUrl(game.awayAbbr)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
          {game.awayTeam}
          <span className="font-semibold text-slate-400">at</span>
          <img src={nflLogoUrl(game.homeAbbr)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
          {game.homeTeam}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center">
        {isFinal ? (
          <span className="font-black text-slate-900">
            {result!.awayScore}–{result!.homeScore}
            <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-black uppercase text-slate-500">Final</span>
          </span>
        ) : (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-blue-700">Scheduled</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-slate-500">{game.stadium ?? "—"}</td>
    </tr>
  );
}

export default function NFLSchedule() {
  const seo = getSeoMeta("nfl");
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { loading, error, data } = useNflSeasonData(season);

  usePageSeo({
    title: `${CURRENT_SEASON} NFL Schedule by Week | Joe Knows Ball`,
    description: "Full NFL schedule by week with kickoff times, stadiums and final scores, refreshed automatically from free public data.",
    path: "/nfl/schedule",
    noindex: seo.noindex ?? false,
  });

  const resultsById = useMemo(
    () => new Map((data?.results ?? []).map((r) => [r.gameId, r])),
    [data]
  );
  const weeks = useMemo(() => {
    const map = new Map<string, NflGameRecord[]>();
    for (const game of data?.games ?? []) {
      const label = weekLabel(game);
      const list = map.get(label) ?? [];
      list.push(game);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [data]);

  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const hasResults = (data?.results.length ?? 0) > 0;
  const isCurrent = season === CURRENT_SEASON;
  const defaultOpen = weeks.length > 0 ? weeks[0][0] : null;
  const activeWeek = openWeek ?? defaultOpen;
  const activeGames = weeks.find(([label]) => label === activeWeek)?.[1] ?? [];

  return (
    <SiteShell>
      <main className="site-page pb-16 pt-8">
        <div className="site-container site-stack">
          <section>
            <div className="text-[11px] font-bold uppercase tracking-[.16em] text-blue-600">NFL · Schedule</div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{season} NFL Schedule</h1>
            <p className="mt-2 text-sm text-slate-500">Kickoff times shown in Eastern Time · Refreshed automatically from free public data</p>
            <div className="mt-5"><NflGuideNav /></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SEASONS.map((y) => (
                <button
                  key={y}
                  onClick={() => { setSeason(y); setOpenWeek(null); }}
                  className={`rounded-full border px-3 py-1 text-xs font-black transition ${y === season ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </section>

          <div className="mt-3">
            <StaleWarning meta={data?.gamesMeta} maxAgeHours={72} enabled={isCurrent && hasResults} />
          </div>
          {loading && <p className="mt-6 text-sm text-slate-500">Loading schedule…</p>}
          {error && <p className="mt-6 text-sm font-semibold text-red-700">Could not load the {season} schedule. Please try again later.</p>}

          {!loading && !error && weeks.length > 0 && (
            <>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {weeks.map(([label]) => (
                  <button
                    key={label}
                    onClick={() => setOpenWeek(label)}
                    className={`rounded border px-2 py-1 text-[10px] font-black uppercase tracking-wide transition ${label === activeWeek ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"}`}
                  >
                    {label.replace("Week ", "W")}
                  </button>
                ))}
              </div>
              <article className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">{activeWeek}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500">
                        <th className="px-2 py-2 text-left">Kickoff (ET)</th>
                        <th className="px-2 py-2 text-left">Matchup</th>
                        <th className="px-2 py-2">Score</th>
                        <th className="px-2 py-2 text-left">Stadium</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeGames.map((game) => (
                        <GameRow key={game.gameId} game={game} result={resultsById.get(game.gameId)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          )}

          <LastUpdated meta={data?.gamesMeta} className="mt-4" />
        </div>
      </main>
    </SiteShell>
  );
}

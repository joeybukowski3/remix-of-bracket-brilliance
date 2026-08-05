import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning from "@/components/nfl/StaleWarning";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips, NflSeasonPicker } from "@/components/nfl/ui/NflFilterBar";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
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
    <tr className={NFL_TABLE_ROW}>
      <td className="whitespace-nowrap px-2 py-2 text-slate-500">{kickoffLabel(game.dateUtc)}</td>
      <td className="px-2 py-2">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
          <img src={nflLogoUrl(game.awayAbbr)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
          {game.awayTeam}
          <span className="font-normal text-slate-400">at</span>
          <img src={nflLogoUrl(game.homeAbbr)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
          {game.homeTeam}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center">
        {isFinal ? (
          <span className="font-semibold tabular-nums text-slate-900">
            {result!.awayScore}–{result!.homeScore}
            <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-500">Final</span>
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Scheduled</span>
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
    <>
      <NflPageHeader
        eyebrow="NFL · Schedule"
        title={`${season} NFL Schedule`}
        description="Kickoff times shown in Eastern Time. Refreshed automatically from free public data."
      >
        <NflSeasonPicker
          seasons={SEASONS}
          value={season}
          onChange={(next) => { setSeason(next); setOpenWeek(null); }}
        />
      </NflPageHeader>

      <StaleWarning meta={data?.gamesMeta} maxAgeHours={72} enabled={isCurrent && hasResults} />
      {loading && <p className="text-sm text-slate-500">Loading schedule…</p>}
      {error && <p className="text-sm font-semibold text-red-700">Could not load the {season} schedule. Please try again later.</p>}

      {!loading && !error && weeks.length > 0 && activeWeek && (
        <>
          <NflFilterChips
            label="Select week"
            size="sm"
            options={weeks.map(([label]) => label)}
            value={activeWeek}
            onChange={setOpenWeek}
            formatOption={(label) => label.replace("Week ", "W")}
          />
          <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{activeWeek}</h2>
            <NflTableScroller label={`${activeWeek} games`}>
              <table className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr className={NFL_TABLE_HEAD_ROW}>
                    <th scope="col" className="px-2 py-2 text-left">Kickoff (ET)</th>
                    <th scope="col" className="px-2 py-2 text-left">Matchup</th>
                    <th scope="col" className="px-2 py-2">Score</th>
                    <th scope="col" className="px-2 py-2 text-left">Stadium</th>
                  </tr>
                </thead>
                <tbody>
                  {activeGames.map((game) => (
                    <GameRow key={game.gameId} game={game} result={resultsById.get(game.gameId)} />
                  ))}
                </tbody>
              </table>
            </NflTableScroller>
          </article>
        </>
      )}

      <LastUpdated meta={data?.gamesMeta} />
    </>
  );
}

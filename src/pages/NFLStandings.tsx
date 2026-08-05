import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { NFL_DIVISIONS, NFL_DIVISION_ORDER, nflLogoUrl, type NflDivisionTeam } from "@/data/nflPreseason2026";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning from "@/components/nfl/StaleWarning";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflSeasonPicker } from "@/components/nfl/ui/NflFilterBar";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { deriveStandings, sortStandings, formatStandingRecord, type TeamStanding } from "@/lib/nfl/standings";

const SEASONS = [2026, 2025, 2024, 2023, 2022];
const CURRENT_SEASON = 2026;

function rankHeat(rank: number | null) {
  if (rank == null) return { background: "transparent", color: "#5a6878" };
  const t = (rank - 1) / 31;
  if (t <= 0.5) {
    const k = 1 - t * 2;
    return { background: `rgba(22,163,74,${0.12 + k * 0.30})`, color: k > 0.4 ? "#0f5132" : "#166534" };
  }
  const k = (t - 0.5) * 2;
  return { background: `rgba(220,38,38,${0.10 + k * 0.30})`, color: k > 0.4 ? "#7f1d1d" : "#991b1b" };
}

function TeamLogo({ abbr, color }: { abbr: string; color: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="flex h-7 w-7 items-center justify-center rounded-full text-[8px] font-black text-white" style={{ background: color }}>{abbr.toUpperCase()}</span>;
  return <img src={nflLogoUrl(abbr)} alt="" className="h-7 w-7 object-contain" loading="lazy" onError={() => setFailed(true)} />;
}

type RankLookup = Map<string, NflDivisionTeam>;

function DivisionCard({ name, rows, season, ranks }: { name: string; rows: TeamStanding[]; season: number; ranks: RankLookup }) {
  const sorted = sortStandings(rows);
  const isCurrent = season === CURRENT_SEASON;
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{name}</h2>
      <NflTableScroller label={`${name} standings`}>
        <table className="w-full min-w-[430px] text-xs">
          <thead>
            <tr className={NFL_TABLE_HEAD_ROW}>
              <th scope="col" className="px-2 py-2 text-left">Team</th>
              <th scope="col" className="px-1 py-2">W-L</th>
              {isCurrent
                ? (<><th scope="col" className="px-1 py-2">Pwr</th><th scope="col" className="px-1 py-2">Off</th><th scope="col" className="px-1 py-2">Def</th></>)
                : (<><th scope="col" className="px-1 py-2">PF</th><th scope="col" className="px-1 py-2">PA</th><th scope="col" className="px-1 py-2">Diff</th></>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const preseason = ranks.get(row.abbr);
              const heat = rankHeat(preseason?.pwrRank ?? null);
              const color = preseason?.color ?? "#334155";
              return (
                <tr key={row.abbr} className={NFL_TABLE_ROW}>
                  <td className="p-0">
                    <Link to={`/nfl/guide/team/${row.slug}`} className="flex items-center gap-2 px-2 py-1.5 font-semibold text-slate-800 hover:text-sky-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500" aria-label={`Open ${row.name} team dashboard`}>
                      <span className="h-6 w-[3px] rounded-full" style={{ background: color }} aria-hidden />
                      <TeamLogo abbr={row.abbr} color={color} />
                      <span className="whitespace-nowrap">{row.name}</span>
                    </Link>
                  </td>
                  <td className="px-1 text-center font-semibold tabular-nums text-slate-800">{formatStandingRecord(row)}</td>
                  {isCurrent ? (
                    <>
                      <td className="px-1 text-center font-semibold tabular-nums" style={heat}>{preseason?.pwrRank ?? "—"}</td>
                      <td className="px-1 text-center tabular-nums text-slate-500">{preseason?.offRank ?? "—"}</td>
                      <td className="px-1 text-center tabular-nums text-slate-500">{preseason?.defRank ?? "—"}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-1 text-center tabular-nums text-slate-500">{row.pointsFor}</td>
                      <td className="px-1 text-center tabular-nums text-slate-500">{row.pointsAgainst}</td>
                      <td className={`px-1 text-center font-semibold tabular-nums ${row.pointDiff > 0 ? "text-emerald-700" : row.pointDiff < 0 ? "text-red-700" : "text-slate-500"}`}>
                        {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </NflTableScroller>
    </article>
  );
}

export default function NFLStandings() {
  const seo = getSeoMeta("nfl");
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { loading, error, data } = useNflSeasonData(season);

  usePageSeo({
    title: "2026 NFL Standings by Division | Joe Knows Ball",
    description: "NFL standings by division derived from final game results, with clickable team dashboards and preseason power rankings.",
    path: "/nfl/standings",
    noindex: seo.noindex ?? false,
  });

  const standings = useMemo(
    () => (data ? deriveStandings(data.results, data.teams) : []),
    [data]
  );
  const byDivision = useMemo(() => {
    const map = new Map<string, TeamStanding[]>();
    for (const row of standings) {
      const list = map.get(row.division) ?? [];
      list.push(row);
      map.set(row.division, list);
    }
    return map;
  }, [standings]);

  const ranks: RankLookup = useMemo(() => {
    const map = new Map<string, NflDivisionTeam>();
    for (const division of NFL_DIVISION_ORDER) {
      for (const team of NFL_DIVISIONS[division] ?? []) map.set(team.abbr, team);
    }
    return map;
  }, []);

  const hasResults = (data?.results.length ?? 0) > 0;
  const isCurrent = season === CURRENT_SEASON;

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Standings"
        title={`${season} NFL Standings by Division`}
        description="Derived automatically from final game results. Select a team for its full dashboard."
      >
        <NflSeasonPicker seasons={SEASONS} value={season} onChange={setSeason} />
      </NflPageHeader>

      {isCurrent && !loading && !error && !hasResults && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          No final 2026 NFL results are available yet. Standings will update automatically once games are completed.
        </p>
      )}
      <StaleWarning meta={data?.resultsMeta} maxAgeHours={72} enabled={isCurrent && hasResults} />

      {loading && <p className="text-sm text-slate-500">Loading standings…</p>}
      {error && <p className="text-sm font-semibold text-red-700">Could not load standings data for {season}. Please try again later.</p>}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          {NFL_DIVISION_ORDER.filter((division) => byDivision.has(division)).map((division) => (
            <DivisionCard key={division} name={division} rows={byDivision.get(division)!} season={season} ranks={ranks} />
          ))}
        </div>
      )}

      <p className="text-[11px] leading-5 text-slate-500">
        {isCurrent ? "Pwr = preseason power rank (1–32) · Off / Def = unit rank · " : "PF / PA = points for and against · "}
        Standings are sorted by a simplified regular-season ranking formula (win% → wins → point differential → points for) and do not yet apply the full NFL playoff tiebreaker sequence.
      </p>
      <LastUpdated meta={data?.resultsMeta} />
    </>
  );
}

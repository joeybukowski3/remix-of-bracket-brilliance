import { useMemo, useState } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning from "@/components/nfl/StaleWarning";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildWeekMatchups, getAvailableWeeks, type NflMatchup } from "@/lib/nfl/matchups";
import MatchupCard from "@/components/nfl/matchups/MatchupCard";

const CURRENT_SEASON = 2026;
const DEFAULT_WEEK = 1;
const GUIDE = getNflSeasonGuide(CURRENT_SEASON)!;

function etDateKey(iso: string | null): string {
  if (!iso) return "zzz-tbd";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "zzz-tbd";
  // Sortable YYYY-MM-DD in Eastern Time.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "numeric" }).format(d);
}

function etDateLabel(iso: string | null): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(d);
}

type DayGroup = { key: string; label: string; matchups: NflMatchup[] };

function groupByDay(matchups: NflMatchup[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const matchup of matchups) {
    const key = etDateKey(matchup.kickoffUtc);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: etDateLabel(matchup.kickoffUtc), matchups: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.matchups.push(matchup);
  }
  return groups;
}

export default function NFLMatchups() {
  const seo = getSeoMeta("nfl");
  const { loading, error, data } = useNflSeasonData(CURRENT_SEASON);
  const [selectedWeek, setSelectedWeek] = useState(DEFAULT_WEEK);

  usePageSeo({
    title: `${CURRENT_SEASON} NFL Weekly Matchups | Joe Knows Ball`,
    description: "Week-by-week NFL matchup previews with team power ratings, side-by-side comparisons, model advantages and matchup angles.",
    path: "/nfl/matchups",
    noindex: seo.noindex ?? false,
  });

  const weeks = useMemo(() => getAvailableWeeks(data?.games ?? []), [data]);
  const activeWeek = weeks.includes(selectedWeek) ? selectedWeek : (weeks[0] ?? DEFAULT_WEEK);
  const matchups = useMemo(
    () => (data ? buildWeekMatchups(data.games, GUIDE, activeWeek) : []),
    [data, activeWeek]
  );
  const dayGroups = useMemo(() => groupByDay(matchups), [matchups]);
  const hasResults = (data?.results.length ?? 0) > 0;

  return (
    <main className="site-page pb-16 pt-8">
      <div className="site-container site-stack">
        <section>
          <div className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-600">NFL · Weekly Matchups</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{CURRENT_SEASON} NFL Weekly Matchups</h1>
          <p className="mt-2 text-sm text-slate-500">Week 1 schedule, team power ratings and matchup previews. Kickoff times in Eastern Time.</p>

          {weeks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Select week">
              {weeks.map((week) => (
                <button
                  key={week}
                  type="button"
                  onClick={() => setSelectedWeek(week)}
                  aria-pressed={week === activeWeek}
                  className={`rounded border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                    week === activeWeek
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:border-emerald-400"
                  }`}
                >
                  W{week}
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="mt-2">
          <StaleWarning meta={data?.gamesMeta} maxAgeHours={72} enabled={hasResults} />
        </div>

        {loading && <p className="mt-6 text-sm text-slate-500">Loading matchups…</p>}
        {error && (
          <p className="mt-6 text-sm font-semibold text-red-700">
            Could not load the {CURRENT_SEASON} schedule. Please try again later.
          </p>
        )}
        {!loading && !error && matchups.length === 0 && (
          <p className="mt-6 text-sm text-slate-500">No games are scheduled for this week yet.</p>
        )}

        {!loading && !error && dayGroups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">{group.label}</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {group.matchups.map((matchup) => (
                <MatchupCard key={matchup.gameId} matchup={matchup} />
              ))}
            </div>
          </section>
        ))}

        <LastUpdated meta={data?.gamesMeta} className="mt-4" />
      </div>
    </main>
  );
}

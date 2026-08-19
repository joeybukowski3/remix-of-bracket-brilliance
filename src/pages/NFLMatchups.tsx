import { useMemo, useState } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning from "@/components/nfl/StaleWarning";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildWeekMatchups, getAvailableWeeks, type NflMatchup } from "@/lib/nfl/matchups";
import MatchupCard, { type MatchupCardOvr } from "@/components/nfl/matchups/MatchupCard";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { useNflMatchupMarket } from "@/hooks/useNflMatchupMarket";
import { currentMarketFor } from "@/lib/nfl/marketData";

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
  // Optional enrichment, loaded independently of the schedule: a missing or
  // malformed market artifact leaves each card's spread at N/A and changes
  // nothing else on the page.
  const { artifact: marketArtifact } = useNflMatchupMarket();
  // Universal current 2026 OVR/rank -- the only source for the "Power" line
  // on each card. Never the guide's frozen 2025-preseason powerRank/overallPct.
  const currentRating = useNflCurrentRating2026();
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

  const ovrByAbbr = useMemo(() => {
    const map = new Map<string, MatchupCardOvr>();
    for (const team of currentRating.data?.teams ?? []) map.set(team.abbr, { rating: team.rating, rank: team.rank });
    return map;
  }, [currentRating.data]);

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Weekly Matchups"
        title={`${CURRENT_SEASON} NFL Weekly Matchups`}
        description="Week-by-week schedule, team power ratings and matchup previews. Kickoff times in Eastern Time."
      >
        {weeks.length > 0 && (
          <NflFilterChips
            label="Select week"
            size="sm"
            options={weeks}
            value={activeWeek}
            onChange={setSelectedWeek}
            formatOption={(week) => `W${week}`}
          />
        )}
      </NflPageHeader>

      <StaleWarning meta={data?.gamesMeta} maxAgeHours={72} enabled={hasResults} />

      {loading && <p className="text-sm text-slate-500">Loading matchups…</p>}
      {error && (
        <p className="text-sm font-semibold text-red-700">
          Could not load the {CURRENT_SEASON} schedule. Please try again later.
        </p>
      )}
      {!loading && !error && matchups.length === 0 && (
        <p className="text-sm text-slate-500">No games are scheduled for this week yet.</p>
      )}

      {!loading && !error && dayGroups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {group.matchups.map((matchup) => (
              <MatchupCard
                key={matchup.gameId}
                matchup={matchup}
                market={currentMarketFor(marketArtifact, matchup.gameId)}
                awayOvr={ovrByAbbr.get(matchup.away.abbr) ?? null}
                homeOvr={ovrByAbbr.get(matchup.home.abbr) ?? null}
              />
            ))}
          </div>
        </section>
      ))}

      <LastUpdated meta={data?.gamesMeta} />
    </>
  );
}

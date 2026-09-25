import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning from "@/components/nfl/StaleWarning";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import { useNflMatchupEpa } from "@/hooks/useNflMatchupEpa";
import { useNflMatchupMarket } from "@/hooks/useNflMatchupMarket";
import { useNflMatchupProjections } from "@/hooks/useNflMatchupProjections";
import { useNflMatchupTotals } from "@/hooks/useNflMatchupTotals";
import { currentMarketFor } from "@/lib/nfl/marketData";
import { projectionFor } from "@/lib/nfl/projectionData";
import { teamTotalFor } from "@/lib/nfl/totalsProjectionData";
import { useNflMatchupMetrics } from "@/hooks/useNflMatchupMetrics";
import { useNflSuccessRates } from "@/hooks/useNflSuccessRates";
import { useNflTrenchMetrics } from "@/hooks/useNflTrenchMetrics";
import { deriveStandings, formatStandingRecord } from "@/lib/nfl/standings";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildWeekMatchups, type NflMatchup } from "@/lib/nfl/matchups";
import { resolveNflWeekSelection } from "@/lib/nfl/weekSelection";
import MatchupMatrixRow from "@/components/nfl/matchups/MatchupMatrixRow";
import MatchupMatrixControls, { type NflMatrixDisplayMode } from "@/components/nfl/matchups/MatchupMatrixControls";
import { buildMatchupMatrixBoard } from "@/lib/nfl/matchupMatrixData";
import { DEFAULT_MATRIX_DATA_WINDOW_MODE, type NflMatrixDataWindowMode } from "@/lib/nfl/matchupMatrixWindow";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";

const CURRENT_SEASON = 2026;
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
  const location = useLocation();
  const navigate = useNavigate();
  const seo = getSeoMeta("nfl");
  const { loading, error, data } = useNflSeasonData(CURRENT_SEASON);
  // Universal current 2026 OVR/rank/performance -- the only source for the
  // matrix's OVR column. Never the guide's frozen 2025-preseason values.
  const currentRating = useNflCurrentRating2026();
  // Independent optional enrichments: each pipeline outage leaves only its own
  // columns at "N/A" rather than breaking the matrix.
  const { artifact: epaArtifact } = useNflMatchupEpa();
  const { artifact: conventionalArtifact } = useNflMatchupMetrics();
  const { artifact: successArtifact } = useNflSuccessRates();
  const { artifact: trenchArtifact } = useNflTrenchMetrics();
  // Same canonical artifacts the matchup detail page reads for Vegas/JKB line and total.
  const { artifact: marketArtifact } = useNflMatchupMarket();
  const { artifact: projectionArtifact } = useNflMatchupProjections();
  const { artifact: totalsArtifact } = useNflMatchupTotals();

  const [displayMode, setDisplayMode] = useState<NflMatrixDisplayMode>("rankings");
  const [dataWindow, setDataWindow] = useState<NflMatrixDataWindowMode>(DEFAULT_MATRIX_DATA_WINDOW_MODE);

  usePageSeo({
    title: `${CURRENT_SEASON} NFL Weekly Matchups | Joe Knows Ball`,
    description: "Week-by-week NFL matchup previews with team power ratings, side-by-side comparisons, model advantages and matchup angles.",
    path: "/nfl/matchups",
    noindex: seo.noindex ?? false,
  });

  const weekSelection = useMemo(
    () => resolveNflWeekSelection(data?.games ?? [], { search: location.search }),
    [data, location.search]
  );
  const weeks = weekSelection.availableWeeks;
  const activeWeek = weekSelection.week;
  const matchups = useMemo(
    () => (data && activeWeek !== null ? buildWeekMatchups(data.games, GUIDE, activeWeek) : []),
    [data, activeWeek]
  );
  const dayGroups = useMemo(() => groupByDay(matchups), [matchups]);
  const hasResults = (data?.results.length ?? 0) > 0;

  // Live 2026 win-loss record, from the same canonical results/standings
  // pipeline that powers /nfl/standings and /nfl/power-ratings -- NOT the v03
  // Stage-1 fullSeason artifact, whose `teams` array stays empty until it is
  // manually regenerated post-preseason.
  const recordByAbbr = useMemo(() => {
    if (!data) return new Map<string, string>();
    return new Map(deriveStandings(data.results, data.teams).map((row) => [row.abbr, formatStandingRecord(row)]));
  }, [data]);

  // Ratings mode and rank computation both need the WHOLE league's values,
  // not just the two teams in a given card, so the board is built once per
  // render from every team the schedule knows about.
  const board = useMemo(
    () =>
      buildMatchupMatrixBoard({
        teamAbbrs: (data?.teams ?? []).map((team) => team.abbr),
        mode: dataWindow,
        currentRating: currentRating.data,
        epaArtifact,
        conventionalArtifact,
        successArtifact,
        trenchArtifact,
      }),
    [data?.teams, dataWindow, currentRating.data, epaArtifact, conventionalArtifact, successArtifact, trenchArtifact]
  );

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
            value={activeWeek ?? weeks[0]}
            onChange={(week) => {
              const params = new URLSearchParams(location.search);
              params.set("week", String(week));
              navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
            }}
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

      {!loading && !error && matchups.length > 0 && (
        <MatchupMatrixControls
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          dataWindow={dataWindow}
          onDataWindowChange={setDataWindow}
        />
      )}

      {!loading && !error && dayGroups.map((group) => (
        <section key={group.key} aria-label={group.label} className="mb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</h2>
          <div className="flex flex-col gap-2.5">
            {group.matchups.map((matchup) => (
              <MatchupMatrixRow
                key={matchup.gameId}
                matchup={matchup}
                board={board}
                displayMode={displayMode}
                awayRecord={recordByAbbr.get(matchup.away.abbr) ?? null}
                homeRecord={recordByAbbr.get(matchup.home.abbr) ?? null}
                market={currentMarketFor(marketArtifact, matchup.gameId)}
                projection={projectionFor(projectionArtifact, matchup.gameId)}
                totalProjection={teamTotalFor(totalsArtifact, matchup.gameId)}
              />
            ))}
          </div>
        </section>
      ))}

      <LastUpdated meta={data?.gamesMeta} />
    </>
  );
}

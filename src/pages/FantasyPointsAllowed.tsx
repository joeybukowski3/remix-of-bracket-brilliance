import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import TeamLogo from "@/components/TeamLogo";
import { NflTableScroller } from "@/components/nfl/ui/NflTable";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getRankGradientColor } from "@/lib/fantasy/parPresentation";
import {
  POINTS_ALLOWED_2025,
  POINTS_ALLOWED_POSITIONS,
  POINTS_ALLOWED_TEAM_COUNT,
  type PointsAllowedPosition,
} from "@/lib/fantasy/pointsAllowed2025";

/** Seasons this reference view can show. Only 2025 has data today. */
const SEASONS = [2025, 2026] as const;
type Season = (typeof SEASONS)[number];

/** The season each dataset actually covers. 2026 is intentionally absent. */
const SEASON_DATA: Partial<Record<Season, typeof POINTS_ALLOWED_2025>> = {
  2025: POINTS_ALLOWED_2025,
};

type SortKey = "team" | PointsAllowedPosition;

/**
 * Standalone reference view of fantasy points allowed by defense. Kept separate
 * from the player boards on purpose — the boards only borrow this data to shade
 * playoff-week opponents.
 */
export default function FantasyPointsAllowed() {
  const seo = getSeoMeta("fantasy-points-allowed");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex ?? false,
  });

  const [season, setSeason] = useState<Season>(2025);
  const [sortKey, setSortKey] = useState<SortKey>("QB");
  const teams = SEASON_DATA[season];

  const sorted = useMemo(() => {
    if (!teams) return [];
    if (sortKey === "team") return [...teams].sort((a, b) => a.name.localeCompare(b.name));
    return [...teams].sort((a, b) => a.byPosition[sortKey].rank - b.byPosition[sortKey].rank);
  }, [teams, sortKey]);

  return (
    <SiteShell>
      <NflPageHeader
        eyebrow="Fantasy Football"
        title="Points Allowed by Position"
        description="Fantasy points allowed per game by every NFL defense, split by position. The research board uses this to shade playoff-week opponents; this page is the full table behind that shading."
      />

      <div className="mt-4 space-y-4">
        <section
          aria-labelledby="points-allowed-title"
          className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        >
          <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="points-allowed-title" className="text-base font-bold tracking-tight sm:text-lg">
                  {season} fantasy points allowed
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300 sm:text-[13px]">
                  Average per game, weeks 1-17. Rank 1 allowed the most points to that position, so
                  it is the most favourable matchup.
                </p>
              </div>
              <Link
                to="/fantasy-football"
                className="text-xs font-semibold text-sky-300 underline hover:text-sky-200"
              >
                Back to research board
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Season
              </span>
              <div className="inline-flex gap-1 rounded-lg bg-slate-200 p-1" role="group" aria-label="Season">
                {SEASONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={season === option}
                    onClick={() => setSeason(option)}
                    className={cn(
                      "min-h-8 rounded-md px-2.5 text-[11px] font-semibold tabular-nums",
                      season === option ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
                    )}
                  >
                    {option}
                    {!SEASON_DATA[option] && (
                      <span className="ml-1 font-normal text-slate-400">(no data)</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {teams && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Sort by
                </span>
                <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-200 p-1" role="group" aria-label="Sort by position">
                  {(["team", ...POINTS_ALLOWED_POSITIONS] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={sortKey === key}
                      onClick={() => setSortKey(key)}
                      className={cn(
                        "min-h-8 rounded-md px-2.5 text-[11px] font-semibold",
                        sortKey === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
                      )}
                    >
                      {key === "team" ? "Team" : key}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {teams ? (
            <NflTableScroller label={`${season} fantasy points allowed by position`} className="max-h-[72vh]">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-20 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                  <tr className="bg-slate-200">
                    <th className="sticky left-0 z-30 min-w-52 border-b border-r border-slate-300 bg-slate-200 px-3 py-1.5">
                      Team
                    </th>
                    {POINTS_ALLOWED_POSITIONS.map((position) => (
                      <th
                        key={position}
                        colSpan={2}
                        className="border-b border-r border-slate-300 px-2 py-1.5 text-center"
                      >
                        {position}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-slate-100">
                    <th className="sticky left-0 z-30 border-b border-r border-slate-300 bg-slate-100 px-3 py-1.5">
                      <span className="text-[9px] font-medium normal-case text-slate-500">
                        {season} season · pts allowed per game
                      </span>
                    </th>
                    {POINTS_ALLOWED_POSITIONS.map((position) => (
                      <FragmentHeaders key={position} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((team) => (
                    <tr key={team.abbr} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <TeamLogo name={team.abbr.toUpperCase()} logo={nflLogoUrl(team.abbr)} className="h-5 w-5" />
                          <span className="truncate text-[12px] font-bold text-slate-950">{team.name}</span>
                        </div>
                      </td>
                      {POINTS_ALLOWED_POSITIONS.map((position) => {
                        const entry = team.byPosition[position];
                        const background = getRankGradientColor(entry.rank, POINTS_ALLOWED_TEAM_COUNT);
                        return [
                          <td
                            key={`${position}-rk`}
                            style={background ? { backgroundColor: background } : undefined}
                            className="border-b border-slate-100 px-2 py-1.5 text-center text-[11px] font-bold tabular-nums text-slate-800"
                          >
                            {entry.rank}
                          </td>,
                          <td
                            key={`${position}-pa`}
                            className="border-b border-r border-slate-200 px-2 py-1.5 text-center text-[10px] tabular-nums text-slate-600"
                          >
                            {entry.pointsAllowed.toFixed(1)}
                          </td>,
                        ];
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </NflTableScroller>
          ) : (
            <NoSeasonData season={season} />
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600 sm:px-5">
          <strong className="text-slate-900">Source:</strong> FantasyPros fantasy points allowed,
          2025 actual season (weeks 1-17), averaged per game. This is historical data — it is not a
          2026 projection, and the research board labels it 2025 wherever it appears.
        </section>
      </div>
    </SiteShell>
  );
}

function FragmentHeaders() {
  return (
    <>
      <th className="min-w-12 border-b border-slate-200 px-2 py-1.5 text-center">Rk</th>
      <th className="min-w-14 border-b border-r border-slate-200 px-2 py-1.5 text-center">PA/G</th>
    </>
  );
}

/**
 * Shown when a season has no dataset. Deliberately explicit rather than an
 * empty table, so the toggle can ship before the data exists.
 */
function NoSeasonData({ season }: { season: Season }) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-sm font-bold text-slate-900">No {season} points-allowed data yet</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-600">
        The {season} season has not produced points-allowed results. This view will populate once
        the {season} data lands; until then the board's matchup shading uses 2025 actuals.
      </p>
      <p className="mt-3 text-xs text-slate-500">
        Showing {season} — switch to 2025 for the full table.
      </p>
    </div>
  );
}

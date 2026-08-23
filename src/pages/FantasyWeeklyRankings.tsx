import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FantasyRankingModeNav from "@/components/fantasy/FantasyRankingModeNav";
import ProjectionMethodologyPanel from "@/components/fantasy/ProjectionMethodologyPanel";
import WeeklyFantasyRankingsTable from "@/components/fantasy/WeeklyFantasyRankingsTable";
import SiteShell from "@/components/layout/SiteShell";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useWeeklyFantasyProjectionArtifact } from "@/hooks/useWeeklyFantasyProjectionArtifact";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { WEEKLY_RANKINGS_SEASON } from "@/lib/fantasy/weeklyRankings";
import { cn } from "@/lib/utils";
import { getSeoMeta } from "@/lib/seo";
import { resolveNflWeekSelection } from "@/lib/nfl/weekSelection";

const POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

function formatAsOf(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

export default function FantasyWeeklyRankings() {
  const seo = getSeoMeta("fantasy-weekly-rankings");
  usePageSeo({ title: seo.title, description: seo.description, path: seo.path, noindex: seo.noindex ?? false });
  const [searchParams, setSearchParams] = useSearchParams();
  const [position, setPosition] = useState<FantasyPosition>("QB");
  const season = useNflSeasonData(WEEKLY_RANKINGS_SEASON);
  const games = season.data?.games;
  const weekSelection = useMemo(
    () => resolveNflWeekSelection(games ?? [], { search: searchParams }),
    [games, searchParams],
  );
  const weeks = weekSelection.availableWeeks;
  const week = weekSelection.week;
  const weekly = useWeeklyFantasyProjectionArtifact(WEEKLY_RANKINGS_SEASON, week ?? weeks[0] ?? 1);

  if (week === null) {
    return (
      <SiteShell>
        <main className="site-container space-y-4 py-6">
          <FantasyRankingModeNav mode="weekly" />
          <NflPageHeader eyebrow="Fantasy Football · Full PPR" title="Weekly Fantasy Rankings" description="No regular-season schedule is available yet." />
          <section role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">No regular-season schedule is available yet.</section>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main className="site-container space-y-4 py-6">
        <FantasyRankingModeNav mode="weekly" week={week} />
        <NflPageHeader
          eyebrow="Fantasy Football · Full PPR"
          title="Weekly Fantasy Rankings"
          description={`Week ${week} JKB fantasy projections, ranked by projected points.`}
        >
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>Week</span>
            <select
              aria-label="Select week"
              value={week}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                next.set("week", event.target.value);
                setSearchParams(next);
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900"
            >
              {(weeks.length > 0 ? weeks : [week]).map((option) => <option key={option} value={option}>Week {option}</option>)}
            </select>
          </label>
        </NflPageHeader>

        {season.error && <p role="status" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Schedule data is unavailable; the requested week remains selected.</p>}

        {weekly.status === "ready" && (
          <>
            <section aria-label="Projection metadata" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-300">
              <strong className="text-white">Week {weekly.artifact.week}</strong>
              <span>Full PPR</span>
              <span>JKB Projection</span>
              <span>As of {formatAsOf(weekly.freshness.inputAsOf)}</span>
            </section>

            <div role="group" aria-label="Select position" className="grid grid-cols-4 gap-1 rounded-lg bg-slate-200 p-1">
              {POSITIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={position === option}
                  onClick={() => setPosition(option)}
                  className={cn("min-h-10 rounded-md px-2 text-xs font-black transition-colors", position === option ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950")}
                >{option}</button>
              ))}
            </div>

            <WeeklyFantasyRankingsTable rows={weekly.rows[position]} />
            <ProjectionMethodologyPanel />
          </>
        )}

        {weekly.status === "loading" && <section role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">Loading Week {week} rankings…</section>}
        {weekly.status === "missing" && (
          <section role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center">
            <h2 className="font-bold text-slate-950">Week {week} rankings are not available yet</h2>
            <p className="mt-1 text-sm text-slate-600">This page will not substitute Rest-of-Season or another week’s rankings.</p>
          </section>
        )}
        {weekly.status === "error" && (
          <section role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center">
            <h2 className="font-bold text-red-950">Week {week} rankings could not be loaded</h2>
            <p className="mt-1 text-sm text-red-800">The weekly artifact failed validation or could not be read. Try again after the source is refreshed.</p>
          </section>
        )}
      </main>
    </SiteShell>
  );
}

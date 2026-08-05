import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflSection from "@/components/nfl/ui/NflSection";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import {
  FANTASY_POSITION_FILTERS,
  FANTASY_RANKINGS,
  countByPosition,
  filterFantasyRankings,
  getPopulatedColumns,
  type FantasyPositionFilter,
} from "@/lib/fantasy/rankings";

/**
 * Fantasy Football landing page.
 *
 * This is the section's architecture, not its content. The customized Joe Knows
 * Ball rankings have not been supplied, so the table renders its real empty
 * state rather than sample players — and the page links only to routes that
 * exist. Draft tools, player analysis and draft strategy are described as
 * planned in prose; they are deliberately not rendered as tabs or links,
 * because a tab that goes nowhere is worse than no tab.
 */
export default function FantasyFootball() {
  const seo = getSeoMeta("fantasy-football");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex ?? false,
  });

  const [position, setPosition] = useState<FantasyPositionFilter>("ALL");
  const [query, setQuery] = useState("");

  const { rows, scoring, season, updatedAt } = FANTASY_RANKINGS;
  const counts = useMemo(() => countByPosition(rows), [rows]);
  const visibleRows = useMemo(
    () => filterFantasyRankings(rows, position, query),
    [rows, position, query],
  );
  const columns = useMemo(() => getPopulatedColumns(rows), [rows]);
  const hasRankings = rows.length > 0;

  return (
    <SiteShell>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 xl:py-7">
          <main className="space-y-5 pb-10">
            <NflPageHeader
              eyebrow="Joe Knows Ball · Fantasy Football"
              title={`${season} Fantasy Football Rankings`}
              description={`Customized Joe Knows Ball ${scoring} rankings and draft research. This is the home for our own ranking list — we do not republish another site's board.`}
              actions={
                <Link
                  to="/16-0"
                  className="inline-flex items-center rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  Try the 16-0 Draft Simulator →
                </Link>
              }
            />

            <NflSection
              title={`${season} overall rankings`}
              subtitle={
                updatedAt
                  ? `${scoring} scoring · updated ${new Date(updatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`
                  : `${scoring} scoring · the ranking list has not been published yet`
              }
              headerExtra={
                <div className="flex flex-wrap items-center gap-3">
                  <NflFilterChips
                    label="Filter by position"
                    size="sm"
                    options={FANTASY_POSITION_FILTERS}
                    value={position}
                    onChange={setPosition}
                    formatOption={(option) => {
                      const label = option === "ALL" ? "Overall" : option;
                      // The count is only meaningful once rows exist; showing
                      // "QB (0)" before publication reads as a broken filter.
                      return hasRankings ? `${label} (${counts[option] ?? 0})` : label;
                    }}
                  />
                  <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      disabled={!hasRankings}
                      placeholder="Search player or team"
                      aria-label="Search rankings by player or team"
                      className="w-full rounded border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    />
                  </div>
                </div>
              }
              bodyClassName={hasRankings ? "!px-0" : ""}
            >
              {!hasRankings ? (
                <RankingsEmptyState season={season} scoring={scoring} />
              ) : (
                <NflTableScroller label={`${season} fantasy football rankings`}>
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className={NFL_TABLE_HEAD_ROW}>
                        <th scope="col" className="px-3 py-2 text-right">#</th>
                        <th scope="col" className="px-3 py-2 text-left">Player</th>
                        <th scope="col" className="px-2 py-2 text-left">Team</th>
                        <th scope="col" className="px-2 py-2 text-center">Pos</th>
                        {columns.map((column) => (
                          <th
                            key={column.key}
                            scope="col"
                            className={`px-2 py-2 ${column.align === "left" ? "text-left" : "text-center"}`}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={`${row.overallRank}-${row.player}`} className={NFL_TABLE_ROW}>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{row.overallRank}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.player}</td>
                          <td className="px-2 py-2 uppercase text-slate-600">{row.team}</td>
                          <td className="px-2 py-2 text-center text-slate-600">{row.position}</td>
                          {columns.map((column) => (
                            <td
                              key={column.key}
                              className={`px-2 py-2 tabular-nums text-slate-700 ${column.align === "left" ? "text-left" : "text-center"}`}
                            >
                              {row[column.key] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {visibleRows.length === 0 && (
                        <tr>
                          <td colSpan={4 + columns.length} className="px-3 py-6 text-center text-sm text-slate-500">
                            No player matches that filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </NflTableScroller>
              )}
            </NflSection>

            <NflSection title="What is coming to this section" collapse="mobile">
              <p className="text-[13px] leading-6 text-slate-600">
                Fantasy Football is being built as its own product area rather than another
                team-analysis page. The rankings table above is the foundation: it already
                understands position ranks, tiers, bye weeks, ADP, projected points, strength of
                schedule and a Joe Knows Ball score, and renders whichever of those the published
                list carries.
              </p>
              <p className="mt-3 text-[13px] leading-6 text-slate-600">
                Position rankings, draft tools, player analysis and draft strategy will follow once
                the ranking list is published. They are named here so the direction is clear — they
                are intentionally not linked yet, because nothing on Joe Knows Ball should link to a
                page that does not exist.
              </p>
            </NflSection>

            <NflSection title="Related NFL research" collapse="mobile">
              <ul className="grid gap-2 sm:grid-cols-2">
                <RelatedLink to="/nfl" title="NFL Power Ratings" detail="Model offense, defense and overall ratings for all 32 teams." />
                <RelatedLink to="/nfl/schedule" title="NFL Schedule" detail="Full season schedule, kickoff times and results." />
                <RelatedLink to="/nfl/guide" title="2026 Team Guide" detail="Team dashboards, projections and offseason movement." />
                <RelatedLink to="/16-0" title="16-0 Draft Simulator" detail="Draft a 17-player roster and simulate the season." />
              </ul>
            </NflSection>
          </main>
        </div>
      </div>
    </SiteShell>
  );
}

function RankingsEmptyState({ season, scoring }: { season: number; scoring: string }) {
  return (
    <div className="py-8 text-center">
      <h3 className="text-sm font-semibold text-slate-900">
        The {season} rankings have not been published yet
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-slate-600">
        This table will fill with the customized Joe Knows Ball {scoring} board — our own rankings,
        not a consensus list republished from elsewhere. Position filters and search are wired and
        will work the moment the list lands.
      </p>
      <Link
        to="/nfl/guide"
        className="mt-4 inline-flex rounded border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1"
      >
        Browse the 2026 NFL Team Guide
      </Link>
    </div>
  );
}

function RelatedLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <li>
      <Link
        to={to}
        className="block rounded border border-slate-200 px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-5 text-slate-500">{detail}</span>
      </Link>
    </li>
  );
}

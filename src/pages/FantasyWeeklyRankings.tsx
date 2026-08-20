import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import WeeklyRankingsTable, {
  type StatDisplayMode,
} from "@/components/fantasy/WeeklyRankingsTable";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useNflMatchupEpa } from "@/hooks/useNflMatchupEpa";
import { useNflMatchupMetrics } from "@/hooks/useNflMatchupMetrics";
import { useNflSuccessRates } from "@/hooks/useNflSuccessRates";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import {
  buildWeekOpponentMap,
  buildWeeklyRankingRows,
  DEFAULT_WEEKLY_RANKING_POSITION,
  WEEKLY_RANKING_POSITIONS,
  WEEKLY_RANKINGS_SEASON,
  WEEKLY_RANKINGS_WEEK,
} from "@/lib/fantasy/weeklyRankings";
import { createWeeklyStatResolver } from "@/lib/fantasy/weeklyStatResolver";

/** Below Tailwind's `md` the table becomes compact stacked rows. */
const MOBILE_QUERY = "(max-width: 767px)";

/** Stat display options, in toggle order. Percentile leads and is the default. */
const DISPLAY_MODES: ReadonlyArray<StatDisplayMode> = ["percentile", "raw"];
const DISPLAY_MODE_LABELS: Record<StatDisplayMode, string> = {
  percentile: "Percentile",
  raw: "Raw",
};

/**
 * Week 1 fantasy rankings — V1 research board.
 *
 * Ordered by 2026 projected PPG and by nothing else. The Week 1 opponent, the
 * 2025 fantasy-points-allowed columns and the matchup grade are informational
 * context; none of them touches the fantasy ranking. See `weeklyRankings.ts`.
 */
export default function FantasyWeeklyRankings() {
  const seo = getSeoMeta("fantasy-weekly-rankings");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex ?? false,
  });

  const [position, setPosition] = useState<FantasyPosition>(DEFAULT_WEEKLY_RANKING_POSITION);
  const [displayMode, setDisplayMode] = useState<StatDisplayMode>("percentile");
  const isCompact = useIsCompactLayout(MOBILE_QUERY);

  const season = useNflSeasonData(WEEKLY_RANKINGS_SEASON);
  const epa = useNflMatchupEpa();
  const metrics = useNflMatchupMetrics();
  const success = useNflSuccessRates();

  const opponentMap = useMemo(
    () => buildWeekOpponentMap(season.data?.games ?? [], WEEKLY_RANKINGS_WEEK),
    [season.data],
  );

  const resolveStat = useMemo(
    () =>
      createWeeklyStatResolver({
        epa: epa.artifact,
        metrics: metrics.artifact,
        success: success.artifact,
      }),
    [epa.artifact, metrics.artifact, success.artifact],
  );

  const rows = useMemo(
    () => buildWeeklyRankingRows(position, opponentMap, resolveStat),
    [position, opponentMap, resolveStat],
  );

  const unresolved = rows.filter((row) => row.unresolvedReason).length;

  return (
    <SiteShell>
      {/* `site-container` is the site-wide gutter + max width token (index.css).
          This route sits outside NflPlatformLayout, which owns that gutter for
          /nfl pages, so the page applies it itself the way MLB.tsx and
          Rankings.tsx do. */}
      <main className="site-container space-y-4 py-6">
        <NflPageHeader
          eyebrow="Fantasy Football"
          title={`Week ${WEEKLY_RANKINGS_WEEK} Fantasy Rankings`}
          description={
            <>
              Ranked by 2026 projected PPG only. Week {WEEKLY_RANKINGS_WEEK} opponent and{" "}
              <Link
                to="/fantasy-football/points-allowed"
                className="font-semibold text-sky-700 underline"
              >
                2025 fantasy points allowed
              </Link>{" "}
              are informational context — they do not change the order.
            </>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <NflFilterChips
              label="Select position"
              size="sm"
              options={WEEKLY_RANKING_POSITIONS}
              value={position}
              onChange={setPosition}
            />
            {/* Hidden on compact: the stat columns it controls are not rendered
                in the mobile list, so the control would have no visible effect. */}
            {!isCompact && (
              <NflFilterChips
                label="Stat display"
                size="sm"
                options={DISPLAY_MODES}
                value={displayMode}
                onChange={setDisplayMode}
                formatOption={(mode) => DISPLAY_MODE_LABELS[mode]}
              />
            )}
          </div>
        </NflPageHeader>

        {season.loading && (
          <p className="text-sm text-slate-500">Loading the {WEEKLY_RANKINGS_SEASON} schedule…</p>
        )}

        {season.error && (
          <p
            role="status"
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            Week {WEEKLY_RANKINGS_WEEK} opponents are unavailable ({season.error}). Rankings still
            reflect projected PPG; matchup columns show a dash.
          </p>
        )}

        {unresolved > 0 && !season.loading && (
          <p
            role="status"
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            {unresolved} {unresolved === 1 ? "player has" : "players have"} no resolvable Week{" "}
            {WEEKLY_RANKINGS_WEEK} matchup. They keep their PPG rank and show a dash rather than a
            guessed opponent.
          </p>
        )}

        {/* Keyed on position so a tab change resets the exploratory table sort
            back to projected PPG descending. The display mode lives above and
            deliberately persists across tabs. */}
        <WeeklyRankingsTable
          key={position}
          position={position}
          rows={rows}
          isCompact={isCompact}
          displayMode={displayMode}
        />
      </main>
    </SiteShell>
  );
}

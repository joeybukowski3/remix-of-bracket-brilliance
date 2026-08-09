import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflSection from "@/components/nfl/ui/NflSection";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import {
  FANTASY_POSITION_FILTERS,
  FANTASY_POSITION_METRIC_LABELS,
  FANTASY_RANKINGS,
  countByPosition,
  filterFantasyRankings,
  getFantasyMetricValues,
  type FantasyPositionFilter,
  type FantasyRankingRow,
} from "@/lib/fantasy/rankings";

/**
 * Fantasy Football landing page.
 *
 * The published 2026 list (250 players, verbatim from the supplied workbook) is
 * rendered as a compact board — Rank, Player, Team, Pos, Pos Rank, draft
 * Rd/Pick and the workbook's AVG composite. The deeper fields live in an
 * expandable row per player so the primary view stays scannable. Draft tools,
 * player analysis and draft strategy remain planned and are described in prose,
 * not rendered as tabs that go nowhere.
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

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })
    : null;

  return (
    <SiteShell>
      <NflPageHeader
        eyebrow="Fantasy Football"
        title="Fantasy Football Rankings"
        description="Customized Joe Knows Ball PPR rankings — a 12-team, 1-QB mock draft board from the 2026 workbook."
      />
      <NflSection
        title="2026 Rankings"
        subtitle={`${scoring} scoring · ${formattedDate ? `updated ${formattedDate}` : "not yet updated"} · ${rows.length} players. Click a row for metrics, playoff schedule and deeper ranks.`}
      >
        <NflFilterChips
          label="Position"
          options={FANTASY_POSITION_FILTERS}
          value={position}
          onChange={setPosition}
          formatOption={(option) => (option === "ALL" ? "Overall" : option)}
        />
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search players"
            placeholder="Search players or teams"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        {visibleRows.length === 0 ? (
          <EmptyState />
        ) : (
          <RankingsTable rows={visibleRows} />
        )}
        <WhatIsComing />
      </NflSection>
    </SiteShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-semibold text-slate-700">No matching players</p>
      <p className="mt-1 text-sm text-slate-600">
        Try a different search or position filter.
      </p>
    </div>
  );
}

function RankingsTable({ rows }: { rows: readonly FantasyRankingRow[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggle = (key: string) =>
    setExpandedKey((current) => (current === key ? null : key));

  return (
    <NflTableScroller label="Overall rankings">
      <table className="min-w-full text-sm">
        <thead>
          <tr className={NFL_TABLE_HEAD_ROW}>
            <th className="px-2 py-2 text-left">Rank</th>
            <th className="px-2 py-2 text-left">Player</th>
            <th className="px-2 py-2 text-left">Team</th>
            <th className="px-2 py-2 text-left">Pos</th>
            <th className="px-2 py-2 text-right">Pos Rank</th>
            <th className="px-2 py-2 text-right">Rd/Pick</th>
            <th className="px-2 py-2 text-right">AVG</th>
            <th className="px-2 py-2 text-right">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.player;
            const open = expandedKey === key;
            const detailId = `fantasy-detail-${row.overallRank}`;
            return (
              <Fragment key={key}>
                <tr
                  onClick={() => toggle(key)}
                  className={`${NFL_TABLE_ROW} cursor-pointer`}
                  aria-expanded={open}
                >
                  <td className="px-2 py-2 font-semibold tabular-nums">{row.overallRank}</td>
                  <td className="px-2 py-2 font-medium">{row.player}</td>
                  <td className="px-2 py-2 uppercase text-slate-600">{row.team?.toUpperCase() ?? "FA"}</td>
                  <td className="px-2 py-2 text-slate-600">{row.position}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.positionRank ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {row.draftRound != null && row.roundPick != null
                      ? `${row.draftRound}/${row.roundPick}`
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.averageRank ?? "—"}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={`${open ? "Hide" : "Show"} details for ${row.player}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(key);
                      }}
                      className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr key={`${key}-detail`}>
                    <td colSpan={8} id={detailId} className="border-b border-slate-200 bg-slate-50 px-4 py-4">
                      <DetailPanel row={row} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </NflTableScroller>
  );
}

function DetailPanel({ row }: { row: FantasyRankingRow }) {
  const labels = FANTASY_POSITION_METRIC_LABELS[row.position];
  const metricValues = getFantasyMetricValues(row);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {row.position} Metrics
        </h3>
        <dl className="mt-2 space-y-1 text-sm">
          {labels.map((label, index) => (
            <RowDetail key={label} label={label} value={metricValues[index]} rank />
          ))}
        </dl>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ranks</h3>
        <dl className="mt-2 space-y-1 text-sm">
          <RowDetail label="WAR" value={row.warRank} rank />
          <RowDetail label="Late" value={row.lateSeasonRank} rank />
          <RowDetail label="Proj" value={row.projectionRank} rank />
          <RowDetail label="Vegas" value={row.vegasRank} rank />
        </dl>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Team Context</h3>
        <dl className="mt-2 space-y-1 text-sm">
          <RowDetail label="SOS" value={row.strengthOfSchedule} />
          <RowDetail label="O-Line" value={row.offensiveLineRank} rank />
        </dl>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Playoff Schedule</h3>
        <dl className="mt-2 space-y-1 text-sm">
          <RowDetail label="Week 15" value={row.playoffWeek15Opponent} />
          <RowDetail label="Week 16" value={row.playoffWeek16Opponent} />
          <RowDetail label="Week 17" value={row.playoffWeek17Opponent} />
        </dl>
      </div>
    </div>
  );
}

function RowDetail({
  label,
  value,
  rank = false,
}: {
  label: string;
  value: number | string | undefined;
  rank?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900">
        {value == null ? "—" : rank ? `#${value}` : String(value)}
      </dd>
    </div>
  );
}

function WhatIsComing() {
  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">What's coming</h2>
      <p className="mt-2 text-sm text-slate-600">
        The board above is the foundation of the fantasy football section. Joe
        plans to add draft tools, player analysis and draft strategy over the
        next few weeks.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>Draft simulator with AI-powered pick suggestions</li>
        <li>Player analysis pages with advanced stats</li>
        <li>Draft strategy guides by pick position</li>
        <li>Strength-of-schedule and bye-week planning tools</li>
      </ul>
    </section>
  );
}

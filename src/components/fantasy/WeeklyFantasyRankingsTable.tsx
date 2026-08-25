import { Fragment, useMemo, useState } from "react";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyExpandControl,
  FantasyOpponentIdentity,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import useIsCompactLayout from "@/hooks/useIsCompactLayout";
import type { WeeklyResearchMetric } from "@/lib/fantasy/weekly/researchContext";
import type { WeeklyFantasyResearchRow } from "@/lib/fantasy/weekly/researchJoin";
import {
  matchupGradeHeatClass,
  matchupGradeHeatTone,
  prepareWeeklyResearchPresentation,
  weeklyHeatClass,
  weeklyHeatStyle,
  type WeeklyDisplayMetric,
  type WeeklyResearchPresentationRow,
} from "@/lib/fantasy/weekly/researchPresentation";
import type { NflMatchupEdge } from "@/lib/nfl/matchupEdges";
import { cn } from "@/lib/utils";

export type WeeklyResearchDisplayMode = "stat" | "rank";

type EvidenceKey = "touches" | "yardsPerCarry" | "receivingTargets" | "targetShare" | "airYardsPerGame" | "targetsPerGame";
type EvidenceColumn = { key: EvidenceKey; desktop: string; mobile: string };

const COMMON_HEADERS = [
  "RK", "OPPONENT", "PLAYER", "PROJ. PTS", "SEASON PPG", "L5 PPG", "MATCHUP GRADE",
  "OPP FPA SEASON", "OPP FPA L5", "TRENCHES", "EPA ADV.", "SUCCESS ADV.",
] as const;

const EVIDENCE_COLUMNS: Record<WeeklyFantasyResearchRow["position"], readonly EvidenceColumn[]> = {
  QB: [],
  RB: [
    { key: "touches", desktop: "TOUCHES", mobile: "Touches" },
    { key: "yardsPerCarry", desktop: "YPC", mobile: "YPC" },
    { key: "receivingTargets", desktop: "REC TARGETS", mobile: "Rec Targets" },
  ],
  WR: [
    { key: "targetShare", desktop: "TARGET %", mobile: "Target %" },
    { key: "airYardsPerGame", desktop: "AIR YARDS", mobile: "Air Yards" },
    { key: "targetsPerGame", desktop: "TARGETS/G", mobile: "Targets/G" },
  ],
  TE: [
    { key: "targetShare", desktop: "TARGET %", mobile: "Target %" },
    { key: "airYardsPerGame", desktop: "AIR YARDS", mobile: "Air Yards" },
    { key: "targetsPerGame", desktop: "TARGETS/G", mobile: "Targets/G" },
  ],
};

function formatMetric(metric: WeeklyResearchMetric, digits = 1): string {
  return metric.value == null ? "N/A" : metric.value.toFixed(digits);
}

function formatEvidenceValue(key: EvidenceKey, value: number | null): string {
  if (value == null) return "N/A";
  if (key === "targetShare") return `${(value * 100).toFixed(1)}%`;
  if (key === "touches" || key === "receivingTargets") return Math.round(value).toString();
  return value.toFixed(1);
}

function metricText(metric: WeeklyDisplayMetric, mode: WeeklyResearchDisplayMode, statValue: string): string {
  if (mode === "rank") return metric.displayRank == null ? "N/A" : `#${metric.displayRank}`;
  return statValue;
}

function edgeStatText(edge: NflMatchupEdge): string {
  if (edge.rankDifference == null) return "N/A";
  return `${edge.rankDifference > 0 ? "+" : ""}${edge.rankDifference}`;
}

function ordinal(rank: number): string {
  const remainder100 = rank % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${rank}th`;
  const suffix = rank % 10 === 1 ? "st" : rank % 10 === 2 ? "nd" : rank % 10 === 3 ? "rd" : "th";
  return `${rank}${suffix}`;
}

function sampleLabel(metric: WeeklyResearchMetric): string {
  if (metric.sampleSize === 0) return "No eligible sample";
  if (metric.sampleSeason != null) return `${metric.sampleSeason} · ${metric.sampleSize} game${metric.sampleSize === 1 ? "" : "s"}`;
  return `${metric.sampleSize} games across seasons`;
}

function heatProps(metric: WeeklyDisplayMetric) {
  return {
    className: weeklyHeatClass(metric.tone),
    style: weeklyHeatStyle(metric.tone),
    "data-heat-tone": metric.tone,
    "data-display-rank": metric.displayRank ?? undefined,
    "data-rank-pool-size": metric.poolSize || undefined,
  };
}

function MetricCell({ metric, mode, statValue }: { metric: WeeklyDisplayMetric; mode: WeeklyResearchDisplayMode; statValue: string }) {
  const heat = heatProps(metric);
  return (
    <td
      className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center text-xs font-black tabular-nums", heat.className)}
      style={heat.style}
      data-heat-tone={heat["data-heat-tone"]}
      data-display-rank={heat["data-display-rank"]}
      data-rank-pool-size={heat["data-rank-pool-size"]}
    >
      {metricText(metric, mode, statValue)}
    </td>
  );
}

function MetricCellWithProjectionData({ metric, mode, value }: { metric: WeeklyDisplayMetric; mode: WeeklyResearchDisplayMode; value: number }) {
  const heat = heatProps(metric);
  return (
    <td
      data-projected-fantasy-points={value}
      className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center text-sm font-black tabular-nums", heat.className)}
      style={heat.style}
      data-heat-tone={heat["data-heat-tone"]}
      data-display-rank={heat["data-display-rank"]}
      data-rank-pool-size={heat["data-rank-pool-size"]}
    >
      {metricText(metric, mode, value.toFixed(1))}
    </td>
  );
}

function EdgeCell({ edge, metric, mode }: { edge: NflMatchupEdge; metric: WeeklyDisplayMetric; mode: WeeklyResearchDisplayMode }) {
  return <MetricCell metric={metric} mode={mode} statValue={edgeStatText(edge)} />;
}

function MobileMetric({ label, value, metric }: { label: string; value: string; metric?: WeeklyDisplayMetric }) {
  const heat = metric ? heatProps(metric) : null;
  return (
    <div
      className={cn("min-w-0 rounded-md px-1.5 py-1.5", heat?.className ?? "bg-slate-50 text-slate-800")}
      style={heat?.style}
      data-heat-tone={heat?.["data-heat-tone"]}
      data-display-rank={heat?.["data-display-rank"]}
      data-rank-pool-size={heat?.["data-rank-pool-size"]}
    >
      <div className="truncate text-[8px] font-bold uppercase tracking-[0.04em] opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-black leading-4 tabular-nums">{value}</div>
    </div>
  );
}

function EdgeDetail({ title, edge, metric }: { title: string; edge: NflMatchupEdge; metric: WeeklyDisplayMetric }) {
  const rows = [
    ["Team rank", edge.offense ? `${edge.offense.label} · ${ordinal(edge.offense.rank)}` : "N/A"],
    ["Opponent rank", edge.defense ? `${edge.defense.label} · ${ordinal(edge.defense.rank)}` : "N/A"],
    ["Rank difference", edgeStatText(edge)],
    ["Weekly matchup edge rank", metric.displayRank == null ? "N/A" : `${ordinal(metric.displayRank)} of ${metric.poolSize}`],
  ] as const;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h4 className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-[0.05em] text-slate-950">{title}</h4>
      <dl className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 px-3 py-1.5">
            <dt className="font-semibold text-slate-500">{label}</dt>
            <dd className="text-right font-black tabular-nums text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.04em] text-slate-500">Source note</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-600">{edge.sampleLabel} · {edge.source}</p>
      </div>
    </div>
  );
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function Detail({ presentation }: { presentation: WeeklyResearchPresentationRow }) {
  const { row } = presentation;
  const evidence = EVIDENCE_COLUMNS[row.position];
  const samples = [
    ["Season PPG sample", sampleLabel(row.research.seasonPpg)],
    ["L5 PPG sample", sampleLabel(row.research.last5Ppg)],
    ["FPA season sample", sampleLabel(row.research.opponentFpaSeason)],
    ["FPA L5 sample", sampleLabel(row.research.opponentFpaLast5)],
    ...evidence.map((column) => {
      const raw = row.research.evidence[column.key];
      const display = presentation.evidence[column.key];
      return [`${column.mobile} evidence`, `${formatEvidenceValue(column.key, raw.value)} · ${display.displayRank == null ? "N/A" : `#${display.displayRank} of ${display.poolSize}`} · ${sampleLabel(raw)}`] as const;
    }),
  ] as const;
  const projectionContext = [
    ["Baseline pts", row.baselineFantasyPoints.toFixed(1)],
    ["Usage adjustment", row.position === "QB" ? "Not used" : row.residualActivated ? signed(row.components.usageAdjustment) : "Not active yet"],
    ["Scoring environment", row.context.scoringEnvironment.marketContextAvailable ? signed(row.components.scoringEnvironmentAdjustment) : "No market data"],
    ["Projection FPA adjustment", row.context.opponentFpa.fallbackReason === "missing-both-neutral" ? "No matchup data" : signed(row.components.opponentFpaAdjustment)],
    ["Final projected pts", row.projectedFantasyPoints.toFixed(1)],
  ] as const;
  return (
    <div data-weekly-expanded-detail className="space-y-3 rounded-xl border border-slate-200 bg-slate-100/70 p-2.5 text-xs text-slate-700 sm:p-3">
      <section aria-labelledby={`samples-${row.playerId}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <h3 id={`samples-${row.playerId}`} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.05em] text-slate-950">Samples / evidence</h3>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
          {samples.map(([label, value]) => (
            <div key={label} className="border-b border-slate-100 px-3 py-2 sm:border-r last:border-r-0">
              <dt className="text-[9px] font-bold uppercase tracking-[0.04em] text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-black text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby={`matchups-${row.playerId}`}>
        <h3 id={`matchups-${row.playerId}`} className="mb-1.5 px-1 text-[11px] font-black uppercase tracking-[0.05em] text-slate-950">Underlying matchup components</h3>
        <div className="grid gap-2 md:grid-cols-3">
          <EdgeDetail title="Trenches" edge={row.matchupEdges.trenches} metric={presentation.matchupEdges.trenches} />
          <EdgeDetail title="EPA advantage" edge={row.matchupEdges.epa} metric={presentation.matchupEdges.epa} />
          <EdgeDetail title="Success advantage" edge={row.matchupEdges.success} metric={presentation.matchupEdges.success} />
        </div>
      </section>
      <section aria-labelledby={`projection-${row.playerId}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <h3 id={`projection-${row.playerId}`} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.05em] text-slate-950">Projection context summary</h3>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-5">
          {projectionContext.map(([label, value]) => (
            <div key={label} className="border-b border-slate-100 px-3 py-2 sm:border-r last:border-r-0">
              <dt className="text-[9px] font-bold uppercase tracking-[0.04em] text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm font-black tabular-nums text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">JKB Full PPR · Pregame information only; research context does not alter the projection or rank.</p>
      </section>
    </div>
  );
}

function MobileCard({ presentation, mode, expanded, onToggle }: { presentation: WeeklyResearchPresentationRow; mode: WeeklyResearchDisplayMode; expanded: boolean; onToggle: () => void }) {
  const { row } = presentation;
  const evidence = EVIDENCE_COLUMNS[row.position];
  return (
    <article data-mobile-weekly-card className="border-b border-slate-200 bg-white px-3 py-2.5 last:border-b-0">
      <div className="grid grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-2">
        <div className="text-center text-base font-black tabular-nums text-slate-950">{row.positionRank}</div>
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1"><FantasyPlayerIdentity player={row.playerName} team={row.team} wrapName /></div>
          <FantasyExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`} expanded={expanded} onClick={onToggle} />
        </div>
        <MobileMetric label="Proj Pts" value={metricText(presentation.projectedFantasyPoints, mode, row.projectedFantasyPoints.toFixed(1))} metric={presentation.projectedFantasyPoints} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[8px] font-bold uppercase tracking-[0.04em] text-slate-500">Opponent</div>
          <div className="mt-0.5 text-xs"><FantasyOpponentIdentity opponent={row.opponent} homeAway={row.homeAway} /></div>
        </div>
        <div className={cn("min-w-0 rounded-md px-1.5 py-1.5", matchupGradeHeatClass(row.matchupRating?.id))} style={weeklyHeatStyle(matchupGradeHeatTone(row.matchupRating?.id))} data-heat-tone={matchupGradeHeatTone(row.matchupRating?.id)}>
          <div className="truncate text-[8px] font-bold uppercase tracking-[0.04em] opacity-70">Matchup Grade</div>
          <div className="mt-0.5 text-sm font-black leading-4">{row.matchupRating?.label ?? "N/A"}</div>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5" aria-label="Production">
        <MobileMetric label="Season PPG" value={metricText(presentation.seasonPpg, mode, formatMetric(row.research.seasonPpg))} metric={presentation.seasonPpg} />
        <MobileMetric label="L5 PPG" value={metricText(presentation.last5Ppg, mode, formatMetric(row.research.last5Ppg))} metric={presentation.last5Ppg} />
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5" aria-label="Opponent fantasy points allowed">
        <MobileMetric label="FPA Season" value={metricText(presentation.opponentFpaSeason, mode, formatMetric(row.research.opponentFpaSeason))} metric={presentation.opponentFpaSeason} />
        <MobileMetric label="FPA L5" value={metricText(presentation.opponentFpaLast5, mode, formatMetric(row.research.opponentFpaLast5))} metric={presentation.opponentFpaLast5} />
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5" aria-label="Matchup advantages">
        <MobileMetric label="Trenches" value={metricText(presentation.matchupEdges.trenches, mode, edgeStatText(row.matchupEdges.trenches))} metric={presentation.matchupEdges.trenches} />
        <MobileMetric label="EPA Adv" value={metricText(presentation.matchupEdges.epa, mode, edgeStatText(row.matchupEdges.epa))} metric={presentation.matchupEdges.epa} />
        <MobileMetric label="Success Adv" value={metricText(presentation.matchupEdges.success, mode, edgeStatText(row.matchupEdges.success))} metric={presentation.matchupEdges.success} />
      </div>
      {evidence.length > 0 && (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5" aria-label="Position evidence">
          {evidence.map((column) => {
            const metric = presentation.evidence[column.key];
            return <MobileMetric key={column.key} label={column.mobile} value={metricText(metric, mode, formatEvidenceValue(column.key, metric.rawValue))} metric={metric} />;
          })}
        </div>
      )}
      {expanded && <div className="mt-3 border-t border-slate-200 pt-3"><Detail presentation={presentation} /></div>}
    </article>
  );
}

export default function WeeklyFantasyRankingsTable({ rows, displayMode }: { rows: readonly WeeklyFantasyResearchRow[]; displayMode: WeeklyResearchDisplayMode }) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const compact = useIsCompactLayout();
  const presentationRows = useMemo(() => prepareWeeklyResearchPresentation(rows), [rows]);
  const position = rows[0]?.position ?? "QB";
  const evidence = EVIDENCE_COLUMNS[position];
  const columnCount = COMMON_HEADERS.length + evidence.length;

  return (
    <section aria-label={`${position} weekly fantasy research board`} data-display-mode={displayMode} className={cn(FANTASY_TABLE_SHELL, "overflow-visible")}>
      {compact ? (
        <div data-weekly-mobile-layout>
          {presentationRows.map((presentation) => {
            const expanded = expandedPlayerId === presentation.row.playerId;
            return <MobileCard key={presentation.row.playerId} presentation={presentation} mode={displayMode} expanded={expanded} onToggle={() => setExpandedPlayerId(expanded ? null : presentation.row.playerId)} />;
          })}
        </div>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[10px] text-slate-700">
          <caption className="sr-only">Canonical weekly fantasy projections with display-only research context</caption>
          <colgroup><col className="w-9" /><col className="w-[74px]" /><col className="w-44" /><col className="w-16" />{Array.from({ length: columnCount - 4 }, (_, index) => <col key={index} />)}</colgroup>
          <thead data-weekly-desktop-sticky-header className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">
            <tr>
              {COMMON_HEADERS.map((header) => <th key={header} scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "sticky top-[73px] z-30 bg-slate-100 px-1 py-2 text-center leading-tight", (header === "OPPONENT" || header === "PLAYER") && "text-left")}>{header}</th>)}
              {evidence.map((column) => <th key={column.key} scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "sticky top-[73px] z-30 bg-slate-100 px-1 py-2 text-center leading-tight")}>{column.desktop}</th>)}
            </tr>
          </thead>
          <tbody>
            {presentationRows.map((presentation) => {
              const { row } = presentation;
              const expanded = expandedPlayerId === row.playerId;
              return (
                <Fragment key={row.playerId}>
                  <tr data-player-id={row.playerId} className="group bg-white hover:bg-slate-50">
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center text-xs font-black tabular-nums text-slate-950")}>{row.positionRank}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-1 text-xs")}><FantasyOpponentIdentity opponent={row.opponent} homeAway={row.homeAway} compact /></td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-1")}><div className="flex min-w-0 items-center gap-1"><div className="min-w-0 flex-1"><FantasyPlayerIdentity player={row.playerName} team={row.team} compact wrapName /></div><FantasyExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`} expanded={expanded} onClick={() => setExpandedPlayerId(expanded ? null : row.playerId)} /></div></td>
                    <MetricCellWithProjectionData metric={presentation.projectedFantasyPoints} mode={displayMode} value={row.projectedFantasyPoints} />
                    <MetricCell metric={presentation.seasonPpg} mode={displayMode} statValue={formatMetric(row.research.seasonPpg)} />
                    <MetricCell metric={presentation.last5Ppg} mode={displayMode} statValue={formatMetric(row.research.last5Ppg)} />
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center", matchupGradeHeatClass(row.matchupRating?.id))} style={weeklyHeatStyle(matchupGradeHeatTone(row.matchupRating?.id))} data-heat-tone={matchupGradeHeatTone(row.matchupRating?.id)}><span className="inline-flex rounded border border-current/20 px-1.5 py-0.5 font-black">{row.matchupRating?.label ?? "N/A"}</span></td>
                    <MetricCell metric={presentation.opponentFpaSeason} mode={displayMode} statValue={formatMetric(row.research.opponentFpaSeason)} />
                    <MetricCell metric={presentation.opponentFpaLast5} mode={displayMode} statValue={formatMetric(row.research.opponentFpaLast5)} />
                    <EdgeCell edge={row.matchupEdges.trenches} metric={presentation.matchupEdges.trenches} mode={displayMode} />
                    <EdgeCell edge={row.matchupEdges.epa} metric={presentation.matchupEdges.epa} mode={displayMode} />
                    <EdgeCell edge={row.matchupEdges.success} metric={presentation.matchupEdges.success} mode={displayMode} />
                    {evidence.map((column) => <MetricCell key={column.key} metric={presentation.evidence[column.key]} mode={displayMode} statValue={formatEvidenceValue(column.key, presentation.evidence[column.key].rawValue)} />)}
                  </tr>
                  {expanded && <tr className="bg-slate-50"><td colSpan={columnCount} className="border-b border-slate-200 px-4 py-3"><Detail presentation={presentation} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

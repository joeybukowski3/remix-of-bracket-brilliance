import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CircleDot } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyExpandControl,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import useIsCompactLayout from "@/hooks/useIsCompactLayout";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import type { WeeklyResearchMetric } from "@/lib/fantasy/weekly/researchContext";
import type { WeeklyFantasyResearchRow } from "@/lib/fantasy/weekly/researchJoin";
import { mobilePlayerLastName } from "@/lib/fantasy/weekly/mobilePlayerName";
import {
  matchupGradeHeatClass,
  matchupGradeHeatTone,
  prepareWeeklyResearchPresentation,
  weeklyHeatClass,
  weeklyHeatTextClass,
  weeklyHeatStyle,
  weeklyMatchupComponentHeatTone,
  weeklyMatchupDifferenceHeatTone,
  weeklyRankHeatTone,
  type WeeklyDisplayMetric,
  type WeeklyResearchPresentationRow,
} from "@/lib/fantasy/weekly/researchPresentation";
import type { NflMatchupEdge } from "@/lib/nfl/matchupEdges";
import { weeklyStatDefinition, type WeeklyStatDefinition } from "@/lib/fantasy/weeklyPresentationMetadata";
import {
  CANONICAL_WEEKLY_SORT,
  defaultWeeklySortDirection,
  sortWeeklyResearchPresentation,
  type WeeklyEvidenceSortKey,
  type WeeklyResearchSort,
  type WeeklyResearchSortKey,
} from "@/lib/fantasy/weekly/researchSorting";
import { cn } from "@/lib/utils";

export type WeeklyResearchDisplayMode = "stat" | "rank";

type EvidenceKey = WeeklyEvidenceSortKey;
type EvidenceColumn = { key: EvidenceKey; desktop: string; detail: string };
type TableColumn = { key: WeeklyResearchSortKey; label: string; align?: "left" };
type EdgeKey = "trenches" | "epa" | "success";
type MobileMetricKey = "seasonPpg" | "last5Ppg" | "matchup" | "opponentFpaSeason" | "opponentFpaLast5" | EdgeKey | EvidenceKey;
type MobileColumn = { key: MobileMetricKey; definition: WeeklyStatDefinition };

const MOBILE_COLUMNS = {
  rank: 30,
  logo: 28,
  player: 88,
  projection: 52,
  metric: 54,
} as const;

const MOBILE_STICKY_LEFT = {
  rank: 0,
  logo: MOBILE_COLUMNS.rank,
  player: MOBILE_COLUMNS.rank + MOBILE_COLUMNS.logo,
} as const;

const EVIDENCE_CARD_TONES = [
  "border-sky-100 bg-sky-50/75 text-sky-950",
  "border-violet-100 bg-violet-50/75 text-violet-950",
  "border-cyan-100 bg-cyan-50/75 text-cyan-950",
  "border-indigo-100 bg-indigo-50/75 text-indigo-950",
] as const;

const EVIDENCE_MARKER_TONES = ["text-sky-500", "text-violet-500", "text-cyan-500", "text-indigo-500"] as const;

const EDGE_DETAIL_TONES = {
  trenches: {
    border: "border-cyan-200",
    header: "border-cyan-200 bg-cyan-50 text-cyan-950",
    marker: "bg-cyan-500",
    source: "border-cyan-100 bg-cyan-50/60",
  },
  epa: {
    border: "border-violet-200",
    header: "border-violet-200 bg-violet-50 text-violet-950",
    marker: "bg-violet-500",
    source: "border-violet-100 bg-violet-50/60",
  },
  success: {
    border: "border-indigo-200",
    header: "border-indigo-200 bg-indigo-50 text-indigo-950",
    marker: "bg-indigo-500",
    source: "border-indigo-100 bg-indigo-50/60",
  },
} as const;

const WEEKLY_COMMON_COLUMNS: readonly TableColumn[] = [
  { key: "rank", label: "RK" },
  { key: "player", label: "PLAYER", align: "left" },
  { key: "opponent", label: "OPP", align: "left" },
  { key: "projectedFantasyPoints", label: "PROJ. PTS" },
  { key: "seasonPpg", label: "SEASON PPG" },
  { key: "last5Ppg", label: "L5 TREND" },
  { key: "matchup", label: "MATCHUP" },
  { key: "opponentFpaSeason", label: "OPP ALLOWED SZN" },
  { key: "opponentFpaLast5", label: "OPP ALLOWED L5" },
] as const;

const EVIDENCE_COLUMNS: Record<WeeklyFantasyResearchRow["position"], readonly EvidenceColumn[]> = {
  QB: [],
  RB: [
    { key: "touches", desktop: "TOUCHES RK", detail: "Touches" },
    { key: "yardsPerCarry", desktop: "YPC RK", detail: "YPC" },
    { key: "receivingTargets", desktop: "REC TARGETS RK", detail: "Rec Targets" },
  ],
  WR: [
    { key: "targetShare", desktop: "TARGET % RK", detail: "Target %" },
    { key: "airYardsPerGame", desktop: "AIR YARDS RK", detail: "Air Yards" },
    { key: "targetsPerGame", desktop: "TARGETS/G RK", detail: "Targets/Game" },
  ],
  TE: [
    { key: "targetShare", desktop: "TARGET % RK", detail: "Target %" },
    { key: "airYardsPerGame", desktop: "AIR YARDS RK", detail: "Air Yards" },
    { key: "targetsPerGame", desktop: "TARGETS/G RK", detail: "Targets/Game" },
  ],
};

const EDGE_COLUMNS: Record<WeeklyFantasyResearchRow["position"], readonly TableColumn[]> = {
  QB: [
    { key: "trenches", label: "TRENCHES" },
    { key: "epa", label: "EPA ADV." },
    { key: "success", label: "SUCCESS ADV." },
  ],
  RB: [{ key: "trenches", label: "TRENCHES" }],
  WR: [{ key: "trenches", label: "TRENCHES" }],
  TE: [{ key: "trenches", label: "TRENCHES" }],
};

const MOBILE_COMMON_COLUMNS: readonly MobileColumn[] = (
  ["seasonPpg", "last5Ppg", "matchup", "opponentFpaSeason", "opponentFpaLast5", "trenches"] satisfies readonly MobileMetricKey[]
).map((key) => ({ key, definition: weeklyStatDefinition(key) }));

const MOBILE_EDGE_COLUMNS: Record<WeeklyFantasyResearchRow["position"], readonly MobileColumn[]> = {
  QB: (["epa", "success"] satisfies readonly MobileMetricKey[]).map((key) => ({ key, definition: weeklyStatDefinition(key) })),
  RB: [], WR: [], TE: [],
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

function MetricCellWithProjectionData({ metric, value }: { metric: WeeklyDisplayMetric; value: number }) {
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
      {value.toFixed(1)}
    </td>
  );
}

function MobileMetricCell({ value, metric, matchupTone }: { value: string; metric?: WeeklyDisplayMetric; matchupTone?: ReturnType<typeof matchupGradeHeatTone> }) {
  const heat = metric ? heatProps(metric) : null;
  const tone = matchupTone ?? heat?.["data-heat-tone"];
  return (
    <div
      className={cn("flex min-w-0 items-center justify-center self-stretch border-l border-white/60 px-px text-center text-[clamp(9px,2.7vw,11px)] font-black leading-none tabular-nums", heat?.className ?? matchupGradeHeatClass(matchupTone))}
      style={heat?.style ?? weeklyHeatStyle(matchupTone ?? "missing")}
      data-heat-tone={tone}
      data-display-rank={heat?.["data-display-rank"]}
      data-rank-pool-size={heat?.["data-rank-pool-size"]}
    >
      <span className="truncate">{value}</span>
    </div>
  );
}

function compactMatchupLabel(label: string | undefined): string {
  if (label === "Neutral") return "Neut";
  if (label === "Very Tough") return "V Tough";
  return label ?? "N/A";
}

function mobilePlayerNames(rows: readonly WeeklyResearchPresentationRow[]): Map<string, string> {
  const lastNameCounts = new Map<string, number>();
  for (const { row } of rows) {
    const surname = mobilePlayerLastName(row.playerName).toLocaleLowerCase();
    lastNameCounts.set(surname, (lastNameCounts.get(surname) ?? 0) + 1);
  }
  return new Map(rows.map(({ row }) => {
    const surname = mobilePlayerLastName(row.playerName);
    const duplicate = (lastNameCounts.get(surname.toLocaleLowerCase()) ?? 0) > 1;
    const firstInitial = row.playerName.trim().charAt(0);
    return [row.playerId, duplicate ? `${firstInitial}. ${surname}` : surname];
  }));
}

function EdgeDetail({ title, category, edge, metric }: { title: string; category: EdgeKey; edge: NflMatchupEdge; metric: WeeklyDisplayMetric }) {
  const tone = EDGE_DETAIL_TONES[category];
  const rows = [
    {
      key: "team-rank",
      label: "Team rank",
      value: edge.offense ? `${edge.offense.label} · ${ordinal(edge.offense.rank)}` : "N/A",
      qualityTone: weeklyMatchupComponentHeatTone(edge.offense?.rank, "offense"),
    },
    {
      key: "opponent-rank",
      label: "Opponent rank",
      value: edge.defense ? `${edge.defense.label} · ${ordinal(edge.defense.rank)}` : "N/A",
      qualityTone: weeklyMatchupComponentHeatTone(edge.defense?.rank, "opponent-defense"),
    },
    {
      key: "rank-difference",
      label: "Rank difference",
      value: edgeStatText(edge),
      qualityTone: weeklyMatchupDifferenceHeatTone(edge.rankDifference),
    },
    {
      key: "edge-rank",
      label: "Weekly matchup edge rank",
      value: metric.displayRank == null ? "N/A" : `${ordinal(metric.displayRank)} of ${metric.poolSize}`,
      qualityTone: weeklyRankHeatTone(metric.displayRank, 32),
    },
  ] as const;
  return (
    <div data-matchup-category={category} className={cn("overflow-hidden border bg-white sm:rounded-lg", tone.border)}>
      <h4 className={cn("flex items-center gap-1.5 border-b px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.04em] sm:px-3 sm:py-2 sm:text-[11px]", tone.header)}>
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone.marker)} />
        {title}
      </h4>
      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 px-2 py-1 sm:px-3 sm:py-1.5">
            <dt className="font-semibold text-slate-500">{row.label}</dt>
            <dd data-matchup-detail-value={row.key} data-quality-tone={row.qualityTone} className={cn("text-right font-black tabular-nums", weeklyHeatTextClass(row.qualityTone))}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className={cn("border-t px-2 py-1.5 sm:px-3 sm:py-2", tone.source)}>
        <p className="text-[9px] font-bold uppercase tracking-[0.04em] text-slate-500">Source note</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-600">{edge.sampleLabel} · {edge.source}</p>
      </div>
    </div>
  );
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function rankAndValue(value: string, metric: WeeklyDisplayMetric): string {
  return `${value} · ${metric.displayRank == null ? "Rank N/A" : `Rank #${metric.displayRank}`}`;
}

function ExpandedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-slate-100 px-2 py-1.5 last:border-r-0 sm:px-3 sm:py-2">
      <dt className="text-[9px] font-bold uppercase leading-3 tracking-[0.03em] text-slate-500 sm:text-[10px]">{label}</dt>
      <dd className="mt-0.5 text-[11px] font-black leading-4 tabular-nums text-slate-950 sm:text-xs">{value}</dd>
    </div>
  );
}

function MobileExpandedSummary({ presentation }: { presentation: WeeklyResearchPresentationRow }) {
  const { row } = presentation;
  const evidence = EVIDENCE_COLUMNS[row.position];
  const metrics = [
    ["Season PPG", rankAndValue(formatMetric(row.research.seasonPpg), presentation.seasonPpg)],
    ["Last 5 Trend", rankAndValue(formatMetric(row.research.last5Ppg), presentation.last5Ppg)],
    ["Matchup", row.matchupRating?.label ?? "N/A"],
    ["Opponent Allowed Season", rankAndValue(formatMetric(row.research.opponentFpaSeason), presentation.opponentFpaSeason)],
    ["Opponent Allowed Last 5", rankAndValue(formatMetric(row.research.opponentFpaLast5), presentation.opponentFpaLast5)],
    ["Trenches", rankAndValue(edgeStatText(row.matchupEdges.trenches), presentation.matchupEdges.trenches)],
    ...(row.position === "QB" ? [
      ["EPA Advantage", rankAndValue(edgeStatText(row.matchupEdges.epa), presentation.matchupEdges.epa)],
      ["Success Advantage", rankAndValue(edgeStatText(row.matchupEdges.success), presentation.matchupEdges.success)],
    ] : []),
    ...evidence.map((column) => [
      column.detail,
      rankAndValue(formatEvidenceValue(column.key, row.research.evidence[column.key].value), presentation.evidence[column.key]),
    ]),
  ] as readonly (readonly [string, string])[];

  return (
    <section data-mobile-expanded-summary aria-label={`Expanded summary for ${row.playerName}`} className="overflow-hidden border border-slate-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-slate-200 bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-black text-slate-950 sm:text-sm">{row.playerName}</h3>
          <p className="text-[10px] font-bold uppercase text-slate-500 sm:text-[11px]">
            {row.homeAway === "away" ? "@" : "vs"} {row.opponent}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-bold uppercase tracking-[0.04em] text-slate-500 sm:text-[9px]">Projected Points</p>
          <p className="text-sm font-black tabular-nums text-slate-950 sm:text-base">{row.projectedFantasyPoints.toFixed(1)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3">
        {metrics.map(([label, value]) => <ExpandedMetric key={label} label={label} value={value} />)}
      </dl>
    </section>
  );
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
      return [`${column.detail} evidence`, `${formatEvidenceValue(column.key, raw.value)} · ${display.displayRank == null ? "N/A" : `#${display.displayRank} of ${display.poolSize}`} · ${sampleLabel(raw)}`] as const;
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
    <div data-weekly-expanded-detail className="space-y-2 border border-slate-200 bg-slate-100/70 p-1.5 text-[10px] text-slate-700 sm:space-y-3 sm:rounded-lg sm:p-3 sm:text-xs">
      <section aria-labelledby={`samples-${row.playerId}`} className="overflow-hidden border border-slate-200 bg-white sm:rounded-lg">
        <h3 id={`samples-${row.playerId}`} className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.04em] text-slate-950 sm:px-3 sm:py-2 sm:text-[11px]">Samples / evidence</h3>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
          {samples.map(([label, value], index) => (
            <div key={label} data-evidence-card className={cn("border-b px-2 py-1.5 sm:border-r sm:px-3 sm:py-2 last:border-r-0", EVIDENCE_CARD_TONES[index % EVIDENCE_CARD_TONES.length])}>
              <dt className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.04em] opacity-70">
                <CircleDot aria-hidden className={cn("h-3 w-3 shrink-0", EVIDENCE_MARKER_TONES[index % EVIDENCE_MARKER_TONES.length])} />
                {label}
              </dt>
              <dd className="mt-0.5 font-black">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby={`matchups-${row.playerId}`}>
        <h3 id={`matchups-${row.playerId}`} className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.04em] text-slate-950 sm:mb-1.5 sm:text-[11px]">Matchup details</h3>
        <div className="grid gap-1.5 md:grid-cols-3 md:gap-2">
          <EdgeDetail title="Trenches" category="trenches" edge={row.matchupEdges.trenches} metric={presentation.matchupEdges.trenches} />
          <EdgeDetail title="EPA advantage" category="epa" edge={row.matchupEdges.epa} metric={presentation.matchupEdges.epa} />
          <EdgeDetail title="Success advantage" category="success" edge={row.matchupEdges.success} metric={presentation.matchupEdges.success} />
        </div>
      </section>
      <section aria-labelledby={`projection-${row.playerId}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <h3 id={`projection-${row.playerId}`} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.05em] text-slate-950">Projection context</h3>
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

function mobileMetric(
  presentation: WeeklyResearchPresentationRow,
  key: MobileMetricKey,
  mode: WeeklyResearchDisplayMode,
): { value: string; metric?: WeeklyDisplayMetric; matchupTone?: ReturnType<typeof matchupGradeHeatTone> } {
  const { row } = presentation;
  if (key === "matchup") {
    return { value: compactMatchupLabel(row.matchupRating?.label), matchupTone: matchupGradeHeatTone(row.matchupRating?.id) };
  }
  if (key === "trenches" || key === "epa" || key === "success") {
    return { value: metricText(presentation.matchupEdges[key], mode, edgeStatText(row.matchupEdges[key])), metric: presentation.matchupEdges[key] };
  }
  if (key === "seasonPpg" || key === "last5Ppg" || key === "opponentFpaSeason" || key === "opponentFpaLast5") {
    return { value: metricText(presentation[key], mode, formatMetric(row.research[key])), metric: presentation[key] };
  }
  const metric = presentation.evidence[key];
  return { value: metricText(metric, mode, formatEvidenceValue(key, metric.rawValue)), metric };
}

function mobileLayoutStyle(metricCount: number) {
  return {
    minWidth: "100%",
    width: `${MOBILE_COLUMNS.rank + MOBILE_COLUMNS.logo + MOBILE_COLUMNS.player + MOBILE_COLUMNS.projection + (metricCount * MOBILE_COLUMNS.metric)}px`,
  };
}

function mobileGridStyle(metricCount: number) {
  return {
    ...mobileLayoutStyle(metricCount),
    gridTemplateColumns: `${MOBILE_COLUMNS.rank}px ${MOBILE_COLUMNS.logo}px ${MOBILE_COLUMNS.player}px ${MOBILE_COLUMNS.projection}px repeat(${metricCount}, ${MOBILE_COLUMNS.metric}px)`,
  };
}

function MobileHeader({ columns }: { columns: readonly MobileColumn[] }) {
  const rank = weeklyStatDefinition("rank");
  const player = weeklyStatDefinition("player");
  const projection = weeklyStatDefinition("projection");
  return (
    <div data-mobile-weekly-header role="row" className="grid h-6 items-stretch border-b border-slate-300 bg-slate-100 text-[8px] font-black uppercase tracking-[-0.02em] text-slate-600" style={mobileGridStyle(columns.length)}>
      <span role="columnheader" aria-label={rank.name} title={rank.name} data-mobile-sticky="rank" className="sticky z-20 flex items-center justify-center bg-slate-100" style={{ left: MOBILE_STICKY_LEFT.rank }}>{rank.abbreviation}</span>
      <span role="columnheader" aria-label="Team logo" title="Team logo" data-mobile-sticky="logo" className="sticky z-20 flex items-center justify-center border-l border-slate-200 bg-slate-100" style={{ left: MOBILE_STICKY_LEFT.logo }}><CircleDot aria-hidden className="h-2.5 w-2.5" /></span>
      <span role="columnheader" aria-label={player.name} title={player.name} data-mobile-sticky="last-name" className="sticky z-20 flex items-center border-l border-r border-slate-300 bg-slate-100 px-1 shadow-[2px_0_3px_rgba(15,23,42,0.12)]" style={{ left: MOBILE_STICKY_LEFT.player }}>{player.abbreviation}</span>
      <span role="columnheader" aria-label={projection.name} title={projection.name} className="flex items-center justify-center border-r border-slate-200">{projection.abbreviation}</span>
      {columns.map((column) => <span role="columnheader" aria-label={column.definition.name} title={column.definition.name} key={column.key} className="flex items-center justify-center border-r border-slate-200 last:border-r-0">{column.definition.abbreviation}</span>)}
    </div>
  );
}

function MobileRow({ presentation, displayName, columns, mode, expanded, onToggle }: {
  presentation: WeeklyResearchPresentationRow;
  displayName: string;
  columns: readonly MobileColumn[];
  mode: WeeklyResearchDisplayMode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { row } = presentation;
  return (
    <article data-mobile-weekly-row data-player-id={row.playerId} className="border-b-2 border-slate-200 bg-white last:border-b-0" style={mobileLayoutStyle(columns.length)}>
      <button
        type="button"
        aria-label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`}
        aria-expanded={expanded}
        onClick={onToggle}
        className="grid h-8 items-stretch text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
        style={mobileGridStyle(columns.length)}
      >
        <span data-mobile-sticky="rank" className="sticky z-20 flex items-center justify-center bg-white text-[11px] font-black tabular-nums text-slate-950" style={{ left: MOBILE_STICKY_LEFT.rank }}>{row.positionRank}</span>
        <span data-mobile-sticky="logo" data-team-logo={row.team.toUpperCase()} className="sticky z-20 flex items-center justify-center border-l border-slate-100 bg-white" style={{ left: MOBILE_STICKY_LEFT.logo }}>
          <TeamLogo name={row.team.toUpperCase()} logo={nflLogoUrl(row.team.toUpperCase())} className="h-4 w-4 shrink-0" />
        </span>
        <span data-mobile-sticky="last-name" className="sticky z-20 flex min-w-0 items-center border-l border-r border-slate-300 bg-white px-1 shadow-[2px_0_3px_rgba(15,23,42,0.12)]" style={{ left: MOBILE_STICKY_LEFT.player }}>
          <span data-player-name className="truncate text-[11px] font-black leading-none text-slate-950">{displayName}</span>
        </span>
        <span
          data-projected-fantasy-points={row.projectedFantasyPoints}
          className={cn("flex items-center justify-center border-r border-white/60 text-[11px] font-black tabular-nums", weeklyHeatClass(presentation.projectedFantasyPoints.tone))}
          style={weeklyHeatStyle(presentation.projectedFantasyPoints.tone)}
          data-heat-tone={presentation.projectedFantasyPoints.tone}
        >
          {row.projectedFantasyPoints.toFixed(1)}
        </span>
        {columns.map((column) => <MobileMetricCell key={column.key} {...mobileMetric(presentation, column.key, mode)} />)}
      </button>
      {expanded && (
        <div data-mobile-expanded-container className="sticky left-0 w-[calc(100vw-2rem)] space-y-1.5 border-t border-slate-300 bg-slate-50 p-1.5 sm:w-[calc(100vw-3rem)]">
          <MobileExpandedSummary presentation={presentation} />
          <Detail presentation={presentation} />
        </div>
      )}
    </article>
  );
}

function SortableHeader({
  column,
  activeSort,
  onSort,
}: {
  column: TableColumn;
  activeSort: WeeklyResearchSort;
  onSort: (key: WeeklyResearchSortKey) => void;
}) {
  const active = activeSort.key === column.key;
  const ariaSort = active ? (activeSort.direction === "asc" ? "ascending" : "descending") : "none";
  const Indicator = activeSort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      data-sort-key={column.key}
      className={cn(
        FANTASY_TABLE_HEADER_CELL,
        "sticky top-[73px] z-30 bg-slate-100 p-0 leading-tight",
        active && "bg-sky-100 text-sky-950",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          "group/sort flex min-h-10 w-full items-center gap-0.5 px-1 py-2 text-center transition-colors hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500",
          column.align === "left" ? "justify-start text-left" : "justify-center",
        )}
      >
        <span>{column.label}</span>
        <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden>
          <Indicator className={cn("h-3 w-3", active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-30")} />
        </span>
      </button>
    </th>
  );
}

export default function WeeklyFantasyRankingsTable({ rows, displayMode }: { rows: readonly WeeklyFantasyResearchRow[]; displayMode: WeeklyResearchDisplayMode }) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [userSort, setUserSort] = useState<WeeklyResearchSort | null>(null);
  const compact = useIsCompactLayout();
  const presentationRows = useMemo(() => prepareWeeklyResearchPresentation(rows), [rows]);
  const activeSort = userSort ?? CANONICAL_WEEKLY_SORT;
  const sortedPresentationRows = useMemo(
    () => sortWeeklyResearchPresentation(presentationRows, activeSort, displayMode),
    [activeSort, displayMode, presentationRows],
  );
  const position = rows[0]?.position ?? "QB";
  const evidence = EVIDENCE_COLUMNS[position];
  const columns: readonly TableColumn[] = [
    ...WEEKLY_COMMON_COLUMNS,
    ...EDGE_COLUMNS[position],
    ...evidence.map((column) => ({ key: column.key, label: column.desktop })),
  ];
  const mobileColumns: readonly MobileColumn[] = [
    ...MOBILE_COMMON_COLUMNS,
    ...MOBILE_EDGE_COLUMNS[position],
    ...evidence.map((column) => ({ key: column.key, definition: weeklyStatDefinition(column.key) })),
  ];
  const compactNames = useMemo(() => mobilePlayerNames(presentationRows), [presentationRows]);
  const columnCount = columns.length;
  const handleSort = (key: WeeklyResearchSortKey) => {
    setUserSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: defaultWeeklySortDirection(key, displayMode) });
    setExpandedPlayerId(null);
  };

  return (
    <section aria-label={`${position} weekly fantasy research board`} data-display-mode={displayMode} className={cn(FANTASY_TABLE_SHELL, "overflow-visible")}>
      {compact ? (
        <div data-weekly-mobile-layout data-mobile-table-scroll className="overflow-x-auto overscroll-x-contain">
          <MobileHeader columns={mobileColumns} />
          {presentationRows.map((presentation) => {
            const expanded = expandedPlayerId === presentation.row.playerId;
            return <MobileRow key={presentation.row.playerId} presentation={presentation} displayName={compactNames.get(presentation.row.playerId) ?? mobilePlayerLastName(presentation.row.playerName)} columns={mobileColumns} mode={displayMode} expanded={expanded} onToggle={() => setExpandedPlayerId(expanded ? null : presentation.row.playerId)} />;
          })}
        </div>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[10px] text-slate-700">
          <caption className="sr-only">Canonical weekly fantasy projections with display-only research context</caption>
          <colgroup><col className="w-9" /><col className="w-44" /><col className="w-[62px]" /><col className="w-16" />{Array.from({ length: columnCount - 4 }, (_, index) => <col key={index} />)}</colgroup>
          <thead data-weekly-desktop-sticky-header className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">
            <tr>
              {columns.map((column) => <SortableHeader key={column.key} column={column} activeSort={activeSort} onSort={handleSort} />)}
            </tr>
          </thead>
          <tbody>
            {sortedPresentationRows.map((presentation) => {
              const { row } = presentation;
              const expanded = expandedPlayerId === row.playerId;
              return (
                <Fragment key={row.playerId}>
                  <tr data-player-id={row.playerId} className="group bg-white hover:bg-slate-50">
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center text-xs font-black tabular-nums text-slate-950")}>{row.positionRank}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-1")}><div className="flex min-w-0 items-center gap-1"><div className="min-w-0 flex-1"><FantasyPlayerIdentity player={row.playerName} team={row.team} compact wrapName showTeamAbbreviation={false} /></div><FantasyExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`} expanded={expanded} onClick={() => setExpandedPlayerId(expanded ? null : row.playerId)} /></div></td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "whitespace-nowrap px-1 py-2 text-left text-xs font-black uppercase text-slate-950")}><span className="mr-1 lowercase text-slate-500">{row.homeAway === "away" ? "@" : "vs"}</span>{row.opponent}</td>
                    <MetricCellWithProjectionData metric={presentation.projectedFantasyPoints} value={row.projectedFantasyPoints} />
                    <MetricCell metric={presentation.seasonPpg} mode={displayMode} statValue={formatMetric(row.research.seasonPpg)} />
                    <MetricCell metric={presentation.last5Ppg} mode={displayMode} statValue={formatMetric(row.research.last5Ppg)} />
                    <td data-matchup-grade-cell className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center font-black", matchupGradeHeatClass(row.matchupRating?.id))} style={weeklyHeatStyle(matchupGradeHeatTone(row.matchupRating?.id))} data-heat-tone={matchupGradeHeatTone(row.matchupRating?.id)}>{row.matchupRating?.label ?? "N/A"}</td>
                    <MetricCell metric={presentation.opponentFpaSeason} mode={displayMode} statValue={formatMetric(row.research.opponentFpaSeason)} />
                    <MetricCell metric={presentation.opponentFpaLast5} mode={displayMode} statValue={formatMetric(row.research.opponentFpaLast5)} />
                    {EDGE_COLUMNS[position].map((column) => {
                      const key = column.key as EdgeKey;
                      return <MetricCell key={key} metric={presentation.matchupEdges[key]} mode={displayMode} statValue={edgeStatText(row.matchupEdges[key])} />;
                    })}
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

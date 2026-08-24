import { Fragment, useState, type ReactNode } from "react";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyExpandControl,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import type { WeeklyFantasyResearchRow } from "@/lib/fantasy/weekly/researchJoin";
import useIsCompactLayout from "@/hooks/useIsCompactLayout";
import type { WeeklyResearchMetric } from "@/lib/fantasy/weekly/researchContext";
import type { NflMatchupEdge } from "@/lib/nfl/matchupEdges";
import { cn } from "@/lib/utils";

type EvidenceKey = "touches" | "redZoneTouches" | "yardsPerCarry" | "receivingTargets" | "targetShare" | "airYardsPerGame" | "targetsPerGame";
type EvidenceColumn = { key: EvidenceKey; desktop: string; mobile: string };

const COMMON_HEADERS = [
  "RK", "PLAYER", "PROJ. PTS", "SEASON PPG", "L5 PPG", "MATCHUP GRADE",
  "OPP FPA SEASON", "OPP FPA L5", "TRENCHES", "EPA ADV.", "SUCCESS ADV.",
] as const;

const EVIDENCE_COLUMNS: Record<WeeklyFantasyResearchRow["position"], readonly EvidenceColumn[]> = {
  QB: [],
  RB: [
    { key: "touches", desktop: "TOUCHES RK", mobile: "Touches" },
    { key: "redZoneTouches", desktop: "RZ TOUCHES RK", mobile: "RZ Touches" },
    { key: "yardsPerCarry", desktop: "YPC RK", mobile: "YPC" },
    { key: "receivingTargets", desktop: "REC TARGETS RK", mobile: "Rec Targets" },
  ],
  WR: [
    { key: "targetShare", desktop: "TARGET % RK", mobile: "Target %" },
    { key: "airYardsPerGame", desktop: "AIR YARDS RK", mobile: "Air Yards" },
    { key: "targetsPerGame", desktop: "TARGETS/G RK", mobile: "Targets/G" },
  ],
  TE: [
    { key: "targetShare", desktop: "TARGET % RK", mobile: "Target %" },
    { key: "airYardsPerGame", desktop: "AIR YARDS RK", mobile: "Air Yards" },
    { key: "targetsPerGame", desktop: "TARGETS/G RK", mobile: "Targets/G" },
  ],
};

function displayOpponent(row: WeeklyFantasyResearchRow): string {
  const prefix = row.homeAway === "away" ? "@" : row.homeAway === "neutral" ? "N" : "vs";
  return `${prefix} ${row.opponent.toUpperCase()}`;
}

function formatMetric(metric: WeeklyResearchMetric, digits = 1): string {
  return metric.value == null ? "N/A" : metric.value.toFixed(digits);
}

function rankText(metric: WeeklyResearchMetric): string {
  return metric.rank == null ? "N/A" : `#${metric.rank}`;
}

function rankTone(metric: WeeklyResearchMetric): string {
  if (metric.rank == null || metric.poolSize <= 0) return "bg-slate-50 text-slate-500";
  const percentile = metric.rank / metric.poolSize;
  if (percentile <= 1 / 3) return "bg-emerald-50 text-emerald-800";
  if (percentile <= 2 / 3) return "bg-slate-50 text-slate-700";
  return "bg-rose-50 text-rose-800";
}

function edgeTone(edge: NflMatchupEdge): string {
  if (edge.score == null) return "bg-slate-50 text-slate-500";
  if (edge.score > 8) return "bg-emerald-50 text-emerald-800";
  if (edge.score < -8) return "bg-rose-50 text-rose-800";
  return "bg-slate-50 text-slate-700";
}

function edgeText(edge: NflMatchupEdge): string {
  if (edge.score == null) return "N/A";
  const rounded = Math.round(edge.score);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function sampleLabel(metric: WeeklyResearchMetric): string {
  if (metric.sampleSize === 0) return "No eligible sample";
  if (metric.sampleSeason != null) return `${metric.sampleSeason} · ${metric.sampleSize} game${metric.sampleSize === 1 ? "" : "s"}`;
  return `${metric.sampleSize} games across seasons`;
}

function MetricCell({ metric, children }: { metric: WeeklyResearchMetric; children?: ReactNode }) {
  return (
    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-2 text-center font-bold tabular-nums", rankTone(metric))}>
      {children ?? formatMetric(metric)}
    </td>
  );
}

function EdgeCell({ edge }: { edge: NflMatchupEdge }) {
  return <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-2 text-center font-black tabular-nums", edgeTone(edge))}>{edgeText(edge)}</td>;
}

function MobileMetric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cn("min-w-0 rounded-md px-1.5 py-1.5", tone ?? "bg-slate-50 text-slate-800")}>
      <div className="truncate text-[8px] font-bold uppercase tracking-[0.04em] opacity-70">{label}</div>
      <div className="mt-0.5 text-xs font-black tabular-nums">{value}</div>
    </div>
  );
}

function EdgeDetail({ title, edge }: { title: string; edge: NflMatchupEdge }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <p className="font-bold text-slate-900">{title}: {edgeText(edge)}</p>
      <p className="mt-1 text-slate-600">{edge.offense ? `${edge.offense.label}: ${edge.offense.formattedValue} (#${edge.offense.rank})` : "Offense: N/A"}</p>
      <p className="text-slate-600">{edge.defense ? `${edge.defense.label}: ${edge.defense.formattedValue} (#${edge.defense.rank})` : "Defense: N/A"}</p>
      <p className="mt-1 text-[10px] text-slate-500">{edge.sampleLabel} · {edge.source}</p>
    </div>
  );
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function Detail({ row }: { row: WeeklyFantasyResearchRow }) {
  const evidence = EVIDENCE_COLUMNS[row.position];
  return (
    <div className="space-y-3 text-xs text-slate-700">
      <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="text-slate-500">Season PPG sample:</span> {sampleLabel(row.research.seasonPpg)}</p>
        <p><span className="text-slate-500">L5 PPG sample:</span> {sampleLabel(row.research.last5Ppg)}</p>
        <p><span className="text-slate-500">FPA season sample:</span> {sampleLabel(row.research.opponentFpaSeason)}</p>
        <p><span className="text-slate-500">FPA L5 sample:</span> {sampleLabel(row.research.opponentFpaLast5)}</p>
        {evidence.map((column) => (
          <p key={column.key}><span className="text-slate-500">{column.mobile}:</span> {rankText(row.research.evidence[column.key])} · {formatMetric(row.research.evidence[column.key], column.key === "targetShare" ? 3 : 1)}</p>
        ))}
      </div>
      <div>
        <p className="mb-1.5 font-bold text-slate-900">Underlying matchup components</p>
        <div className="grid gap-2 md:grid-cols-3">
        <EdgeDetail title="Trenches" edge={row.matchupEdges.trenches} />
        <EdgeDetail title="EPA advantage" edge={row.matchupEdges.epa} />
        <EdgeDetail title="Success advantage" edge={row.matchupEdges.success} />
        </div>
      </div>
      <div className="grid gap-x-5 gap-y-1.5 border-t border-slate-200 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="text-slate-500">Baseline pts:</span> {row.baselineFantasyPoints.toFixed(1)}</p>
        <p><span className="text-slate-500">Usage adjustment:</span> {row.position === "QB" ? "Not used" : row.residualActivated ? signed(row.components.usageAdjustment) : "Not active yet"}</p>
        <p><span className="text-slate-500">Scoring environment:</span> {row.context.scoringEnvironment.marketContextAvailable ? signed(row.components.scoringEnvironmentAdjustment) : "No market data"}</p>
        <p><span className="text-slate-500">Projection FPA adjustment:</span> {row.context.opponentFpa.fallbackReason === "missing-both-neutral" ? "No matchup data" : signed(row.components.opponentFpaAdjustment)}</p>
        <p><span className="text-slate-500">Final projected pts:</span> {row.projectedFantasyPoints.toFixed(1)}</p>
        <p className="sm:col-span-2 lg:col-span-3"><span className="text-slate-500">Scoring:</span> JKB Full PPR · Pregame information only; research context does not alter the projection or rank.</p>
      </div>
    </div>
  );
}

function MobileCard({ row, expanded, onToggle }: { row: WeeklyFantasyResearchRow; expanded: boolean; onToggle: () => void }) {
  const evidence = EVIDENCE_COLUMNS[row.position];
  return (
    <article className="border-b border-slate-200 bg-white px-3 py-2.5 last:border-b-0">
      <div className="grid grid-cols-[32px_minmax(0,1fr)_64px] items-center gap-2">
        <div className="text-center text-base font-black tabular-nums text-slate-950">{row.positionRank}</div>
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1"><FantasyPlayerIdentity player={row.playerName} team={row.team} /></div>
          <FantasyExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`} expanded={expanded} onClick={onToggle} />
        </div>
        <MobileMetric label="Proj Pts" value={row.projectedFantasyPoints.toFixed(1)} tone="bg-sky-100 text-sky-950" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <MobileMetric label="Opponent" value={displayOpponent(row)} />
        <MobileMetric label="Matchup Grade" value={row.matchupRating?.label ?? "N/A"} tone={row.matchupRating?.badgeClass} />
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5" aria-label="Production">
        <MobileMetric label="Season PPG" value={formatMetric(row.research.seasonPpg)} tone={rankTone(row.research.seasonPpg)} />
        <MobileMetric label="L5 PPG" value={formatMetric(row.research.last5Ppg)} tone={rankTone(row.research.last5Ppg)} />
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5" aria-label="Opponent fantasy points allowed">
        <MobileMetric label="FPA Season" value={formatMetric(row.research.opponentFpaSeason)} tone={rankTone(row.research.opponentFpaSeason)} />
        <MobileMetric label="FPA L5" value={formatMetric(row.research.opponentFpaLast5)} tone={rankTone(row.research.opponentFpaLast5)} />
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5" aria-label="Matchup advantages">
        <MobileMetric label="Trenches" value={edgeText(row.matchupEdges.trenches)} tone={edgeTone(row.matchupEdges.trenches)} />
        <MobileMetric label="EPA Adv" value={edgeText(row.matchupEdges.epa)} tone={edgeTone(row.matchupEdges.epa)} />
        <MobileMetric label="Success Adv" value={edgeText(row.matchupEdges.success)} tone={edgeTone(row.matchupEdges.success)} />
      </div>
      {evidence.length > 0 && (
        <div className={cn("mt-1.5 grid gap-1.5", evidence.length === 4 ? "grid-cols-4" : "grid-cols-3")} aria-label="Position evidence">
          {evidence.map((column) => <MobileMetric key={column.key} label={column.mobile} value={rankText(row.research.evidence[column.key])} tone={rankTone(row.research.evidence[column.key])} />)}
        </div>
      )}
      {expanded && <div className="mt-3 border-t border-slate-200 pt-3"><Detail row={row} /></div>}
    </article>
  );
}

export default function WeeklyFantasyRankingsTable({ rows }: { rows: readonly WeeklyFantasyResearchRow[] }) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const compact = useIsCompactLayout();
  const position = rows[0]?.position ?? "QB";
  const evidence = EVIDENCE_COLUMNS[position];
  const columnCount = COMMON_HEADERS.length + evidence.length;

  return (
    <section aria-label={`${position} weekly fantasy research board`} className={FANTASY_TABLE_SHELL}>
      {compact ? (
        <div>
          {rows.map((row) => <MobileCard key={row.playerId} row={row} expanded={expandedPlayerId === row.playerId} onToggle={() => setExpandedPlayerId(expandedPlayerId === row.playerId ? null : row.playerId)} />)}
        </div>
      ) : (
        <div>
          <table className="w-full table-fixed border-collapse text-left text-[10px] text-slate-700">
          <caption className="sr-only">Canonical weekly fantasy projections with display-only research context</caption>
          <colgroup><col className="w-10" /><col className="w-40" />{Array.from({ length: columnCount - 2 }, (_, index) => <col key={index} />)}</colgroup>
          <thead className="bg-slate-100 text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">
            <tr>
              {COMMON_HEADERS.map((header) => <th key={header} scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "px-1 py-2 text-center leading-tight", header === "PLAYER" && "text-left", header === "PROJ. PTS" && "bg-sky-100 text-sky-950")}>{header}</th>)}
              {evidence.map((column) => <th key={column.key} scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "px-1 py-2 text-center leading-tight")}>{column.desktop}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = expandedPlayerId === row.playerId;
              return (
                <Fragment key={row.playerId}>
                  <tr className="group bg-white hover:bg-slate-50">
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center text-xs font-black tabular-nums text-slate-950")}>{row.positionRank}</td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-1")}><div className="flex min-w-0 items-center gap-1"><div className="min-w-0 flex-1"><FantasyPlayerIdentity player={row.playerName} team={row.team} compact /></div><FantasyExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`} expanded={expanded} onClick={() => setExpandedPlayerId(expanded ? null : row.playerId)} /></div></td>
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "bg-sky-50 px-1 py-2 text-center text-xs font-black tabular-nums text-sky-950")}>{row.projectedFantasyPoints.toFixed(1)}</td>
                    <MetricCell metric={row.research.seasonPpg} />
                    <MetricCell metric={row.research.last5Ppg} />
                    <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-2 text-center")}><span className={cn("inline-flex rounded border px-1.5 py-0.5 font-bold", row.matchupRating?.badgeClass ?? "border-slate-200 bg-slate-50 text-slate-500")}>{row.matchupRating?.label ?? "N/A"}</span><span className="mt-0.5 block text-[9px] font-semibold text-slate-500">{displayOpponent(row)}</span></td>
                    <MetricCell metric={row.research.opponentFpaSeason} />
                    <MetricCell metric={row.research.opponentFpaLast5} />
                    <EdgeCell edge={row.matchupEdges.trenches} />
                    <EdgeCell edge={row.matchupEdges.epa} />
                    <EdgeCell edge={row.matchupEdges.success} />
                    {evidence.map((column) => <MetricCell key={column.key} metric={row.research.evidence[column.key]}>{rankText(row.research.evidence[column.key])}</MetricCell>)}
                  </tr>
                  {expanded && <tr className="bg-slate-50"><td colSpan={columnCount} className="border-b border-slate-200 px-4 py-3"><Detail row={row} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

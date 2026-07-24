import { useState, type ReactNode } from "react";
import { useJkbTrendRankings, type JkbTrendRanking } from "@/hooks/useJkbTrendRankings";
import { normalizePlayerKey, type PgaHistoryResult, type PgaTournamentModelRow } from "@/lib/pga/historyModel";
import { percentileHeatClass } from "@/lib/pga/pgaHeatColors";

type Props = {
  rows: PgaTournamentModelRow[];
  statView: "percentile" | "raw";
  isMajor: boolean;
  eventLabel: string;
};

const RECENT_START_COUNT = 5;
const statKeys = ["sgTotal", "sgApp", "sgPutt", "sgAtG", "drivingAccuracy", "drivingDistance"] as const;
const statLabels = ["SG Total", "SG App", "SG Putt", "SG ARG", "Drive Acc.", "Drive Dist."];

export default function PgaHistoryModelTable({ rows, statView, isMajor, eventLabel }: Props) {
  const { payload: trendPayload, rankingMap, error: trendError } = useJkbTrendRankings();
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  return (
    <>
      {trendPayload?.generatedAt ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[10px] text-cyan-950">
          <span><strong>JKB Trend Rank:</strong> trailing 20 adjusted rounds versus the available tracked-player cohort in validated {availableTrendTours(trendPayload.sources)} data, not complete tournament fields.</span>
          <span>Updated {new Date(trendPayload.generatedAt).toLocaleDateString()}</span>
        </div>
      ) : trendError ? (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">JKB Trend Rank is temporarily unavailable; the previous finish-based trend is shown.</div>
      ) : null}

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full min-w-[1180px] table-fixed text-center text-[12px] leading-tight">
          <DesktopColumnWidths isMajor={isMajor} />
          <thead>
            <tr className="bg-slate-900 text-[11px] font-black uppercase tracking-[0.08em] text-white">
              <th rowSpan={2} className="px-1 py-2.5">#</th>
              <th rowSpan={2} className="px-2 py-2.5 text-left">Player</th>
              <th rowSpan={2} className="px-1 py-2.5">Score</th>
              <Group count={6}>Player Stats</Group>
              <Group count={2}>Model</Group>
              <Group count={1}>Last 5 Starts</Group>
              {isMajor ? (
                <>
                  <Group count={1}>Specific Major</Group>
                  <Group count={1}>Last 8 Majors</Group>
                </>
              ) : (
                <Group count={1}>{eventLabel} History</Group>
              )}
            </tr>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase text-slate-600">
              {statLabels.map((label, index) => (
                <th key={label} className={`${index === 0 ? "border-l border-slate-200" : ""} px-0.5 py-2`}>
                  {compactStatLabel(label)}
                </th>
              ))}
              <th className="border-l border-slate-200 px-0.5 py-2">Fit</th>
              <th className="px-0.5 py-2">JKB Trend</th>
              <th className="border-l border-slate-200 px-1 py-2 text-slate-500">Latest → Older</th>
              {isMajor ? (
                <>
                  <th className="border-l border-slate-200 px-1 py-2 text-slate-500">Latest 4</th>
                  <th className="border-l border-slate-200 px-1 py-2 text-slate-500">Latest 8</th>
                </>
              ) : (
                <th className="border-l border-slate-200 px-1 py-2 text-slate-500">Latest 4</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <DesktopRow
                key={row.player}
                row={row}
                index={index}
                statView={statView}
                isMajor={isMajor}
                trendRanking={rankingMap.get(normalizePlayerKey(row.player)) ?? null}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 lg:hidden">
        {rows.map((row) => {
          const isExpanded = expandedPlayer === row.player;
          return (
            <MobileCard
              key={row.player}
              row={row}
              statView={statView}
              isMajor={isMajor}
              eventLabel={eventLabel}
              trendRanking={rankingMap.get(normalizePlayerKey(row.player)) ?? null}
              expanded={isExpanded}
              onToggle={() => setExpandedPlayer(isExpanded ? null : row.player)}
            />
          );
        })}
      </div>
    </>
  );
}

function DesktopColumnWidths({ isMajor }: { isMajor: boolean }) {
  return (
    <colgroup>
      <col style={{ width: "34px" }} />
      <col data-testid="pga-player-column" style={{ width: "210px", minWidth: "210px" }} />
      <col style={{ width: "64px" }} />
      {statKeys.map((key) => <col key={key} style={{ width: "58px" }} />)}
      <col style={{ width: "58px" }} />
      <col style={{ width: "74px" }} />
      <col style={{ width: isMajor ? "220px" : "240px" }} />
      <col style={{ width: isMajor ? "150px" : "250px" }} />
      {isMajor ? <col style={{ width: "200px" }} /> : null}
    </colgroup>
  );
}

function DesktopRow({ row, index, statView, isMajor, trendRanking }: {
  row: PgaTournamentModelRow;
  index: number;
  statView: "percentile" | "raw";
  isMajor: boolean;
  trendRanking: JkbTrendRanking | null;
}) {
  const bg = index % 2 ? "bg-slate-50" : "bg-white";

  return (
    <tr className={`${bg} hover:bg-emerald-50/40`}>
      <td className="border-b border-slate-100 px-1 py-2.5 text-[11px] font-bold tabular-nums text-slate-500">{row.modelRank}</td>
      <td className="whitespace-nowrap border-b border-r border-slate-100 px-2 py-2.5 text-left text-[13px] font-black text-slate-900" title={row.player}>{row.player}</td>
      <td className="border-b border-r border-slate-100 px-1 py-2.5"><Score value={row.modelScore} /></td>

      {statKeys.map((key, statIndex) => (
        <td key={key} className={`${statIndex === 0 ? "border-l" : ""} border-b border-slate-100 p-0`}>
          {statView === "percentile"
            ? <Percentile value={row.displayPercentiles[key] ?? null} />
            : <Raw value={raw(row, key)} />}
        </td>
      ))}

      <td className="border-b border-l border-slate-100 p-0"><Percentile value={row.courseFit} /></td>
      <td className="border-b border-slate-100 px-1 py-1.5"><Trend ranking={trendRanking} direction={row.trend.direction} label={row.trend.label} /></td>
      <td className="border-b border-l border-slate-100 px-1 py-1.5"><FinishStrip values={row.recentResults} count={RECENT_START_COUNT} trendStyle /></td>

      {isMajor ? (
        <>
          <td className="border-b border-l border-slate-100 px-1 py-1.5"><FinishStrip values={row.specificMajorResults} count={4} /></td>
          <td className="border-b border-l border-slate-100 px-1 py-1.5"><FinishStrip values={row.allMajorResults} count={8} dense /></td>
        </>
      ) : (
        <td className="border-b border-l border-slate-100 px-1 py-1.5"><FinishStrip values={row.eventResults} count={4} /></td>
      )}
    </tr>
  );
}

function MobileCard({ row, statView, isMajor, eventLabel, trendRanking, expanded, onToggle }: {
  row: PgaTournamentModelRow;
  statView: "percentile" | "raw";
  isMajor: boolean;
  eventLabel: string;
  trendRanking: JkbTrendRanking | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelId = `pga-player-details-${normalizePlayerKey(row.player)}`;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 px-3 py-3 text-left"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="w-8 shrink-0 text-[11px] font-black tabular-nums text-slate-500">#{row.modelRank}</span>
        <span className="min-w-0 flex-1 whitespace-normal text-[14px] font-black leading-tight text-slate-900">{row.player}</span>
        <Score value={row.modelScore} />
        <span aria-hidden="true" className="w-4 shrink-0 text-center text-sm font-black text-slate-500">{expanded ? "▲" : "▼"}</span>
        <span className="sr-only">{expanded ? "Hide details" : "View details"}</span>
      </button>

      {expanded ? (
        <div id={panelId} className="border-t border-slate-100 px-3 pb-3">
          <MobileSection title="Player Stats">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {statKeys.map((key, index) => (
                statView === "percentile"
                  ? <PercentileMetric key={key} label={statLabels[index]} value={row.displayPercentiles[key] ?? null} />
                  : <Metric key={key} label={statLabels[index]} value={raw(row, key)} />
              ))}
            </div>
          </MobileSection>

          <MobileSection title="Model">
            <div className="grid grid-cols-2 gap-2">
              <PercentileMetric label="Course Fit" value={row.courseFit} plainValue />
              <Metric label="JKB Trend" value={trendMetric(trendRanking, row.trend.label)} />
            </div>
          </MobileSection>

          <MobileSection title="Last 5 Starts">
            <FinishStrip values={row.recentResults} count={RECENT_START_COUNT} trendStyle />
          </MobileSection>

          <MobileSection title="Tournament History">
            <div className="space-y-3">
              {isMajor ? (
                <>
                  <Strip label="Specific major" values={row.specificMajorResults} count={4} />
                  <Strip label="Last 8 majors" values={row.allMajorResults} count={8} />
                </>
              ) : (
                <Strip label={`${eventLabel} history`} values={row.eventResults} count={4} />
              )}
            </div>
          </MobileSection>
        </div>
      ) : null}
    </article>
  );
}

function MobileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Group({ count, children }: { count: number; children: ReactNode }) {
  return <th colSpan={count} className="border-l border-slate-700 px-1 py-2 text-emerald-300">{children}</th>;
}

function FinishStrip({ values, count, trendStyle = false, dense = false }: {
  values: PgaHistoryResult[];
  count: number;
  trendStyle?: boolean;
  dense?: boolean;
}) {
  return (
    <div className={`grid w-full items-center gap-0.5 ${gridClass(count)}`}>
      {Array.from({ length: count }, (_, index) => (
        <Finish key={index} value={values[index]} trendStyle={trendStyle} dense={dense} />
      ))}
    </div>
  );
}

function Finish({ value, trendStyle = false, dense = false }: {
  value?: PgaHistoryResult;
  trendStyle?: boolean;
  dense?: boolean;
}) {
  if (!value) {
    return <div className="flex h-7 min-w-0 items-center justify-center text-[11px] text-slate-300">—</div>;
  }

  const position = value.finishPosition ?? 999;
  const isWin = value.madeCut && position === 1;
  const title = [value.eventName, value.season, value.finishText].filter(Boolean).join(" · ");
  const badgeClass = isWin
    ? "border-amber-500 bg-gradient-to-b from-amber-300 to-amber-400 text-amber-950 shadow-sm"
    : !value.madeCut
      ? value.status === "missed_cut"
        ? "border-slate-300 bg-slate-100 text-slate-700"
        : "border-rose-300 bg-rose-100 text-rose-900"
      : position <= 5
        ? "border-emerald-400 bg-emerald-200 text-emerald-950"
        : position <= 10
          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
          : position <= 20
            ? "border-cyan-200 bg-cyan-50 text-cyan-900"
            : position <= 40
              ? "border-slate-200 bg-white text-slate-700"
              : "border-slate-200 bg-slate-50 text-slate-600";
  const dotClass = isWin
    ? "bg-amber-400"
    : !value.madeCut
      ? "bg-red-400"
      : position <= 10
        ? "bg-emerald-500"
        : position <= 25
          ? "bg-amber-300"
          : "bg-slate-300";

  return (
    <div title={title} className="flex min-w-0 flex-col items-center justify-center gap-0.5">
      {trendStyle ? <span className={`h-1 w-1 rounded-full ${dotClass}`} /> : null}
      <span className={`flex h-6 w-full min-w-0 items-center justify-center rounded border px-0.5 font-black tabular-nums ${dense ? "text-[9px]" : "text-[11px]"} ${badgeClass}`}>
        {isWin ? "1" : value.finishText}
      </span>
    </div>
  );
}

function Percentile({ value }: { value: number | null | undefined }) {
  if (value == null) return <div className="flex h-9 items-center justify-center bg-slate-100 text-slate-400">—</div>;
  return (
    <div className={`flex h-9 items-center justify-center px-0.5 text-[13px] font-bold tabular-nums ${percentileHeatClass(value)}`}>
      {Math.round(value)}
    </div>
  );
}

function Raw({ value }: { value: string }) {
  return <div className="flex h-9 items-center justify-center px-0.5 text-[12px] font-semibold tabular-nums text-slate-800">{value}</div>;
}

function Score({ value }: { value: number }) {
  return <span className="inline-flex min-w-0 shrink-0 justify-center rounded-full bg-emerald-700 px-2 py-1 text-[12px] font-black tabular-nums text-white">{value.toFixed(1)}</span>;
}

function Trend({ ranking, direction, label }: {
  ranking: JkbTrendRanking | null;
  direction: "up" | "down" | "flat" | "unknown";
  label: string;
}) {
  if (ranking?.rank != null) {
    const sources = Object.entries(ranking.sourceCounts ?? {}).map(([tour, count]) => `${tour}: ${count}`).join(" · ");
    const title = [
      `JKB Trend Rank #${ranking.rank}`,
      `Recent 20: ${signed(ranking.recent20)}`,
      `Vs baseline: ${signed(ranking.vsBaseline)}`,
      `${ranking.roundsUsed} rounds`,
      ranking.confidence === "provisional" ? "Provisional sample" : "Official sample",
      sources,
    ].filter(Boolean).join(" · ");
    return (
      <div title={title} className="flex flex-col items-center leading-none">
        <span className="text-[13px] font-black tabular-nums text-cyan-800">#{ranking.rank}{ranking.confidence === "provisional" ? "*" : ""}</span>
        <span className={`mt-0.5 text-[11px] font-bold tabular-nums ${(ranking.vsBaseline ?? 0) > 0.15 ? "text-emerald-700" : (ranking.vsBaseline ?? 0) < -0.15 ? "text-rose-700" : "text-slate-600"}`}>
          {signed(ranking.recent20)}
        </span>
      </div>
    );
  }

  const icon = direction === "up" ? "↑" : direction === "down" ? "↓" : direction === "flat" ? "→" : "";
  const className = direction === "up" ? "text-emerald-700" : direction === "down" ? "text-rose-700" : "text-slate-600";
  return <span className={`whitespace-nowrap text-[12px] font-black ${className}`}>{icon} {label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-white px-2 py-2"><div className="text-[10px] font-black uppercase text-slate-500">{label}</div><div className="text-[13px] font-black tabular-nums">{value}</div></div>;
}

function PercentileMetric({ label, value, plainValue = false }: { label: string; value: number | null | undefined; plainValue?: boolean }) {
  const className = value == null ? "pga-heat-missing bg-slate-100 text-slate-500" : percentileHeatClass(value);
  const display = value == null ? "—" : plainValue ? String(Math.round(value)) : pct(value);
  return (
    <div className={`rounded-lg border border-white/70 px-2 py-2 font-bold tabular-nums ${className}`}>
      <div className="text-[10px] font-black uppercase opacity-75">{label}</div>
      <div className="text-[13px] font-black">{display}</div>
    </div>
  );
}

function Strip({ label, values, count, trendStyle = false }: {
  label: string;
  values: PgaHistoryResult[];
  count: number;
  trendStyle?: boolean;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1 text-[9px] font-black uppercase text-slate-400">{label}</div>
      <FinishStrip values={values} count={count} trendStyle={trendStyle} dense={count === 8} />
    </div>
  );
}

function gridClass(count: number) {
  if (count === 8) return "grid-cols-8";
  if (count === 5) return "grid-cols-5";
  return "grid-cols-4";
}

function compactStatLabel(label: string) {
  if (label === "Drive Acc.") return <>Drv<br />Acc</>;
  if (label === "Drive Dist.") return <>Drv<br />Dist</>;
  return label.replace("SG ", "");
}

function raw(row: PgaTournamentModelRow, key: typeof statKeys[number]) {
  const value = key === "drivingDistance" ? row.drivingDistance : row[key];
  if (value == null) return "—";
  if (key === "drivingAccuracy") return `${value.toFixed(1)}%`;
  if (key === "drivingDistance") return value.toFixed(1);
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function pct(value: number | null) {
  return value == null ? "—" : `${Math.round(value)}th`;
}

function signed(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function trendMetric(ranking: JkbTrendRanking | null, fallback: string) {
  if (ranking?.rank == null) return fallback;
  return `#${ranking.rank}${ranking.confidence === "provisional" ? "*" : ""} · ${signed(ranking.recent20)}`;
}

function availableTrendTours(sources: Record<string, { status?: string }> | undefined) {
  const available = Object.entries(sources ?? {}).filter(([, source]) => source.status === "available").map(([tour]) => tour);
  return available.length ? available.join("/") : "available tour";
}

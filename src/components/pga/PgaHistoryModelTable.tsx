import type { ReactNode } from "react";
import type { PgaHistoryResult, PgaTournamentModelRow } from "@/lib/pga/historyModel";

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
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full table-fixed text-center text-[9px] leading-tight">
          <DesktopColumnWidths isMajor={isMajor} />
          <thead>
            <tr className="bg-slate-900 font-black uppercase tracking-[0.08em] text-white">
              <th rowSpan={2} className="px-1 py-2">#</th>
              <th rowSpan={2} className="px-2 py-2 text-left">Player</th>
              <th rowSpan={2} className="px-1 py-2">Score</th>
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
            <tr className="border-b border-slate-200 bg-slate-50 font-black uppercase text-slate-500">
              {statLabels.map((label, index) => (
                <th key={label} className={`${index === 0 ? "border-l border-slate-200" : ""} px-0.5 py-2`}>
                  {compactStatLabel(label)}
                </th>
              ))}
              <th className="border-l border-slate-200 px-0.5 py-2">Fit</th>
              <th className="px-0.5 py-2">Trend</th>
              <th className="border-l border-slate-200 px-1 py-2 text-[8px] text-slate-400">Latest → Older</th>
              {isMajor ? (
                <>
                  <th className="border-l border-slate-200 px-1 py-2 text-[8px] text-slate-400">Latest 4</th>
                  <th className="border-l border-slate-200 px-1 py-2 text-[8px] text-slate-400">Latest 8</th>
                </>
              ) : (
                <th className="border-l border-slate-200 px-1 py-2 text-[8px] text-slate-400">Latest 4</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <DesktopRow key={row.player} row={row} index={index} statView={statView} isMajor={isMajor} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <MobileCard key={row.player} row={row} statView={statView} isMajor={isMajor} eventLabel={eventLabel} />
        ))}
      </div>
    </>
  );
}

function DesktopColumnWidths({ isMajor }: { isMajor: boolean }) {
  return (
    <colgroup>
      <col style={{ width: "2.5%" }} />
      <col style={{ width: "11.5%" }} />
      <col style={{ width: "5%" }} />
      {statKeys.map((key) => <col key={key} style={{ width: "4.6%" }} />)}
      <col style={{ width: "4.5%" }} />
      <col style={{ width: "5.5%" }} />
      <col style={{ width: isMajor ? "18%" : "21%" }} />
      <col style={{ width: isMajor ? "11%" : "22.4%" }} />
      {isMajor ? <col style={{ width: "14.4%" }} /> : null}
    </colgroup>
  );
}

function DesktopRow({ row, index, statView, isMajor }: {
  row: PgaTournamentModelRow;
  index: number;
  statView: "percentile" | "raw";
  isMajor: boolean;
}) {
  const bg = index % 2 ? "bg-slate-50" : "bg-white";

  return (
    <tr className={`${bg} hover:bg-emerald-50/40`}>
      <td className="border-b border-slate-100 px-1 py-1.5 font-bold text-slate-400">{row.modelRank}</td>
      <td className="truncate border-b border-r border-slate-100 px-2 py-1.5 text-left font-black text-slate-900" title={row.player}>{row.player}</td>
      <td className="border-b border-r border-slate-100 px-1 py-1.5"><Score value={row.modelScore} /></td>

      {statKeys.map((key, statIndex) => (
        <td key={key} className={`${statIndex === 0 ? "border-l" : ""} border-b border-slate-100 p-0`}>
          {statView === "percentile"
            ? <Percentile value={row.displayPercentiles[key] ?? null} />
            : <Raw value={raw(row, key)} />}
        </td>
      ))}

      <td className="border-b border-l border-slate-100 p-0"><Percentile value={row.courseFit} /></td>
      <td className="border-b border-slate-100 px-1 py-1.5"><Trend direction={row.trend.direction} label={row.trend.label} /></td>
      <td className="border-b border-l border-slate-100 px-1 py-1"><FinishStrip values={row.recentResults} count={RECENT_START_COUNT} trendStyle /></td>

      {isMajor ? (
        <>
          <td className="border-b border-l border-slate-100 px-1 py-1"><FinishStrip values={row.specificMajorResults} count={4} /></td>
          <td className="border-b border-l border-slate-100 px-1 py-1"><FinishStrip values={row.allMajorResults} count={8} dense /></td>
        </>
      ) : (
        <td className="border-b border-l border-slate-100 px-1 py-1"><FinishStrip values={row.eventResults} count={4} /></td>
      )}
    </tr>
  );
}

function MobileCard({ row, statView, isMajor, eventLabel }: {
  row: PgaTournamentModelRow;
  statView: "percentile" | "raw";
  isMajor: boolean;
  eventLabel: string;
}) {
  return (
    <article className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex justify-between gap-3">
        <div>
          <div className="text-[10px] font-black text-slate-400">#{row.modelRank}</div>
          <div className="font-black">{row.player}</div>
        </div>
        <Score value={row.modelScore} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {statKeys.map((key, index) => (
          <Metric key={key} label={statLabels[index]} value={statView === "percentile" ? pct(row.displayPercentiles[key] ?? null) : raw(row, key)} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Course Fit" value={row.courseFit == null ? "—" : String(Math.round(row.courseFit))} />
        <Metric label="Trend" value={row.trend.label} />
      </div>

      <Strip label="Last 5 Starts" values={row.recentResults} count={RECENT_START_COUNT} trendStyle />

      <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-bold">Tournament history</summary>
        <div className="mt-3 space-y-3">
          {isMajor ? (
            <>
              <Strip label="Specific major" values={row.specificMajorResults} count={4} />
              <Strip label="Last 8 majors" values={row.allMajorResults} count={8} />
            </>
          ) : (
            <Strip label={`${eventLabel} history`} values={row.eventResults} count={4} />
          )}
        </div>
      </details>
    </article>
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
    return <div className="flex h-7 min-w-0 items-center justify-center text-[8px] text-slate-300">—</div>;
  }

  const position = value.finishPosition ?? 999;
  const isWin = value.madeCut && position === 1;
  const title = [value.eventName, value.season, value.finishText].filter(Boolean).join(" · ");
  const badgeClass = isWin
    ? "border-amber-500 bg-gradient-to-b from-amber-300 to-amber-400 text-amber-950 shadow-sm"
    : !value.madeCut
      ? value.status === "missed_cut"
        ? "border-slate-300 bg-slate-100 text-slate-600"
        : "border-red-300 bg-red-100 text-red-700"
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
      <span className={`flex h-5 w-full min-w-0 items-center justify-center rounded border px-0.5 font-black ${dense ? "text-[7px]" : "text-[8px]"} ${badgeClass}`}>
        {isWin ? "1" : value.finishText}
      </span>
    </div>
  );
}

function Percentile({ value }: { value: number | null | undefined }) {
  if (value == null) return <div className="flex h-8 items-center justify-center text-slate-300">—</div>;
  const bg = value >= 75 ? "#166534" : value >= 50 ? "#bbf7d0" : value <= 25 ? "#fecaca" : "#f8fafc";
  const color = value >= 75 ? "white" : value <= 25 ? "#7f1d1d" : "#052e16";
  return <div className="flex h-8 items-center justify-center px-0.5 font-black" style={{ backgroundColor: bg, color }}>{Math.round(value)}</div>;
}

function Raw({ value }: { value: string }) {
  return <div className="flex h-8 items-center justify-center px-0.5 font-bold text-slate-700">{value}</div>;
}

function Score({ value }: { value: number }) {
  return <span className="inline-flex min-w-0 justify-center rounded-full bg-emerald-600 px-1.5 py-1 text-[9px] font-black text-white">{value.toFixed(1)}</span>;
}

function Trend({ direction, label }: { direction: "up" | "down" | "flat"; label: string }) {
  const icon = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const className = direction === "up" ? "text-emerald-700" : direction === "down" ? "text-red-600" : "text-slate-500";
  return <span className={`whitespace-nowrap font-black ${className}`}>{icon} {label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-white px-2 py-2"><div className="text-[8px] font-black uppercase text-slate-400">{label}</div><div className="text-xs font-black">{value}</div></div>;
}

function Strip({ label, values, count, trendStyle = false }: {
  label: string;
  values: PgaHistoryResult[];
  count: number;
  trendStyle?: boolean;
}) {
  return (
    <div className="mt-3">
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

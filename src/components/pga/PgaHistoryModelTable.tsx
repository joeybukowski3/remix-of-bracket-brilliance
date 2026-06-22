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
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className={`w-full text-[11px] ${isMajor ? "min-w-[2180px]" : "min-w-[1580px]"}`}>
          <thead>
            <tr className="bg-slate-900 text-[9px] font-black uppercase tracking-wider text-white">
              <th rowSpan={2} className="sticky left-0 z-40 w-10 bg-slate-900 px-2 py-2">#</th>
              <th rowSpan={2} className="sticky left-10 z-40 min-w-44 bg-slate-900 px-3 py-2 text-left">Player</th>
              <th rowSpan={2} className="sticky left-[216px] z-40 min-w-20 bg-slate-900 px-2 py-2">Score</th>
              <Group count={RECENT_START_COUNT}>Last 5 Starts</Group>
              {isMajor ? (
                <>
                  <Group count={4}>Specific Major</Group>
                  <Group count={8}>Last 8 Majors</Group>
                </>
              ) : (
                <Group count={4}>{eventLabel} History</Group>
              )}
              <Group count={2}>Derived</Group>
              <Group count={6}>Player Stats</Group>
            </tr>
            <tr className="border-b bg-slate-50 text-[9px] font-black uppercase text-slate-500">
              {recentHeaders()}
              {isMajor ? <>{headers("M", 4)}{headers("AM", 8)}</> : headers("E", 4)}
              <th className="border-l px-2 py-2">Course Fit</th>
              <th className="px-2 py-2">Trend</th>
              {statLabels.map((label, index) => (
                <th key={label} className={`${index === 0 ? "border-l" : ""} whitespace-nowrap px-2 py-2`}>
                  {label}
                </th>
              ))}
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

function DesktopRow({ row, index, statView, isMajor }: {
  row: PgaTournamentModelRow;
  index: number;
  statView: "percentile" | "raw";
  isMajor: boolean;
}) {
  const bg = index % 2 ? "bg-slate-50" : "bg-white";

  return (
    <tr className={`${bg} hover:bg-emerald-50/40`}>
      <td className={`sticky left-0 z-30 border-b px-2 py-2 font-bold text-slate-400 ${bg}`}>{row.modelRank}</td>
      <td className={`sticky left-10 z-30 border-b border-r px-3 py-2 text-left font-bold whitespace-nowrap ${bg}`}>{row.player}</td>
      <td className={`sticky left-[216px] z-30 border-b border-r px-2 py-2 ${bg}`}><Score value={row.modelScore} /></td>
      {history(row.recentResults, RECENT_START_COUNT, "r", true)}
      {isMajor ? (
        <>
          {history(row.specificMajorResults, 4, "m")}
          {history(row.allMajorResults, 8, "am")}
        </>
      ) : history(row.eventResults, 4, "e")}
      <td className="border-b border-l p-0"><Percentile value={row.courseFit} /></td>
      <td className={`border-b px-2 py-2 font-black ${row.trend.direction === "up" ? "text-emerald-700" : row.trend.direction === "down" ? "text-red-600" : "text-slate-500"}`}>{row.trend.label}</td>
      {statKeys.map((key, statIndex) => (
        <td key={key} className={`${statIndex === 0 ? "border-l" : ""} border-b p-0`}>
          {statView === "percentile" ? <Percentile value={row.displayPercentiles[key] ?? null} /> : <Raw value={raw(row, key)} />}
        </td>
      ))}
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
      <Strip label="Last 5 Starts" values={row.recentResults} count={RECENT_START_COUNT} trendStyle />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Course Fit" value={row.courseFit == null ? "—" : String(Math.round(row.courseFit))} />
        <Metric label="Trend" value={row.trend.label} />
      </div>
      <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-bold">Full history and stats</summary>
        <div className="mt-3 space-y-3">
          {isMajor ? (
            <>
              <Strip label="Specific major" values={row.specificMajorResults} count={4} />
              <Strip label="Last 8 majors" values={row.allMajorResults} count={8} />
            </>
          ) : (
            <Strip label={`${eventLabel} history`} values={row.eventResults} count={4} />
          )}
          <div className="grid grid-cols-2 gap-2">
            {statKeys.map((key, i) => (
              <Metric key={key} label={statLabels[i]} value={statView === "percentile" ? pct(row.displayPercentiles[key] ?? null) : raw(row, key)} />
            ))}
          </div>
        </div>
      </details>
    </article>
  );
}

function Group({ count, children }: { count: number; children: ReactNode }) {
  return <th colSpan={count} className="border-l border-slate-600 px-2 py-2 text-emerald-300">{children}</th>;
}

function recentHeaders() {
  return ["Latest", "2", "3", "4", "5"].map((label, index) => (
    <th key={label} className="min-w-[58px] px-1 py-2 text-center" title={index === 0 ? "Most recent start" : `${index + 1} starts ago`}>
      {label}
    </th>
  ));
}

function headers(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => (
    <th key={`${prefix}${i}`} className="min-w-12 px-1 py-2 text-center">{prefix}{i + 1}</th>
  ));
}

function history(values: PgaHistoryResult[], count: number, prefix: string, trendStyle = false) {
  return Array.from({ length: count }, (_, i) => (
    <td key={`${prefix}${i}`} className={`border-b px-1 ${trendStyle ? "py-1" : "py-1.5"}`}>
      <Finish value={values[i]} trendStyle={trendStyle} />
    </td>
  ));
}

function Finish({ value, trendStyle = false }: { value?: PgaHistoryResult; trendStyle?: boolean }) {
  if (!value) {
    return <div className={`${trendStyle ? "h-10" : "h-7"} flex items-center justify-center text-slate-300`}>—</div>;
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

  if (!trendStyle) {
    return (
      <span title={title} className={`inline-flex min-w-9 justify-center rounded border px-1 py-1 text-[10px] font-black ${badgeClass}`}>
        {isWin ? "1" : value.finishText}
      </span>
    );
  }

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
    <div title={title} className="flex min-w-[52px] flex-col items-center gap-1 py-0.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className={`inline-flex h-7 min-w-10 items-center justify-center rounded border px-1 text-[10px] font-black ${badgeClass}`}>
        {isWin ? "1" : value.finishText}
      </span>
    </div>
  );
}

function Percentile({ value }: { value: number | null | undefined }) {
  if (value == null) return <div className="py-2 text-slate-300">—</div>;
  const bg = value >= 75 ? "#166534" : value >= 50 ? "#bbf7d0" : value <= 25 ? "#fecaca" : "#f8fafc";
  const color = value >= 75 ? "white" : value <= 25 ? "#7f1d1d" : "#052e16";
  return <div className="min-w-14 px-2 py-2 font-black" style={{ backgroundColor: bg, color }}>{Math.round(value)}</div>;
}

function Raw({ value }: { value: string }) {
  return <div className="min-w-16 px-2 py-2 font-bold text-slate-700">{value}</div>;
}

function Score({ value }: { value: number }) {
  return <span className="inline-flex min-w-14 justify-center rounded-full bg-emerald-600 px-2 py-1 font-black text-white">{value.toFixed(1)}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-white px-2 py-2"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className="text-xs font-black">{value}</div></div>;
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
      <div className={`grid gap-1 ${gridClass(count)}`}>
        {Array.from({ length: count }, (_, i) => <Finish key={i} value={values[i]} trendStyle={trendStyle} />)}
      </div>
    </div>
  );
}

function gridClass(count: number) {
  if (count === 8) return "grid-cols-8";
  if (count === 5) return "grid-cols-5";
  return "grid-cols-4";
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

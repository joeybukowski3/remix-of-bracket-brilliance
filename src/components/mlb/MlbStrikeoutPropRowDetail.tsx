import type { ReactNode } from "react";
import type { StrikeoutPropDetail, PitcherStartDetail, PitcherVenueSplit } from "@/hooks/useMlbStrikeoutPropDetails";
import type { KPropsV2ShadowArtifact, KPropsV2ShadowRow } from "@/hooks/useMlbKPropsV2Shadow";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { outsToMlbInnings } from "@/lib/mlb/baseballInnings";
import { cn } from "@/lib/utils";

const DASH = "N/A";

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed;
}

function fmt(value: unknown, digits = 1) {
  const number = finite(value);
  return number == null ? DASH : number.toFixed(digits);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return DASH;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtIpFromOuts(outs: number | null | undefined) {
  if (outs == null || !Number.isFinite(outs)) return DASH;
  return outsToMlbInnings(outs) ?? DASH;
}

function formatIp(value: number | string | null | undefined, outs?: number | null) {
  if (outs != null && Number.isFinite(outs)) return fmtIpFromOuts(outs);
  return value == null || value === "" ? DASH : String(value);
}

function perNine(total: number | null | undefined, outs: number | null | undefined) {
  if (total == null || outs == null || !Number.isFinite(total) || !Number.isFinite(outs) || outs <= 0) return null;
  return (total * 27) / outs;
}

function signed(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function signedPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function TeamCell({ team }: { team: string | null | undefined }) {
  if (!team) return <span>{DASH}</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <MlbTeamLogo team={team} size={14} />
      <span>{team}</span>
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
        {title}
      </div>
      {children}
    </section>
  );
}

function DesktopTable({ columns, rows, footRow }: { columns: string[]; rows: ReactNode[][]; footRow?: ReactNode[] | null }) {
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full table-fixed text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-400">
            {columns.map((column) => <th key={column} className="border-b border-slate-100 px-2 py-1.5 text-left font-bold">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
              {row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-slate-50 px-2 py-1.5 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
        {footRow && (
          <tfoot>
            <tr className="bg-slate-100 font-black text-slate-800">
              {footRow.map((cell, index) => <td key={index} className="border-t border-slate-200 px-2 py-1.5">{cell}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MobileRows({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="grid gap-1.5 p-2 sm:hidden">
      {rows.map((row, index) => (
        <div key={index} className="rounded-lg border border-slate-100 bg-white p-2">
          {columns.map((column, cellIndex) => (
            <div key={`${column}-${cellIndex}`} className="flex items-start justify-between gap-2 py-0.5 text-[11px]">
              <span className="shrink-0 font-black uppercase tracking-wide text-slate-400">{column}</span>
              <span className="min-w-0 text-right font-semibold text-slate-700">{row[cellIndex]}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function summarizeStarts(starts: PitcherStartDetail[]) {
  const rows = starts.filter(Boolean);
  const totalOuts = rows.reduce((sum, start) => sum + (finite(start.outsRecorded) ?? 0), 0);
  const totalKs = rows.reduce((sum, start) => sum + (finite(start.strikeouts) ?? 0), 0);
  const totalHits = rows.reduce((sum, start) => sum + (finite(start.hitsAllowed) ?? 0), 0);
  const pitchCounts = rows.map((start) => finite(start.pitchCount)).filter((value): value is number => value != null);
  return {
    games: rows.length,
    avgOuts: rows.length && totalOuts > 0 ? totalOuts / rows.length : null,
    avgKs: rows.length ? totalKs / rows.length : null,
    k9: totalOuts > 0 ? (totalKs * 27) / totalOuts : null,
    h9: totalOuts > 0 ? (totalHits * 27) / totalOuts : null,
    avgPitchCount: pitchCounts.length ? pitchCounts.reduce((sum, value) => sum + value, 0) / pitchCounts.length : null,
  };
}

function RecentStartsTable({ detail }: { detail: StrikeoutPropDetail }) {
  const starts = (detail.pitcherRecentStarts ?? detail.pitcherLastFiveStarts ?? []).slice(0, 5);
  const summary = summarizeStarts(starts);
  const columns = ["Date", "Opp", "IP", "K", "H/9", "K/9", "Pitch Count"];
  const rows = starts.map((start, index) => {
    const outs = finite(start.outsRecorded);
    const strikeouts = finite(start.strikeouts);
    const hits = finite(start.hitsAllowed);
    return [
      fmtDate(start.date),
      <TeamCell key={`recent-${index}`} team={start.opponentAbbr ?? start.opponent} />,
      formatIp(start.inningsPitched, outs),
      strikeouts == null ? DASH : String(strikeouts),
      fmt(perNine(hits, outs)),
      fmt(perNine(strikeouts, outs)),
      fmt(start.pitchCount, 0),
    ];
  });
  const foot = [
    "AVG",
    `${summary.games} used`,
    summary.avgOuts == null ? DASH : fmtIpFromOuts(Math.round(summary.avgOuts)),
    fmt(summary.avgKs),
    fmt(summary.h9),
    fmt(summary.k9),
    fmt(summary.avgPitchCount),
  ];
  return (
    <SectionCard title={`${detail.pitcher} — Last 5 Starts`}>
      <DesktopTable columns={columns} rows={rows} footRow={foot} />
      <MobileRows columns={columns} rows={rows} />
    </SectionCard>
  );
}

function OpponentRecentTable({ detail }: { detail: StrikeoutPropDetail }) {
  const games = (detail.opponentLastFiveGames ?? []).slice(0, 10);
  const summary = detail.opponentLastFiveVsStartersSummary;
  const columns = ["Date", "Opp", "Opposing SP", "SP IP", "SP K", "Game K"];
  const rows = games.map((game, index) => [
    fmtDate(game.date),
    <TeamCell key={`opp-${index}`} team={game.opponent} />,
    game.opposingStartingPitcher ?? DASH,
    formatIp(game.opposingStarterInningsPitched),
    fmt(game.opposingStarterStrikeouts, 0),
    fmt(game.teamTotalStrikeouts, 0),
  ]);
  const foot = [
    "AVG",
    summary?.gamesUsed != null ? `${summary.gamesUsed} used` : "",
    "",
    summary?.averageOpposingStarterInnings == null ? DASH : fmtIpFromOuts(Math.round(summary.averageOpposingStarterInnings * 3)),
    fmt(summary?.averageOpposingStarterStrikeouts),
    fmt(summary?.averageTeamStrikeouts),
  ];
  return (
    <SectionCard title={`${detail.opponent} — Last 10 Games vs SP`}>
      <DesktopTable columns={columns} rows={rows} footRow={foot} />
      <MobileRows columns={columns} rows={rows} />
    </SectionCard>
  );
}

type SplitMetrics = {
  ip: string;
  k9: number | null;
  kDiff: number | null;
  h9: number | null;
  hDiffPct: number | null;
  gamesUsed: number;
};

function splitMetrics(split: PitcherVenueSplit["season"] | PitcherVenueSplit["lastFiveAtSite"], baselineK9: number | null, baselineH9: number | null): SplitMetrics {
  const k9 = perNine(split.strikeouts, split.totalOuts);
  const h9 = perNine(split.hitsAllowed, split.totalOuts);
  return {
    ip: split.inningsPitched ?? (split.totalOuts != null ? fmtIpFromOuts(split.totalOuts) : DASH),
    k9,
    kDiff: k9 != null && baselineK9 != null ? k9 - baselineK9 : null,
    h9,
    hDiffPct: h9 != null && baselineH9 != null && baselineH9 !== 0 ? ((h9 - baselineH9) / baselineH9) * 100 : null,
    gamesUsed: split.gamesUsed ?? 0,
  };
}

function DiffValue({ value, inverse = false, percent = false }: { value: number | null; inverse?: boolean; percent?: boolean }) {
  if (value == null) return <span className="text-slate-400">{DASH}</span>;
  const good = inverse ? value < 0 : value > 0;
  const bad = inverse ? value > 0 : value < 0;
  return <span className={cn("font-black tabular-nums", good && "text-emerald-700", bad && "text-red-600", !good && !bad && "text-slate-500")}>{percent ? signedPercent(value) : signed(value)}</span>;
}

function VenueSplitsTable({ detail }: { detail: StrikeoutPropDetail }) {
  const splits = detail.pitcherVenueSplits;
  if (!splits) return <SectionCard title={`${detail.pitcher} — Home/Away Splits`}><div className="p-4 text-sm text-slate-500">Split data is not available.</div></SectionCard>;

  const seasonOuts = (splits.home.season.totalOuts ?? 0) + (splits.away.season.totalOuts ?? 0);
  const seasonKs = (splits.home.season.strikeouts ?? 0) + (splits.away.season.strikeouts ?? 0);
  const seasonHits = (splits.home.season.hitsAllowed ?? 0) + (splits.away.season.hitsAllowed ?? 0);
  const baselineK9 = seasonOuts > 0 ? (seasonKs * 27) / seasonOuts : null;
  const baselineH9 = seasonOuts > 0 ? (seasonHits * 27) / seasonOuts : null;

  const rows = (["home", "away"] as const).map((site) => {
    const split = splits[site];
    const season = splitMetrics(split.season, baselineK9, baselineH9);
    const lastFive = splitMetrics(split.lastFiveAtSite, baselineK9, baselineH9);
    const shortSample = lastFive.gamesUsed < 5;
    return { site, season, lastFive, shortSample };
  });

  return (
    <SectionCard title={`${detail.pitcher} — Home/Away Splits`}>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[880px] table-fixed text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-slate-400">
              <th rowSpan={2} className="w-[72px] border-b border-slate-100 px-2 py-1.5 text-left font-bold align-bottom">Site</th>
              <th colSpan={5} className="border-b border-l border-slate-100 bg-slate-50/70 px-2 py-1.5 text-center font-black text-slate-500">Season</th>
              <th colSpan={5} className="border-b border-l border-slate-100 bg-slate-50/70 px-2 py-1.5 text-center font-black text-slate-500">Last 5 at Site</th>
            </tr>
            <tr className="text-[9px] uppercase tracking-wide text-slate-400">
              {["IP", "K/9", "K/9 +/-", "H/9", "Hit Avg +/-", "IP", "K/9", "K/9 +/-", "H/9", "Hit Avg +/-"].map((column, index) => (
                <th key={`${column}-${index}`} className={cn("border-b border-slate-100 px-2 py-1.5 text-left font-bold", (index === 0 || index === 5) && "border-l")}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.site} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                <td className="border-b border-slate-100 px-2 py-2 font-black capitalize text-slate-800">{row.site}</td>
                <td className="border-b border-l border-slate-100 px-2 py-2">{row.season.ip}</td>
                <td className="border-b border-slate-100 px-2 py-2 font-semibold">{fmt(row.season.k9)}</td>
                <td className="border-b border-slate-100 px-2 py-2"><DiffValue value={row.season.kDiff} /></td>
                <td className="border-b border-slate-100 px-2 py-2 font-semibold">{fmt(row.season.h9)}</td>
                <td className="border-b border-slate-100 px-2 py-2"><DiffValue value={row.season.hDiffPct} inverse percent /></td>
                <td className="border-b border-l border-slate-100 px-2 py-2">{row.lastFive.ip}{row.shortSample ? "*" : ""}</td>
                <td className="border-b border-slate-100 px-2 py-2 font-semibold">{fmt(row.lastFive.k9)}</td>
                <td className="border-b border-slate-100 px-2 py-2"><DiffValue value={row.lastFive.kDiff} /></td>
                <td className="border-b border-slate-100 px-2 py-2 font-semibold">{fmt(row.lastFive.h9)}</td>
                <td className="border-b border-slate-100 px-2 py-2"><DiffValue value={row.lastFive.hDiffPct} inverse percent /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 p-2 sm:hidden">
        {rows.map((row) => (
          <div key={row.site} className="rounded-lg border border-slate-100 bg-white p-2">
            <div className="mb-2 text-xs font-black capitalize text-slate-900">{row.site}</div>
            <div className="grid grid-cols-2 gap-2">
              {(["season", "lastFive"] as const).map((group) => {
                const values = row[group];
                return (
                  <div key={group} className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-1 text-[9px] font-black uppercase tracking-wide text-slate-400">{group === "season" ? "Season" : "Last 5 at Site"}</div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between"><span>IP</span><strong>{values.ip}{group === "lastFive" && row.shortSample ? "*" : ""}</strong></div>
                      <div className="flex justify-between"><span>K/9</span><strong>{fmt(values.k9)}</strong></div>
                      <div className="flex justify-between"><span>K/9 +/-</span><DiffValue value={values.kDiff} /></div>
                      <div className="flex justify-between"><span>H/9</span><strong>{fmt(values.h9)}</strong></div>
                      <div className="flex justify-between"><span>Hit Avg +/-</span><DiffValue value={values.hDiffPct} inverse percent /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {rows.some((row) => row.shortSample) && (
        <div className="border-t border-slate-100 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800">* fewer than 5 starts available at that site; calculation uses all available starts.</div>
      )}
      <div className="border-t border-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-500">K/9 +/- compares each split with the pitcher&apos;s overall season K/9. Hit Avg +/- is the percentage difference in H/9 versus the pitcher&apos;s overall season H/9; lower is better.</div>
    </SectionCard>
  );
}

export function MlbStrikeoutPropRowDetailLoading() {
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">Loading pitcher details…</div>;
}

export function MlbStrikeoutPropRowDetailUnavailable({ pitcher }: { pitcher: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">Detailed game-log data is not currently available for {pitcher}.</div>;
}

export function MlbStrikeoutPropRowDetailStale() {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">Pitcher detail data is from a different slate and is hidden to avoid showing stale matchup context.</div>;
}

export function MlbStrikeoutPropDetailsStaleBanner({ detailsDate, slateDate }: { detailsDate: string | null; slateDate: string | null }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Pitcher detail data is stale ({detailsDate ?? DASH}); current slate is {slateDate ?? DASH}. Expanded details will remain hidden until the artifact refreshes.</div>;
}

export default function MlbStrikeoutPropRowDetail({
  detail,
  shadowRow = null,
  shadowArtifact = null,
  showV2Shadow = false,
  publicSlateDate = null,
  row = null,
}: {
  detail: StrikeoutPropDetail;
  shadowRow?: KPropsV2ShadowRow | null;
  shadowArtifact?: KPropsV2ShadowArtifact | null;
  showV2Shadow?: boolean;
  publicSlateDate?: string | null;
  row?: PitcherStrikeoutTeamRow | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <RecentStartsTable detail={detail} />
        <OpponentRecentTable detail={detail} />
      </div>
      <VenueSplitsTable detail={detail} />
      {showV2Shadow && (
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-[10px] text-slate-600">
          Debug: public slate {publicSlateDate ?? DASH} · resolved projection {fmt(row?.projectedKs)} · shadow {fmt(shadowRow?.v2?.projectedStrikeouts)} · model {shadowArtifact?.modelVersion ?? DASH}
        </div>
      )}
    </div>
  );
}

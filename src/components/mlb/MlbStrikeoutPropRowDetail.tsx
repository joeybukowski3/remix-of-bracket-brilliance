import type { ReactNode } from "react";
import type { PitcherVenueSplit, StrikeoutPropDetail } from "@/hooks/useMlbStrikeoutPropDetails";
import type { KPropsV2ShadowArtifact, KPropsV2ShadowRow } from "@/hooks/useMlbKPropsV2Shadow";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { outsToMlbInnings } from "@/lib/mlb/baseballInnings";

const DASH = "N/A";

function fmtNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? DASH : String(Math.trunc(value));
}

function fmtFixed(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? DASH : value.toFixed(digits);
}

function fmtIp(value: string | number | null | undefined) {
  return value == null || value === "" ? DASH : String(value);
}

function fmtOuts(outs: number | null | undefined) {
  if (outs == null || !Number.isFinite(outs)) return DASH;
  return outsToMlbInnings(Math.round(outs)) ?? DASH;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return DASH;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TeamCell({ team }: { team: string | null | undefined }) {
  if (!team) return <span>{DASH}</span>;
  return <span className="inline-flex items-center gap-1 font-semibold"><MlbTeamLogo team={team} size={14} />{team}</span>;
}

function MiniTable({ title, columns, rows, footRows = [], emptyMessage }: { title: string; columns: string[]; rows: ReactNode[][]; footRows?: ReactNode[][]; emptyMessage: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</div>
      <div className="hidden sm:block">
        <table className="w-full table-fixed text-[11px]">
          <thead><tr className="text-[9px] uppercase tracking-wide text-slate-400">{columns.map((column) => <th key={column} className="border-b border-slate-100 px-2 py-1 text-left font-bold">{column}</th>)}</tr></thead>
          <tbody>
            {rows.length ? rows.map((row, index) => <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>{row.map((cell, cellIndex) => <td key={cellIndex} className="break-words border-b border-slate-50 px-2 py-1 text-slate-700">{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="px-2 py-3 text-center text-slate-400">{emptyMessage}</td></tr>}
          </tbody>
          {footRows.length > 0 && <tfoot>{footRows.map((row, index) => <tr key={`foot-${index}`} className="bg-slate-100 font-black text-slate-800">{row.map((cell, cellIndex) => <td key={cellIndex} className="break-words border-t border-slate-200 px-2 py-1.5">{cell}</td>)}</tr>)}</tfoot>}
        </table>
      </div>
      <div className="grid gap-1.5 p-2 sm:hidden">
        {rows.length ? rows.map((row, index) => <div key={index} className="rounded-lg border border-slate-100 bg-white p-2">{columns.map((column, cellIndex) => <div key={column} className="flex min-w-0 items-start justify-between gap-3 py-0.5 text-[11px]"><span className="shrink-0 font-black uppercase tracking-wide text-slate-400">{column}</span><span className="min-w-0 text-right font-semibold text-slate-700">{row[cellIndex]}</span></div>)}</div>) : <div className="px-2 py-3 text-center text-xs text-slate-400">{emptyMessage}</div>}
        {footRows.map((row, index) => <div key={`foot-card-${index}`} data-testid="strikeout-recent-avg-row" className="rounded-lg border border-slate-200 bg-slate-100 p-2">{columns.map((column, cellIndex) => <div key={column} className="flex min-w-0 items-start justify-between gap-3 py-0.5 text-[11px]"><span className="shrink-0 font-black uppercase tracking-wide text-slate-500">{cellIndex === 0 ? String(row[cellIndex]) : column}</span>{cellIndex > 0 && <span className="min-w-0 text-right font-black text-slate-800">{row[cellIndex]}</span>}</div>)}</div>)}
      </div>
    </div>
  );
}

function splitRow(split: PitcherVenueSplit | undefined, label: string): ReactNode[] {
  const season = split?.season;
  const recent = split?.lastFiveAtSite;
  const sample = recent?.gamesUsed ?? 0;
  return [
    label,
    season?.totalOuts != null ? `${fmtOuts(season.totalOuts)} (${season.gamesUsed} starts)` : DASH,
    fmtNumber(season?.strikeouts),
    fmtNumber(season?.hitsAllowed),
    recent?.totalOuts != null ? `${fmtOuts(recent.totalOuts)} (${sample} ${sample === 1 ? "start" : "starts"})` : DASH,
    fmtNumber(recent?.strikeouts),
    fmtNumber(recent?.hitsAllowed),
  ];
}

function DebugPanels({ detail, shadowRow, artifact, publicSlateDate }: { detail: StrikeoutPropDetail; shadowRow: KPropsV2ShadowRow; artifact: KPropsV2ShadowArtifact | null; publicSlateDate: string | null }) {
  return (
    <div data-testid="strikeout-v2-debug-panels" className="grid min-w-0 gap-2">
      <section className="min-w-0 rounded-xl border border-sky-200 bg-sky-50/60 p-2.5">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Projection Comparison</h4>
        <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-3">
          <div className="rounded-lg bg-white px-2 py-1">Legacy: <strong>{fmtFixed(shadowRow.legacy.projectedKs)}</strong></div>
          <div className="rounded-lg bg-white px-2 py-1">V2 Shadow: <strong>{fmtFixed(shadowRow.v2.projectedStrikeouts)}</strong></div>
          <div className="rounded-lg bg-white px-2 py-1">Δ: <strong>{fmtFixed(shadowRow.comparison.v2MinusLegacyKs)}</strong></div>
        </div>
        <p className="mt-2 text-[10px] font-semibold text-slate-500">V2 Shadow is experimental and does not replace the public projection for {detail.pitcher}.</p>
      </section>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">V2 Model Breakdown</h4>
        <div className="mt-2 grid gap-1 text-[10px]">{shadowRow.v2.components.map((component) => <div key={component.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 rounded bg-slate-50 px-2 py-1"><span className="truncate">{component.label}</span><span>{fmtFixed(component.value, 3)}</span><span>{fmtFixed(component.contribution, 3)}</span></div>)}</div>
      </section>
      <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Split Availability</h4>
        <p className="mt-2 text-[11px] text-amber-800">Public pitcher venue totals now come from the detail artifact. V2 split inputs and gating remain unchanged.</p>
      </section>
      {artifact && <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5"><h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Source Integrity</h4><div className="mt-2 text-[11px] text-slate-600">Artifact slate: <strong>{artifact.slateDate}</strong> · Public slate: <strong>{publicSlateDate ?? DASH}</strong> · Version: <strong>{artifact.modelVersion}</strong></div></section>}
    </div>
  );
}

export function MlbStrikeoutPropRowDetailLoading() {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">Loading recent strikeout details…</div>;
}

export function MlbStrikeoutPropRowDetailUnavailable({ pitcher }: { pitcher: string }) {
  return <div data-testid="strikeout-prop-detail-unavailable" className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">Recent strikeout details are not available for {pitcher} right now.</div>;
}

export function MlbStrikeoutPropRowDetailStale() {
  return <div data-testid="strikeout-prop-detail-stale" className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-700">Detail data is out of date for the current slate — see the notice above.</div>;
}

export function MlbStrikeoutPropDetailsStaleBanner({ detailsDate, slateDate }: { detailsDate: string | null; slateDate: string | null }) {
  return <div data-testid="strikeout-prop-details-stale-warning" role="alert" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Strikeout detail data is out of date (showing {detailsDate ?? "an earlier slate"}, current slate is {slateDate ?? "today"}). Row detail panels are temporarily unavailable until the data refreshes. Base rankings above are unaffected.</div>;
}

export default function MlbStrikeoutPropRowDetail({ detail, shadowRow = null, shadowArtifact = null, showV2Shadow = false, publicSlateDate = null }: { detail: StrikeoutPropDetail; shadowRow?: KPropsV2ShadowRow | null; shadowArtifact?: KPropsV2ShadowArtifact | null; showV2Shadow?: boolean; publicSlateDate?: string | null }) {
  const starts = detail.pitcherRecentStarts ?? detail.pitcherLastFiveStarts ?? [];
  const summary = detail.pitcherLastFiveSummary;
  const startRows: ReactNode[][] = starts.map((start, index) => {
    const hitsPerNine = start.outsRecorded != null && start.outsRecorded > 0 && start.hitsAllowed != null ? start.hitsAllowed * 27 / start.outsRecorded : null;
    const strikeoutsPerNine = start.outsRecorded != null && start.outsRecorded > 0 && start.strikeouts != null ? start.strikeouts * 27 / start.outsRecorded : null;
    return [fmtDate(start.date), <TeamCell key={index} team={start.opponentAbbr ?? start.opponent} />, fmtIp(start.inningsPitched), fmtNumber(start.strikeouts), fmtFixed(hitsPerNine), fmtFixed(strikeoutsPerNine), fmtNumber(start.pitchCount)];
  });
  const startAvg: ReactNode[][] = [["AVG", `${summary?.gamesUsed ?? starts.length} starts`, summary?.averageInningsOuts != null ? fmtOuts(summary.averageInningsOuts) : DASH, fmtFixed(summary?.averageStrikeouts), fmtFixed(summary?.hitsPerNine), fmtFixed(summary?.strikeoutsPerNine), fmtFixed(summary?.averagePitchCount)]];

  const opponentRows: ReactNode[][] = detail.opponentLastFiveGames.map((game, index) => [fmtDate(game.date), <TeamCell key={index} team={game.opponent} />, game.opposingStartingPitcher ?? DASH, fmtIp(game.opposingStarterInningsPitched), fmtNumber(game.opposingStarterStrikeouts), fmtNumber(game.teamTotalStrikeouts)]);
  const splitRows = [splitRow(detail.pitcherVenueSplits?.home, "Home"), splitRow(detail.pitcherVenueSplits?.away, "Away")];

  return (
    <div data-testid="strikeout-prop-detail" className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
      <section>
        <h3 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Recent Performance</h3>
        <div className="grid min-w-0 gap-2 lg:grid-cols-2 lg:items-start">
          <div className="grid min-w-0 gap-2">
            <MiniTable title={`${detail.pitcher} — Last 5 Starts`} columns={["Date", "Opp", "IP", "K", "H/9", "K/9", "Pitch Count"]} rows={startRows} footRows={startAvg} emptyMessage="No recent starts available." />
            <MiniTable title={`${detail.pitcher} — Splits`} columns={["Site", "IP / Season", "K", "Hits Allowed", "IP / Last 5", "K / Last 5", "Hits Allowed / Last 5"]} rows={splitRows} emptyMessage="No venue splits available." />
          </div>
          <MiniTable title={`${detail.opponent} — Last 5 Games vs SP`} columns={["Date", "Opp", "Opposing SP", "SP IP", "SP K", "Team K"]} rows={opponentRows} emptyMessage="No recent games available." />
        </div>
      </section>
      {showV2Shadow && shadowRow && <DebugPanels detail={detail} shadowRow={shadowRow} artifact={shadowArtifact} publicSlateDate={publicSlateDate} />}
    </div>
  );
}

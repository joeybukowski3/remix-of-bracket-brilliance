import type { ReactNode } from "react";
import type { StrikeoutPropDetail } from "@/hooks/useMlbStrikeoutPropDetails";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";

const DASH = "N/A";

function fmtText(value: string | null | undefined) {
  return value && value.trim() ? value : DASH;
}
function fmtNumber(value: number | null | undefined) {
  return value == null ? DASH : String(value);
}
function fmtIp(value: number | string | null | undefined) {
  return value == null || value === "" ? DASH : String(value);
}
function fmtDate(value: string | null | undefined) {
  if (!value) return DASH;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TeamCell({ team }: { team: string | null }) {
  if (!team) return <span>{DASH}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <MlbTeamLogo team={team} size={14} />
      {team}
    </span>
  );
}

function MiniTable({
  title,
  columns,
  rows,
  emptyMessage,
}: {
  title: string;
  columns: string[];
  rows: ReactNode[][];
  emptyMessage: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-slate-400">
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap border-b border-slate-100 px-2 py-1 text-left font-bold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="whitespace-nowrap border-b border-slate-50 px-2 py-1 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-2 py-3 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MlbStrikeoutPropRowDetailLoading() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">
      Loading recent strikeout details…
    </div>
  );
}

export function MlbStrikeoutPropRowDetailUnavailable({ pitcher }: { pitcher: string }) {
  return (
    <div
      data-testid="strikeout-prop-detail-unavailable"
      className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400"
    >
      Recent strikeout details are not available for {pitcher} right now.
    </div>
  );
}

/**
 * Shown per-row instead of MlbStrikeoutPropRowDetailUnavailable when the
 * details file's own slate date doesn't match the page's current slate
 * date. Deliberately does not say "not available for {pitcher}" -- that
 * phrasing reads as a per-pitcher data gap when the real cause is a global
 * stale file, which the banner above the table already explains.
 */
export function MlbStrikeoutPropRowDetailStale() {
  return (
    <div
      data-testid="strikeout-prop-detail-stale"
      className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-700"
    >
      Detail data is out of date for the current slate — see the notice above.
    </div>
  );
}

/** Global banner shown once above the table when the details file's slate date doesn't match the page's current slate date. */
export function MlbStrikeoutPropDetailsStaleBanner({ detailsDate, slateDate }: { detailsDate: string | null; slateDate: string | null }) {
  return (
    <div
      data-testid="strikeout-prop-details-stale-warning"
      role="alert"
      className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
    >
      Strikeout detail data is out of date (showing {detailsDate ?? "an earlier slate"}, current slate is {slateDate ?? "today"}). Row
      detail panels are temporarily unavailable until the data refreshes. Base rankings above are unaffected.
    </div>
  );
}

export default function MlbStrikeoutPropRowDetail({ detail }: { detail: StrikeoutPropDetail }) {
  const startRows: ReactNode[][] = detail.pitcherLastFiveStarts.map((start, index) => [
    fmtDate(start.date),
    <TeamCell key={`start-opp-${index}`} team={start.opponent} />,
    fmtIp(start.inningsPitched),
    fmtNumber(start.strikeouts),
  ]);

  const opponentRows: ReactNode[][] = detail.opponentLastFiveGames.map((game, index) => [
    fmtDate(game.date),
    <TeamCell key={`vs-opp-${index}`} team={game.opponent} />,
    fmtText(game.opposingStartingPitcher),
    fmtIp(game.opposingStarterInningsPitched),
    fmtNumber(game.opposingStarterStrikeouts),
    fmtNumber(game.teamTotalStrikeouts),
  ]);

  return (
    <div
      data-testid="strikeout-prop-detail"
      className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 sm:grid-cols-2"
    >
      <MiniTable
        title={`${detail.pitcher} — last 5 starts`}
        columns={["Date", "Opp", "IP", "K"]}
        rows={startRows}
        emptyMessage="No recent starts available."
      />
      <MiniTable
        title={`${detail.opponent} — last 5 games vs SP`}
        columns={["Date", "Opp", "Opposing SP", "SP IP", "SP K", "Team K"]}
        rows={opponentRows}
        emptyMessage="No recent games available."
      />
    </div>
  );
}

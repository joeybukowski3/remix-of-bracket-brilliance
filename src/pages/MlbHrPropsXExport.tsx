import { useSearchParams } from "react-router-dom";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { decodeArtifactParam, formatSlateDateLabel, type HrArtifactRow } from "@/lib/mlb/xExportArtifact";

const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

/**
 * Bare HR Props X-export route (/mlb/hr-props/x-export). Renders ONLY the
 * confirmed-and-selected hitters passed in the immutable artifact via `?d=`.
 * No site header, no MLB sidebar -- it lives outside MlbLayout. Every row
 * carries data-* attributes the poster scrapes back to prove the screenshot
 * matches the selection artifact and caption before posting.
 */
function HrExportRow({ row, index }: { row: HrArtifactRow; index: number }) {
  const colors = getMlbTeamColors(row.team);
  return (
    <tr
      data-hr-row=""
      data-hr-rank={row.rank}
      data-hr-player-id={row.playerId ?? ""}
      data-hr-game-id={row.gameId ?? ""}
      data-hr-player={row.player}
      data-hr-team={row.team}
      data-hr-order={row.battingOrder ?? ""}
      data-hr-score={row.hrScore ?? ""}
      data-hr-odds={row.hrOddsYes ?? ""}
      className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
    >
      <td className="px-4 py-3 text-center text-lg font-black tabular-nums" style={{ color: colors.primary }}>
        {row.rank}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <MlbTeamLogo team={row.team} size={36} />
          <div className="min-w-0">
            <div className="truncate text-lg font-black" style={{ color: INK }}>
              {row.player}
            </div>
            <div className="truncate text-xs font-semibold" style={{ color: MUTED }}>
              {row.team} vs {row.opponent}
              {row.battingOrder != null ? ` · Batting ${row.battingOrder}` : ""}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xl font-black tabular-nums text-white" style={{ backgroundColor: colors.primary }}>
          {row.hrScore != null ? row.hrScore.toFixed(1) : "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-xl font-black tabular-nums" style={{ color: INK }}>
        {row.hrOddsYes ?? "—"}
      </td>
    </tr>
  );
}

export default function MlbHrPropsXExport() {
  const [searchParams] = useSearchParams();
  const artifact = decodeArtifactParam<HrArtifactRow>(searchParams.get("d"));

  if (!artifact) {
    return (
      <div className="p-8 text-center text-sm text-red-500" data-testid="hr-x-export-unavailable">
        HR X-export selection data is unavailable or malformed.
      </div>
    );
  }

  const rows = artifact.rows ?? [];

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-200 p-6">
      <div
        data-x-export="mlb-hr-social"
        data-x-content="hr"
        data-x-slate-date={artifact.slateDate}
        data-x-row-count={rows.length}
        data-x-selection-status={artifact.selectionStatus}
        className="w-[1080px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl"
      >
        <div className="bg-[#0f172a] px-8 pb-6 pt-7">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300/80">Joe Knows Ball</div>
          <div className="mt-1 text-4xl font-black text-white">MLB Home Run Props</div>
          <div className="mt-1 text-base text-slate-300">
            {formatSlateDateLabel(artifact.slateDate)} · Confirmed lineups only
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-8 py-14 text-center" data-testid="hr-x-export-no-rows">
            <div className="text-lg font-black" style={{ color: INK }}>
              No confirmed HR plays qualify yet.
            </div>
            <div className="mt-1 text-sm" style={{ color: MUTED }}>
              Waiting on official batting orders.
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-black uppercase tracking-wide" style={{ color: MUTED }}>
                <th className="px-4 py-2 text-center">#</th>
                <th className="px-4 py-2 text-left">Hitter</th>
                <th className="px-4 py-2 text-center">HR Score</th>
                <th className="px-4 py-2 text-right">HR Yes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <HrExportRow key={`${row.playerId ?? row.player}-${row.gameId ?? index}`} row={row} index={index} />
              ))}
            </tbody>
          </table>
        )}

        <div className="border-t px-8 py-4 text-center" style={{ borderColor: BORDER }}>
          <div className="text-sm font-black" style={{ color: INK }}>
            JoeKnowsBall
          </div>
          <div className="mt-0.5 text-sm font-semibold text-sky-700">Full table: joeknowsball.com/mlb/hr-props</div>
          <div className="mt-1 text-xs" style={{ color: MUTED }}>
            For entertainment / trend analysis only. Not betting advice.
          </div>
        </div>
      </div>
    </div>
  );
}

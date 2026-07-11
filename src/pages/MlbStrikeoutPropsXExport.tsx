import { useSearchParams } from "react-router-dom";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { decodeArtifactParam, formatSignedEdge, formatSlateDateLabel, type KArtifactRow } from "@/lib/mlb/xExportArtifact";

const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const OVER = "#065f46";
const UNDER = "#7c2d12";

function formatLine(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}

/**
 * Bare Strikeout Props X-export route (/mlb/strikeout-props/x-export). Renders
 * ONLY the current-listed-starter rows the readiness gate selected, from the
 * immutable artifact via `?d=`. No site header, no MLB sidebar. Side (OVER/
 * UNDER) and the side-correct odds come straight from the artifact so they can
 * never diverge from the caption. data-* attributes let the poster verify the
 * screenshot against the artifact.
 */
function KExportRow({ row, index }: { row: KArtifactRow; index: number }) {
  const colors = getMlbTeamColors(row.team);
  const isUnder = row.side.toUpperCase() === "UNDER";
  const sideColor = isUnder ? UNDER : OVER;
  return (
    <tr
      data-k-row=""
      data-k-rank={row.rank}
      data-k-pitcher-id={row.pitcherId ?? ""}
      data-k-game-id={row.gameId ?? ""}
      data-k-pitcher={row.pitcher}
      data-k-team={row.team}
      data-k-side={row.side}
      data-k-line={row.kLine ?? ""}
      data-k-odds={row.odds ?? ""}
      data-k-edge={row.projectionEdge ?? ""}
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
              {row.pitcher}
            </div>
            <div className="truncate text-xs font-semibold" style={{ color: MUTED }}>
              {row.team} vs {row.opponent}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-base font-black uppercase tracking-wide text-white" style={{ backgroundColor: sideColor }}>
          {isUnder ? "Under" : "Over"} {formatLine(row.kLine)}
        </span>
      </td>
      <td className="px-4 py-3 text-center text-lg font-black tabular-nums" style={{ color: INK }}>
        {row.odds ?? "—"}
      </td>
      <td className="px-4 py-3 text-right text-lg font-black tabular-nums" style={{ color: sideColor }}>
        {formatSignedEdge(row.projectionEdge)}
      </td>
    </tr>
  );
}

export default function MlbStrikeoutPropsXExport() {
  const [searchParams] = useSearchParams();
  const artifact = decodeArtifactParam<KArtifactRow>(searchParams.get("d"));

  if (!artifact) {
    return (
      <div className="p-8 text-center text-sm text-red-500" data-testid="k-x-export-unavailable">
        Strikeout X-export selection data is unavailable or malformed.
      </div>
    );
  }

  const rows = artifact.rows ?? [];

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-200 p-6">
      <div
        data-x-export="mlb-k-social"
        data-x-content="k"
        data-x-slate-date={artifact.slateDate}
        data-x-row-count={rows.length}
        data-x-selection-status={artifact.selectionStatus}
        className="w-[1080px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl"
      >
        <div className="bg-[#0f172a] px-8 pb-6 pt-7">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300/80">Joe Knows Ball</div>
          <div className="mt-1 text-4xl font-black text-white">MLB Strikeout Props</div>
          <div className="mt-1 text-base text-slate-300">
            {formatSlateDateLabel(artifact.slateDate)} · Confirmed starters only
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-8 py-14 text-center" data-testid="k-x-export-no-rows">
            <div className="text-lg font-black" style={{ color: INK }}>
              No confirmed strikeout plays qualify yet.
            </div>
            <div className="mt-1 text-sm" style={{ color: MUTED }}>
              Waiting on confirmed starters.
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-black uppercase tracking-wide" style={{ color: MUTED }}>
                <th className="px-4 py-2 text-center">#</th>
                <th className="px-4 py-2 text-left">Pitcher</th>
                <th className="px-4 py-2 text-center">Pick</th>
                <th className="px-4 py-2 text-center">Odds</th>
                <th className="px-4 py-2 text-right">Edge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <KExportRow key={`${row.pitcherId ?? row.pitcher}-${row.gameId ?? index}`} row={row} index={index} />
              ))}
            </tbody>
          </table>
        )}

        <div className="border-t px-8 py-4 text-center" style={{ borderColor: BORDER }}>
          <div className="text-sm font-black" style={{ color: INK }}>
            JoeKnowsBall
          </div>
          <div className="mt-0.5 text-sm font-semibold text-sky-700">Full table: joeknowsball.com/mlb/strikeout-props</div>
          <div className="mt-1 text-xs" style={{ color: MUTED }}>
            For entertainment / trend analysis only. Not betting advice.
          </div>
        </div>
      </div>
    </div>
  );
}

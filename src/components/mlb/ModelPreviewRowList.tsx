import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";

export type ModelPreviewRow = {
  key: string;
  player: string;
  team: string;
  opponent?: string;
  /** Optional formatted numeric score, e.g. "+6.4". Omit for fields with no calibrated numeric meaning. */
  scoreText?: string;
  badge?: { label: string; bg: string; color: string };
};

/**
 * Generic row list for mobile model previews that aren't odds-driven
 * (ML Edges, Pitcher Regression) — reuses the visual language of
 * PropPreviewCard's row list without requiring the HR/K odds-badge props.
 */
export function ModelPreviewRowList({ rows }: { rows: ModelPreviewRow[] }) {
  return (
    <div>
      {rows.map((row, index) => (
        <div
          key={row.key}
          className={`flex items-center gap-2.5 border-b border-slate-200/80 px-4 py-2.5 last:border-b-0 ${index % 2 === 1 ? "bg-slate-50/50" : ""}`}
        >
          <MlbTeamLogo team={row.team} size={20} />
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold leading-5 text-slate-950" title={row.player}>
              {row.player}
            </div>
            {row.opponent ? (
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-slate-600" title={`vs ${row.opponent}`}>
                vs {row.opponent}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {row.scoreText ? (
              <span className="text-xs font-extrabold tabular-nums text-slate-900">{row.scoreText}</span>
            ) : null}
            {row.badge ? (
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                style={{ backgroundColor: row.badge.bg, color: row.badge.color }}
              >
                {row.badge.label}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

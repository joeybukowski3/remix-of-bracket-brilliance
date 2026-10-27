import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ColumnId } from "@/lib/nba/props/boardColumns";
import { needsSeasonStats } from "@/lib/nba/props/boardColumns";
import { MAX_USER_MINUTES, MIN_USER_MINUTES } from "@/lib/nba/props/minutesOverride";
import { COLUMN_DEFS, minutesEditorInfo, type CellContext } from "@/components/nba/boardColumnDefs";
import { MinutesEditor } from "@/components/nba/MinutesEditor";
import RecentFormPanel from "@/components/nba/RecentFormPanel";

/** Season and matchup lines shown for every player, on a phone because the table has no room for them. */
const SEASON_LINES: readonly ColumnId[] = ["seasonSample", "mpg", "perGame", "perMinute", "last5", "last10", "lastSeason"];
const MATCHUP_LINES: readonly ColumnId[] = ["oppLast10", "dvpAllowed", "dvpPrior", "dvpCurrent", "matchup"];
const LINE_LINES: readonly ColumnId[] = ["line", "overUnder", "jkbProjection", "modelEdge", "jkbMinutes", "jkbTriple", "source"];
const RESULT_LINES: readonly ColumnId[] = ["adjustedProjection", "adjustedDifference", "seasonRateEstimate"];

function Lines({ ids, ctx, hasSeasonStats }: { ids: readonly ColumnId[]; ctx: CellContext; hasSeasonStats: boolean }) {
  return (
    <dl className="space-y-1">
      {ids
        .filter((id) => hasSeasonStats || !needsSeasonStats(id))
        .map((id) => {
          const def = COLUMN_DEFS[id];
          return (
            <div key={id} className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-600" title={def.title(ctx.market)}>
                {def.label(ctx.market)}
              </dt>
              <dd className="m-0 text-right tabular-nums text-slate-900" data-testid={`detail-${id}`}>
                {def.render(ctx)}
              </dd>
            </div>
          );
        })}
    </dl>
  );
}

function Section({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section role="group" aria-label={title} className={cn("min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2", className)}>
      <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{title}</h4>
      {children}
    </section>
  );
}

interface PropsRowDetailProps {
  ctx: CellContext;
  /** True while the "Your min" column is shown in the table: the field is there, so it is not repeated here. */
  minutesInTable: boolean;
  hasSeasonStats: boolean;
}

/**
 * The expanded row: the manual-minutes control and its results, then the season, matchup and line figures. It keeps the
 * default table narrow (a phone shows only a few columns) without hiding any number or the minutes override.
 */
export default function PropsRowDetail({ ctx, minutesInTable, hasSeasonStats }: PropsRowDetailProps) {
  const { row, market, draft, onDraftChange, onReset } = ctx;
  const info = minutesEditorInfo(row, market);
  return (
    <div className="sticky left-0 grid max-w-[min(72rem,calc(100vw-3rem))] gap-2 px-2 py-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
      <Section title="Your minutes" className="border-indigo-200 bg-indigo-50/40">
        {minutesInTable ? (
          <p className="mb-1.5 text-[11px] text-slate-600">Type minutes in the Your min column.</p>
        ) : (
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-600">
              {MIN_USER_MINUTES}–{MAX_USER_MINUTES} min{info.jkbMinutes !== null ? `; blank uses JKB ${info.jkbMinutes.toFixed(1)}` : ""}
            </span>
            <MinutesEditor name={row.entry.playerName} draft={draft} placeholder={info.placeholder} disabledReason={info.canEdit ? null : "No JKB minutes or season rate to work from for this player"} onChange={onDraftChange} onReset={onReset} />
          </div>
        )}
        <Lines ids={RESULT_LINES} ctx={ctx} hasSeasonStats={hasSeasonStats} />
      </Section>
      {hasSeasonStats ? (
        <Section title="Last 10 games" className="sm:order-last sm:col-span-2 lg:col-span-4">
          <RecentFormPanel row={row} market={market} />
        </Section>
      ) : null}
      {hasSeasonStats ? (
        <Section title="This season">
          <Lines ids={SEASON_LINES} ctx={ctx} hasSeasonStats={hasSeasonStats} />
        </Section>
      ) : null}
      <Section title="Opponent (est. position)">
        <Lines ids={MATCHUP_LINES} ctx={ctx} hasSeasonStats={hasSeasonStats} />
      </Section>
      <Section title="Line & JKB">
        <Lines ids={LINE_LINES} ctx={ctx} hasSeasonStats={hasSeasonStats} />
      </Section>
    </div>
  );
}

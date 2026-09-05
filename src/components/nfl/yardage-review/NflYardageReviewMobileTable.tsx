import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import type { NflYardageReviewRow } from "@/lib/nfl/props/review/yardageMarketJoin";
import { weeklyHeatClass, weeklyHeatStyle, type NflYardageOpponentContextWithHeat, type WeeklyHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import type { NflYardageReviewSortKey, NflYardageReviewSortState } from "@/lib/nfl/props/review/reviewFilters";
import { lastNameOf } from "@/lib/nfl/props/review/playerDisplayName";
import { TeamLogo } from "./NflYardageReviewTeamCell";
import { NflMatchupScoreBadgeCompact } from "./NflYardageReviewBadges";
import NflYardageReviewDetailPanel from "./NflYardageReviewDetailPanel";
import { isInteractiveTarget } from "./interactiveTarget";

/**
 * Sticky mobile category-header CELL class -- mirrors the identical contract
 * in src/components/mlb/props-mobile/PropsMobileTablePrimitives.tsx
 * (STICKY_MOBILE_HEADER_CELL_CLASS) so K Props, HR Props, and this table all
 * look and behave the same. Kept duplicated on purpose rather than a
 * cross-sport import.
 *
 * Applied to every `<th>`, NOT the `<tr>` -- `position: sticky` on a table
 * row has no reliable visible effect since a row isn't an independently
 * painted box; each header cell needs its own sticky position + opaque
 * background, or the header appears to float mid-table with body rows
 * visible through it while scrolling.
 *
 * `top-[73px]` = SiteHeader's real rendered height: `min-h-[72px]` plus its
 * own `border-b` (1px) -- see src/components/layout/SiteHeader.tsx
 * (`sticky top-0 z-[100]`). `z-30` sits below SiteHeader (z-[100]) and above
 * table body rows.
 *
 * No ancestor between the table and the page body may set ANY `overflow`
 * value other than `visible`/`clip` -- not `overflow-hidden`, not
 * `overflow-auto`, and not `overflow-x-hidden` either. Every non-`visible`
 * overflow value (including `overflow-x-hidden`) establishes a CSS
 * "scroll container" per spec, which becomes the containing block that
 * `position: sticky` resolves against -- so the header sticks relative to
 * that wrapper instead of the page viewport, and clips or detaches once the
 * wrapper scrolls out of view. The table already uses `table-fixed` with
 * explicit `colgroup` widths, so no horizontal clipping is needed to avoid
 * overflow.
 */
const STICKY_MOBILE_HEADER_CELL_CLASS =
  "sticky top-[73px] z-30 border-b border-slate-200 bg-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.06)]";

function SortArrow({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) {
    return (
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0 opacity-40" fill="none" aria-hidden="true">
        <path d="M5 6.5 8 3.5 11 6.5M5 9.5 8 12.5 11 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const d = direction === "desc" ? "M8 3v9M4.5 9 8 12.5 11.5 9" : "M8 13V4M4.5 7 8 3.5 11.5 7";
  return (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0 text-sky-700" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MobileSortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "center",
}: {
  label: string;
  sortKey: NflYardageReviewSortKey;
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  align?: "left" | "center";
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      scope="col"
      data-testid={`nfl-yardage-mobile-sort-${sortKey}`}
      aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-1.5 py-1.5", align === "left" ? "text-left" : "text-center", STICKY_MOBILE_HEADER_CELL_CLASS)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "flex items-center gap-0.5 rounded px-0.5 text-[9px] font-bold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
          align === "center" ? "mx-auto" : "",
          active ? "text-sky-800" : "text-slate-500 hover:text-slate-800",
        )}
      >
        {label}
        <SortArrow direction={active ? sort!.direction : null} />
      </button>
    </th>
  );
}

/**
 * Diff tone -- the one column on this table allowed to carry a green/red
 * signal, since it's the outcome value the whole row builds to. Positive =
 * green, negative = red, zero or unavailable = neutral gray; always bold and
 * always paired with an explicit +/- sign, never color-only.
 */
function diffToneClass(diff: number | null): string {
  if (diff == null || diff === 0) return "text-slate-500";
  return diff > 0 ? "text-emerald-700" : "text-rose-700";
}

/**
 * Dense sports-board style mobile table: Player / Proj / Line / Diff / Match
 * columns only, ~44-56px rows, no horizontal scroll. Tapping a row expands
 * the same detail panel used by the desktop table inline underneath it, one
 * player at a time. Sort state is shared with the desktop table via
 * `sort`/`onSort` -- both views always agree on the active sort.
 */
export default function NflYardageReviewMobileTable({
  entries,
  sort,
  onSort,
  opponentContextByKey,
  projectedYardsHeatByKey,
  season,
}: {
  entries: readonly NflYardageReviewRow[];
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  opponentContextByKey: ReadonlyMap<string, NflYardageOpponentContextWithHeat>;
  projectedYardsHeatByKey: ReadonlyMap<string, WeeklyHeatTone>;
  season: number;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="md:hidden" data-testid="nfl-yardage-mobile-table">
      <div className="rounded-lg border border-slate-300 shadow-sm">
        <table className="w-full table-fixed text-[11px]">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[16%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr data-testid="nfl-yardage-mobile-sticky-header">
              <MobileSortHeader label="Player" sortKey="player" sort={sort} onSort={onSort} align="left" />
              <MobileSortHeader label="Proj" sortKey="projectedYards" sort={sort} onSort={onSort} />
              <MobileSortHeader label="Line" sortKey="line" sort={sort} onSort={onSort} />
              <MobileSortHeader label="Diff" sortKey="difference" sort={sort} onSort={onSort} />
              <MobileSortHeader label="Match" sortKey="matchupScore" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {entries.map(({ row, marketInfo, band }) => {
              const rowKey = `${row.market}-${row.playerId}`;
              const context = opponentContextByKey.get(rowKey);
              const expanded = expandedKey === rowKey;
              const toggle = () => setExpandedKey(expanded ? null : rowKey);
              return (
                <Fragment key={rowKey}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 last:border-b-0 transition hover:bg-slate-50"
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    aria-label={expanded ? `Collapse details for ${row.playerName}` : `Expand details for ${row.playerName}`}
                    onClick={(event) => {
                      if (isInteractiveTarget(event.target)) return;
                      toggle();
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggle();
                    }}
                  >
                    <td className="overflow-hidden px-1.5 py-2">
                      <span className="flex min-w-0 items-baseline gap-1">
                        <TeamLogo abbr={row.team} />
                        <span className="min-w-0 truncate font-semibold text-slate-900">{lastNameOf(row.playerName)}</span>
                        {/* homeAway is the row's own canonical field -- never inferred from any display string. */}
                        <span className="shrink-0 truncate text-[9px] font-medium text-slate-500">
                          {row.homeAway === "away" ? "@" : "vs"} {row.opponent.toUpperCase()}
                        </span>
                      </span>
                    </td>
                    <td className="px-1 py-2 text-center tabular-nums">
                      {row.projectedYards != null ? (
                        <span
                          className={cn("inline-block rounded px-1 py-0.5 text-[12px] font-bold", weeklyHeatClass(projectedYardsHeatByKey.get(rowKey) ?? "missing"))}
                          style={weeklyHeatStyle(projectedYardsHeatByKey.get(rowKey) ?? "missing")}
                        >
                          {row.projectedYards.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-[12px] font-bold text-slate-900">—</span>
                      )}
                    </td>
                    {/* Secondary to Proj on purpose -- neutral, never colored by edge (that's Diff's job). */}
                    <td className="px-1 py-2 text-center tabular-nums text-slate-600">
                      {marketInfo.available ? marketInfo.line.toFixed(1) : <span className="text-slate-400">—</span>}
                    </td>
                    {/* The one column allowed a green/red signal -- it's the row's outcome value. Always bold, sign always shown, never color-only. */}
                    <td
                      className={cn("px-1 py-2 text-center tabular-nums font-bold", diffToneClass(marketInfo.available ? marketInfo.rawDifference : null))}
                      data-testid="nfl-yardage-mobile-diff-cell"
                    >
                      {marketInfo.available ? (
                        <span title="Projection minus sportsbook line -- research context only, not a recommendation">
                          {/* Zero gets no leading sign (matches the "0.0" example, not "+0.0") -- negative already carries its own "-" from toFixed. */}
                          {marketInfo.rawDifference > 0 ? "+" : ""}
                          {marketInfo.rawDifference.toFixed(1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <NflMatchupScoreBadgeCompact score={row.matchupScore?.matchupScore ?? null} band={band} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-slate-100">
                      <td colSpan={5} className="p-0">
                        <NflYardageReviewDetailPanel row={row} marketInfo={marketInfo} opponentContext={context} season={season} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

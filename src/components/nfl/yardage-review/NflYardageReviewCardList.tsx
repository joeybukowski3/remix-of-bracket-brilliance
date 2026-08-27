import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NflYardageReviewRow } from "@/lib/nfl/props/review/yardageMarketJoin";
import { weeklyHeatClass, weeklyHeatStyle, type NflYardageOpponentContextWithHeat, type WeeklyHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import NflYardageReviewTeamCell from "./NflYardageReviewTeamCell";
import { NflMatchupScoreBadge } from "./NflYardageReviewBadges";
import { marketRoleStat } from "./marketRoleStat";
import { OppEdgeCell, OppEpaAllowedCell, OppSuccessAllowedCell, OppYardsAllowedL5Cell, OppYardsAllowedSeasonCell } from "./opponentContextCells";
import NflYardageReviewDetailPanel from "./NflYardageReviewDetailPanel";

/**
 * True when a click/keydown originated on a native interactive child rather
 * than the card background. Deliberately excludes `[role="button"]` -- the
 * card itself (the `<li>`) carries that role for its own tap/keyboard
 * handling, and matching it here would make every tap on the card look like
 * a tap on an "interactive child" and never toggle.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input, select, textarea") != null;
}

/** Highly compact mobile stand-in for the desktop table -- one dense card per player, not a horizontally-scrolled table. */
export default function NflYardageReviewCardList({
  entries,
  opponentContextByKey,
  projectedYardsHeatByKey,
  season,
}: {
  entries: readonly NflYardageReviewRow[];
  opponentContextByKey: ReadonlyMap<string, NflYardageOpponentContextWithHeat>;
  projectedYardsHeatByKey: ReadonlyMap<string, WeeklyHeatTone>;
  season: number;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {entries.map(({ row, marketInfo, band }) => {
        const rowKey = `${row.market}-${row.playerId}`;
        const context = opponentContextByKey.get(rowKey);
        const expanded = expandedKey === rowKey;
        const toggle = () => setExpandedKey(expanded ? null : rowKey);
        return (
          <li
            key={rowKey}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm transition hover:border-slate-400"
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-900">{row.playerName}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <NflYardageReviewTeamCell abbr={row.team} />
                  <span aria-hidden>vs</span>
                  <NflYardageReviewTeamCell abbr={row.opponent} />
                  <span className="rounded bg-slate-100 px-1 py-0.5 font-semibold text-slate-600">{row.position}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {row.projectedYards != null ? (
                  <p
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-lg font-bold leading-tight tabular-nums",
                      weeklyHeatClass(projectedYardsHeatByKey.get(rowKey) ?? "missing"),
                    )}
                    style={weeklyHeatStyle(projectedYardsHeatByKey.get(rowKey) ?? "missing")}
                  >
                    {row.projectedYards.toFixed(1)}
                  </p>
                ) : (
                  <p className="text-lg font-bold leading-tight tabular-nums text-slate-900">—</p>
                )}
                <p className="text-[9px] uppercase tracking-wide text-slate-400">proj yds</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <NflMatchupScoreBadge score={row.matchupScore?.matchupScore ?? null} band={band} />
              {marketRoleStat(row) && <span className="text-slate-500">{marketRoleStat(row)}</span>}
            </div>

            <div className="mt-2 flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px]">
              {marketInfo.available ? (
                <>
                  <span className="font-semibold text-slate-800">
                    Line {marketInfo.line.toFixed(1)}{" "}
                    <span className="font-normal text-slate-500">({marketInfo.overPrice} / {marketInfo.underPrice})</span>
                  </span>
                  {/* Research context only -- neutral color on purpose, never green/red "bet this side" styling. */}
                  <span className="font-semibold text-slate-600" title="Projection minus sportsbook line -- research context only, not a recommendation">
                    {marketInfo.rawDifference >= 0 ? "+" : ""}
                    {marketInfo.rawDifference.toFixed(1)} diff
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Sportsbook line unavailable</span>
              )}
            </div>

            <div className="mt-1.5 grid grid-cols-5 gap-1 rounded border border-slate-200 px-2 py-1.5 text-center text-[10px]">
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">Yds All. Szn</p>
                <OppYardsAllowedSeasonCell context={context} />
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">Yds All. L5</p>
                <OppYardsAllowedL5Cell context={context} />
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">EPA Allowed Rk</p>
                <OppEpaAllowedCell context={context} />
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">Success Allowed Rk</p>
                <OppSuccessAllowedCell context={context} />
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">Team Edge</p>
                <OppEdgeCell context={context} />
              </div>
            </div>

            {/* Visual affordance only -- the whole card (li, role="button" above) handles the tap/keyboard toggle so this never nests an interactive control inside another. */}
            <div
              aria-hidden="true"
              className="pointer-events-none mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-slate-100 py-1 text-[10px] font-semibold text-slate-500"
            >
              {expanded ? "Hide details" : "Show details"}
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
            </div>
            {expanded && (
              <div id={`${rowKey}-detail`} className="-mx-2.5 -mb-2.5 mt-1.5 rounded-b-lg">
                <NflYardageReviewDetailPanel row={row} marketInfo={marketInfo} opponentContext={context} season={season} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

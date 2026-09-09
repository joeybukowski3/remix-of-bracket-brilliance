/**
 * Player Stats / Opponent Stats -- sits above the Player Last 10 / Opponent
 * Last 10 history tabs (`Last10Tabs` in NflYardageReviewDetailPanel.tsx), a
 * deliberately separate tab/panel group with its own visual identity
 * (neutral slate) so the two systems never read as one four-tab control.
 *
 * Below `md`: the tab switcher (single active panel at a time), Player
 * Stats default. Resets to Player Stats whenever a different player's panel
 * mounts (a fresh key from the parent forces remount -- see
 * NflYardageReviewDetailPanel).
 *
 * `md` and wider: both grids render side by side under a shared heading row
 * instead of tabs -- these are simple label/value rows (`NflYardageMetricGrid`),
 * not wide data tables, so unlike the Last-10 comparison (`min-[1680px]`,
 * which needs the platform layout's near-maximum content width to fit two
 * ~650px dense tables) two of these fit comfortably well below that, at the
 * same `md` breakpoint the rest of this page already uses to distinguish
 * "mobile" from "browser" layout (see NflYardageReviewDetailPanel's
 * mobile-only header and NFLYardagePropsReview's filter row).
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { NflCurrentWeekProjectionRow } from "@/lib/nfl/props/types/currentWeekProjection";
import type { NflYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";
import type { NflYardagePlayerHistory } from "@/lib/nfl/props/types/yardageHistory";
import { buildMetricGridRows, buildOpponentMetricGridRows } from "@/lib/nfl/props/review/metricGridView";
import NflYardageMetricGrid from "./NflYardageMetricGrid";

export default function NflYardageStatsTabs({
  row,
  opponentContext,
  playerHistory,
}: {
  row: NflCurrentWeekProjectionRow;
  opponentContext: NflYardageOpponentContext | undefined;
  playerHistory: NflYardagePlayerHistory | null | undefined;
}) {
  const [active, setActive] = useState<"player" | "opponent">("player");
  const tabClass = (isActive: boolean) =>
    cn(
      "rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition",
      isActive ? "border-slate-700 bg-slate-700 text-white shadow-sm" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
    );

  const playerRows = buildMetricGridRows(row, opponentContext, playerHistory);
  const opponentRows = buildOpponentMetricGridRows(row, opponentContext);

  return (
    <div>
      {/* Below `md`: the tab switcher, isolated in its own subtree (mirrors Last10Tabs/
       * Last10Comparison's split) so it never shares a DOM parent with the always-rendered
       * side-by-side grid below -- tests scope queries to this subtree via
       * `getByRole("tablist", { name: "Stats" }).parentElement`. */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Stats" className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            role="tab"
            id="stats-tab-player"
            aria-selected={active === "player"}
            aria-controls="stats-panel-player"
            tabIndex={active === "player" ? 0 : -1}
            onClick={() => setActive("player")}
            className={tabClass(active === "player")}
          >
            Player Stats
          </button>
          <button
            type="button"
            role="tab"
            id="stats-tab-opponent"
            aria-selected={active === "opponent"}
            aria-controls="stats-panel-opponent"
            tabIndex={active === "opponent" ? 0 : -1}
            onClick={() => setActive("opponent")}
            className={tabClass(active === "opponent")}
          >
            Opponent Stats
          </button>
        </div>
        <div id="stats-panel-player" role="tabpanel" aria-labelledby="stats-tab-player" className="mt-1.5">
          {active === "player" && <NflYardageMetricGrid rows={playerRows} />}
        </div>
        <div id="stats-panel-opponent" role="tabpanel" aria-labelledby="stats-tab-opponent" className="mt-1.5">
          {active === "opponent" && <NflYardageMetricGrid rows={opponentRows} />}
        </div>
      </div>

      <div className="hidden md:grid md:grid-cols-2 md:gap-3">
        <div>
          <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Player Stats</h3>
          <NflYardageMetricGrid rows={playerRows} />
        </div>
        <div>
          <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Opponent Stats</h3>
          <NflYardageMetricGrid rows={opponentRows} />
        </div>
      </div>
    </div>
  );
}

/**
 * Player Stats / Opponent Stats tab control -- sits above the Player Last
 * 10 / Opponent Last 10 history tabs (`Last10Tabs` in
 * NflYardageReviewDetailPanel.tsx), a deliberately separate
 * tablist/tab/tabpanel group with its own visual identity (neutral slate)
 * so the two tab systems never read as one four-tab control. Player Stats
 * is the default. Resets to Player Stats whenever a different player's
 * panel mounts (a fresh key from the parent forces remount -- see
 * NflYardageReviewDetailPanel).
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

  return (
    <div>
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
        {active === "player" && <NflYardageMetricGrid rows={buildMetricGridRows(row, opponentContext, playerHistory)} />}
      </div>
      <div id="stats-panel-opponent" role="tabpanel" aria-labelledby="stats-tab-opponent" className="mt-1.5">
        {active === "opponent" && <NflYardageMetricGrid rows={buildOpponentMetricGridRows(row, opponentContext)} />}
      </div>
    </div>
  );
}

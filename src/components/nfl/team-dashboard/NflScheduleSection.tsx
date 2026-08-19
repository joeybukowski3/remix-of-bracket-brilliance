import { useEffect, useState } from "react";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import type { NflTeamScheduleResponse } from "@/lib/nfl/teamSchedule";
import {
  WARREN_SHARP_SCHEDULE_SOURCE,
  getWarrenSharpRestEdgeForGame,
  getWarrenSharpScheduleProfile,
} from "@/lib/nfl/warrenSharpSchedule2026";
import NflSection from "@/components/nfl/ui/NflSection";
import NflScheduleGameCard, { type ScheduleOpponentOvr } from "./NflScheduleGameCard";
import NflWarrenSharpScheduleSummary from "./NflWarrenSharpScheduleSummary";

type LoadStatus = "loading" | "success" | "error";

export default function NflScheduleSection({
  team,
  ovrByAbbr,
}: {
  team: NflGuideTeamNormalized;
  /** Universal current 2026 OVR/rank, keyed by abbr. Undefined while the board is still loading. */
  ovrByAbbr?: ReadonlyMap<string, ScheduleOpponentOvr>;
}) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<NflTeamScheduleResponse | null>(null);
  const [error, setError] = useState("");
  const sharpSchedule = getWarrenSharpScheduleProfile(team.abbr);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    setStatus("loading");
    setError("");

    fetch(`${base}/api/nfl/team-schedule?team=${encodeURIComponent(team.abbr)}`, {
      signal: controller.signal,
    })
      .then(async (result) => {
        const payload = await result.json().catch(() => null);
        if (!result.ok || !Array.isArray(payload?.games)) {
          throw new Error(payload?.error ?? "The 2026 schedule is unavailable.");
        }
        return payload as NflTeamScheduleResponse;
      })
      .then((payload) => {
        setData(payload);
        setStatus("success");
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "The 2026 schedule is unavailable.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [team.abbr]);

  return (
    // The schedule is the main reason a visitor opens a team page, so it stays
    // expanded on mobile rather than collapsing with the deeper sections.
    <NflSection
      eyebrow="Week by week"
      title="2026 regular-season schedule"
      subtitle="Each matchup includes the opponent's current power rating, model matchup edges and Warren Sharp's relative-rest edge. Away games use a tinted background."
      bodyClassName="!px-0 !py-0"
    >
      {sharpSchedule && (
        <div className="border-b border-slate-100 px-3 py-3 sm:px-4">
          <NflWarrenSharpScheduleSummary profile={sharpSchedule} />
        </div>
      )}

      {status === "loading" && <ScheduleLoading />}
      {status === "error" && (
        <div className="p-4 text-sm leading-6 text-red-700">
          The schedule feed is unavailable right now. {error}
        </div>
      )}
      {status === "success" && data && (
        <>
          {data.stale && (
            <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Showing the most recent cached schedule.
            </div>
          )}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3">
            {data.games.map((game, index) => (
              <NflScheduleGameCard
                key={game.id}
                team={team}
                game={game}
                fallbackWeek={index + 1}
                restEdge={getWarrenSharpRestEdgeForGame(
                  sharpSchedule,
                  game.week,
                  game.opponentAbbr,
                )}
                opponentOvr={ovrByAbbr?.get(game.opponentAbbr) ?? null}
              />
            ))}
          </div>
        </>
      )}

      {sharpSchedule && (
        <p className="border-t border-slate-100 px-3 py-3 text-[11px] leading-5 text-slate-500 sm:px-4">
          Schedule-strength and rest data are derived from {WARREN_SHARP_SCHEDULE_SOURCE.title}, pages {sharpSchedule.sourcePages.strengthOfSchedule}, {sharpSchedule.sourcePages.weeklySchedule} and {sharpSchedule.sourcePages.timingSummary}. Sharp SOS is displayed with #1 as hardest for consistency with this site.
        </p>
      )}
    </NflSection>
  );
}

function ScheduleLoading() {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="animate-pulse border-b border-r border-slate-100 p-5">
          <div className="h-3 w-16 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-28 rounded bg-slate-100" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="h-14 rounded bg-slate-100" />
            <div className="h-14 rounded bg-slate-100" />
            <div className="h-14 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

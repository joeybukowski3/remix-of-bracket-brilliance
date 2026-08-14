import { useState } from "react";
import { ChevronDown } from "lucide-react";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import type { OpponentRankSummary } from "@/lib/nfl/opponentRankSummary";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

const NOT_ENOUGH_DATA = "Not enough data";

/**
 * Strength of schedule — informational context only.
 *
 * This block describes the opponents each team has already played. It is
 * deliberately inert: it does not shift, re-colour, re-order or re-weight a
 * single value in Statistical Comparison, Unit Matchups or anywhere else. The
 * ranks on this page remain raw league ranks, and toggling this block open or
 * closed changes nothing outside it.
 *
 * The figures are NOT tier-coloured, and that is deliberate rather than an
 * omission. Every other rank on this page reads "1 is best", so the shared
 * `rankTier` palette would paint an average opponent rank of 4 emerald —
 * exactly inverting the meaning, since facing the league's best teams is a
 * *hard* schedule, not a good one. The direction is stated in words instead.
 *
 * Sample size is shown, never hidden: `gamesPlayed` is what the team has
 * played, `ratedGames` is how many of those opponents the power board could
 * actually rate, and the averages are over `ratedGames`. When the two differ the
 * partial sample is called out on the row itself.
 */

/** Permanent caveat. Mirrors the doc comment in opponentRankSummary.ts. */
export const SCHEDULE_CONTEXT_DISCLAIMER =
  "Each opponent contributes the rank it holds today, not the rank it held when the game was played. This figure can therefore move in a week a team did not play, because an opponent's own form re-rates the games already behind it.";

function formatAverage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return NOT_ENOUGH_DATA;
  return value.toFixed(1);
}

/** One average, or the explicit not-enough-data state. Never blank, never zero. */
function AverageFigure({ label, value }: { label: string; value: number | null }) {
  const unavailable = value == null || !Number.isFinite(value);

  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 leading-5",
          unavailable
            ? "text-[11px] font-semibold text-slate-600"
            : "text-[17px] font-bold tabular-nums text-slate-900"
        )}
      >
        {formatAverage(value)}
      </dd>
    </div>
  );
}

/**
 * One team's card.
 *
 * The sample line is always present, so a reader never has to infer whether a
 * figure is backed by one game or seventeen.
 */
function TeamScheduleCard({
  team,
  side,
  summary,
}: {
  team: NflMatchupTeam;
  side: "away" | "home";
  summary: OpponentRankSummary;
}) {
  const partial = summary.ratedGames < summary.gamesPlayed;
  const noSample = summary.ratedGames === 0;

  return (
    <div className="rounded border border-slate-200 p-2.5">
      <div className="flex items-center gap-2">
        <NflTeamCrest team={team} side={side} size={20} />
        <span className="truncate text-[12px] font-semibold text-slate-900">{team.teamName}</span>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2">
        <AverageFigure label="Opp power" value={summary.avgOpponentPowerRank} />
        <AverageFigure label="Opp offense" value={summary.avgOpponentOffenseRank} />
        <AverageFigure label="Opp defense" value={summary.avgOpponentDefenseRank} />
      </dl>

      <p className="mt-2 text-[10px] leading-4 text-slate-600">
        {noSample ? (
          <>
            <span className="font-semibold text-slate-900">
              {summary.gamesPlayed === 0
                ? "No games played yet this season."
                : `${summary.gamesPlayed} game${summary.gamesPlayed === 1 ? "" : "s"} played, none with a rated opponent.`}
            </span>{" "}
            No average is shown and none has been estimated.
          </>
        ) : (
          <>
            Based on {summary.ratedGames} of {summary.gamesPlayed} game
            {summary.gamesPlayed === 1 ? "" : "s"} played
            {partial && (
              <>
                {" "}
                —{" "}
                <span className="font-semibold text-slate-900">
                  partial sample: {summary.gamesPlayed - summary.ratedGames} opponent
                  {summary.gamesPlayed - summary.ratedGames === 1 ? "" : "s"} unrated
                </span>
              </>
            )}
            .
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Compact schedule-context block for Team Comparison.
 *
 * Collapsible purely as a reading convenience. The disclosure governs this
 * block's own visibility and nothing else — no value, colour or ordering
 * anywhere else on the page depends on its state.
 */
export default function MatchupScheduleContext({
  matchup,
  awaySummary,
  homeSummary,
  defaultOpen = true,
}: {
  matchup: NflMatchup;
  awaySummary: OpponentRankSummary;
  homeSummary: OpponentRankSummary;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      aria-labelledby="schedule-context-heading"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h2
            id="schedule-context-heading"
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600"
          >
            Strength of Schedule
          </h2>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
            Average league rank of the opponents each team has already played.{" "}
            <span className="font-semibold text-slate-900">Lower means a tougher schedule.</span>{" "}
            Context only — it does not adjust any figure on this page.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="schedule-context-body"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {open ? "Hide" : "Show"}
          <ChevronDown
            aria-hidden
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      <div id="schedule-context-body" hidden={!open} className="px-3 py-3 sm:px-4">
        <div className="grid gap-2 @[560px]:grid-cols-2">
          <TeamScheduleCard team={matchup.away} side="away" summary={awaySummary} />
          <TeamScheduleCard team={matchup.home} side="home" summary={homeSummary} />
        </div>

        <p className="mt-2.5 text-[11px] leading-4 text-slate-600">
          Regular-season games played so far only; unplayed opponents are not included.{" "}
          {SCHEDULE_CONTEXT_DISCLAIMER}
        </p>
      </div>
    </section>
  );
}

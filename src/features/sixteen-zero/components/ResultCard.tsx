import { ChevronDown, Circle, CheckCircle2, RotateCcw, Trophy, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { Fragment, useId, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/ui/Logo";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { computePickOutcomeExtremes } from "../engine/draftPickValue";
import type { PickOutcome } from "../engine/draftPickValue";
import type { RosterScoringProfile } from "../engine/rosterScoringProfile";
import { NflTeamLogo } from "./NflTeamLogo";
import { ShareResultsButton } from "./ShareResultsButton";
import { SixteenZeroHeader } from "./SixteenZeroHeader";
import type {
  DraftSelection,
  LineupSlot,
  MatchupLineupEntry,
  ScheduleGame,
  SeasonResult,
} from "../types";

const SHARE_WATERMARK = "joeknowsball.com/16-0";
const SEASON_RESULTS_ID = "season-results";
const STARTING_ROSTER_ID = "starting-roster";

function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function JumpLinks() {
  return (
    <nav aria-label="Jump to section" className="flex flex-wrap justify-center gap-2">
      <a
        href={`#${SEASON_RESULTS_ID}`}
        onClick={(event) => scrollToSection(event, SEASON_RESULTS_ID)}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[0.75rem] font-black text-white backdrop-blur transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-200"
      >
        Season Results
      </a>
      <a
        href={`#${STARTING_ROSTER_ID}`}
        onClick={(event) => scrollToSection(event, STARTING_ROSTER_ID)}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[0.75rem] font-black text-white backdrop-blur transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-200"
      >
        Starting Roster
      </a>
    </nav>
  );
}

function DraftPickTile({
  label,
  icon,
  pick,
}: {
  label: string;
  icon: ReactNode;
  pick: PickOutcome;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left">
      <p className="flex items-center gap-1 text-[0.625rem] font-black uppercase tracking-[0.14em] text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[0.9375rem] font-black text-white">{pick.playerName}</p>
      <p className="mt-0.5 text-[0.6875rem] text-slate-400">
        {pick.team} · Round {pick.round}, Pick {pick.overallPick}
      </p>
      <p className="mt-0.5 text-[0.6875rem] text-slate-400">
        Sim {pick.simulatedContributionPPG.toFixed(1)} PPG · Proj {pick.projectedContributionPPG.toFixed(1)} PPG
      </p>
    </div>
  );
}

const LINEUP_SLOTS: LineupSlot[] = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DST"];

function opponentDisplay(entry: MatchupLineupEntry): string {
  if (!entry.nflOpponent) return "—";
  return entry.isHome ? `vs. ${entry.nflOpponent}` : `at ${entry.nflOpponent}`;
}

function LineupEntryRow({ entry }: { entry: MatchupLineupEntry }) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
      <span className="rounded bg-cyan-400/10 px-1 py-0.5 text-center text-[0.6875rem] font-black text-cyan-300">
        {entry.slot}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 truncate text-[0.8125rem] font-bold text-white">
          <NflTeamLogo team={entry.nflTeam} size={18} />
          <span className="truncate">{entry.playerName}</span>
          {entry.isTemporaryReplacement && (
            <span
              className="shrink-0 rounded bg-amber-400/15 px-1 py-0.5 text-[0.625rem] font-black uppercase tracking-wide text-amber-300"
              data-temporary-replacement
            >
              Temp
            </span>
          )}
        </span>
        <span className="block truncate text-[0.6875rem] text-slate-500">
          {entry.position} · {entry.nflTeam} · {opponentDisplay(entry)}
        </span>
      </span>
      <span className="text-right font-mono text-[0.8125rem] font-black text-white">
        {entry.points.toFixed(1)}
      </span>
    </div>
  );
}

function MatchupBoxScorePanel({ game }: { game: ScheduleGame }) {
  if (game.isBye) {
    return (
      <p className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] italic text-slate-400">
        First-round bye — no matchup was played.
      </p>
    );
  }
  if (!game.boxScore) {
    return (
      <p className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] italic text-slate-400">
        Matchup details unavailable.
      </p>
    );
  }
  const { userLineup, opponentLineup } = game.boxScore;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[0.6875rem] font-black uppercase tracking-wider text-slate-500">
          Your lineup
        </p>
        <div className="space-y-1.5">
          {userLineup.map((entry) => (
            <LineupEntryRow key={entry.slot} entry={entry} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[0.6875rem] font-black uppercase tracking-wider text-slate-500">
          {game.opponentName}
        </p>
        <div className="space-y-1.5">
          {opponentLineup.map((entry) => (
            <LineupEntryRow key={entry.slot} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchupExpandToggle({
  isOpen,
  onToggle,
  controlsId,
  label,
}: {
  isOpen: boolean;
  onToggle: () => void;
  controlsId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={controlsId}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
    >
      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
    </button>
  );
}

function stageLabel(game: ScheduleGame): string {
  if (game.fantasyWeek <= 14) return "Regular season";
  if (game.fantasyWeek === 15) return game.isBye ? "Playoff bye" : "First round";
  if (game.fantasyWeek === 16) return "Semifinal";
  return "Championship";
}

type ScheduleRow = ScheduleGame & { recordAfter: string };

function buildScheduleRows(schedule: readonly ScheduleGame[]): ScheduleRow[] {
  let wins = 0;
  let losses = 0;
  return schedule.map((game) => {
    if (game.result === "W") wins += 1;
    else if (game.result === "L") losses += 1;
    return { ...game, recordAfter: `${wins}-${losses}` };
  });
}

function ResultBadge({ game }: { game: ScheduleRow }) {
  if (game.isBye) {
    return <span className="text-xs font-black text-amber-300">BYE</span>;
  }
  if (game.result === "W") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-300">
        <CheckCircle2 className="h-4 w-4" /> WIN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-black text-rose-300">
      <XCircle className="h-4 w-4" /> LOSS
    </span>
  );
}

function SeasonScheduleSection({ schedule }: { schedule: readonly ScheduleGame[] }) {
  const rows = buildScheduleRows(schedule);
  const baseId = useId();
  const [expandedWeeks, setExpandedWeeks] = useState<ReadonlySet<number>>(new Set());

  const toggleWeek = (fantasyWeek: number) => {
    setExpandedWeeks((current) => {
      const next = new Set(current);
      if (next.has(fantasyWeek)) next.delete(fantasyWeek);
      else next.add(fantasyWeek);
      return next;
    });
  };

  return (
    <section
      id={SEASON_RESULTS_ID}
      className="border-t border-white/10 p-6 sm:p-10"
      data-season-schedule
    >
      <h2 className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-black text-white">
        Season results
      </h2>
      <p className="mt-1 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] text-slate-500">
        Every resolved week from the season simulation, in order. Select a week to see the full box score.
      </p>

      <div className="mt-4 hidden overflow-x-auto rounded-xl border border-white/10 sm:block">
        <table className="w-full min-w-[640px] text-left text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)]">
          <thead className="bg-white/[0.04] text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">Week</th>
              <th scope="col" className="px-4 py-3">Stage</th>
              <th scope="col" className="px-4 py-3">Opponent</th>
              <th scope="col" className="px-3 py-3 text-right">You</th>
              <th scope="col" className="px-3 py-3 text-right">Opp.</th>
              <th scope="col" className="px-3 py-3 text-center">Result</th>
              <th scope="col" className="px-4 py-3 text-right">Record</th>
              <th scope="col" className="px-3 py-3 text-center">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rows.map((game) => {
              const detailId = `${baseId}-detail-${game.fantasyWeek}`;
              const isOpen = expandedWeeks.has(game.fantasyWeek);
              return (
                <Fragment key={game.fantasyWeek}>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-slate-400">{game.fantasyWeek}</td>
                    <td className="px-4 py-3 font-semibold text-cyan-200">{stageLabel(game)}</td>
                    <td className="max-w-40 truncate px-4 py-3 font-semibold text-slate-200">
                      {game.opponentName}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-white">
                      {game.isBye ? "—" : game.userScore?.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-400">
                      {game.isBye ? "—" : game.opponentScore?.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <ResultBadge game={game} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">
                      {game.recordAfter}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <MatchupExpandToggle
                        isOpen={isOpen}
                        onToggle={() => toggleWeek(game.fantasyWeek)}
                        controlsId={detailId}
                        label={`${isOpen ? "Hide" : "Show"} Week ${game.fantasyWeek} matchup details`}
                      />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} id={detailId} className="bg-white/[0.02] px-4 py-4">
                        <MatchupBoxScorePanel game={game} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <ol className="mt-4 space-y-2 sm:hidden">
        {rows.map((game) => {
          const detailId = `${baseId}-mobile-detail-${game.fantasyWeek}`;
          const isOpen = expandedWeeks.has(game.fantasyWeek);
          return (
            <li
              key={game.fantasyWeek}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-black text-white">
                  Week {game.fantasyWeek} · {stageLabel(game)}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <ResultBadge game={game} />
                  <MatchupExpandToggle
                    isOpen={isOpen}
                    onToggle={() => toggleWeek(game.fantasyWeek)}
                    controlsId={detailId}
                    label={`${isOpen ? "Hide" : "Show"} Week ${game.fantasyWeek} matchup details`}
                  />
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] text-slate-300">
                <span className="min-w-0 truncate">{game.opponentName}</span>
                <span className="shrink-0 font-mono">
                  {game.isBye ? "—" : `${game.userScore?.toFixed(1)} - ${game.opponentScore?.toFixed(1)}`}
                </span>
              </div>
              <div className="mt-1 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                Record after: {game.recordAfter}
              </div>
              {isOpen && (
                <div id={detailId} className="mt-3 border-t border-white/10 pt-3">
                  <MatchupBoxScorePanel game={game} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ScoringProfileStrip({ profile }: { profile: RosterScoringProfile }) {
  const columns: Array<{
    label: string;
    value: number;
    blurb: string;
    icon: string;
    tileClass: string;
    labelClass: string;
    valueClass: string;
    blurbClass: string;
  }> = [
    {
      label: "If Everything Went Right",
      value: profile.highSidePPG,
      blurb:
        "It never happens, but this is how your team could have scored if your players consistently reached the strong end of their potential.",
      icon: "📈",
      tileClass: "border-emerald-400/25 bg-emerald-400/10",
      labelClass: "text-emerald-300",
      valueClass: "text-emerald-100",
      blurbClass: "text-emerald-200/70",
    },
    {
      label: "True Average PPG",
      value: profile.baselinePPG,
      blurb: "The projection-based average for the highest-scoring legal version of your roster. No simulation involved.",
      icon: "⚔️",
      tileClass: "border-white/15 bg-white/[0.05]",
      labelClass: "text-slate-300",
      valueClass: "text-white",
      blurbClass: "text-slate-400",
    },
    {
      label: "If Everything Went Wrong",
      value: profile.lowSidePPG,
      blurb: "This is the potential downside of your drafted team. When it rains, it pours.",
      icon: "🗑️",
      tileClass: "border-rose-400/25 bg-rose-400/10",
      labelClass: "text-rose-300",
      valueClass: "text-rose-100",
      blurbClass: "text-rose-200/70",
    },
  ];
  return (
    <div
      className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3"
      data-scoring-profile
    >
      {columns.map((column) => (
        <div
          key={column.label}
          className={`rounded-xl border px-3 py-2.5 text-left ${column.tileClass}`}
        >
          <p
            className={`flex items-center gap-1 text-[0.625rem] font-black uppercase tracking-[0.14em] ${column.labelClass}`}
          >
            <span aria-hidden="true">{column.icon}</span>
            {column.label}
          </p>
          <p className={`mt-1 text-xl font-black tracking-tight sm:text-2xl ${column.valueClass}`}>
            {column.value.toFixed(1)}
          </p>
          <p className={`mt-1 text-[0.6875rem] leading-snug ${column.blurbClass}`}>{column.blurb}</p>
        </div>
      ))}
    </div>
  );
}

type OutcomeTier = {
  badgeClass: string;
  panelGradientClass: string;
  accentTextClass: string;
  Icon: typeof Trophy;
};

function getOutcomeTier(result: SeasonResult, perfectSeason: boolean): OutcomeTier {
  if (perfectSeason || result.playoffResult === "League Champion") {
    return {
      badgeClass: "border-amber-300/30 bg-amber-400/10 text-amber-200",
      panelGradientClass: "from-amber-400/15",
      accentTextClass: "text-amber-300",
      Icon: Trophy,
    };
  }
  if (result.playoffResult === "Lost Championship") {
    return {
      badgeClass: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
      panelGradientClass: "from-emerald-400/10",
      accentTextClass: "text-emerald-300",
      Icon: CheckCircle2,
    };
  }
  if (
    result.playoffResult === "Eliminated in Semifinal" ||
    result.playoffResult === "Eliminated in First Round"
  ) {
    return {
      badgeClass: "border-rose-300/30 bg-rose-400/10 text-rose-200",
      panelGradientClass: "from-rose-400/10",
      accentTextClass: "text-rose-300",
      Icon: XCircle,
    };
  }
  return {
    badgeClass: "border-cyan-300/30 bg-cyan-400/10 text-cyan-200",
    panelGradientClass: "from-cyan-400/10",
    accentTextClass: "text-cyan-300",
    Icon: Circle,
  };
}

export function ResultCard({
  result,
  draftSlot,
  scoringProfile,
  draftSelections,
  onDraftAgain,
}: {
  result: SeasonResult;
  draftSlot: number;
  scoringProfile?: RosterScoringProfile | null;
  draftSelections?: readonly DraftSelection[];
  onDraftAgain: () => void;
}) {
  const perfectSeason =
    result.finalWins === 16 &&
    result.finalLosses === 0 &&
    result.playoffResult === "League Champion";

  const pickExtremes = draftSelections
    ? computePickOutcomeExtremes(
        draftSelections,
        draftSlot,
        SIMULATION_PLAYERS,
        result.schedule,
        DEFENSE_POSITION_RANKS,
      )
    : null;

  const tier = getOutcomeTier(result, perfectSeason);

  return (
    <div className="min-h-screen bg-[#050b16] text-white">
      <SixteenZeroHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        <section
          className="overflow-hidden rounded-3xl border border-white/10 bg-[#0a1424] shadow-2xl shadow-black/40"
          data-share-card
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/60 px-6 py-4 sm:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <Logo width={52} className="shrink-0 brightness-0 invert" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-black uppercase tracking-[0.18em] text-white">
                  JoeKnowsBall
                </p>
                <p className="truncate text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {SHARE_WATERMARK}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-cyan-200">
                16-0
              </span>
            </div>
            <ShareResultsButton result={result} bestPick={pickExtremes?.best} />
          </div>

          <div
            className={`border-b border-white/10 bg-gradient-to-b ${tier.panelGradientClass} to-transparent px-6 py-10 text-center sm:px-10 sm:py-12`}
          >
            <tier.Icon className={`mx-auto h-8 w-8 ${tier.accentTextClass}`} aria-hidden="true" />
            <p
              className={`mt-3 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-black uppercase tracking-[0.24em] ${tier.accentTextClass}`}
            >
              {result.playoffResult}
            </p>
            <h1 className="mt-2 text-5xl font-black tracking-[-0.05em] text-white sm:text-6xl">
              {result.finalWins}-{result.finalLosses}
            </h1>
            <p className="mt-2 text-[clamp(1rem,0.9rem+0.4vw,1.25rem)] font-black text-white">
              {perfectSeason ? "The perfect fantasy season." : result.playoffResult}
            </p>
          </div>

          <div className="border-b border-white/10 bg-slate-950/50 px-6 py-8 sm:px-10">
            <div className="grid gap-2.5 sm:grid-cols-3" data-share-facts>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left">
                <p className="text-[0.625rem] font-black uppercase tracking-[0.14em] text-slate-400">
                  Draft position
                </p>
                <p className="mt-1 text-[0.9375rem] font-black text-white">Pick {draftSlot}</p>
              </div>
              {pickExtremes && (
                <>
                  <DraftPickTile
                    label="Best Pick This Run"
                    icon={<TrendingUp className="h-3 w-3" aria-hidden="true" />}
                    pick={pickExtremes.best}
                  />
                  <DraftPickTile
                    label="Worst Pick This Run"
                    icon={<TrendingDown className="h-3 w-3" aria-hidden="true" />}
                    pick={pickExtremes.worst}
                  />
                </>
              )}
            </div>

            {scoringProfile && <ScoringProfileStrip profile={scoringProfile} />}
          </div>

          <div className="px-6 py-6 sm:px-10">
            <JumpLinks />
          </div>

          <div className="grid gap-8 border-t border-white/10 p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-black">
                Season summary
              </h2>
              <dl className="mt-4 divide-y divide-white/[0.08] rounded-xl border border-white/10">
                {[
                  ["Final record", `${result.finalWins}-${result.finalLosses}`],
                  ["Regular season", `${result.regularWins}-${result.regularLosses}`],
                  ["Playoff outcome", result.playoffResult],
                  ["Draft position", `Pick ${draftSlot}`],
                  ["Average weekly score", result.averageWeeklyScore.toFixed(1)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-slate-400">
                      {label}
                    </dt>
                    <dd className="text-right text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-black text-white">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <Button
                onClick={onDraftAgain}
                size="lg"
                className="mt-5 w-full bg-cyan-400 font-black text-slate-950 hover:bg-cyan-300"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Draft Again
              </Button>
            </div>

            <div id={STARTING_ROSTER_ID}>
              <h2 className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-black">
                Starting roster
              </h2>
              <p className="mt-1 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] text-slate-500">
                Highest projected legal lineup · bench stays private
              </p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {LINEUP_SLOTS.map((slot) => {
                  const player = result.startingRoster[slot];
                  return (
                    <div
                      key={slot}
                      className="grid min-h-14 grid-cols-[48px_1fr_auto] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3.5"
                    >
                      <span className="rounded bg-cyan-400/10 px-1.5 py-1 text-center text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-black text-cyan-300">
                        {slot}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-bold">
                        <NflTeamLogo team={player.team} size={22} />
                        <span className="truncate">{player.name}</span>
                      </span>
                      <span className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                        {player.team}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <SeasonScheduleSection schedule={result.schedule} />
        </section>
      </main>
    </div>
  );
}

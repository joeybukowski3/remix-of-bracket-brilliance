import { AlertTriangle, CheckCircle2, Circle, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LEAGUE_CONFIG, ROSTER_SOFT_MAXIMUMS } from "../data/engineConfig";
import {
  countRosterPositions,
  getRosterNeeds,
  minimumPicksNeededForLegalRoster,
} from "../engine/rosterRules";
import { NflTeamLogo } from "./NflTeamLogo";
import type { LineupSlot, SimulationPlayer } from "../types";

const STARTER_SLOT_POSITIONS: Array<{
  slot: LineupSlot;
  eligible: SimulationPlayer["position"][];
}> = [
  { slot: "QB", eligible: ["QB"] },
  { slot: "RB1", eligible: ["RB"] },
  { slot: "RB2", eligible: ["RB"] },
  { slot: "WR1", eligible: ["WR"] },
  { slot: "WR2", eligible: ["WR"] },
  { slot: "TE", eligible: ["TE"] },
  { slot: "FLEX", eligible: ["RB", "WR", "TE"] },
  { slot: "K", eligible: ["K"] },
  { slot: "DST", eligible: ["DST"] },
];

function assignDraftRoster(roster: readonly SimulationPlayer[]) {
  const available = [...roster].sort(
    (first, second) =>
      second.blendedPPG - first.blendedPPG ||
      first.consensusOverallRank - second.consensusOverallRank,
  );
  const starters = new Map<LineupSlot, SimulationPlayer>();
  for (const definition of STARTER_SLOT_POSITIONS) {
    const playerIndex = available.findIndex((player) =>
      definition.eligible.includes(player.position),
    );
    if (playerIndex >= 0) {
      starters.set(definition.slot, available[playerIndex]);
      available.splice(playerIndex, 1);
    }
  }
  return { starters, bench: available };
}

export function RosterContents({
  roster,
  picksRemaining,
}: {
  roster: readonly SimulationPlayer[];
  picksRemaining: number;
}) {
  const { starters, bench } = assignDraftRoster(roster);
  const counts = countRosterPositions(roster);
  const flexEligibleCount = counts.RB + counts.WR + counts.TE;
  const needs = getRosterNeeds(roster);
  const currentRound = roster.length + 1;
  const forced =
    picksRemaining > 0 &&
    minimumPicksNeededForLegalRoster(roster) === picksRemaining;
  const needsStartingSpecialist = counts.K === 0 || counts.DST === 0;
  const requirements = [
    { label: "QB", count: counts.QB, target: LEAGUE_CONFIG.rosterRequirements.QB, kind: "minimum" as const, hardMax: ROSTER_SOFT_MAXIMUMS.QB as number | undefined },
    { label: "RB", count: counts.RB, target: LEAGUE_CONFIG.rosterRequirements.RB, kind: "minimum" as const, hardMax: ROSTER_SOFT_MAXIMUMS.RB as number | undefined },
    { label: "WR", count: counts.WR, target: LEAGUE_CONFIG.rosterRequirements.WR, kind: "minimum" as const, hardMax: ROSTER_SOFT_MAXIMUMS.WR as number | undefined },
    { label: "TE", count: counts.TE, target: LEAGUE_CONFIG.rosterRequirements.TE, kind: "minimum" as const, hardMax: ROSTER_SOFT_MAXIMUMS.TE as number | undefined },
    {
      label: "RB/WR/TE",
      count: flexEligibleCount,
      target: LEAGUE_CONFIG.rosterRequirements.flexEligible,
      kind: "minimum" as const,
      hardMax: undefined as number | undefined,
    },
    { label: "K", count: counts.K, target: LEAGUE_CONFIG.rosterRequirements.K, kind: "exact" as const, hardMax: LEAGUE_CONFIG.rosterRequirements.K as number | undefined },
    { label: "DST", count: counts.DST, target: LEAGUE_CONFIG.rosterRequirements.DST, kind: "exact" as const, hardMax: LEAGUE_CONFIG.rosterRequirements.DST as number | undefined },
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-black text-white">
            Your roster
          </h2>
          <p className="text-[clamp(0.6875rem,0.65rem+0.15vw,0.8125rem)] text-slate-400">
            {roster.length}/17 players · {picksRemaining} picks left
          </p>
        </div>
        <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[clamp(0.6875rem,0.65rem+0.15vw,0.8125rem)] font-bold text-cyan-300">
          Full PPR
        </span>
      </div>
      <div
        className="mt-4 rounded-xl border border-white/[0.08] bg-slate-950/60 p-3"
        data-roster-requirements
      >
        <p className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-black uppercase tracking-[0.14em] text-slate-500">
          Roster requirements
        </p>
        <p className="mt-1.5 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] leading-relaxed text-slate-400">
          Build a legal 17-player roster. Your final two picks are reserved for a
          backup kicker and defense.
        </p>
        <div className="mt-3 space-y-1.5">
          {requirements.map(({ label, count, target, kind, hardMax }) => {
            const satisfied = count >= target;
            const isCritical = !satisfied && forced;
            const isAtHardMax = kind === "exact" ? count >= target : hardMax !== undefined && count >= hardMax;
            const state = isCritical ? "forced" : isAtHardMax ? "max" : satisfied ? "satisfied" : "incomplete";
            return (
              <div
                key={label}
                data-requirement-row={label}
                data-requirement-state={state}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-bold ${
                  state === "max"
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                    : state === "satisfied"
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                      : state === "forced"
                        ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                        : "border-amber-300/20 bg-amber-300/10 text-amber-200"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {state === "max" ? (
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : state === "satisfied" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : state === "forced" ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {label}
                </span>
                <span className="tabular-nums">
                  {count} / {target}{" "}
                  <span className="font-semibold opacity-70">
                    {kind === "exact" ? "exact" : label === "RB/WR/TE" ? "minimum" : "required"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        {needs.length > 0 ? (
          <p className="mt-2 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] leading-relaxed text-slate-500">
            Still required: {needs.join(", ")}
          </p>
        ) : null}
        {needsStartingSpecialist && currentRound < 14 ? (
          <p
            className="mt-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-bold text-amber-200"
            data-specialist-reminder
          >
            You still need a starting kicker and defense before the final backup
            rounds.
          </p>
        ) : null}
        {forced ? (
          <p
            className="mt-2 rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1.5 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-bold text-rose-200"
            data-roster-forced
          >
            Roster completion is forcing every remaining pick.
          </p>
        ) : null}
      </div>
      <div className="mt-4 space-y-1.5">
        {STARTER_SLOT_POSITIONS.map(({ slot }) => {
          const player = starters.get(slot);
          return (
            <div
              key={slot}
              className="grid min-h-10 grid-cols-[42px_1fr_auto] items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.035] px-2.5 py-2"
            >
              <span className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-black tracking-wide text-cyan-300">
                {slot}
              </span>
              {player ? (
                <>
                  <span className="flex min-w-0 items-center gap-1.5 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-semibold text-slate-100">
                    <NflTeamLogo team={player.team} size={22} />
                    <span className="truncate">{player.name}</span>
                  </span>
                  <span className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                    {player.team} · B{player.byeWeek}
                  </span>
                </>
              ) : (
                <span className="col-span-2 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-slate-600">
                  Empty
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <h3 className="text-[clamp(0.75rem,0.68rem+0.2vw,0.9375rem)] font-bold uppercase tracking-[0.14em] text-slate-500">
          Bench ({bench.length}/8)
        </h3>
        <div className="mt-2 space-y-1">
          {Array.from({ length: 8 }, (_, index) => {
            const player = bench[index];
            return (
              <div
                key={player?.id ?? `empty-${index}`}
                className="flex min-h-8 items-center justify-between rounded-md px-2 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] odd:bg-white/[0.025]"
              >
                {player ? (
                  <>
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-300">
                      <NflTeamLogo team={player.team} size={20} />
                      <span className="truncate">{player.name}</span>
                    </span>
                    <span className="ml-2 shrink-0 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                      {player.position} · {player.team}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-700">Open bench slot</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function UserRosterPanel({
  roster,
  picksRemaining,
  showMobileTrigger = true,
}: {
  roster: readonly SimulationPlayer[];
  picksRemaining: number;
  showMobileTrigger?: boolean;
}) {
  return (
    <>
      <div className="hidden rounded-2xl border border-white/10 bg-slate-900/80 p-4 lg:block">
        <RosterContents roster={roster} picksRemaining={picksRemaining} />
      </div>
      {showMobileTrigger ? <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="border-cyan-400/30 bg-slate-900 text-cyan-200 hover:bg-slate-800 hover:text-cyan-100"
            >
              <Users className="mr-2 h-4 w-4" />
              Roster {roster.length}/17
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[92vw] max-w-md overflow-y-auto border-slate-700 bg-slate-950 text-white"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Your fantasy roster</SheetTitle>
              <SheetDescription>Current starters, bench, and open roster slots.</SheetDescription>
            </SheetHeader>
            <RosterContents roster={roster} picksRemaining={picksRemaining} />
          </SheetContent>
        </Sheet>
      </div> : null}
    </>
  );
}

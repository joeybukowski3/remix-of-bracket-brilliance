import { SIMULATION_PLAYERS } from "../data";
import type { DraftSelection } from "../types";
import type { DraftPick } from "../engine/draftOrder";
import { Button } from "@/components/ui/button";
import { NflTeamLogo } from "./NflTeamLogo";

const PLAYERS_BY_ID = new Map(SIMULATION_PLAYERS.map((player) => [player.id, player]));

type DraftStatusPanelProps = {
  currentPick: DraftPick | null;
  draftSlot: number;
  isUserOnClock: boolean;
  needsStartingK?: boolean;
  needsStartingDST?: boolean;
  onDraftBestAvailable?: () => void;
};

export function DraftStatusPanel({
  currentPick,
  draftSlot,
  isUserOnClock,
  needsStartingK = false,
  needsStartingDST = false,
  onDraftBestAvailable,
}: DraftStatusPanelProps) {
  const showStartingSpecialistWarning =
    currentPick !== null &&
    currentPick.round >= 14 &&
    currentPick.round <= 15 &&
    (needsStartingK || needsStartingDST);
  const missingSpecialists = [
    needsStartingK ? "K" : null,
    needsStartingDST ? "DST" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-black/10">
        <p className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-bold uppercase tracking-[0.2em] text-cyan-300">
          Draft status
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/5 p-2">
            <span className="block text-[clamp(0.625rem,0.58rem+0.1vw,0.6875rem)] uppercase text-slate-500">
              Round
            </span>
            <strong className="text-[clamp(1.125rem,1rem+0.5vw,1.375rem)] text-white">
              {currentPick?.round ?? 17}
            </strong>
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <span className="block text-[clamp(0.625rem,0.58rem+0.1vw,0.6875rem)] uppercase text-slate-500">
              Overall
            </span>
            <strong className="text-[clamp(1.125rem,1rem+0.5vw,1.375rem)] text-white">
              {currentPick?.overallPick ?? 204}
            </strong>
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <span className="block text-[clamp(0.625rem,0.58rem+0.1vw,0.6875rem)] uppercase text-slate-500">
              Your slot
            </span>
            <strong className="text-[clamp(1.125rem,1rem+0.5vw,1.375rem)] text-amber-300">
              {draftSlot}
            </strong>
          </div>
        </div>
        <p className="mt-3 text-[clamp(0.6875rem,0.63rem+0.2vw,0.8125rem)] text-slate-400">
          {currentPick
            ? isUserOnClock
              ? `Your pick: Round ${currentPick.round}, Pick ${currentPick.overallPick}. Take your time — the draft waits for you.`
              : `Team ${currentPick.slot} is selecting…`
            : "Draft complete"}
        </p>
        {isUserOnClock && onDraftBestAvailable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onDraftBestAvailable}
            className="mt-3 w-full border-cyan-400/40 bg-transparent text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-bold text-cyan-200 hover:bg-cyan-400/10"
          >
            Draft best available
          </Button>
        ) : null}
      </div>

      {showStartingSpecialistWarning ? (
        <div
          className="rounded-xl border border-orange-300/25 bg-orange-300/10 px-3 py-2.5 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-semibold leading-relaxed text-orange-100"
          role="note"
          data-starting-specialist-warning
        >
          Starting {missingSpecialists.join(" + ")} still needed. Draft them
          before Round 15 ends; the engine will force the pick if necessary.
        </div>
      ) : null}

      {currentPick && currentPick.round >= 16 ? (
        <div
          className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2.5 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-semibold leading-relaxed text-amber-100"
          role="note"
          data-final-rounds-note
        >
          <span className="sm:hidden">
            Final 2 picks: Backup K + DST. Check bye weeks.
          </span>
          <span className="hidden sm:inline">
            Final two rounds: Draft one backup kicker and one backup defense.
            Check their bye weeks so your starters have coverage.
          </span>
        </div>
      ) : null}
    </div>
  );
}

type RecentSelectionsPanelProps = {
  recentSelections: DraftSelection[];
  allSelections: DraftSelection[];
};

export function RecentSelectionsPanel({
  recentSelections,
  allSelections,
}: RecentSelectionsPanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
      <h2 className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-bold text-white">
        Recent selections
      </h2>
      <ol className="mt-3 space-y-2">
        {recentSelections.length === 0 ? (
          <li className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] text-slate-500">
            The board is about to open.
          </li>
        ) : (
          recentSelections.map((selection) => {
            const player = PLAYERS_BY_ID.get(selection.playerId);
            return (
              <li
                key={selection.overallPick}
                className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2"
              >
                <span className="w-7 shrink-0 font-mono text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                  {selection.overallPick}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-semibold text-slate-200">
                  {player ? <NflTeamLogo team={player.team} size={18} /> : null}
                  <span className="truncate">{player?.name}</span>
                </span>
                <span className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-bold text-cyan-300">
                  {player?.position}
                </span>
              </li>
            );
          })
        )}
      </ol>
      <details className="mt-3">
        <summary className="cursor-pointer text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-semibold text-slate-400 hover:text-white">
          Full draft history ({allSelections.length})
        </summary>
        <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
          {[...allSelections].reverse().map((selection) => {
            const player = PLAYERS_BY_ID.get(selection.playerId);
            return (
              <li
                key={`history-${selection.overallPick}`}
                className="flex justify-between gap-2 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-400"
              >
                <span className="truncate">
                  {selection.overallPick}. {player?.name}
                </span>
                <span className="shrink-0">
                  T{selection.slot}
                  {selection.source === "auto" ? " · AUTO" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}

type DraftBoardProps = DraftStatusPanelProps & RecentSelectionsPanelProps;

export function DraftBoard({
  currentPick,
  draftSlot,
  isUserOnClock,
  recentSelections,
  allSelections,
  needsStartingK = false,
  needsStartingDST = false,
  onDraftBestAvailable,
}: DraftBoardProps) {
  return (
    <aside className="space-y-4">
      <DraftStatusPanel
        currentPick={currentPick}
        draftSlot={draftSlot}
        isUserOnClock={isUserOnClock}
        needsStartingK={needsStartingK}
        needsStartingDST={needsStartingDST}
        onDraftBestAvailable={onDraftBestAvailable}
      />
      <RecentSelectionsPanel recentSelections={recentSelections} allSelections={allSelections} />
    </aside>
  );
}

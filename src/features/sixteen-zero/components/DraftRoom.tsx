import { SIMULATION_PLAYERS } from "../data";
import { countRosterPositions } from "../engine/rosterRules";
import type { ReturnTypeUseDraftGame } from "../hooks/useDraftGame.types";
import { AvailablePlayersTable } from "./AvailablePlayersTable";
import { DraftBoard } from "./DraftBoard";
import { SixteenZeroHeader } from "./SixteenZeroHeader";
import { UserRosterPanel } from "./UserRosterPanel";

export function DraftRoom({ game }: { game: ReturnTypeUseDraftGame }) {
  const isUserOnClock = game.phase === "user_on_clock";
  const draftedPlayer =
    game.selections.length > 0
      ? SIMULATION_PLAYERS.find(
          (player) => player.id === game.selections[game.selections.length - 1]?.playerId,
        )
      : null;
  const userPositionCounts = countRosterPositions(game.userRoster);

  return (
    <div
      className="min-h-screen bg-[#07111f] text-white"
      data-simulation-id={game.simulationId ?? undefined}
    >
      <SixteenZeroHeader
        eyebrow={
          <div className="hidden text-right sm:block">
            <p className="text-[clamp(0.625rem,0.58rem+0.1vw,0.6875rem)] font-bold uppercase tracking-[0.18em] text-slate-500">
              JoeKnowsBall
            </p>
            <p className="text-[clamp(1.125rem,1rem+0.5vw,1.375rem)] font-black tracking-tight text-white">
              16-0 Draft Room
            </p>
          </div>
        }
        trailing={
          <div className="lg:hidden">
            <UserRosterPanel
              roster={game.userRoster}
              picksRemaining={17 - game.userRoster.length}
            />
          </div>
        }
      />

      <div
        className="sr-only"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        {isUserOnClock && game.currentPick
          ? `You are on the clock. Round ${game.currentPick.round}, overall pick ${game.currentPick.overallPick}. Take your time.`
          : draftedPlayer
            ? `${draftedPlayer.name} was drafted.`
            : "CPU teams are drafting."}
      </div>

      <main className="mx-auto grid max-w-[1800px] gap-4 px-3 py-4 sm:px-5 lg:grid-cols-[250px_minmax(0,1fr)_300px]">
        <DraftBoard
          currentPick={game.currentPick}
          draftSlot={game.draftSlot ?? 1}
          isUserOnClock={isUserOnClock}
          recentSelections={game.recentSelections}
          allSelections={game.selections}
          needsStartingK={userPositionCounts.K === 0}
          needsStartingDST={userPositionCounts.DST === 0}
          onDraftBestAvailable={game.draftBestAvailable}
        />
        <AvailablePlayersTable
          players={game.availablePlayers}
          legalPlayerIds={game.legalPlayerIds}
          canDraft={isUserOnClock}
          onDraft={game.draftPlayer}
        />
        <UserRosterPanel
          roster={game.userRoster}
          picksRemaining={17 - game.userRoster.length}
          showMobileTrigger={false}
        />
      </main>
    </div>
  );
}

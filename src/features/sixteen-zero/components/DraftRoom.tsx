import { SIMULATION_PLAYERS } from "../data";
import { countRosterPositions } from "../engine/rosterRules";
import type { ReturnTypeUseDraftGame } from "../hooks/useDraftGame.types";
import { AvailablePlayersTable } from "./AvailablePlayersTable";
import { DraftBoard, DraftStatusPanel, RecentSelectionsPanel } from "./DraftBoard";
import { MobileCollapsibleSection } from "./MobileCollapsibleSection";
import { SixteenZeroHeader } from "./SixteenZeroHeader";
import { RosterContents, UserRosterPanel } from "./UserRosterPanel";

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
        {/* Desktop-only: original left column (draft status + recent selections stacked), unchanged. */}
        <div className="hidden lg:block">
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
        </div>

        {/* Mobile-only: draft status shown first, not collapsible. */}
        <div className="order-1 lg:hidden">
          <DraftStatusPanel
            currentPick={game.currentPick}
            draftSlot={game.draftSlot ?? 1}
            isUserOnClock={isUserOnClock}
            needsStartingK={userPositionCounts.K === 0}
            needsStartingDST={userPositionCounts.DST === 0}
            onDraftBestAvailable={game.draftBestAvailable}
          />
        </div>

        {/* Shared: available players. Visible at both breakpoints; mobile gets a collapsible header, expanded by default. */}
        <MobileCollapsibleSection
          title="Available Players"
          sectionId="available-players"
          subtitle={`${game.availablePlayers.length} remaining`}
          defaultOpen
          className="order-2 lg:order-none"
        >
          <AvailablePlayersTable
            players={game.availablePlayers}
            legalPlayerIds={game.legalPlayerIds}
            canDraft={isUserOnClock}
            onDraft={game.draftPlayer}
          />
        </MobileCollapsibleSection>

        {/* Mobile-only: your roster, collapsible and collapsed by default. */}
        <MobileCollapsibleSection
          title="Your Roster"
          sectionId="your-roster"
          subtitle={`Roster ${game.userRoster.length}/17`}
          hideOnDesktop
          className="order-3"
        >
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <RosterContents roster={game.userRoster} picksRemaining={17 - game.userRoster.length} />
          </div>
        </MobileCollapsibleSection>

        {/* Desktop-only: original right column, unchanged. */}
        <UserRosterPanel
          roster={game.userRoster}
          picksRemaining={17 - game.userRoster.length}
          showMobileTrigger={false}
        />

        {/* Mobile-only: recent selections, collapsible and collapsed by default, shown last. */}
        <MobileCollapsibleSection
          title="Recent Selections"
          sectionId="recent-selections"
          subtitle={draftedPlayer ? `Latest: ${draftedPlayer.name}` : undefined}
          hideOnDesktop
          className="order-4"
        >
          <RecentSelectionsPanel
            recentSelections={game.recentSelections}
            allSelections={game.selections}
          />
        </MobileCollapsibleSection>
      </main>
    </div>
  );
}

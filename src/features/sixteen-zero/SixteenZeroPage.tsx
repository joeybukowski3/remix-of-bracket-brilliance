import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DraftRoom } from "./components/DraftRoom";
import { DraftSlotSelector } from "./components/DraftSlotSelector";
import { LandingHero } from "./components/LandingHero";
import { ResultCard } from "./components/ResultCard";
import { SeasonSimulation } from "./components/SeasonSimulation";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "./data";
import { OPPONENT_NAMES } from "./data/opponentNames";
import { computeRosterScoringProfile } from "./engine/rosterScoringProfile";
import type { RosterScoringProfile } from "./engine/rosterScoringProfile";
import { simulateSeason } from "./engine/seasonSimulation";
import { useDraftGame } from "./hooks/useDraftGame";
import { usePageSeo } from "@/hooks/usePageSeo";
import type { SeasonResult } from "./types";

type Screen = "landing" | "slot-select" | "draft" | "simulating" | "result";

export default function SixteenZeroPage() {
  const game = useDraftGame();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("landing");
  const [seasonResult, setSeasonResult] = useState<SeasonResult | null>(null);
  const [scoringProfile, setScoringProfile] = useState<RosterScoringProfile | null>(null);
  const startDraftGame = game.startDraft;

  usePageSeo({
    title: "16-0 Fantasy Football Draft Simulator",
    description:
      "Draft a 17-player full-PPR fantasy football roster and simulate a 14-game regular season plus the fantasy playoffs. Can you finish 16-0?",
    path: "/16-0",
  });

  const openSlotSelection = useCallback(() => {
    setSeasonResult(null);
    setScoringProfile(null);
    setScreen("slot-select");
  }, []);

  const startDraft = useCallback(
    (draftSlot: number) => {
      startDraftGame(draftSlot);
      setScreen("draft");
      navigate("/16-0/draft");
    },
    [navigate, startDraftGame],
  );

  useEffect(() => {
    if (
      screen !== "draft" ||
      game.phase !== "draft_complete" ||
      !game.seed ||
      !game.simulationId ||
      !game.draftSlot
    ) {
      return;
    }
    const draftedPlayerIds = new Set(
      game.selections.map((selection) => selection.playerId),
    );
    const result = simulateSeason({
      roster: game.userRoster,
      userSlot: game.draftSlot,
      allRosters: game.rosters,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
      seed: game.seed,
    });
    setSeasonResult(result);
    setScoringProfile(
      computeRosterScoringProfile(
        game.userRoster,
        SIMULATION_PLAYERS,
        draftedPlayerIds,
        DEFENSE_POSITION_RANKS,
      ),
    );
    setScreen("simulating");
  }, [
    game.draftSlot,
    game.phase,
    game.rosters,
    game.selections,
    game.seed,
    game.simulationId,
    game.userRoster,
    screen,
  ]);

  const finishAnimation = useCallback(() => {
    if (!seasonResult || !game.simulationId || !game.draftSlot) return;
    setScreen("result");
    navigate(`/16-0/result/${game.simulationId}`, { replace: true });
  }, [
    game.draftSlot,
    game.simulationId,
    navigate,
    seasonResult,
  ]);

  if (screen === "slot-select") return <DraftSlotSelector onConfirm={startDraft} />;
  if (screen === "draft") return <DraftRoom game={game} />;
  if (screen === "simulating" && seasonResult) {
    return <SeasonSimulation result={seasonResult} onComplete={finishAnimation} />;
  }
  if (screen === "result" && seasonResult) {
    return (
      <ResultCard
        result={seasonResult}
        draftSlot={game.draftSlot ?? 1}
        scoringProfile={scoringProfile}
        onDraftAgain={openSlotSelection}
      />
    );
  }
  return (
    <LandingHero
      onStart={openSlotSelection}
      initializing={game.phase === "initializing"}
    />
  );
}

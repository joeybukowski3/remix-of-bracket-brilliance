import { useCallback, useEffect, useMemo, useState } from "react";
import { LEAGUE_CONFIG } from "../data/engineConfig";
import { SIMULATION_PLAYERS } from "../data";
import {
  assignCpuStrategies,
  chooseAutoPick,
  chooseCpuPlayer,
} from "../engine/cpuDraft";
import { createSnakeDraftOrder } from "../engine/draftOrder";
import { createLocalSimulationRun } from "../engine/createLocalRun";
import { getLegalDraftCandidates } from "../engine/rosterRules";
import { SeededRandom } from "../engine/seededRandom";
import type {
  CpuStrategyProfile,
  DraftSelection,
  DraftSource,
  GamePhase,
  SimulationPlayer,
} from "../types";

type DraftState = {
  phase: GamePhase;
  simulationId: string | null;
  seed: string | null;
  draftSlot: number | null;
  currentPickIndex: number;
  selections: DraftSelection[];
  rosters: Record<number, SimulationPlayer[]>;
  strategies: Record<number, CpuStrategyProfile>;
};

const DRAFT_ORDER = createSnakeDraftOrder();

function emptyRosters() {
  return Object.fromEntries(
    Array.from({ length: LEAGUE_CONFIG.teams }, (_, index) => [index + 1, []]),
  ) as Record<number, SimulationPlayer[]>;
}

const INITIAL_STATE: DraftState = {
  phase: "landing",
  simulationId: null,
  seed: null,
  draftSlot: null,
  currentPickIndex: 0,
  selections: [],
  rosters: emptyRosters(),
  strategies: {},
};

export function useDraftGame() {
  const [state, setState] = useState<DraftState>(INITIAL_STATE);

  const startDraft = useCallback((chosenDraftSlot?: number) => {
    setState({ ...INITIAL_STATE, phase: "initializing", rosters: emptyRosters() });
    const run = createLocalSimulationRun(chosenDraftSlot);
    setState({
      ...INITIAL_STATE,
      phase: DRAFT_ORDER[0].slot === run.draftSlot ? "user_on_clock" : "cpu_drafting",
      simulationId: run.simulationId,
      seed: run.seed,
      draftSlot: run.draftSlot,
      strategies: assignCpuStrategies(run.seed, run.draftSlot),
      rosters: emptyRosters(),
    });
  }, []);

  const makePick = useCallback((player: SimulationPlayer, source: DraftSource) => {
    setState((current) => {
      const draftPick = DRAFT_ORDER[current.currentPickIndex];
      if (!draftPick || !current.seed || !current.draftSlot) return current;
      const roster = current.rosters[draftPick.slot] ?? [];
      const picksRemaining = LEAGUE_CONFIG.rounds - roster.length;
      const draftedIds = new Set(current.selections.map((selection) => selection.playerId));
      const available = SIMULATION_PLAYERS.filter(
        (candidate) => candidate.active && !draftedIds.has(candidate.id),
      );
      const legalIds = new Set(
        getLegalDraftCandidates(available, roster, picksRemaining).map(
          (candidate) => candidate.id,
        ),
      );
      if (!legalIds.has(player.id)) return current;
      if (source !== "cpu" && draftPick.slot !== current.draftSlot) return current;
      if (source === "cpu" && draftPick.slot === current.draftSlot) return current;

      const nextIndex = current.currentPickIndex + 1;
      const nextPick = DRAFT_ORDER[nextIndex];
      const nextPhase: GamePhase = !nextPick
        ? "draft_complete"
        : nextPick.slot === current.draftSlot
          ? "user_on_clock"
          : "cpu_drafting";
      return {
        ...current,
        phase: nextPhase,
        currentPickIndex: nextIndex,
        selections: [
          ...current.selections,
          {
            overallPick: draftPick.overallPick,
            round: draftPick.round,
            slot: draftPick.slot,
            playerId: player.id,
            source,
          },
        ],
        rosters: {
          ...current.rosters,
          [draftPick.slot]: [...roster, player],
        },
      };
    });
  }, []);

  const currentPick = DRAFT_ORDER[state.currentPickIndex] ?? null;
  const draftedIds = useMemo(
    () => new Set(state.selections.map((selection) => selection.playerId)),
    [state.selections],
  );
  const availablePlayers = useMemo(
    () =>
      SIMULATION_PLAYERS.filter(
        (player) => player.active && !draftedIds.has(player.id),
      ),
    [draftedIds],
  );
  const userRoster = useMemo(
    () => (state.draftSlot ? state.rosters[state.draftSlot] ?? [] : []),
    [state.draftSlot, state.rosters],
  );
  const legalPlayerIds = useMemo(() => {
    if (!state.draftSlot || state.phase !== "user_on_clock") return new Set<string>();
    return new Set(
      getLegalDraftCandidates(
        availablePlayers,
        userRoster,
        LEAGUE_CONFIG.rounds - userRoster.length,
      ).map((player) => player.id),
    );
  }, [availablePlayers, state.draftSlot, state.phase, userRoster]);

  const draftPlayer = useCallback(
    (playerId: string) => {
      const player = availablePlayers.find((candidate) => candidate.id === playerId);
      if (player && legalPlayerIds.has(player.id)) makePick(player, "user");
    },
    [availablePlayers, legalPlayerIds, makePick],
  );

  const draftBestAvailable = useCallback(() => {
    if (state.phase !== "user_on_clock") return;
    const player = chooseAutoPick(
      availablePlayers,
      userRoster,
      LEAGUE_CONFIG.rounds - userRoster.length,
    );
    makePick(player, "user");
  }, [availablePlayers, makePick, state.phase, userRoster]);

  useEffect(() => {
    if (
      state.phase !== "cpu_drafting" ||
      !state.seed ||
      !currentPick ||
      !state.draftSlot
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      const roster = state.rosters[currentPick.slot] ?? [];
      const player = chooseCpuPlayer({
        availablePlayers,
        roster,
        round: currentPick.round,
        overallPick: currentPick.overallPick,
        picksRemainingIncludingCurrent: LEAGUE_CONFIG.rounds - roster.length,
        profile: state.strategies[currentPick.slot] ?? "balanced",
        random: new SeededRandom(state.seed!).fork(`cpu-pick-${currentPick.overallPick}`),
      });
      makePick(player, "cpu");
    }, 105);
    return () => window.clearTimeout(timeout);
  }, [
    availablePlayers,
    currentPick,
    makePick,
    state.draftSlot,
    state.phase,
    state.rosters,
    state.seed,
    state.strategies,
  ]);

  return {
    ...state,
    currentPick,
    availablePlayers,
    userRoster,
    legalPlayerIds,
    recentSelections: state.selections.slice(-8).reverse(),
    startDraft,
    draftPlayer,
    draftBestAvailable,
  };
}

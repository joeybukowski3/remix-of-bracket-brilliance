import defensePayload from "./defense-ranks-2026-v1.json";
import playersPayload from "./players-2026-v1.json";
import type { DefensePositionRanks } from "../engine/lineupOptimizer";
import type { SimulationPlayer } from "../types";

export const SIMULATION_PLAYERS = playersPayload.players as SimulationPlayer[];
export const PLAYER_DATA_META = playersPayload._meta;
export const DEFENSE_POSITION_RANKS =
  defensePayload.defenseRanks as DefensePositionRanks;
export const DEFENSE_DATA_META = defensePayload._meta;


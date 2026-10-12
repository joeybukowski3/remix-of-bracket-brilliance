/**
 * Frozen inputs for the baseline-v0 golden test (public, untuned parameters). Synthetic and deterministic;
 * changing anything here invalidates the pinned outputs in baselineV0.golden.test.ts.
 */
import type { PregameTarget } from "../features";
import { BASELINE_V0_PUBLIC_PARAMS, type BaselineParams, type BaselinePriors } from "../projection";
import type { NbaPlayerGame } from "../types";
import { playerGame, TEAM_A, TEAM_C } from "./synthetic";

/** The public (untuned) benchmark parameters (re-exported for the golden test). */
export const V0_PUBLIC_PARAMS: BaselineParams = BASELINE_V0_PUBLIC_PARAMS;

export const V0_GOLDEN_PRIORS: BaselinePriors = { leagueRate: { pts: 0.47, reb: 0.19, ast: 0.11 } };

const day = (season: "2023-24" | "2024-25", index: number) => {
  const start = season === "2023-24" ? Date.UTC(2024, 0, 1) : Date.UTC(2024, 10, 1);
  return new Date(start + index * 2 * 86_400_000).toISOString().slice(0, 10);
};

function game(season: "2023-24" | "2024-25", index: number, teamId: number, minutes: number): NbaPlayerGame {
  const prefix = season === "2023-24" ? "00223" : "00224";
  return playerGame({
    playerId: 7,
    season,
    gameId: `${prefix}${String(index + 1).padStart(5, "0")}`,
    gameDate: day(season, index),
    teamId,
    minutes,
    pts: Math.round(minutes * 0.55 + (index % 4)),
    reb: Math.round(minutes * 0.2 + (index % 3)),
    ast: Math.round(minutes * 0.1 + (index % 2)),
  });
}

const PREVIOUS = Array.from({ length: 15 }, (_, i) => game("2023-24", i, TEAM_A, 20 + i));
// Current season: games 0-11 with A, absent for A's games 12-15, back for 16-18, traded to C for 19-22.
const BEFORE_ABSENCE = Array.from({ length: 12 }, (_, i) => game("2024-25", i, TEAM_A, 28 + ((i * 7) % 9)));
const RETURN = [16, 17, 18].map((i, k) => game("2024-25", i, TEAM_A, 18 + 4 * k));
const TRADED = [19, 20, 21, 22].map((i, k) => game("2024-25", i, TEAM_C, 12 + 3 * k));

export const V0_GOLDEN_HISTORY: NbaPlayerGame[] = [...PREVIOUS, ...BEFORE_ABSENCE, ...RETURN, ...TRADED];

export const V0_GOLDEN_TEAM_ROWS = [
  ...Array.from({ length: 19 }, (_, i) => ({ teamId: TEAM_A, gameDate: day("2024-25", i), seasonType: "regular" as const })),
  ...Array.from({ length: 4 }, (_, k) => ({ teamId: TEAM_C, gameDate: day("2024-25", 19 + k), seasonType: "regular" as const })),
];

const targetAt = (row: NbaPlayerGame): PregameTarget => ({ gameId: row.gameId, cutoffDate: row.gameDate, season: row.season, teamId: row.teamId });

export const V0_GOLDEN_TARGETS: PregameTarget[] = [
  targetAt(BEFORE_ABSENCE[4]),
  targetAt(RETURN[0]),
  targetAt(TRADED[0]),
  targetAt(TRADED[3]),
  { gameId: "0022409999", cutoffDate: day("2024-25", 5), season: "2024-25", teamId: TEAM_C },
];

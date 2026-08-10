import generated from "../../../../data/generated/cfb/2026-schedule-v1.json";
import type { CfbGame } from "../types";

/** Current authenticated CFBD 2026 schedule cache. Do not hand-edit. */
export const CFB_SCHEDULE_SOURCE = "live" as const;
export const CFB_GAMES_2026 = generated as CfbGame[];

export const CFB_GAMES_BY_ID: Record<string, CfbGame> = Object.fromEntries(
  CFB_GAMES_2026.map((game) => [game.id, game]),
);

export function getGamesByWeek(week: number): CfbGame[] {
  return CFB_GAMES_2026.filter((game) => game.week === week);
}
export function getGamesForTeam(teamId: string): CfbGame[] {
  return CFB_GAMES_2026.filter(
    (game) => game.awayTeamId === teamId || game.homeTeamId === teamId,
  );
}

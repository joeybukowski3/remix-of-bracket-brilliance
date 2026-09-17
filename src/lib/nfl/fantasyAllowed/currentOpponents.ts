/**
 * Resolves each team's @ / vs opponent for one schedule week, from the same
 * generated schedule (public/data/nfl/<season>/games.json / NflGameRecord)
 * every other NFL surface reads. No new schedule source.
 */

import type { NflGameRecord } from "@/lib/nfl/standings";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { CurrentOpponentLookup } from "./buildRows";

export function resolveCurrentOpponents(games: readonly NflGameRecord[], week: number): CurrentOpponentLookup {
  const lookup = new Map<string, { opponent: string | null; location: "@" | "vs" | null }>();
  for (const game of games) {
    if (game.seasonType !== "REG" || game.week !== week) continue;
    const home = normalizeNflTeamAbbr(game.homeAbbr);
    const away = normalizeNflTeamAbbr(game.awayAbbr);
    if (!home || !away) continue;
    lookup.set(home, { opponent: away, location: "vs" });
    lookup.set(away, { opponent: home, location: "@" });
  }
  return lookup;
}

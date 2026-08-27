/**
 * RESEARCH-ONLY. Leakage-safe historical reconstruction of opponent
 * yardage-production-allowed for the 2022-2025 rushing/receiving
 * context-family study (see scripts/research/nfl-yardage-context-family-
 * study.ts). Not used by any production pipeline.
 *
 * This is deliberately NOT a reuse of
 * public/data/nfl/matchup-production-allowed.json -- that artifact is fixed
 * at end-of-2025-season and can only ever answer "what did team X allow
 * across all of 2025," which cannot support a target game in, say, 2023 week
 * 6 without leaking 2023's own remaining season and all of 2024-2025 into
 * the feature. Here, every window is computed strictly from games that
 * finished BEFORE the target game's own kickoff (`gameDateUtc`), per team,
 * per season, exactly mirroring the leakage discipline already established
 * in src/lib/nfl/props/teamPlayVolume.ts's `selectPriorGamesAsOpponent`.
 *
 * Source: the existing rushing/receiving OUTCOME artifacts
 * (data/nfl/props/rushing-outcomes-v2-2022-2025.json,
 * data/nfl/props/receiving-outcomes-2022-2025.json), which are themselves
 * already-normalized stats_player_week rows -- not a re-parse of the raw
 * CSV. Passing/QB production allowed is intentionally NOT built here: QB
 * passing is out of scope for this phase.
 *
 * Position slices mirror the live-context artifact's convention
 * (scripts/lib/nfl-production-allowed-core.mjs) for continuity: rushing/ALL
 * (team-wide) + rushing/RB, receiving/{WR,TE,RB} (position-specific, no
 * team-wide fallback).
 */

export type NflHistoricalProductionAllowedGameEntry = {
  team: string;
  opponent: string;
  season: number;
  week: number;
  gameId: string;
  gameDateUtc: string;
  rushingYardsAll: number;
  rushingYardsRB: number;
  receivingYardsWR: number;
  receivingYardsTE: number;
  receivingYardsRB: number;
};

export type NflMinimalRushingOutcome = {
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  position: "QB" | "RB" | "WR" | "TE";
  rushingYards: number;
};

export type NflMinimalReceivingOutcome = {
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  position: "RB" | "WR" | "TE";
  receivingYards: number;
};

/**
 * Aggregates rushing + receiving outcome rows into one team-game production
 * log. A `gameDateUtc` resolver is required per row (season|week|team ->
 * kickoff date) -- rows with no resolvable date are dropped (never
 * defaulted to a date that could misorder them into or out of a window).
 */
export function buildHistoricalProductionAllowedGameLog(
  rushingOutcomes: readonly NflMinimalRushingOutcome[],
  receivingOutcomes: readonly NflMinimalReceivingOutcome[],
  gameDateUtc: (season: number, week: number, team: string) => string | null,
): NflHistoricalProductionAllowedGameEntry[] {
  type Acc = Omit<NflHistoricalProductionAllowedGameEntry, "gameDateUtc"> & { gameDateUtc: string | null };
  const byKey = new Map<string, Acc>();

  const keyOf = (season: number, week: number, team: string) => `${season}|${week}|${team}`;

  function entry(season: number, week: number, gameId: string | null, team: string, opponent: string): Acc {
    const key = keyOf(season, week, team);
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        team, opponent, season, week, gameId: gameId ?? "",
        gameDateUtc: gameDateUtc(season, week, team),
        rushingYardsAll: 0, rushingYardsRB: 0, receivingYardsWR: 0, receivingYardsTE: 0, receivingYardsRB: 0,
      };
      byKey.set(key, acc);
    }
    return acc;
  }

  for (const o of rushingOutcomes) {
    const acc = entry(o.season, o.week, o.gameId, o.team, o.opponent);
    acc.rushingYardsAll += o.rushingYards;
    if (o.position === "RB") acc.rushingYardsRB += o.rushingYards;
  }
  for (const o of receivingOutcomes) {
    const acc = entry(o.season, o.week, o.gameId, o.team, o.opponent);
    if (o.position === "WR") acc.receivingYardsWR += o.receivingYards;
    if (o.position === "TE") acc.receivingYardsTE += o.receivingYards;
    if (o.position === "RB") acc.receivingYardsRB += o.receivingYards;
  }

  const out: NflHistoricalProductionAllowedGameEntry[] = [];
  for (const acc of byKey.values()) {
    if (acc.gameDateUtc == null) continue; // unresolvable date -- dropped, never defaulted
    out.push({ ...acc, gameDateUtc: acc.gameDateUtc });
  }
  return out;
}

/** Games where `team` was the OPPONENT (i.e. count toward `team`'s allowed context), strictly before `beforeDateUtc`, chronological. */
export function selectPriorGamesAsOpponent(
  log: readonly NflHistoricalProductionAllowedGameEntry[],
  team: string,
  season: number,
  beforeDateUtc: string,
): NflHistoricalProductionAllowedGameEntry[] {
  return log
    .filter((g) => g.opponent === team && g.season === season && g.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
}

export function selectPriorSeasonGamesAsOpponent(
  log: readonly NflHistoricalProductionAllowedGameEntry[],
  team: string,
  priorSeason: number,
): NflHistoricalProductionAllowedGameEntry[] {
  return log.filter((g) => g.opponent === team && g.season === priorSeason);
}

const LAST5_GAME_COUNT = 5;

export type NflHistoricalAllowedWindow = { seasonPrior: number | null; last5: number | null; priorSeason: number | null };

function averageField(
  games: readonly NflHistoricalProductionAllowedGameEntry[],
  field: keyof Pick<NflHistoricalProductionAllowedGameEntry, "rushingYardsAll" | "rushingYardsRB" | "receivingYardsWR" | "receivingYardsTE" | "receivingYardsRB">,
): number | null {
  if (games.length === 0) return null; // no fallback -- an empty window is a missing feature, never a substituted number
  return games.reduce((s, g) => s + g[field], 0) / games.length;
}

/**
 * Pregame opponent-allowed window for one target game. `seasonPrior` = every
 * completed game this season strictly before kickoff; `last5` = the final 5
 * of those; `priorSeason` = the entirely-prior season's full total (fully in
 * the past, so leakage-safe -- NOT the current/live season's final numbers,
 * which the header comment explicitly forbids).
 *
 * Early season (few or zero `seasonPrior` games): `seasonPrior`/`last5`
 * resolve to null rather than a fabricated fallback; a training/scoring
 * pipeline decides separately whether to substitute `priorSeason` or a
 * league mean -- this function never makes that choice silently.
 */
export function resolveHistoricalProductionAllowedWindow(
  log: readonly NflHistoricalProductionAllowedGameEntry[],
  team: string,
  season: number,
  beforeDateUtc: string,
  field: "rushingYardsAll" | "rushingYardsRB" | "receivingYardsWR" | "receivingYardsTE" | "receivingYardsRB",
): NflHistoricalAllowedWindow {
  const priorInSeason = selectPriorGamesAsOpponent(log, team, season, beforeDateUtc);
  const last5 = priorInSeason.slice(Math.max(0, priorInSeason.length - LAST5_GAME_COUNT));
  const priorSeasonGames = selectPriorSeasonGamesAsOpponent(log, team, season - 1);
  return {
    seasonPrior: averageField(priorInSeason, field),
    last5: averageField(last5, field),
    priorSeason: averageField(priorSeasonGames, field),
  };
}

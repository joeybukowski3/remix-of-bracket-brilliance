import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import { CFB_RESEARCH_DERIVED_DIR } from "../derived/derivedConfig";
import type { CfbDerivedTeamGameMetrics, CfbGarbageTimePolicyMetrics } from "../derived/types";
import type { CfbResearchGame } from "../types";
import type { CfbAggregationMode, CfbGarbagePolicy, CfbMetricName, GameObservation } from "./types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadSeasonTeamGames(season: number): CfbDerivedTeamGameMetrics[] {
  return readJson<CfbDerivedTeamGameMetrics[]>(
    resolve(REPO_ROOT, CFB_RESEARCH_DERIVED_DIR, String(season), "team-game-metrics.json"),
  );
}

export function loadSeasonGames(season: number): CfbResearchGame[] {
  return readJson<CfbResearchGame[]>(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "games.json"));
}

const METRIC_FIELD: Record<CfbMetricName, keyof CfbGarbageTimePolicyMetrics> = {
  ypp: "ypp",
  ppp: "ppp",
  ppaPerPlay: "ppaPerPlay",
  ppaSuccessRate: "ppaSuccessRate",
  downDistanceSuccessRate: "downDistanceSuccessRate",
  explosivePlayRate: "explosivePlayRate",
};

/**
 * Builds one GameObservation per team-side per FBS-primary-population game
 * for a season, given a metric + garbage-time policy + aggregation mode.
 * defenseAllowedValue is read from the OPPONENT's own row in the same
 * game (defense-allowed is the other side's offense, not stored twice).
 */
export function buildSeasonObservations(
  teamGames: readonly CfbDerivedTeamGameMetrics[],
  games: readonly CfbResearchGame[],
  metric: CfbMetricName,
  policy: CfbGarbagePolicy,
  aggregationMode: CfbAggregationMode,
): GameObservation[] {
  const field = METRIC_FIELD[metric];
  const gameById = new Map(games.map((g) => [g.gameId, g]));
  const rowsByGameTeam = new Map<string, CfbDerivedTeamGameMetrics>();
  for (const row of teamGames) rowsByGameTeam.set(`${row.gameId}:${row.teamExternalId}`, row);

  const observations: GameObservation[] = [];
  for (const row of teamGames) {
    const opponentRow = rowsByGameTeam.get(`${row.gameId}:${row.opponentExternalId}`);
    if (!opponentRow) continue; // opponent side missing from derived data — skip rather than fabricate
    const game = gameById.get(row.gameId);
    if (!game) continue;

    const offenseMetrics = row.policyVariants[policy];
    const defenseMetrics = opponentRow.policyVariants[policy];
    const offenseValue = offenseMetrics[field] as number | null;
    const defenseAllowedValue = defenseMetrics[field] as number | null;

    const teamScore = row.homeAwayNeutral === "away" ? game.awayScore : game.homeScore;
    const opponentScore = row.homeAwayNeutral === "away" ? game.homeScore : game.awayScore;

    observations.push({
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      teamExternalId: row.teamExternalId,
      opponentExternalId: row.opponentExternalId,
      teamClassification: row.classification,
      opponentClassification: row.opponentClassification,
      isHome: row.homeAwayNeutral === "home",
      isNeutral: row.homeAwayNeutral === "neutral",
      offenseValue,
      defenseAllowedValue,
      weight: aggregationMode === "playWeighted" ? offenseMetrics.totalWeight : 1,
      actualTeamScore: teamScore,
      actualOpponentScore: opponentScore,
    });
  }
  return observations;
}

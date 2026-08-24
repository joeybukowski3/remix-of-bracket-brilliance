import { computeIterativeAdjustment } from "../phase2/iterativeAdjustment";
import { computeRidgeAdjustment } from "../phase2/ridgeAdjustment";
import { fitMarginTranslation, predictMargin } from "../phase2/marginTranslation";
import { fitStandardizer, applyStandardizer } from "../phase2/standardize";
import type { CfbMetricName, GameObservation, WalkForwardPrediction } from "../phase2/types";
import type { CfbResearchGame } from "../types";
import { blendPriorAndCurrent, type DecayConfig } from "./decay";
import { computeRidgeAdjustmentWithPrior } from "./ridgeWithPrior";
import type { PriorRatings } from "./types";

export type Phase3Method =
  | { kind: "NO_PRIOR_ITERATIVE" }
  | { kind: "NO_PRIOR_RIDGE" }
  | { kind: "ITERATIVE_WITH_PRIOR"; decay: DecayConfig }
  | { kind: "RIDGE_WITH_PRIOR"; lambda: number };

const ITERATIVE_CONFIG = { strength: 1.0, iterations: 20, minimumGames: 1 };
const RIDGE_LAMBDA_DEFAULT = 5;

function isFbsVsFbsGame(game: CfbResearchGame): boolean {
  return (
    (game.homeClassification ?? "").toLowerCase() === "fbs" &&
    (game.awayClassification ?? "").toLowerCase() === "fbs"
  );
}

export type Phase3WalkForwardOptions = {
  method: Phase3Method;
  metricSet: readonly CfbMetricName[];
  testSeasons: readonly number[];
  gamesBySeason: ReadonlyMap<number, readonly CfbResearchGame[]>;
  observationsByMetricAndSeason: ReadonlyMap<CfbMetricName, ReadonlyMap<number, readonly GameObservation[]>>;
  priorsBySeason: ReadonlyMap<number, ReadonlyMap<string, PriorRatings>>;
};

/**
 * Pure core (no file I/O) — mirrors phase2/walkForwardCore.ts's leakage
 * discipline, but restarts the "current season" observation pool at the
 * start of every test season (Section 13: within-season week-by-week
 * accumulation only; the preseason prior — computed once per season from
 * strictly-prior information — is the sole channel carrying information
 * across the season boundary).
 */
export function runPhase3WalkForwardCore(options: Phase3WalkForwardOptions): WalkForwardPrediction[] {
  const predictions: WalkForwardPrediction[] = [];
  // Season restarts have zero within-season training games at week 1, so
  // there is nothing to fit a fresh margin translation on even though the
  // *rating* is meaningful there (via the prior). Carrying forward the
  // previous test season's final-week coefficients is strictly prior
  // information (no leakage) and avoids collapsing week-1 predictions to
  // a degenerate slope=0 (which silently predicted a 0-margin tie for
  // every week-1 game and badly corrupted directional accuracy).
  let lastFittedCoefficients: ReturnType<typeof fitMarginTranslation> | null = null;

  for (const season of options.testSeasons) {
    const games = (options.gamesBySeason.get(season) ?? []).filter((g) => g.status === "final" && isFbsVsFbsGame(g));
    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
    const priors = options.priorsBySeason.get(season) ?? new Map<string, PriorRatings>();

    for (const week of weeks) {
      const trainGames = games.filter((g) => g.week < week);
      if (trainGames.length === 0 && options.method.kind.startsWith("NO_PRIOR")) continue;

      const teamIds = [...new Set(games.flatMap((g) => [g.homeExternalId, g.awayExternalId]))];
      const gamesPlayedByTeam = new Map<string, number>();
      for (const g of trainGames) {
        gamesPlayedByTeam.set(g.homeExternalId, (gamesPlayedByTeam.get(g.homeExternalId) ?? 0) + 1);
        gamesPlayedByTeam.set(g.awayExternalId, (gamesPlayedByTeam.get(g.awayExternalId) ?? 0) + 1);
      }

      function trainingObservations(metric: CfbMetricName): GameObservation[] {
        const bySeasonMap = options.observationsByMetricAndSeason.get(metric);
        const all = bySeasonMap?.get(season) ?? [];
        return all.filter((o) => o.week < week);
      }

      // Composite offense/defense per team for this week's cutoff.
      const offenseByTeam = new Map<string, number>();
      const defenseByTeam = new Map<string, number>();

      if (options.method.kind === "NO_PRIOR_ITERATIVE" || options.method.kind === "ITERATIVE_WITH_PRIOR") {
        const offenseParts = new Map<string, number[]>();
        const defenseParts = new Map<string, number[]>();
        for (const metric of options.metricSet) {
          const result = computeIterativeAdjustment(teamIds, trainingObservations(metric), ITERATIVE_CONFIG);
          const offStd = fitStandardizer(result.teams.map((t) => t.offense).filter((v): v is number => v !== null));
          const defStd = fitStandardizer(result.teams.map((t) => t.defense).filter((v): v is number => v !== null));
          for (const team of result.teams) {
            if (team.offense !== null) {
              const arr = offenseParts.get(team.teamExternalId) ?? [];
              arr.push(applyStandardizer(team.offense, offStd));
              offenseParts.set(team.teamExternalId, arr);
            }
            if (team.defense !== null) {
              const arr = defenseParts.get(team.teamExternalId) ?? [];
              arr.push(applyStandardizer(team.defense, defStd));
              defenseParts.set(team.teamExternalId, arr);
            }
          }
        }
        for (const teamId of teamIds) {
          const offParts = offenseParts.get(teamId) ?? [];
          const defParts = defenseParts.get(teamId) ?? [];
          const currentOffense = offParts.length === 0 ? null : offParts.reduce((s, v) => s + v, 0) / offParts.length;
          const currentDefense = defParts.length === 0 ? null : defParts.reduce((s, v) => s + v, 0) / defParts.length;
          const gp = gamesPlayedByTeam.get(teamId) ?? 0;

          if (options.method.kind === "NO_PRIOR_ITERATIVE") {
            if (currentOffense !== null) offenseByTeam.set(teamId, currentOffense);
            if (currentDefense !== null) defenseByTeam.set(teamId, currentDefense);
          } else {
            const prior = priors.get(teamId);
            const blendedOffense = blendPriorAndCurrent(prior?.priorOffense ?? null, currentOffense, gp, options.method.decay);
            const blendedDefense = blendPriorAndCurrent(prior?.priorDefense ?? null, currentDefense, gp, options.method.decay);
            if (blendedOffense !== null) offenseByTeam.set(teamId, blendedOffense);
            if (blendedDefense !== null) defenseByTeam.set(teamId, blendedDefense);
          }
        }
      } else {
        // RIDGE (with or without prior)
        const offenseParts = new Map<string, number[]>();
        const defenseParts = new Map<string, number[]>();
        for (const metric of options.metricSet) {
          const obs = trainingObservations(metric);
          const plain = computeRidgeAdjustment(teamIds, obs, { lambda: RIDGE_LAMBDA_DEFAULT, includeHfa: true });
          const offStd = fitStandardizer(plain.teams.map((t) => t.offense).filter((v): v is number => v !== null));
          const defStd = fitStandardizer(plain.teams.map((t) => t.defense).filter((v): v is number => v !== null));

          let resultTeams = plain.teams;
          if (options.method.kind === "RIDGE_WITH_PRIOR") {
            const priorOffenseRaw = new Map<string, number>();
            const priorDefenseRaw = new Map<string, number>();
            for (const teamId of teamIds) {
              const prior = priors.get(teamId);
              if (prior?.priorOffense !== null && prior?.priorOffense !== undefined) {
                priorOffenseRaw.set(teamId, prior.priorOffense * offStd.std + offStd.mean);
              }
              if (prior?.priorDefense !== null && prior?.priorDefense !== undefined) {
                priorDefenseRaw.set(teamId, prior.priorDefense * defStd.std + defStd.mean);
              }
            }
            const withPrior = computeRidgeAdjustmentWithPrior(
              teamIds,
              obs,
              { lambda: options.method.lambda, includeHfa: true },
              priorOffenseRaw,
              priorDefenseRaw,
            );
            resultTeams = withPrior.teams;
          }

          for (const team of resultTeams) {
            if (team.offense !== null) {
              const arr = offenseParts.get(team.teamExternalId) ?? [];
              arr.push(applyStandardizer(team.offense, offStd));
              offenseParts.set(team.teamExternalId, arr);
            }
            if (team.defense !== null) {
              const arr = defenseParts.get(team.teamExternalId) ?? [];
              arr.push(applyStandardizer(team.defense, defStd));
              defenseParts.set(team.teamExternalId, arr);
            }
          }
        }
        for (const teamId of teamIds) {
          const offParts = offenseParts.get(teamId) ?? [];
          const defParts = defenseParts.get(teamId) ?? [];
          if (offParts.length > 0) offenseByTeam.set(teamId, offParts.reduce((s, v) => s + v, 0) / offParts.length);
          if (defParts.length > 0) defenseByTeam.set(teamId, defParts.reduce((s, v) => s + v, 0) / defParts.length);
        }
      }

      const powerByTeam = new Map<string, number>();
      for (const teamId of teamIds) {
        const off = offenseByTeam.get(teamId);
        const def = defenseByTeam.get(teamId);
        if (off !== undefined && def !== undefined) powerByTeam.set(teamId, 0.5 * off + 0.5 * def);
      }

      const translationRows = trainGames
        .map((game) => {
          const home = powerByTeam.get(game.homeExternalId);
          const away = powerByTeam.get(game.awayExternalId);
          if (home === undefined || away === undefined || game.homeScore === null || game.awayScore === null) return null;
          return {
            ratingDifferential: home - away,
            actualMargin: game.homeScore - game.awayScore,
            isHome: true,
            isNeutral: game.neutralSite,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      const coefficients =
        translationRows.length > 0 ? fitMarginTranslation(translationRows) : lastFittedCoefficients;
      if (translationRows.length > 0) lastFittedCoefficients = coefficients;
      if (coefficients === null) continue; // no training games this season yet AND no prior season's fit to carry forward

      for (const game of games.filter((g) => g.week === week)) {
        const home = powerByTeam.get(game.homeExternalId);
        const away = powerByTeam.get(game.awayExternalId);
        const ratingDifferential = home !== undefined && away !== undefined ? home - away : null;
        const predictedMargin =
          ratingDifferential === null ? null : predictMargin(ratingDifferential, true, game.neutralSite, coefficients);
        const actualMargin = game.homeScore === null || game.awayScore === null ? null : game.homeScore - game.awayScore;

        predictions.push({
          season,
          week,
          gameId: game.gameId,
          homeTeamExternalId: game.homeExternalId,
          awayTeamExternalId: game.awayExternalId,
          ratingDifferential,
          predictedMargin,
          actualMargin,
        });
      }
    }
  }

  return predictions;
}

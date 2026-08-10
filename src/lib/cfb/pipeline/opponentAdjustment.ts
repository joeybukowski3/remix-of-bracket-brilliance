import { CFB_PIPELINE_CONFIG } from "./config";
import type {
  CfbOpponentAdjustmentResult,
  CfbTeamGamePerformance,
} from "./types";

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

export function computeOpponentAdjustedPerformance(
  teamIds: readonly string[],
  performances: readonly CfbTeamGamePerformance[],
  config: Pick<
    typeof CFB_PIPELINE_CONFIG,
    "opponentAdjustmentIterations" | "opponentAdjustmentStrength" | "minimumGames"
  > = CFB_PIPELINE_CONFIG,
): CfbOpponentAdjustmentResult {
  const eligible = performances.filter(
    (row) =>
      row.opponentTeamId !== null &&
      row.teamClassification?.toLowerCase() === "fbs" &&
      row.opponentClassification?.toLowerCase() === "fbs" &&
      finite(row.yardsPerPlay) &&
      finite(row.yardsPerPlayAllowed),
  );
  const leagueMean = mean(eligible.map((row) => row.yardsPerPlay as number));
  if (leagueMean === null) {
    return {
      adjusted: teamIds.map((teamId) => ({
        teamId,
        opponentAdjustedOffensiveEfficiency: null,
        opponentAdjustedDefensiveEfficiency: null,
        opponentAdjustedPointDifferential: null,
      })),
      iterations: config.opponentAdjustmentIterations,
      eligibleGameCount: 0,
    };
  }

  const byTeam = new Map<string, CfbTeamGamePerformance[]>();
  for (const row of eligible) {
    const rows = byTeam.get(row.teamId) ?? [];
    rows.push(row);
    byTeam.set(row.teamId, rows);
  }

  let offenseStrength = new Map<string, number>();
  let defenseStrength = new Map<string, number>();
  for (const teamId of teamIds) {
    const rows = byTeam.get(teamId) ?? [];
    const offense = mean(rows.map((row) => row.yardsPerPlay).filter(finite));
    const defenseAllowed = mean(rows.map((row) => row.yardsPerPlayAllowed).filter(finite));
    offenseStrength.set(teamId, offense === null ? 0 : offense - leagueMean);
    defenseStrength.set(teamId, defenseAllowed === null ? 0 : leagueMean - defenseAllowed);
  }

  for (let iteration = 0; iteration < config.opponentAdjustmentIterations; iteration += 1) {
    const nextOffense = new Map<string, number>();
    const nextDefense = new Map<string, number>();
    for (const teamId of teamIds) {
      const rows = byTeam.get(teamId) ?? [];
      if (rows.length < config.minimumGames) {
        nextOffense.set(teamId, 0);
        nextDefense.set(teamId, 0);
        continue;
      }
      const offenseValues = rows.map(
        (row) =>
          (row.yardsPerPlay as number) -
          leagueMean +
          config.opponentAdjustmentStrength * (defenseStrength.get(row.opponentTeamId as string) ?? 0),
      );
      const defenseValues = rows.map(
        (row) =>
          leagueMean -
          (row.yardsPerPlayAllowed as number) +
          config.opponentAdjustmentStrength * (offenseStrength.get(row.opponentTeamId as string) ?? 0),
      );
      nextOffense.set(teamId, mean(offenseValues) ?? 0);
      nextDefense.set(teamId, mean(defenseValues) ?? 0);
    }

    const offenseCenter = mean([...nextOffense.values()]) ?? 0;
    const defenseCenter = mean([...nextDefense.values()]) ?? 0;
    offenseStrength = new Map([...nextOffense].map(([id, value]) => [id, value - offenseCenter]));
    defenseStrength = new Map([...nextDefense].map(([id, value]) => [id, value - defenseCenter]));
  }

  return {
    adjusted: teamIds.map((teamId) => {
      const gameCount = byTeam.get(teamId)?.length ?? 0;
      if (gameCount < config.minimumGames) {
        return {
          teamId,
          opponentAdjustedOffensiveEfficiency: null,
          opponentAdjustedDefensiveEfficiency: null,
          opponentAdjustedPointDifferential: null,
        };
      }
      return {
        teamId,
        opponentAdjustedOffensiveEfficiency: leagueMean + (offenseStrength.get(teamId) ?? 0),
        opponentAdjustedDefensiveEfficiency: leagueMean - (defenseStrength.get(teamId) ?? 0),
        opponentAdjustedPointDifferential: null,
      };
    }),
    iterations: config.opponentAdjustmentIterations,
    eligibleGameCount: eligible.length / 2,
  };
}

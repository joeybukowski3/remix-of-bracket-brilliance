/**
 * Availability: P(player appears), kept separate from conditional production.
 *
 * Pregame status comes only from snapshots current before the feature cutoff.
 * Rates by status are learned from the training window only. A player whose
 * participation cannot be established after the game is excluded from scoring
 * rather than scored as a zero-minute game.
 */
import type { AvailabilityStatus } from "../sources/types";
import { FALLBACK_PARTICIPATION_RATE, STATUS_SHRINK_SAMPLES } from "./constants";
import { projectParticipation, type MinutesV1Features, type MinutesV1Params } from "./minutesV1Candidate";
import type { AvailabilityModelId } from "./types";


export interface AvailabilitySample {
  status: AvailabilityStatus | null;
  played: boolean;
}

export interface StatusRateTable {
  n: number;
  overall: number;
  byStatus: Readonly<Record<string, { n: number; played: number }>>;
}

export function trainStatusRates(samples: readonly AvailabilitySample[]): StatusRateTable {
  const byStatus: Record<string, { n: number; played: number }> = {};
  let played = 0;
  for (const sample of samples) {
    if (sample.played) played += 1;
    if (sample.status === null) continue;
    const bucket = (byStatus[sample.status] ??= { n: 0, played: 0 });
    bucket.n += 1;
    if (sample.played) bucket.played += 1;
  }
  return { n: samples.length, overall: samples.length === 0 ? FALLBACK_PARTICIPATION_RATE : played / samples.length, byStatus };
}

export interface AvailabilityInput {
  status: AvailabilityStatus | null;
  v1: MinutesV1Features;
}

export function predictAvailability(table: StatusRateTable, input: AvailabilityInput, v1Params: MinutesV1Params): Record<AvailabilityModelId, number> {
  const historyRate = projectParticipation(input.v1, { ...v1Params, participationPrior: table.overall });
  const bucket = input.status === null ? undefined : table.byStatus[input.status];
  const statusRate = bucket ? (bucket.played + STATUS_SHRINK_SAMPLES * table.overall) / (bucket.n + STATUS_SHRINK_SAMPLES) : historyRate;
  return { constant_rate: table.overall, history_rate: historyRate, status_aware: statusRate };
}

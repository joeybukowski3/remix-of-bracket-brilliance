import path from "node:path";
import { readFileOrNull, writeFileAtomic } from "./bettingLineFsUtils";
import type { TheOddsApiQuota } from "../providers/theOddsApiClient";

/**
 * The Odds API free plan is 500 credits per MONTH (not per day). This guard
 * persists the last observed quota headers and refuses to spend more credits
 * once `x-requests-remaining` drops below a configurable floor, unless the
 * operator passes `--allow-low-quota`.
 *
 * It never invents a daily budget — it only reflects the provider's own
 * `x-requests-remaining` header from the previous run.
 */

export const DEFAULT_QUOTA_REMAINING_FLOOR = 50;
export const QUOTA_STATE_VERSION = "jkb-betting-lines-quota-v1" as const;

export type BettingLineQuotaState = {
  schemaVersion: typeof QUOTA_STATE_VERSION;
  updatedAt: string;
  remaining: number | null;
  used: number | null;
  lastCost: number | null;
  lastLeague: string | null;
};

function quotaStatePath(rootDir: string): string {
  return path.join(path.resolve(rootDir), "quota-state.json");
}

export async function readQuotaState(
  rootDir: string,
): Promise<BettingLineQuotaState | null> {
  const blob = await readFileOrNull(quotaStatePath(rootDir));
  if (blob === null) return null;
  try {
    const parsed = JSON.parse(blob) as BettingLineQuotaState;
    if (parsed && parsed.schemaVersion === QUOTA_STATE_VERSION) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function writeQuotaState(
  rootDir: string,
  quota: TheOddsApiQuota,
  league: string,
  now: () => string,
): Promise<BettingLineQuotaState> {
  const state: BettingLineQuotaState = {
    schemaVersion: QUOTA_STATE_VERSION,
    updatedAt: now(),
    remaining: quota.remaining,
    used: quota.used,
    lastCost: quota.lastCost,
    lastLeague: league,
  };
  await writeFileAtomic(quotaStatePath(rootDir), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export class BettingLineQuotaFloorError extends Error {
  readonly remaining: number;
  readonly floor: number;
  constructor(remaining: number, floor: number) {
    super(
      `The Odds API quota is low: ${remaining} credit(s) remaining, floor is ${floor}. ` +
        "Refusing to spend more this run. Pass --allow-low-quota to override once the " +
        "monthly reset is near or the spend is essential.",
    );
    this.name = "BettingLineQuotaFloorError";
    this.remaining = remaining;
    this.floor = floor;
  }
}

/**
 * Throw {@link BettingLineQuotaFloorError} when the last known `remaining` is
 * below `floor` and the override is not set. A missing / unparseable state file
 * never blocks (first run has no history).
 */
export function assertQuotaHeadroom(input: {
  lastKnown: BettingLineQuotaState | null;
  floor?: number;
  allowLowQuota: boolean;
}): void {
  if (input.allowLowQuota) return;
  const floor = input.floor ?? DEFAULT_QUOTA_REMAINING_FLOOR;
  const remaining = input.lastKnown?.remaining;
  if (typeof remaining === "number" && remaining < floor) {
    throw new BettingLineQuotaFloorError(remaining, floor);
  }
}

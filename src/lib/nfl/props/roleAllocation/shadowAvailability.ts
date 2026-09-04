/**
 * WU4F.1 §4: explicit, machine-readable shadow-availability contract.
 *
 * The rushing-v2 shadow allocator is diagnostic-only and non-blocking to
 * production by design (see rushingShadowAllocation.ts) -- a shadow
 * failure must never affect a production row's projectedCarries or any
 * other numeric field. But "non-blocking" had been implemented as a silent
 * skip: a team with no WU4A row, or a team whose allocation call threw,
 * simply left `allocation_diagnostics: null` with no record of why. This
 * type distinguishes SHADOW_AVAILABLE from an always-explicit
 * SHADOW_UNAVAILABLE reason, so a coverage gap is a labeled, queryable
 * fact instead of an ambiguous null.
 */

export type NflShadowAvailabilityStatus = "available" | "unavailable";

export type NflShadowUnavailableReason =
  | "missing_shadow_artifact"
  | "invalid_shadow_artifact"
  | "missing_team_opportunity"
  | "missing_team_row"
  | "allocation_failure"
  | "other";

export interface NflShadowAvailability {
  shadow_status: NflShadowAvailabilityStatus;
  shadow_unavailable_reason: NflShadowUnavailableReason | null;
}

export function shadowAvailable(): NflShadowAvailability {
  return { shadow_status: "available", shadow_unavailable_reason: null };
}

export function shadowUnavailable(reason: NflShadowUnavailableReason): NflShadowAvailability {
  return { shadow_status: "unavailable", shadow_unavailable_reason: reason };
}

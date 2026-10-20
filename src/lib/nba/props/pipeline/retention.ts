/**
 * Retention caps per odds source.
 *
 * A snapshot is kept permanently unless its source's record names a cap.
 * Expiry is reported here and acted on only by an explicit, separately
 * approved purge: the stores have no delete, and nothing in this module can
 * remove a row.
 */
import type { NbaPregameSnapshot } from "./contracts";
import { ODDS_SOURCE_PROFILES, type OddsSourceProfile } from "./oddsSources";

const DAY_MS = 86_400_000;

/** ISO instant after which a snapshot from this source must not be kept, or null for no cap. */
export function retentionDeadline(capturedAtUtc: string, capDays: number | null): string | null {
  if (capDays === null) return null;
  if (!Number.isFinite(capDays) || capDays <= 0) throw new Error("retention cap must be a positive number of days");
  return new Date(Date.parse(capturedAtUtc) + capDays * DAY_MS).toISOString();
}

/** Snapshots whose source cap has passed at `now`. A source with no cap never expires. */
export function expiredSnapshots(snapshots: readonly NbaPregameSnapshot[], now: Date, profiles: Readonly<Record<string, Pick<OddsSourceProfile, "retentionCapDays">>> = ODDS_SOURCE_PROFILES): NbaPregameSnapshot[] {
  return snapshots.filter((snapshot) => {
    const profile = profiles[snapshot.source.sourceId];
    const deadline = profile ? retentionDeadline(snapshot.timing.capturedAtUtc, profile.retentionCapDays) : null;
    return deadline !== null && Date.parse(deadline) <= now.getTime();
  });
}

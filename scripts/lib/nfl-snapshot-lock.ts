/**
 * WU3.2 -- deterministic pregame-safety/locking rules for the snapshot
 * stream. "Locked" is never a stored flag -- it is always derived from
 * kickoff vs. the current time, so there is nothing to desync or forget to
 * flip. Existing snapshots remain readable forever; locking only blocks
 * creation of a NEW pregame snapshot.
 */

import type { SnapshotType } from "./nfl-snapshot-types";

/** True once kickoff has passed -- no new pregame snapshot may be created for this game/model from this point on. */
export function isPregameStreamLocked(kickoffUtc: string, now: () => Date = () => new Date()): boolean {
  const kickoffMs = Date.parse(kickoffUtc);
  if (!Number.isFinite(kickoffMs)) {
    throw new Error(`isPregameStreamLocked: kickoffUtc "${kickoffUtc}" is not a parseable timestamp.`);
  }
  return now().getTime() >= kickoffMs;
}

export interface CanCreatePregameSnapshotInput {
  kickoffUtc: string;
  researchCutoff: string;
  snapshotType: SnapshotType;
  now?: () => Date;
}

export type CanCreatePregameSnapshotResult = { ok: true } | { ok: false; reason: string };

/**
 * The two hard pregame-safety gates, checked independently:
 *   1. researchCutoff must never be after kickoff -- a snapshot's research
 *      cannot claim to reflect information from after the game started.
 *   2. the stream must not already be locked (now >= kickoff) -- once the
 *      game has started, no new pregame snapshot of ANY type ("initial",
 *      "daily_update", or the final "gameday") may be created. Existing
 *      snapshots are untouched; only new creation is blocked.
 */
export function canCreatePregameSnapshot(input: CanCreatePregameSnapshotInput): CanCreatePregameSnapshotResult {
  const kickoffMs = Date.parse(input.kickoffUtc);
  const cutoffMs = Date.parse(input.researchCutoff);
  if (!Number.isFinite(kickoffMs)) return { ok: false, reason: `kickoffUtc "${input.kickoffUtc}" is not a parseable timestamp` };
  if (!Number.isFinite(cutoffMs)) return { ok: false, reason: `researchCutoff "${input.researchCutoff}" is not a parseable timestamp` };

  if (cutoffMs > kickoffMs) {
    return { ok: false, reason: `researchCutoff (${input.researchCutoff}) is after kickoff (${input.kickoffUtc}) -- pregame snapshots cannot reflect postgame information` };
  }

  const now = input.now ?? (() => new Date());
  if (isPregameStreamLocked(input.kickoffUtc, now)) {
    return { ok: false, reason: `pregame snapshot stream is locked -- kickoff (${input.kickoffUtc}) has already passed; cannot create a new "${input.snapshotType}" snapshot` };
  }

  return { ok: true };
}

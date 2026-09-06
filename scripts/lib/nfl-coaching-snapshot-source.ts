/**
 * Coaching Rating v1 — Phase C. Per-game coaching-snapshot selection shared
 * by the Sides and Totals performance generators.
 *
 * Selection contract:
 *   - historical game (season < current-ratings season): the point-in-time
 *     data/nfl/coaching/rating-snapshots/<season>/<week>.json, refused if its
 *     cutoff is later than the game's kickoff (would leak);
 *   - current/upcoming game: the current-ratings adapter
 *     (nfl-coach-rating-current-adapter.ts), which itself returns null unless
 *     its derived source cutoff is strictly earlier than kickoff;
 *   - anything missing/invalid -> null -> buildCoachingContext() emits
 *     SOURCE_UNAVAILABLE. A historical game NEVER falls back to current
 *     ratings.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adaptCurrentRatingsToSnapshot,
  type CoachEffectiveOverride,
  type CurrentRatingsArtifact,
} from "./nfl-coach-rating-current-adapter";
import type { CoachRatingSnapshot } from "./nfl-game-context";

export type CoachingSnapshotSelector = (game: {
  season: number;
  week: number;
  kickoffUtc: string | null;
}) => CoachRatingSnapshot | null;

function loadJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function createCoachingSnapshotSelector(root: string): CoachingSnapshotSelector {
  const snapshotRoot = join(root, "data", "nfl", "coaching", "rating-snapshots");
  const current = loadJsonIfExists<CurrentRatingsArtifact>(
    join(root, "public", "data", "nfl", "coaching-ratings.json")
  );
  const overrides =
    loadJsonIfExists<{ overrides?: CoachEffectiveOverride[] }>(
      join(root, "data", "nfl", "coaching", "coach-effective-overrides.json")
    )?.overrides ?? [];
  const currentSeason = current?._meta?.season ?? null;
  const snapshotCache = new Map<string, CoachRatingSnapshot | null>();

  return ({ season, week, kickoffUtc }) => {
    const isHistorical = currentSeason == null ? true : season < currentSeason;

    if (isHistorical) {
      const key = `${season}/${week}`;
      if (!snapshotCache.has(key)) {
        snapshotCache.set(
          key,
          loadJsonIfExists<CoachRatingSnapshot>(join(snapshotRoot, String(season), `${week}.json`))
        );
      }
      const snapshot = snapshotCache.get(key) ?? null;
      if (!snapshot) return null;
      if (
        kickoffUtc != null &&
        snapshot.generated_from_cutoff != null &&
        snapshot.generated_from_cutoff > kickoffUtc
      ) {
        return null;
      }
      return snapshot;
    }

    const result = adaptCurrentRatingsToSnapshot({
      artifact: current,
      targetSeason: season,
      targetWeek: week,
      gameKickoffUtc: kickoffUtc,
      overrides,
    });
    return result.status === "OK" ? result.snapshot : null;
  };
}

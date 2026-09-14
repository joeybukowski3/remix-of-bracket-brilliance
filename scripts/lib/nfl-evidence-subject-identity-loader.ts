/**
 * WU2.2 -- production I/O wrapper for the subject-identity loader. Reads the
 * three authoritative repo artifacts for one season off disk and hands them
 * to the pure core (nfl-evidence-subject-identity-loader-core.ts). This is
 * the ONLY file in the loader that touches the filesystem.
 *
 * Sources read (all optional -- a missing file degrades the corresponding
 * part of the result to "unavailable" rather than throwing):
 *   - data/nfl/nflverse/weekly-rosters/roster_weekly_<season>.csv
 *   - data/nfl/nflverse/depth-charts/depth_charts_<season>.csv
 *   - public/data/nfl/coaching-ratings.json
 *
 * No AI/API/network access -- repo-local files only.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./nfl-schedules-results-core.mjs";
import { buildSubjectIdentitySource, type CoachingRatingsArtifact, type DepthChartRow, type GameFacts, type WeeklyRosterRow } from "./nfl-evidence-subject-identity-loader-core";
import type { SubjectIdentitySource } from "./nfl-evidence-types";

function readCsvIfExists<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const text = readFileSync(filePath, "utf8");
  return parseCsv(text) as T[];
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

/**
 * Loads a SubjectIdentitySource for one game, reading repo-local nflverse
 * roster/depth-chart caches and the coaching-ratings artifact for the
 * game's season. `root` is the repo root (same convention as
 * createCoachingSnapshotSelector in nfl-coaching-snapshot-source.ts).
 */
export function loadSubjectIdentitySource(root: string, gameFacts: GameFacts): SubjectIdentitySource {
  const weeklyRosterRows = readCsvIfExists<WeeklyRosterRow>(join(root, "data", "nfl", "nflverse", "weekly-rosters", `roster_weekly_${gameFacts.season}.csv`));
  const depthChartRows = readCsvIfExists<DepthChartRow>(join(root, "data", "nfl", "nflverse", "depth-charts", `depth_charts_${gameFacts.season}.csv`));
  const coachingRatings = readJsonIfExists<CoachingRatingsArtifact>(join(root, "public", "data", "nfl", "coaching-ratings.json"));

  return buildSubjectIdentitySource({ gameFacts, weeklyRosterRows, depthChartRows, coachingRatings });
}

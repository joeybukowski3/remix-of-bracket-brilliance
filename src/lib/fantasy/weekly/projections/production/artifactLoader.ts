import {
  weeklyFantasyProjectionProductionArtifactSchema,
  weeklyFantasyProjectionProductionArtifactPath,
  type WeeklyFantasyProjectionProductionArtifact,
} from "./artifactContract";

export class WeeklyFantasyProjectionArtifactNotFoundError extends Error {}

export type WeeklyFantasyProjectionArtifactLoadState =
  | { status: "loading"; season: number; week: number }
  | { status: "ready"; artifact: WeeklyFantasyProjectionProductionArtifact; rows: WeeklyFantasyProjectionProductionArtifact["rows"]; freshness: { inputAsOf: string; generatedAt: string } }
  | { status: "missing"; season: number; week: number; error: WeeklyFantasyProjectionArtifactNotFoundError }
  | { status: "error"; season: number; week: number; error: Error };

export function weeklyFantasyProjectionArtifactLoadingState(season: number, week: number): WeeklyFantasyProjectionArtifactLoadState {
  weeklyFantasyProjectionProductionArtifactPath(season, week);
  return { status: "loading", season, week };
}

/** Loads and validates the production projection artifact; never re-sorts or recomputes rank. */
export async function loadWeeklyFantasyProjectionArtifact(
  season: number,
  week: number,
  fetcher: typeof fetch = fetch,
): Promise<WeeklyFantasyProjectionProductionArtifact> {
  const path = weeklyFantasyProjectionProductionArtifactPath(season, week);
  const response = await fetcher(path, { cache: "no-store" });
  if (response.status === 404) throw new WeeklyFantasyProjectionArtifactNotFoundError(`Weekly fantasy projection artifact is unavailable: ${path}`);
  if (!response.ok) throw new Error(`Weekly fantasy projection artifact request failed (${response.status}): ${path}`);
  if (response.headers.get("content-type")?.includes("text/html")) {
    throw new WeeklyFantasyProjectionArtifactNotFoundError(`Weekly fantasy projection artifact is unavailable: ${path}`);
  }
  return weeklyFantasyProjectionProductionArtifactSchema.parse(await response.json());
}

export async function loadWeeklyFantasyProjectionState(
  season: number,
  week: number,
  fetcher: typeof fetch = fetch,
): Promise<WeeklyFantasyProjectionArtifactLoadState> {
  try {
    const artifact = await loadWeeklyFantasyProjectionArtifact(season, week, fetcher);
    if (artifact.season !== season || artifact.week !== week) {
      // Never silently substitute another week's artifact.
      return { status: "missing", season, week, error: new WeeklyFantasyProjectionArtifactNotFoundError(`Artifact season/week mismatch for ${season}/${week}.`) };
    }
    return {
      status: "ready", artifact, rows: artifact.rows,
      freshness: { inputAsOf: artifact.inputAsOf, generatedAt: artifact.generatedAt },
    };
  } catch (error) {
    if (error instanceof WeeklyFantasyProjectionArtifactNotFoundError) return { status: "missing", season, week, error };
    return { status: "error", season, week, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

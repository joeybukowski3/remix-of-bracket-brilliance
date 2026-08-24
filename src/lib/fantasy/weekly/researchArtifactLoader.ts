import {
  assertWeeklyFantasyResearchArtifactIdentity,
  weeklyFantasyResearchArtifactPath,
  weeklyFantasyResearchArtifactSchema,
  type WeeklyFantasyResearchArtifact,
} from "@/lib/fantasy/weekly/researchArtifact";

export class WeeklyFantasyResearchArtifactNotFoundError extends Error {}

export type WeeklyFantasyResearchArtifactLoadState =
  | { status: "loading"; season: number; week: number }
  | { status: "ready"; artifact: WeeklyFantasyResearchArtifact }
  | { status: "missing"; season: number; week: number; error: WeeklyFantasyResearchArtifactNotFoundError }
  | { status: "error"; season: number; week: number; error: Error };

export function weeklyFantasyResearchArtifactLoadingState(
  season: number,
  week: number,
): WeeklyFantasyResearchArtifactLoadState {
  weeklyFantasyResearchArtifactPath(season, week);
  return { status: "loading", season, week };
}

export async function loadWeeklyFantasyResearchArtifact(
  season: number,
  week: number,
  fetcher: typeof fetch = fetch,
): Promise<WeeklyFantasyResearchArtifact> {
  const path = weeklyFantasyResearchArtifactPath(season, week);
  const response = await fetcher(path, { cache: "no-store" });
  if (response.status === 404 || response.headers.get("content-type")?.includes("text/html")) {
    throw new WeeklyFantasyResearchArtifactNotFoundError(`Weekly fantasy research artifact is unavailable: ${path}`);
  }
  if (!response.ok) throw new Error(`Weekly fantasy research artifact request failed (${response.status}): ${path}`);
  const artifact = weeklyFantasyResearchArtifactSchema.parse(await response.json());
  assertWeeklyFantasyResearchArtifactIdentity(artifact);
  return artifact;
}

export async function loadWeeklyFantasyResearchState(
  season: number,
  week: number,
  fetcher: typeof fetch = fetch,
): Promise<WeeklyFantasyResearchArtifactLoadState> {
  try {
    const artifact = await loadWeeklyFantasyResearchArtifact(season, week, fetcher);
    if (artifact.season !== season || artifact.week !== week) {
      return {
        status: "missing",
        season,
        week,
        error: new WeeklyFantasyResearchArtifactNotFoundError(`Research artifact season/week mismatch for ${season}/${week}.`),
      };
    }
    return { status: "ready", artifact };
  } catch (error) {
    if (error instanceof WeeklyFantasyResearchArtifactNotFoundError) return { status: "missing", season, week, error };
    return { status: "error", season, week, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

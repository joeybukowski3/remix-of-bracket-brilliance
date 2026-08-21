import { weeklyFantasyRankingArtifactSchema, type WeeklyFantasyRankingArtifact } from "./productionAuthority";

export class WeeklyFantasyArtifactNotFoundError extends Error {}

export type WeeklyFantasyArtifactLoadState =
  | { status: "loading"; season: number; week: number }
  | { status: "ready"; artifact: WeeklyFantasyRankingArtifact; rankings: WeeklyFantasyRankingArtifact["rankings"]; provenance: WeeklyFantasyRankingArtifact["provenance"]; freshness: { inputAsOf: string; generatedAt: string } }
  | { status: "missing"; season: number; week: number; error: WeeklyFantasyArtifactNotFoundError }
  | { status: "error"; season: number; week: number; error: Error };

export function weeklyFantasyArtifactLoadingState(season: number, week: number): WeeklyFantasyArtifactLoadState {
  weeklyFantasyArtifactPath(season, week);
  return { status: "loading", season, week };
}

export function weeklyFantasyArtifactPath(season: number, week: number): string {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) throw new Error("Invalid fantasy artifact season/week");
  return `/data/fantasy/weekly/${season}/week-${String(week).padStart(2, "0")}.json`;
}

/** Loads and validates an artifact; ranking is never calculated in this loader. */
export async function loadWeeklyFantasyRankingArtifact(
  season: number,
  week: number,
  fetcher: typeof fetch = fetch,
): Promise<WeeklyFantasyRankingArtifact> {
  const path = weeklyFantasyArtifactPath(season, week);
  const response = await fetcher(path, { cache: "no-store" });
  if (response.status === 404) throw new WeeklyFantasyArtifactNotFoundError(`Weekly fantasy artifact is unavailable: ${path}`);
  if (!response.ok) throw new Error(`Weekly fantasy artifact request failed (${response.status}): ${path}`);
  if (response.headers.get("content-type")?.includes("text/html")) {
    throw new WeeklyFantasyArtifactNotFoundError(`Weekly fantasy artifact is unavailable: ${path}`);
  }
  return weeklyFantasyRankingArtifactSchema.parse(await response.json());
}

export async function loadWeeklyFantasyRankingState(
  season: number,
  week: number,
  fetcher: typeof fetch = fetch,
): Promise<WeeklyFantasyArtifactLoadState> {
  try {
    const artifact = await loadWeeklyFantasyRankingArtifact(season, week, fetcher);
    return {
      status: "ready", artifact, rankings: artifact.rankings, provenance: artifact.provenance,
      freshness: { inputAsOf: artifact.inputAsOf, generatedAt: artifact.generatedAt },
    };
  } catch (error) {
    if (error instanceof WeeklyFantasyArtifactNotFoundError) return { status: "missing", season, week, error };
    return { status: "error", season, week, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

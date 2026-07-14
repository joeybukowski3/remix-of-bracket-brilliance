import { useEffect, useState } from "react";
import {
  deepFreeze,
  validateNflV03ReviewArtifact,
  type NflV03ArtifactByKind,
  type NflV03ArtifactKind,
  type NflV03ReviewSeason,
} from "@/lib/nfl/v03Review";

const NFL_V03_ARTIFACT_FILES: Record<NflV03ArtifactKind, string> = {
  fullSeason: "full-season-team-metrics.json",
  finalEight: "final-eight-team-metrics.json",
  preseason: "preseason-power-ratings.json",
  contextFlags: "context-flags.json",
  manualAdjustments: "manual-adjustments.json",
};

const ARTIFACT_KINDS = Object.keys(NFL_V03_ARTIFACT_FILES) as NflV03ArtifactKind[];

function artifactPath(season: NflV03ReviewSeason, kind: NflV03ArtifactKind): string {
  return `/data/nfl/${season}/${NFL_V03_ARTIFACT_FILES[kind]}`;
}

export type NflV03ArtifactSlot = {
  kind: NflV03ArtifactKind;
  path: string;
  status: "loaded" | "missing" | "error";
  error: string | null;
};

export type NflV03ReviewData = {
  season: NflV03ReviewSeason;
  artifacts: Partial<NflV03ArtifactByKind>;
  slots: Record<NflV03ArtifactKind, NflV03ArtifactSlot>;
};

type State = {
  loading: boolean;
  error: string | null;
  data: NflV03ReviewData | null;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadNflV03Artifacts(
  season: NflV03ReviewSeason,
  fetcher: FetchLike = fetch,
  signal?: AbortSignal
): Promise<NflV03ReviewData> {
  const loaded = await Promise.all(
    ARTIFACT_KINDS.map(async (kind) => {
      const path = artifactPath(season, kind);
      try {
        const response = await fetcher(path, { cache: "no-store", signal });
        if (response.status === 404) {
          return { kind, path, status: "missing" as const, error: null, artifact: null };
        }
        if (!response.ok) {
          return {
            kind,
            path,
            status: "error" as const,
            error: `${path} returned HTTP ${response.status}`,
            artifact: null,
          };
        }
        const json: unknown = await response.json();
        const artifact = validateNflV03ReviewArtifact(kind, season, json, path);
        return { kind, path, status: "loaded" as const, error: null, artifact };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return {
          kind,
          path,
          status: "error" as const,
          error: `${path}: ${error instanceof Error ? error.message : "Unknown validation error"}`,
          artifact: null,
        };
      }
    })
  );

  const artifacts: Partial<NflV03ArtifactByKind> = {};
  const slots = {} as Record<NflV03ArtifactKind, NflV03ArtifactSlot>;
  loaded.forEach((entry) => {
    slots[entry.kind] = {
      kind: entry.kind,
      path: entry.path,
      status: entry.status,
      error: entry.error,
    };
    if (entry.artifact) {
      Object.assign(artifacts, { [entry.kind]: entry.artifact });
    }
  });

  return deepFreeze({ season, artifacts, slots });
}

export function useNflV03Artifacts(season: NflV03ReviewSeason): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null, data: null });
    loadNflV03Artifacts(season, fetch, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ loading: false, error: null, data });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, error: error.message, data: null });
        }
      });
    return () => controller.abort();
  }, [season]);

  return state;
}

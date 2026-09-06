import { useNflPerformanceArtifact, type NflPerformanceArtifactState } from "./useNflPerformanceArtifact";
import type {
  NflPerformanceHealthArtifact,
  NflPerformanceOverviewArtifact,
  NflPropsPerformanceArtifact,
  NflTotalsPerformanceArtifact,
} from "@/types/nfl/performance";

function isOverviewShape(json: unknown): json is NflPerformanceOverviewArtifact {
  const candidate = json as Partial<NflPerformanceOverviewArtifact> | null;
  return Boolean(candidate && candidate.totals && candidate.props && candidate.sides);
}

function isTotalsShape(json: unknown): json is NflTotalsPerformanceArtifact {
  const candidate = json as Partial<NflTotalsPerformanceArtifact> | null;
  return Boolean(candidate && candidate.summary && Array.isArray(candidate.rows) && candidate.buckets);
}

function isPropsShape(json: unknown): json is NflPropsPerformanceArtifact {
  const candidate = json as Partial<NflPropsPerformanceArtifact> | null;
  return Boolean(candidate && candidate.summary && Array.isArray(candidate.rows) && candidate.coverage);
}

function isHealthShape(json: unknown): json is NflPerformanceHealthArtifact {
  const candidate = json as Partial<NflPerformanceHealthArtifact> | null;
  return Boolean(candidate && candidate.totals && candidate.props && candidate.sides);
}

export type NflPerformanceData = {
  overview: NflPerformanceArtifactState<NflPerformanceOverviewArtifact>;
  totals: NflPerformanceArtifactState<NflTotalsPerformanceArtifact>;
  props: NflPerformanceArtifactState<NflPropsPerformanceArtifact>;
  health: NflPerformanceArtifactState<NflPerformanceHealthArtifact>;
};

/**
 * Loads the four canonical /nfl/performance artifacts independently. Each
 * family fetches and validates on its own -- a failure or malformed payload
 * in one (most likely health.json, which is diagnostic-only) never blocks
 * the others from rendering their tab.
 */
export function useNflPerformanceData(): NflPerformanceData {
  const overview = useNflPerformanceArtifact("/data/nfl/performance/overview.json", isOverviewShape, "Performance overview");
  const totals = useNflPerformanceArtifact("/data/nfl/performance/totals.json", isTotalsShape, "Totals performance");
  const props = useNflPerformanceArtifact("/data/nfl/performance/props.json", isPropsShape, "Starter props performance");
  const health = useNflPerformanceArtifact("/data/nfl/performance/health.json", isHealthShape, "Model health");

  return { overview, totals, props, health };
}

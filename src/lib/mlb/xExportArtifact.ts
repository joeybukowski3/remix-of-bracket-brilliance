// Typed, browser-safe access to the immutable X selection artifact
// (scripts/lib/mlb-x-selection-artifact.mjs). The bare export routes decode
// the artifact straight from the `?d=` query param, so what they render is a
// pure function of the exact rows the readiness gate selected for this attempt
// -- there is no separate fetch of a live table that could have changed.
import { decodeArtifact } from "../../../scripts/lib/mlb-x-selection-artifact.mjs";

export interface HrArtifactRow {
  rank: number;
  playerId: number | null;
  gameId: number | null;
  player: string;
  team: string;
  opponent: string;
  battingOrder: number | null;
  hrScore: number | null;
  hrOddsYes: string | null;
  opposingPitcher: string | null;
}

export interface KArtifactRow {
  rank: number;
  pitcherId: number | null;
  gameId: number | null;
  pitcher: string;
  team: string;
  opponent: string;
  side: string;
  kLine: number | null;
  odds: string | null;
  /** THE resolved production projection that was frozen for this attempt. */
  projectedKs: number | null;
  projectionEdge: number | null;
  bookmaker: string | null;
  legacyProjectedKs?: number | null;
  v2ProjectedKs?: number | null;
  projectionSource?: string | null;
  projectionFallbackReason?: string | null;
  v2Confidence?: string | null;
}

export interface SelectionArtifact<Row = HrArtifactRow | KArtifactRow> {
  contentType: "hr" | "k";
  slateDate: string;
  generatedAt: string;
  confirmationAsOf: string | null;
  earliestFirstPitch: string | null;
  minutesUntilFirstPitch: number | null;
  phase: string | null;
  selectionStatus: string;
  rows: Row[];
}

/** Decode the artifact from the `?d=` param, or null if absent/malformed. */
export function decodeArtifactParam<Row>(param: string | null): SelectionArtifact<Row> | null {
  if (!param) return null;
  try {
    return decodeArtifact(param) as SelectionArtifact<Row>;
  } catch {
    return null;
  }
}

export function formatSlateDateLabel(dateValue: string | null | undefined): string {
  const raw = (dateValue ?? "").trim();
  if (!raw) return "";
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatSignedEdge(edge: number | null): string {
  if (edge == null || !Number.isFinite(edge)) return "";
  return `${edge > 0 ? "+" : ""}${edge.toFixed(1)}`;
}

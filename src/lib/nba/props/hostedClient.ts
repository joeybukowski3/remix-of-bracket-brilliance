/**
 * Browser side of the hosted NBA board: fetch the published snapshot and judge how fresh it is. Nothing is stored in the
 * page and nothing is sent but a plain GET. Everything not understood becomes an explicit state.
 */
import { BOARD_SCHEMA_VERSION, type PropsBoardArtifact } from "./propsBoard";

export const HOSTED_BOARD_URL = "/api/nba/props-board";
export const NO_SNAPSHOT_REASON = "No NBA props snapshot has been published yet.";

/** A snapshot published longer ago than this, or lines captured longer ago than this, are shown as stale. */
export const SNAPSHOT_STALE_AFTER_HOURS = 12;
export const LINES_STALE_AFTER_HOURS = 3;
const MS_PER_HOUR = 3_600_000;

export interface SnapshotFreshness {
  publishedAtUtc: string;
  publishedAgeHours: number;
  /** When the statistics were retrieved from their source, as the board records it. */
  statisticsRetrievedUtc: string | null;
  /** The most recent sportsbook capture on any displayed line; null when the board has no line. */
  newestLineCaptureUtc: string | null;
  lineAgeHours: number | null;
  /** The sportsbook lines were captured longer ago than LINES_STALE_AFTER_HOURS: prices may have moved. */
  linesStale: boolean;
  /** The snapshot was published longer ago than SNAPSHOT_STALE_AFTER_HOURS. */
  snapshotStale: boolean;
  staleReasons: string[];
  isStale: boolean;
}

const ageHours = (iso: string, nowMs: number): number => Math.max(0, (nowMs - Date.parse(iso)) / MS_PER_HOUR);

/** Evaluated when the page renders, never when the board was built, so the indicator cannot go out of date. */
export function snapshotFreshness(board: PropsBoardArtifact, publishedAtUtc: string, nowMs: number): SnapshotFreshness {
  const captures = board.entries.flatMap((entry) => (entry.line ? [Date.parse(entry.line.capturedAtUtc)] : [])).filter((ms) => Number.isFinite(ms));
  const newestLineCaptureUtc = captures.length > 0 ? new Date(Math.max(...captures)).toISOString().replace(/\.\d{3}Z$/, "Z") : null;
  const publishedAgeHours = ageHours(publishedAtUtc, nowMs);
  const lineAgeHours = newestLineCaptureUtc ? ageHours(newestLineCaptureUtc, nowMs) : null;
  const snapshotStale = publishedAgeHours > SNAPSHOT_STALE_AFTER_HOURS;
  const linesStale = lineAgeHours !== null && lineAgeHours > LINES_STALE_AFTER_HOURS;
  const staleReasons = [
    ...(snapshotStale ? [`published more than ${SNAPSHOT_STALE_AFTER_HOURS} hours ago`] : []),
    ...(linesStale ? [`sportsbook lines captured more than ${LINES_STALE_AFTER_HOURS} hours ago`] : []),
  ];
  return { publishedAtUtc, publishedAgeHours, statisticsRetrievedUtc: board.sources.dvpUpdatedUtc, newestLineCaptureUtc, lineAgeHours, linesStale, snapshotStale, staleReasons, isStale: staleReasons.length > 0 };
}

export type HostedLoad =
  | { kind: "ready"; board: PropsBoardArtifact; tier: "full" | "lines-only"; publishedAtUtc: string; attribution: string; notice: string | null }
  | { kind: "empty"; reason: string; snapshotMissing: boolean };

const NOT_AVAILABLE = "The NBA props board is not available right now.";
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: FetchLike = (input, init) => fetch(input, init);
const unavailable = (reason: string = NOT_AVAILABLE, snapshotMissing = false): HostedLoad => ({ kind: "empty", reason, snapshotMissing });

const isBoard = (value: unknown): value is PropsBoardArtifact =>
  typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === BOARD_SCHEMA_VERSION && Array.isArray((value as PropsBoardArtifact).entries) && Array.isArray((value as PropsBoardArtifact).dvpRows);

/** Reads the published snapshot. A plain same-origin GET: the CDN's cache, not the page, decides how fresh it is. */
export async function fetchHostedBoard(fetchImpl: FetchLike = defaultFetch): Promise<HostedLoad> {
  let response: Response;
  try {
    response = await fetchImpl(HOSTED_BOARD_URL, { headers: { accept: "application/json" } });
  } catch {
    return unavailable();
  }
  if (response.status === 404 && (response.headers.get("content-type") ?? "").includes("application/json")) return unavailable(NO_SNAPSHOT_REASON, true);
  if (!response.ok) return unavailable();
  try {
    const body: unknown = await response.json();
    const { tier, publishedAtUtc, attribution, notice, board } = (body ?? {}) as { tier?: unknown; publishedAtUtc?: unknown; attribution?: unknown; notice?: unknown; board?: unknown };
    if ((tier === "full" || tier === "lines-only") && typeof publishedAtUtc === "string" && typeof attribution === "string" && isBoard(board)) {
      return { kind: "ready", board, tier, publishedAtUtc, attribution, notice: typeof notice === "string" ? notice : null };
    }
  } catch {
    // An HTML app shell (no function on this host) fails JSON parsing: same as unavailable.
  }
  return unavailable();
}

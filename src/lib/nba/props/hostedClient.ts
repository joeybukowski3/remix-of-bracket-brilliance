/**
 * Browser side of the hosted private board: fetch the owner's snapshot, sign in and sign out. Same-origin cookies only;
 * nothing is stored in the page (no token, no localStorage). Everything not understood becomes an explicit state.
 */
import { BOARD_SCHEMA_VERSION, type PropsBoardArtifact } from "./propsBoard";

export const HOSTED_BOARD_URL = "/api/nba/props-board";
export const NO_SNAPSHOT_REASON = "No private NBA snapshot has been published yet.";

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
  const staleReasons = [
    ...(publishedAgeHours > SNAPSHOT_STALE_AFTER_HOURS ? [`published more than ${SNAPSHOT_STALE_AFTER_HOURS} hours ago`] : []),
    ...(lineAgeHours !== null && lineAgeHours > LINES_STALE_AFTER_HOURS ? [`sportsbook lines captured more than ${LINES_STALE_AFTER_HOURS} hours ago`] : []),
  ];
  return { publishedAtUtc, publishedAgeHours, statisticsRetrievedUtc: board.sources.dvpUpdatedUtc, newestLineCaptureUtc, lineAgeHours, staleReasons, isStale: staleReasons.length > 0 };
}

export type HostedLoad =
  | { kind: "ready"; board: PropsBoardArtifact; tier: "full" | "lines-only"; publishedAtUtc: string }
  | { kind: "login" }
  | { kind: "empty"; reason: string; snapshotMissing: boolean };

const NOT_AVAILABLE = "No private NBA board is available on this site.";
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: FetchLike = (input, init) => fetch(input, init);
const unavailable = (reason: string = NOT_AVAILABLE, snapshotMissing = false): HostedLoad => ({ kind: "empty", reason, snapshotMissing });

const isBoard = (value: unknown): value is PropsBoardArtifact =>
  typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === BOARD_SCHEMA_VERSION && Array.isArray((value as PropsBoardArtifact).entries) && Array.isArray((value as PropsBoardArtifact).dvpRows);

export async function fetchHostedBoard(fetchImpl: FetchLike = defaultFetch): Promise<HostedLoad> {
  let response: Response;
  try {
    response = await fetchImpl(HOSTED_BOARD_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  } catch {
    return unavailable();
  }
  if (response.status === 401) return { kind: "login" };
  if (response.status === 404 && (response.headers.get("content-type") ?? "").includes("application/json")) return unavailable(NO_SNAPSHOT_REASON, true);
  if (response.status === 503) return unavailable("Private access is not configured on this deployment.");
  if (!response.ok) return unavailable();
  try {
    const body: unknown = await response.json();
    const { tier, publishedAtUtc, board } = (body ?? {}) as { tier?: unknown; publishedAtUtc?: unknown; board?: unknown };
    if ((tier === "full" || tier === "lines-only") && typeof publishedAtUtc === "string" && isBoard(board)) return { kind: "ready", board, tier, publishedAtUtc };
  } catch {
    // An HTML app shell (no function on this host) fails JSON parsing: same as unavailable.
  }
  return unavailable();
}

export async function signIn(passphrase: string, fetchImpl: FetchLike = defaultFetch): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetchImpl(HOSTED_BOARD_URL, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase }) });
    if (response.ok) return { ok: true };
    if (response.status === 429) return { ok: false, message: "Too many attempts. Try again later." };
    if (response.status === 503) return { ok: false, message: "Private access is not configured on this deployment." };
    return { ok: false, message: "That passphrase was not accepted." };
  } catch {
    return { ok: false, message: "Could not reach the server." };
  }
}

export async function signOut(fetchImpl: FetchLike = defaultFetch): Promise<void> {
  try {
    await fetchImpl(HOSTED_BOARD_URL, { method: "DELETE", credentials: "same-origin" });
  } catch {
    // The cookie simply stays until it expires; the next load shows the board or the login again.
  }
}

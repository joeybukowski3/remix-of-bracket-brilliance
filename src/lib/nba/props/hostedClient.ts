/**
 * Browser side of the hosted private board: fetch the owner's snapshot, sign in and sign out. Same-origin cookies only;
 * nothing is stored in the page (no token, no localStorage). Everything not understood becomes an explicit state.
 */
import { BOARD_SCHEMA_VERSION, type PropsBoardArtifact } from "./propsBoard";

export const HOSTED_BOARD_URL = "/api/nba/props-board";
export const NO_SNAPSHOT_REASON = "No private NBA snapshot has been published yet.";

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

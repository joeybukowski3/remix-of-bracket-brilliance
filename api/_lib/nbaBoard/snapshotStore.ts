// Hosted NBA snapshot storage: one row in a Supabase table that only the service role can reach.
// Server-only. The table has row level security enabled and no policy, so the anon key shipped in the browser bundle
// returns nothing (supabase/migrations/20261029_nba_board_snapshots.sql).
import { supabaseAdminFetch } from "../supabase.js";

export const SNAPSHOT_ROW_ID = "current";
const TABLE_PATH = "/rest/v1/nba_board_snapshots";

export interface SnapshotStore {
  /** The stored envelope exactly as saved (unvalidated), or null when nothing was published. */
  read(): Promise<unknown | null>;
  write(envelope: unknown): Promise<void>;
}

export type StoreFailureCategory = "config" | "network" | "unauthorized" | "forbidden" | "not-found" | "bad-request" | "upstream" | "bad-body" | "unclassified";

/** A store failure reduced to fields that are safe to log: no URL, header, key, message or row content. */
export class SnapshotStoreError extends Error {
  constructor(
    readonly category: StoreFailureCategory,
    readonly status?: number,
    /** A PostgREST/Postgres code (PGRST205, 42501) or a system code (ENOTFOUND), only when it is a short token. */
    readonly code?: string,
    readonly errorName?: string,
  ) {
    super(`snapshot read failed (${category})`);
    this.name = "SnapshotStoreError";
  }
}

const SAFE_CODE = /^[A-Za-z0-9_]{3,16}$/;
const safeCode = (value: unknown): string | undefined => (typeof value === "string" && SAFE_CODE.test(value) ? value : undefined);

function categoryForStatus(status: number): StoreFailureCategory {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status >= 500) return "upstream";
  return "bad-request";
}

/** Only the `code` field of the error body is read; the message and hint can echo identifiers, so they are never touched. */
async function errorBodyCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? safeCode((body as { code?: unknown }).code) : undefined;
  } catch {
    return undefined;
  }
}

function classifyRequestFailure(error: unknown): SnapshotStoreError {
  if (error instanceof Error && error.message.startsWith("Missing SUPABASE")) return new SnapshotStoreError("config");
  const cause = error instanceof Error ? (error as { cause?: { code?: unknown } }).cause : undefined;
  return new SnapshotStoreError("network", undefined, safeCode(cause?.code), error instanceof Error ? error.name : undefined);
}

/** One log-safe line for a failed store call, e.g. "category=not-found status=404 code=PGRST205". */
export function describeStoreFailure(error: unknown): string {
  if (!(error instanceof SnapshotStoreError)) return "category=unclassified";
  const parts = [`category=${error.category}`];
  if (error.status !== undefined) parts.push(`status=${error.status}`);
  if (error.errorName) parts.push(`error=${error.errorName}`);
  if (error.code) parts.push(`code=${error.code}`);
  return parts.join(" ");
}

export function createSupabaseSnapshotStore(fetchAdmin: typeof supabaseAdminFetch = supabaseAdminFetch): SnapshotStore {
  return {
    async read() {
      let response: Response;
      try {
        response = await fetchAdmin(`${TABLE_PATH}?id=eq.${SNAPSHOT_ROW_ID}&select=envelope&limit=1`, { headers: { Accept: "application/json" } });
      } catch (error) {
        throw classifyRequestFailure(error);
      }
      if (!response.ok) throw new SnapshotStoreError(categoryForStatus(response.status), response.status, await errorBodyCode(response));
      let rows: unknown;
      try {
        rows = await response.json();
      } catch {
        throw new SnapshotStoreError("bad-body", response.status);
      }
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const row = rows[0] as { envelope?: unknown };
      return row.envelope ?? null;
    },
    async write(envelope) {
      const response = await fetchAdmin(`${TABLE_PATH}?on_conflict=id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: SNAPSHOT_ROW_ID, envelope, published_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(`snapshot write failed (${response.status})`);
    },
  };
}

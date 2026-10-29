// Hosted NBA snapshot storage: one row in a Supabase table that only the service role can reach.
// Server-only. The table has row level security enabled and no policy, so the anon key shipped in the browser bundle
// returns nothing (supabase/migrations/20261029_nba_board_snapshots.sql).
import { supabaseAdminFetch } from "../supabase";

export const SNAPSHOT_ROW_ID = "current";
const TABLE_PATH = "/rest/v1/nba_board_snapshots";

export interface SnapshotStore {
  /** The stored envelope exactly as saved (unvalidated), or null when nothing was published. */
  read(): Promise<unknown | null>;
  write(envelope: unknown): Promise<void>;
}

export function createSupabaseSnapshotStore(fetchAdmin: typeof supabaseAdminFetch = supabaseAdminFetch): SnapshotStore {
  return {
    async read() {
      const response = await fetchAdmin(`${TABLE_PATH}?id=eq.${SNAPSHOT_ROW_ID}&select=envelope&limit=1`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`snapshot read failed (${response.status})`);
      const rows: unknown = await response.json();
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

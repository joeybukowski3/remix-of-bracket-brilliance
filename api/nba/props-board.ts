// GET /api/nba/props-board  the NBA props snapshot that /nba/props renders (public, cached, read-only)
//
// The single serverless function for the NBA board. All logic lives in api/_lib/nbaBoard so it can be tested; see
// docs/nba-hosted-props.md. It reads one row from the snapshot table with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (process.env only, never returned) and makes no provider request.
import { createHandlers } from "../_lib/nbaBoard/handlers.js";
import { createSupabaseSnapshotStore } from "../_lib/nbaBoard/snapshotStore.js";

const handlers = createHandlers({
  store: () => createSupabaseSnapshotStore(),
  now: () => Date.now(),
  logError: (message) => console.error(message),
});

export async function GET() {
  return handlers.GET();
}

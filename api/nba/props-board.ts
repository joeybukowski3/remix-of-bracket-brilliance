// GET    /api/nba/props-board  the owner's hosted NBA props snapshot (requires the session cookie)
// POST   /api/nba/props-board  sign in with the owner passphrase ({ "passphrase": "..." })
// DELETE /api/nba/props-board  sign out
//
// The single serverless function for the private NBA board. All logic lives in api/_lib/nbaPrivate so it can be tested;
// see docs/nba-hosted-private-props.md. Reads NBA_PRIVATE_PASSWORD_HASH, NBA_PRIVATE_SESSION_SECRET, SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY from process.env only; none of them is ever returned.
import { createHandlers, defaultLimiter } from "../_lib/nbaPrivate/handlers";
import { createSupabaseSnapshotStore } from "../_lib/nbaPrivate/snapshotStore";

const handlers = () =>
  createHandlers({
    env: process.env,
    store: () => createSupabaseSnapshotStore(),
    now: () => Date.now(),
    limiter: defaultLimiter,
    logError: (message) => console.error(message),
  });

export async function GET(request: Request) {
  return handlers().GET(request);
}

export async function POST(request: Request) {
  return handlers().POST(request);
}

export async function DELETE(request: Request) {
  return handlers().DELETE(request);
}

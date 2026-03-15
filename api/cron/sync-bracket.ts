import { getStoredBracket } from "../_lib/bracket-store";
import { syncOfficialBracket } from "../_lib/bracket-sync";

const BRACKET_SYNC_SEASON = process.env.BRACKET_SYNC_SEASON || "2026";
const CRON_SECRET = process.env.CRON_SECRET || "";

function authorizedCron(request: Request) {
  if (!CRON_SECRET) return true;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!authorizedCron(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stored = await getStoredBracket(BRACKET_SYNC_SEASON).catch(() => null);
    if (stored?.is_complete) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Bracket already complete",
        season: BRACKET_SYNC_SEASON,
        source: stored.source,
      });
    }

    const result = await syncOfficialBracket(false);
    return Response.json({
      ok: true,
      skipped: false,
      season: result.season,
      source: result.source,
      bracketLive: result.active,
      matchedTeams: result.validation.matchedTeams,
      totalTeams: result.validation.totalTeams,
      reasons: result.validation.reasons,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Cron bracket sync failed",
      },
      { status: 500 },
    );
  }
}

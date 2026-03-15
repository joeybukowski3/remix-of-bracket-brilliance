import { syncOfficialBracket } from "../_lib/bracket-sync";
import { isAuthorized } from "../_lib/auth";

const BRACKET_SYNC_SECRET = process.env.BRACKET_SYNC_SECRET || "";

export async function POST(request: Request) {
  if (!isAuthorized(request, BRACKET_SYNC_SECRET)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncOfficialBracket(true);
    return Response.json({
      ok: true,
      season: result.season,
      source: result.source,
      bracketLive: result.active,
      stored: result.stored,
      regionsFound: result.validation.regionsFound,
      matchedTeams: result.validation.matchedTeams,
      totalTeams: result.validation.totalTeams,
      duplicateTeams: result.validation.duplicateTeams,
      unmatchedTeams: result.validation.unmatchedTeams,
      reasons: result.validation.reasons,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to sync bracket" },
      { status: 500 },
    );
  }
}

export const GET = POST;

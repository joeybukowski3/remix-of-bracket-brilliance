import { OFFICIAL_2026_BRACKET } from "./_lib/bracket-data";
import { syncOfficialBracket } from "./_lib/bracket-sync";
import { getStoredBracket } from "./_lib/bracket-store";

const BRACKET_SYNC_SEASON = process.env.BRACKET_SYNC_SEASON || "2026";

export async function GET() {
  try {
    const stored = await getStoredBracket(BRACKET_SYNC_SEASON).catch(() => null);
    if (stored?.is_complete) {
      return Response.json({
        ok: true,
        source: "official",
        bracketLive: true,
        payload: stored.payload,
        validation: stored.validation,
      });
    }

    const synced = await syncOfficialBracket(false).catch(() => null);
    if (synced?.payload?.regions?.length === 4 && synced.validation.matchedTeams >= 64) {
      return Response.json({
        ok: true,
        source: "official",
        bracketLive: synced.active,
        payload: synced.payload,
        validation: synced.validation,
      });
    }

    return Response.json({
      ok: true,
      source: "placeholder",
      bracketLive: false,
      payload: OFFICIAL_2026_BRACKET,
      validation: stored?.validation ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        ok: true,
        source: "placeholder",
        bracketLive: false,
        payload: OFFICIAL_2026_BRACKET,
        error: error instanceof Error ? error.message : "Failed to load stored bracket",
      },
    );
  }
}

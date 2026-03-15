import { OFFICIAL_2026_BRACKET } from "../src/data/bracket2026";
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

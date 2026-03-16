// GET /api/odds/current
// Returns current NCAAB moneyline odds from The Odds API, cached server-side for 5 minutes.
// ODDS_API_KEY is read from server environment only — never exposed to the browser.

import { getOdds } from "./_service";

export async function GET() {
  try {
    const odds = await getOdds();

    return Response.json(
      { success: true, odds, count: odds.length },
      {
        headers: {
          // Let Vercel's CDN cache this response for 5 min, serve stale for 60 s while revalidating
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    console.error("[api/odds/current] Unhandled error:", err);
    // Return an empty-but-successful response so the frontend degrades gracefully
    return Response.json(
      { success: true, odds: [], count: 0 },
      { status: 200 },
    );
  }
}

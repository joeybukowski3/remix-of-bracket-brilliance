const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeConference(rawGroup: any): string {
  return rawGroup?.shortName || rawGroup?.name || rawGroup?.abbreviation || "NCAA";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500",
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const league = data?.sports?.[0]?.leagues?.[0];
    const groups = league?.groups || [];

    const teams = groups.flatMap((group: any) =>
      (group?.teams || []).map((entry: any) => ({
        id: entry?.team?.id || "",
        name: entry?.team?.displayName || entry?.team?.name || "",
        abbreviation: entry?.team?.abbreviation || "",
        conference: normalizeConference(group),
        record: entry?.team?.record?.items?.[0]?.summary || entry?.team?.recordSummary || "",
        logo: entry?.team?.logos?.[0]?.href || entry?.team?.logo || "",
        seed: entry?.team?.rank || null,
      })),
    );

    return new Response(
      JSON.stringify({ success: true, teams }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching ESPN teams:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch teams";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

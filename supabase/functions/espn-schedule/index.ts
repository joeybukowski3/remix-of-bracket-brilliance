const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date'); // YYYYMMDD format
    
    // Default to today's date
    const today = dateParam || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    // ESPN scoreboard API - no API key needed, it's public
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${today}&limit=100`;
    
    console.log('Fetching ESPN schedule for date:', today);
    
    const response = await fetch(espnUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    // Transform ESPN data into our format
    const games = (data.events || []).map((event: any) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const odds = competition?.odds?.[0] ?? null;
      
      const homeTeam = competitors.find((c: any) => c.homeAway === 'home');
      const awayTeam = competitors.find((c: any) => c.homeAway === 'away');
      
      return {
        id: event.id,
        name: event.name,
        shortName: event.shortName,
        date: event.date,
        status: competition?.status?.type?.description || 'Scheduled',
        statusDetail: competition?.status?.type?.detail || '',
        completed: competition?.status?.type?.completed || false,
        venue: competition?.venue?.fullName || '',
        broadcast: competition?.broadcasts?.[0]?.names?.[0] || '',
        odds: odds ? {
          provider: odds.provider?.name || odds.details || 'Sportsbook',
          details: odds.details || '',
          overUnder: typeof odds.overUnder === 'number' ? odds.overUnder : null,
          homeMoneyline:
            typeof odds.homeTeamOdds?.moneyLine === 'number'
              ? odds.homeTeamOdds.moneyLine
              : typeof odds.homeTeamOdds?.moneyLine === 'string'
                ? Number(odds.homeTeamOdds.moneyLine)
                : null,
          awayMoneyline:
            typeof odds.awayTeamOdds?.moneyLine === 'number'
              ? odds.awayTeamOdds.moneyLine
              : typeof odds.awayTeamOdds?.moneyLine === 'string'
                ? Number(odds.awayTeamOdds.moneyLine)
                : null,
        } : null,
        homeTeam: homeTeam ? {
          id: homeTeam.id,
          name: homeTeam.team?.displayName || homeTeam.team?.name || '',
          abbreviation: homeTeam.team?.abbreviation || '',
          logo: homeTeam.team?.logo || '',
          score: homeTeam.score || '0',
          seed: homeTeam.curatedRank?.current || null,
          record: homeTeam.records?.[0]?.summary || '',
        } : null,
        awayTeam: awayTeam ? {
          id: awayTeam.id,
          name: awayTeam.team?.displayName || awayTeam.team?.name || '',
          abbreviation: awayTeam.team?.abbreviation || '',
          logo: awayTeam.team?.logo || '',
          score: awayTeam.score || '0',
          seed: awayTeam.curatedRank?.current || null,
          record: awayTeam.records?.[0]?.summary || '',
        } : null,
      };
    });

    return new Response(
      JSON.stringify({ success: true, date: today, games }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching ESPN schedule:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch schedule';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

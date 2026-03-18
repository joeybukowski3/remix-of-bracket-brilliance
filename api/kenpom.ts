// GET /api/kenpom
// Scrapes KenPom.com for offensive and defensive efficiency ranks.
// Falls back to Bart Torvik if KenPom blocks the request.
// Cached in-process for 6 hours — KenPom updates once daily.

export interface KenPomTeam {
  teamName: string;
  overallRank: number;
  adjOE: number;
  adjOERank: number;
  adjDE: number;
  adjDERank: number;
}

export interface KenPomResponse {
  teams: KenPomTeam[];
  source: 'kenpom' | 'torvik' | null;
  fetchedAt: string;
  error?: string;
}

// ── Module-level cache ────────────────────────────────────────────────────────

let cache: KenPomResponse | null = null;
let cacheTsMs = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://google.com',
  'Cache-Control': 'no-cache',
};

// ── KenPom scraper ────────────────────────────────────────────────────────────

async function fetchKenPom(): Promise<KenPomTeam[]> {
  const resp = await fetch('https://kenpom.com/', { headers: BROWSER_HEADERS });
  if (!resp.ok) throw new Error(`KenPom HTTP ${resp.status}`);

  const html = await resp.text();
  const { load } = await import('cheerio');
  const $ = load(html);
  const teams: KenPomTeam[] = [];

  // KenPom main table: #ratings-table
  // Columns: 0=Rank, 1=Team(link), 2=Conf, 3=W-L, 4=AdjEM, 5=AdjOE, 6=OE-Rank, 7=AdjDE, 8=DE-Rank
  // Note: KenPom ranks appear as small text nodes inside the same <td> as the rating.
  // We pull them from adjacent rank columns (cols[5].text for OE, etc.)
  $('#ratings-table tbody tr').each((_i, row) => {
    const cols = $(row).find('td');
    if (cols.length < 8) return;

    const rank = parseInt($(cols[0]).text().trim(), 10);
    const teamName = $(cols[1]).find('a').text().trim();

    // KenPom layout: col 5 = AdjOE value, col 6 = OE rank, col 7 = AdjDE value, col 8 = DE rank
    const adjOE = parseFloat($(cols[5]).text().trim());
    const adjOERank = parseInt($(cols[6]).text().trim(), 10);
    const adjDE = parseFloat($(cols[7]).text().trim());
    const adjDERank = parseInt($(cols[8]).text().trim(), 10);

    if (teamName && !isNaN(rank) && !isNaN(adjOERank) && !isNaN(adjDERank)) {
      teams.push({ teamName, overallRank: rank, adjOE, adjOERank, adjDE, adjDERank });
    }
  });

  if (teams.length < 50) {
    throw new Error(`KenPom parse returned only ${teams.length} teams — likely blocked or table structure changed`);
  }

  return teams;
}

// ── Bart Torvik fallback ──────────────────────────────────────────────────────

async function fetchTorvik(): Promise<KenPomTeam[]> {
  const resp = await fetch('https://barttorvik.com/trank.php', { headers: BROWSER_HEADERS });
  if (!resp.ok) throw new Error(`Torvik HTTP ${resp.status}`);

  const html = await resp.text();
  const { load } = await import('cheerio');
  const $ = load(html);

  // Collect raw rows: team name + raw OE/DE values
  const rawRows: { teamName: string; adjOE: number; adjDE: number }[] = [];

  // Torvik's table rows — team name in first anchor, OE/DE in known column positions
  $('table tbody tr').each((_i, row) => {
    const cols = $(row).find('td');
    if (cols.length < 5) return;

    const teamName = $(cols[0]).find('a').text().trim() || $(cols[0]).text().trim();
    if (!teamName) return;

    // Try to find AdjOE and AdjDE values in common Torvik column positions
    // Torvik trank.php: col 0=team, col 1=conf, col 2=record, col 3=AdjEM, col 4=AdjOE, col 5=AdjDE
    const adjOE = parseFloat($(cols[4]).text().trim());
    const adjDE = parseFloat($(cols[5]).text().trim());

    if (!isNaN(adjOE) && !isNaN(adjDE)) {
      rawRows.push({ teamName, adjOE, adjDE });
    }
  });

  if (rawRows.length < 50) {
    throw new Error(`Torvik parse returned only ${rawRows.length} teams`);
  }

  // Compute OE/DE ranks by sorting (higher OE = better rank #1, lower DE = better rank #1)
  const oeRanked = [...rawRows].sort((a, b) => b.adjOE - a.adjOE);
  const deRanked = [...rawRows].sort((a, b) => a.adjDE - b.adjDE);

  const oeRankMap = new Map(oeRanked.map((t, i) => [t.teamName, i + 1]));
  const deRankMap = new Map(deRanked.map((t, i) => [t.teamName, i + 1]));

  const emSorted = [...rawRows].sort((a, b) => (b.adjOE - b.adjDE) - (a.adjOE - a.adjDE));

  return emSorted.map((row, i) => ({
    teamName: row.teamName,
    overallRank: i + 1,
    adjOE: row.adjOE,
    adjOERank: oeRankMap.get(row.teamName) ?? i + 1,
    adjDE: row.adjDE,
    adjDERank: deRankMap.get(row.teamName) ?? i + 1,
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const now = Date.now();
  if (cache !== null && now - cacheTsMs < CACHE_TTL_MS) {
    return Response.json(cache, {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' },
    });
  }

  let teams: KenPomTeam[] = [];
  let source: 'kenpom' | 'torvik' | null = null;
  let errorMsg: string | undefined;

  try {
    teams = await fetchKenPom();
    source = 'kenpom';
    console.log(`[api/kenpom] KenPom OK — ${teams.length} teams`);
  } catch (kenpomErr) {
    const msg = kenpomErr instanceof Error ? kenpomErr.message : String(kenpomErr);
    console.error('[api/kenpom] KenPom failed:', msg);

    try {
      teams = await fetchTorvik();
      source = 'torvik';
      console.log(`[api/kenpom] Torvik fallback OK — ${teams.length} teams`);
    } catch (torvikErr) {
      const msg2 = torvikErr instanceof Error ? torvikErr.message : String(torvikErr);
      console.error('[api/kenpom] Torvik also failed:', msg2);
      errorMsg = `KenPom: ${msg}; Torvik: ${msg2}`;
    }
  }

  const result: KenPomResponse = {
    teams,
    source,
    fetchedAt: new Date().toISOString(),
    ...(errorMsg ? { error: errorMsg } : {}),
  };

  if (teams.length > 0) {
    cache = result;
    cacheTsMs = now;
  }

  return Response.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' },
  });
}

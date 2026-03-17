// GET /api/odds/current
// Self-contained — zero imports from other server files so Vercel has nothing to resolve.
// ODDS_API_KEY is read from process.env only; it is never returned to the browser.

// ── Types ────────────────────────────────────────────────────────────────────

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number; // present in spreads / totals markets
}

interface OddsApiMarket {
  key: string;
  last_update: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

export interface NormalizedOddsEvent {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  sportsbook: string;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  homeImpliedProb: number | null;
  awayImpliedProb: number | null;
  /** Point spread for the home team (negative = favorite, e.g. -5.5) */
  homeSpread: number | null;
  /** Point spread for the away team (positive = underdog, e.g. +5.5) */
  awaySpread: number | null;
  lastUpdated: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORT_KEY   = "basketball_ncaab";
const REGIONS     = "us";
const MARKETS     = "h2h,spreads";
const ODDS_FORMAT = "american";
const PREFERRED_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "pointsbet", "williamhill_us"];
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Module-level cache (best-effort; works when Vercel reuses the warm instance) ──

let oddsCache: NormalizedOddsEvent[] | null = null;
let cacheTsMs = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function americanToImplied(odds: number): number {
  return odds < 0 ? (-odds) / (-odds + 100) : 100 / (odds + 100);
}

function pickBook(bookmakers: OddsApiBookmaker[]): OddsApiBookmaker | null {
  for (const key of PREFERRED_BOOKS) {
    const found = bookmakers.find((b) => b.key === key);
    if (found) return found;
  }
  return bookmakers[0] ?? null;
}

function normalizeEvent(event: OddsApiEvent): NormalizedOddsEvent | null {
  const book = pickBook(event.bookmakers);
  if (!book) return null;

  const market = book.markets.find((m) => m.key === "h2h");
  if (!market) return null;

  const homeOutcome = market.outcomes.find((o) => o.name === event.home_team);
  const awayOutcome = market.outcomes.find((o) => o.name === event.away_team);

  const homeML = typeof homeOutcome?.price === "number" ? homeOutcome.price : null;
  const awayML = typeof awayOutcome?.price === "number" ? awayOutcome.price : null;

  let homeProb = homeML !== null ? americanToImplied(homeML) : null;
  let awayProb = awayML !== null ? americanToImplied(awayML) : null;

  if (homeProb !== null && awayProb !== null) {
    const total = homeProb + awayProb;
    if (total > 0) { homeProb /= total; awayProb /= total; }
  }

  const spreadsMarket = book.markets.find((m) => m.key === "spreads");
  const homeSpreadOutcome = spreadsMarket?.outcomes.find((o) => o.name === event.home_team);
  const awaySpreadOutcome = spreadsMarket?.outcomes.find((o) => o.name === event.away_team);
  const homeSpread = typeof homeSpreadOutcome?.point === "number" ? homeSpreadOutcome.point : null;
  const awaySpread = typeof awaySpreadOutcome?.point === "number" ? awaySpreadOutcome.point : null;

  return {
    id: event.id,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    sportsbook: book.title,
    homeMoneyline: homeML,
    awayMoneyline: awayML,
    homeImpliedProb: homeProb,
    awayImpliedProb: awayProb,
    homeSpread,
    awaySpread,
    lastUpdated: book.last_update,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const apiKey  = process.env.ODDS_API_KEY ?? "";
  const hasKey  = apiKey.length > 0;

  const requestUrl =
    `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/` +
    `?apiKey=${hasKey ? "***" : "(missing)"}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=${ODDS_FORMAT}`;

  // Debug fields — temporarily included to help verify the pipeline in production.
  const debug: Record<string, unknown> = {
    hasApiKey:          hasKey,
    sportKeyUsed:       SPORT_KEY,
    marketsUsed:        MARKETS,
    regionsUsed:        REGIONS,
    requestUrlUsed:     requestUrl,   // key value is masked above
    upstreamStatus:     null as number | null,
    rawGameCount:       null as number | null,
    normalizedGameCount:null as number | null,
    matchedGameCount:   null as number | null,
    errorSummary:       null as string | null,
  };

  if (!hasKey) {
    debug.errorSummary = "ODDS_API_KEY not set";
    return Response.json(
      { success: false, odds: [], count: 0, ...debug },
      { status: 200 },
    );
  }

  // Return cached result when still fresh
  const now = Date.now();
  if (oddsCache !== null && now - cacheTsMs < CACHE_TTL_MS) {
    debug.normalizedGameCount = oddsCache.length;
    debug.matchedGameCount    = oddsCache.length;
    return Response.json(
      { success: true, odds: oddsCache, count: oddsCache.length, cached: true, ...debug },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
    );
  }

  const fetchUrl =
    `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/` +
    `?apiKey=${apiKey}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=${ODDS_FORMAT}`;

  let raw: OddsApiEvent[] = [];
  try {
    const resp = await fetch(fetchUrl);
    debug.upstreamStatus = resp.status;

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      debug.errorSummary = `Upstream ${resp.status}: ${body.slice(0, 120)}`;
      console.error(`[api/odds/current] Upstream error ${resp.status}: ${body.slice(0, 200)}`);
      // Fall back to stale cache if available
      if (oddsCache !== null) {
        debug.normalizedGameCount = oddsCache.length;
        debug.matchedGameCount    = oddsCache.length;
        return Response.json(
          { success: true, odds: oddsCache, count: oddsCache.length, stale: true, ...debug },
          { status: 200 },
        );
      }
      return Response.json({ success: false, odds: [], count: 0, ...debug }, { status: 200 });
    }

    raw = (await resp.json()) as OddsApiEvent[];
    debug.rawGameCount = raw.length;
  } catch (fetchErr) {
    debug.errorSummary = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error("[api/odds/current] Fetch error:", fetchErr);
    if (oddsCache !== null) {
      debug.normalizedGameCount = oddsCache.length;
      debug.matchedGameCount    = oddsCache.length;
      return Response.json(
        { success: true, odds: oddsCache, count: oddsCache.length, stale: true, ...debug },
        { status: 200 },
      );
    }
    return Response.json({ success: false, odds: [], count: 0, ...debug }, { status: 200 });
  }

  let normalized: NormalizedOddsEvent[] = [];
  try {
    normalized = raw.map(normalizeEvent).filter((e): e is NormalizedOddsEvent => e !== null);
    debug.normalizedGameCount = normalized.length;
    debug.matchedGameCount    = normalized.length;
  } catch (normErr) {
    debug.errorSummary = `Normalization error: ${normErr instanceof Error ? normErr.message : String(normErr)}`;
    console.error("[api/odds/current] Normalization error:", normErr);
  }

  oddsCache = normalized;
  cacheTsMs = now;

  console.log(`[api/odds/current] OK — ${normalized.length} events normalized`);

  return Response.json(
    { success: true, odds: normalized, count: normalized.length, ...debug },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
  );
}

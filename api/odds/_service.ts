// Server-side odds service — never imported by frontend code.
// Lives co-located with api/odds/current.ts so Vercel bundles it without cross-directory traversal.

const CACHE_TTL_MS = 5 * 60 * 1000;
const PREFERRED_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "pointsbet", "williamhill_us"];

interface OddsApiOutcome {
  name: string;
  price: number;
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
  sport_key: string;
  sport_title: string;
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
  lastUpdated: string;
}

let oddsCache: NormalizedOddsEvent[] | null = null;
let cacheTsMs = 0;

function americanToImplied(odds: number): number {
  if (odds < 0) return (-odds) / (-odds + 100);
  return 100 / (odds + 100);
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

  const homeML = homeOutcome?.price ?? null;
  const awayML = awayOutcome?.price ?? null;

  let homeProb = homeML !== null ? americanToImplied(homeML) : null;
  let awayProb = awayML !== null ? americanToImplied(awayML) : null;
  if (homeProb !== null && awayProb !== null) {
    const total = homeProb + awayProb;
    if (total > 0) {
      homeProb = homeProb / total;
      awayProb = awayProb / total;
    }
  }

  return {
    id: event.id,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    sportsbook: book.title,
    homeMoneyline: typeof homeML === "number" ? homeML : null,
    awayMoneyline: typeof awayML === "number" ? awayML : null,
    homeImpliedProb: homeProb,
    awayImpliedProb: awayProb,
    lastUpdated: book.last_update,
  };
}

export async function getOdds(): Promise<NormalizedOddsEvent[]> {
  const now = Date.now();
  if (oddsCache !== null && now - cacheTsMs < CACHE_TTL_MS) {
    return oddsCache;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("[odds-service] ODDS_API_KEY environment variable is not set");
    return oddsCache ?? [];
  }

  const url =
    "https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds/" +
    `?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;

  let raw: OddsApiEvent[];
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[odds-service] The Odds API responded ${resp.status}: ${body.slice(0, 200)}`);
      return oddsCache ?? [];
    }
    raw = (await resp.json()) as OddsApiEvent[];
  } catch (err) {
    console.error("[odds-service] Fetch error:", err);
    return oddsCache ?? [];
  }

  const normalized = raw
    .map(normalizeEvent)
    .filter((e): e is NormalizedOddsEvent => e !== null);

  oddsCache = normalized;
  cacheTsMs = now;

  console.log(`[odds-service] Fetched ${normalized.length} NCAAB odds events`);
  return normalized;
}

// Server-side odds service — never imported by frontend code.
// Fetches NCAAB odds from The Odds API and caches in-memory for 5 minutes.

const CACHE_TTL_MS = 5 * 60 * 1000;
const PREFERRED_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "pointsbet", "williamhill_us"];

// ── Raw Odds API shapes ──────────────────────────────────────────────────────

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

// ── Normalized shape (shared with frontend via hook) ─────────────────────────

export interface NormalizedOddsEvent {
  /** Odds API event ID */
  id: string;
  /** ISO-8601 game start time */
  commenceTime: string;
  /** Full team name as returned by The Odds API, e.g. "Duke Blue Devils" */
  homeTeam: string;
  /** Full team name as returned by The Odds API, e.g. "Connecticut Huskies" */
  awayTeam: string;
  /** Sportsbook name, e.g. "DraftKings" */
  sportsbook: string;
  /** American moneyline for the home team (-150, +130, …) */
  homeMoneyline: number | null;
  /** American moneyline for the away team */
  awayMoneyline: number | null;
  /** Vig-normalized win probability for home (0–1) */
  homeImpliedProb: number | null;
  /** Vig-normalized win probability for away (0–1) */
  awayImpliedProb: number | null;
  lastUpdated: string;
}

// ── Module-level cache ───────────────────────────────────────────────────────

let oddsCache: NormalizedOddsEvent[] | null = null;
let cacheTsMs = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

  // Remove vig so probabilities sum to 1
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

// ── Public API ────────────────────────────────────────────────────────────────

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

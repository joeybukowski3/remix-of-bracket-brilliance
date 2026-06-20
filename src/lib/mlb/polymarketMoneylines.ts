/**
 * Polymarket MLB moneyline parsing and matching utilities.
 *
 * Handles:
 *  - Parsing JSON-encoded outcomes/outcomePrices from Gamma API
 *  - Filtering moneyline markets from spreads, totals, props, futures
 *  - Matching Polymarket events to MLB schedule games
 *  - Normalizing team names to canonical abbreviations
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolymarketMlbMarket = {
  id?: string | number;
  slug?: string;
  question?: string;
  groupItemTitle?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  active?: boolean;
  closed?: boolean;
  resolved?: boolean;
};

export type PolymarketMlbEvent = {
  id?: string | number;
  title?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  resolved?: boolean;
  eventDate?: string;
  startTime?: string;
  gameId?: string | number;
  markets?: PolymarketMlbMarket[];
  teams?: Array<{ name?: string; league?: string }>;
};

export type TeamPrices = {
  yesPrice: number | null;
  noPrice: number | null;
};

export type ParsedMoneylineMarket = {
  marketId: string;
  marketSlug: string | null;
  awayTeam: string; // canonical abbreviation
  homeTeam: string; // canonical abbreviation
  awayPrices: TeamPrices;
  homePrices: TeamPrices;
};

export type MoneylineGame = {
  gamePk: number;
  gameDate: string;
  status: string;
  venue: string;
  away: {
    id: number;
    name: string;
    abbreviation: string;
    yesPrice: number | null;
    noPrice: number | null;
  };
  home: {
    id: number;
    name: string;
    abbreviation: string;
    yesPrice: number | null;
    noPrice: number | null;
  };
  matched: boolean;
  eventId: string | null;
  eventTitle: string | null;
  eventSlug: string | null;
  marketUrl: string | null;
  marketStatus: string | null;
};

export type MoneylineApiResponse = {
  source: "polymarket";
  date: string;
  updatedAt: string;
  stale: boolean;
  matchedCount: number;
  totalGames: number;
  games: MoneylineGame[];
  diagnostics?: {
    unmatchedMarketTitles: string[];
    ambiguousMatches: string[];
    rejectedMarketTitles: string[];
  };
};

// ---------------------------------------------------------------------------
// MLB team alias map — abbreviation → known names (lowercase)
// ---------------------------------------------------------------------------

export const MLB_TEAM_ALIASES: Record<string, string[]> = {
  ARI: ["arizona diamondbacks", "diamondbacks", "d-backs", "d backs", "dbacks", "arizona"],
  ATL: ["atlanta braves", "braves", "atlanta"],
  BAL: ["baltimore orioles", "orioles", "baltimore"],
  BOS: ["boston red sox", "red sox", "boston"],
  CHC: ["chicago cubs", "cubs"],
  CIN: ["cincinnati reds", "reds", "cincinnati"],
  CLE: ["cleveland guardians", "guardians", "cleveland"],
  COL: ["colorado rockies", "rockies", "colorado"],
  CWS: ["chicago white sox", "white sox"],
  DET: ["detroit tigers", "tigers", "detroit"],
  HOU: ["houston astros", "astros", "houston"],
  KC: ["kansas city royals", "royals", "kansas city"],
  LAA: ["los angeles angels", "la angels", "angels", "anaheim angels"],
  LAD: ["los angeles dodgers", "la dodgers", "dodgers"],
  MIA: ["miami marlins", "marlins", "miami"],
  MIL: ["milwaukee brewers", "brewers", "milwaukee"],
  MIN: ["minnesota twins", "twins", "minnesota"],
  NYM: ["new york mets", "ny mets", "mets"],
  NYY: ["new york yankees", "ny yankees", "yankees"],
  ATH: ["athletics", "oakland athletics", "a's", "oakland a's", "oakland", "sacramento"],
  PHI: ["philadelphia phillies", "phillies", "philadelphia"],
  PIT: ["pittsburgh pirates", "pirates", "pittsburgh"],
  SD: ["san diego padres", "padres", "san diego"],
  SEA: ["seattle mariners", "mariners", "seattle"],
  SF: ["san francisco giants", "sf giants", "giants", "san francisco"],
  STL: ["st. louis cardinals", "st louis cardinals", "cardinals", "st. louis", "st louis"],
  TB: ["tampa bay rays", "rays", "tampa bay", "tampa"],
  TEX: ["texas rangers", "rangers", "texas"],
  TOR: ["toronto blue jays", "blue jays", "toronto"],
  WSH: ["washington nationals", "nationals", "washington"],
};

// Pre-build reverse lookup: lowercase alias → abbreviation
const ALIAS_TO_ABBR = new Map<string, string>();
for (const [abbr, aliases] of Object.entries(MLB_TEAM_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_ABBR.set(alias, abbr);
  }
  // Also add the abbreviation itself lowercased
  ALIAS_TO_ABBR.set(abbr.toLowerCase(), abbr);
}

/**
 * Map variant abbreviations (from MLB Stats API or other sources) to the
 * canonical abbreviation used in this codebase's logo/color maps.
 */
const ABBR_VARIANTS: Record<string, string> = {
  AZ: "ARI",
  OAK: "ATH",
};

export function canonicalAbbr(abbr: string): string {
  const upper = abbr.toUpperCase();
  return ABBR_VARIANTS[upper] ?? upper;
}

// Also add variant abbreviations to the alias map
for (const [variant, canonical] of Object.entries(ABBR_VARIANTS)) {
  ALIAS_TO_ABBR.set(variant.toLowerCase(), canonical);
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9.' ]+/g, " ")
    .trim();
}

export function matchMlbTeam(value: string): string | null {
  const source = normalize(value);
  if (!source) return null;

  // Try exact alias match first
  if (ALIAS_TO_ABBR.has(source)) return ALIAS_TO_ABBR.get(source)!;

  // Try substring match - check if any alias appears in the source
  for (const [alias, abbr] of ALIAS_TO_ABBR.entries()) {
    if (alias.length >= 4 && source.includes(alias)) return abbr;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parsing outcomes and prices
// ---------------------------------------------------------------------------

export function parseStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map((item) => String(item));

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      // not valid JSON
    }
  }

  return null;
}

export function parsePrice(value: string): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= 1 ? num : null;
}

/**
 * Extract YES and NO prices from a binary Yes/No market.
 */
export function parseYesNoMarket(
  outcomes: unknown,
  outcomePrices: unknown,
): { yesPrice: number | null; noPrice: number | null } {
  const labels = parseStringArray(outcomes);
  const prices = parseStringArray(outcomePrices);
  if (!labels || !prices || labels.length !== prices.length) {
    return { yesPrice: null, noPrice: null };
  }

  const yesIndex = labels.findIndex((o) => normalize(o) === "yes");
  const noIndex = labels.findIndex((o) => normalize(o) === "no");

  return {
    yesPrice: yesIndex >= 0 ? parsePrice(prices[yesIndex]) : null,
    noPrice: noIndex >= 0 ? parsePrice(prices[noIndex]) : null,
  };
}

/**
 * Extract team prices from a two-team outcome market.
 * Returns prices indexed by canonical team abbreviation.
 */
export function parseTwoTeamMarket(
  outcomes: unknown,
  outcomePrices: unknown,
): Map<string, TeamPrices> | null {
  const labels = parseStringArray(outcomes);
  const prices = parseStringArray(outcomePrices);
  if (!labels || !prices || labels.length !== 2 || prices.length !== 2) {
    return null;
  }

  const team0 = matchMlbTeam(labels[0]);
  const team1 = matchMlbTeam(labels[1]);
  if (!team0 || !team1 || team0 === team1) return null;

  const price0 = parsePrice(prices[0]);
  const price1 = parsePrice(prices[1]);

  const result = new Map<string, TeamPrices>();
  // In a two-team market, one team's YES = their price, NO = the other team's price
  result.set(team0, { yesPrice: price0, noPrice: price1 });
  result.set(team1, { yesPrice: price1, noPrice: price0 });

  return result;
}

// ---------------------------------------------------------------------------
// Market filtering — identify the moneyline/game-winner market
// ---------------------------------------------------------------------------

/** Keywords that indicate a market is NOT a simple moneyline. */
const REJECT_PATTERNS = [
  /\bspread\b/i,
  /\bo\/u\b/i,
  /\bover\s*\/?\s*under\b/i,
  /\btotal\b/i,
  /\brun\s*line\b/i,
  /\bfirst\s*5\b/i,
  /\b1st\s*5\b/i,
  /\bf5\b/i,
  /\binning/i,
  /\bprop\b/i,
  /\bhome\s*run\b/i,
  /\bstrikeout/i,
  /\bhit/i,
  /\brbi\b/i,
  /\bextra\s*inning/i,
  /\bnrfi\b/i,
  /\bworld\s*series\b/i,
  /\bchampion/i,
  /\bplayoff/i,
  /\bdivision\b/i,
  /\bpennant\b/i,
  /\bmvp\b/i,
  /\ball[\s-]*star\b/i,
  /\bseason\b/i,
  /\bwins?\s+total/i,
  /\bcorrect\s*score\b/i,
  /\bparlay\b/i,
  /\bfuture/i,
  /\bseries\s*winner\b/i,
  /\bwin\s*\d+\+?\s*game/i,
];

export function isRejectableMarket(market: PolymarketMlbMarket): boolean {
  const text = [
    market.groupItemTitle,
    market.question,
    market.slug,
  ]
    .filter(Boolean)
    .join(" ");

  // groupItemTitle of "-" or empty means it's the primary market
  const git = (market.groupItemTitle ?? "").trim();
  if (git && git !== "-") {
    // If groupItemTitle names something specific (Spread, O/U, NRFI, etc.), reject
    if (REJECT_PATTERNS.some((p) => p.test(git))) return true;
  }

  return REJECT_PATTERNS.some((p) => p.test(text));
}

/**
 * Find the moneyline/game-winner market within an event's markets.
 * Returns null if none found.
 */
export function findMoneylineMarket(
  markets: PolymarketMlbMarket[],
): PolymarketMlbMarket | null {
  for (const market of markets) {
    // Skip inactive/closed/resolved
    if (market.closed || market.resolved) continue;

    // Must be the primary game market
    const git = (market.groupItemTitle ?? "").trim();
    if (git && git !== "-") {
      // Has a specific groupItemTitle — only accept if it's a clear moneyline label
      if (!/^(moneyline|game\s*winner|winner|-)$/i.test(git)) continue;
    }

    // Reject non-moneyline markets by keywords
    if (isRejectableMarket(market)) continue;

    // Must have exactly two team outcomes (not Yes/No)
    const labels = parseStringArray(market.outcomes);
    if (!labels || labels.length !== 2) continue;

    const team0 = matchMlbTeam(labels[0]);
    const team1 = matchMlbTeam(labels[1]);
    if (!team0 || !team1 || team0 === team1) continue;

    // Not Yes/No outcomes
    if (
      labels.some((l) => normalize(l) === "yes" || normalize(l) === "no")
    ) {
      continue;
    }

    return market;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Schedule matching
// ---------------------------------------------------------------------------

export type ScheduleGame = {
  gamePk: number;
  gameDate: string;
  status: string;
  venue: string;
  gameNumber?: number;
  away: { id: number; name: string; abbreviation: string };
  home: { id: number; name: string; abbreviation: string };
};

/**
 * Match a Polymarket event to an MLB schedule game.
 * Uses team names from the event and schedule, plus date matching.
 */
export function matchEventToGame(
  event: PolymarketMlbEvent,
  scheduleGames: ScheduleGame[],
  alreadyMatched: Set<number>,
): ScheduleGame | "ambiguous" | null {
  // Extract team abbreviations from event title or teams array
  const eventTeams = extractTeamsFromEvent(event);
  if (!eventTeams || eventTeams.length < 2) return null;

  const candidates = scheduleGames.filter((game) => {
    if (alreadyMatched.has(game.gamePk)) return false;

    const gameTeams = [canonicalAbbr(game.away.abbreviation), canonicalAbbr(game.home.abbreviation)];
    // Both event teams must match game teams
    return (
      eventTeams.every((et) => gameTeams.includes(canonicalAbbr(et))) &&
      gameTeams.every((gt) => eventTeams.includes(canonicalAbbr(gt)))
    );
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Doubleheader — try to match by start time
  if (event.startTime) {
    const eventTime = new Date(event.startTime).getTime();
    const sorted = candidates
      .map((g) => ({ game: g, diff: Math.abs(new Date(g.gameDate).getTime() - eventTime) }))
      .sort((a, b) => a.diff - b.diff);

    // If the closest is within 2 hours and clearly closer than the next, use it
    if (sorted.length >= 2 && sorted[0].diff < 2 * 60 * 60 * 1000 && sorted[0].diff < sorted[1].diff * 0.5) {
      return sorted[0].game;
    }

    // If times are close to each other, it's ambiguous
    return "ambiguous";
  }

  return "ambiguous";
}

function extractTeamsFromEvent(event: PolymarketMlbEvent): string[] | null {
  // Try from teams array first
  if (event.teams && event.teams.length >= 2) {
    const abbrs = event.teams
      .map((t) => matchMlbTeam(t.name ?? ""))
      .filter((a): a is string => a !== null);
    if (abbrs.length >= 2) return abbrs;
  }

  // Fall back to parsing the event title
  const title = event.title ?? "";
  // Typical format: "Team A vs. Team B" or "Team A vs Team B"
  const parts = title.split(/\s+vs\.?\s+/i);
  if (parts.length === 2) {
    const t0 = matchMlbTeam(parts[0]);
    const t1 = matchMlbTeam(parts[1]);
    if (t0 && t1) return [t0, t1];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatCents(price: number | null): string {
  if (price == null) return "—";
  return `${Math.round(price * 100)}¢`;
}

export function formatProbability(price: number | null): string {
  if (price == null) return "—";
  return `${Math.round(price * 100)}%`;
}

// ---------------------------------------------------------------------------
// Full normalization: events + schedule → MoneylineApiResponse
// ---------------------------------------------------------------------------

export function normalizeMoneylineResponse(
  events: PolymarketMlbEvent[],
  scheduleGames: ScheduleGame[],
  date: string,
  isDev: boolean,
): MoneylineApiResponse {
  const alreadyMatched = new Set<number>();
  const gameResults = new Map<number, Partial<MoneylineGame>>();
  const unmatchedMarketTitles: string[] = [];
  const ambiguousMatches: string[] = [];
  const rejectedMarketTitles: string[] = [];

  for (const event of events) {
    const markets = event.markets ?? [];
    const moneylineMarket = findMoneylineMarket(markets);

    // Track rejected markets for diagnostics
    if (isDev) {
      for (const m of markets) {
        if (m !== moneylineMarket && isRejectableMarket(m)) {
          rejectedMarketTitles.push(
            (m.groupItemTitle ? `[${m.groupItemTitle}] ` : "") +
              (m.question || m.slug || "unknown"),
          );
        }
      }
    }

    if (!moneylineMarket) continue;

    // Parse prices
    const teamPrices = parseTwoTeamMarket(
      moneylineMarket.outcomes,
      moneylineMarket.outcomePrices,
    );
    if (!teamPrices) continue;

    // Try to match to a schedule game
    const matchResult = matchEventToGame(event, scheduleGames, alreadyMatched);

    if (matchResult === "ambiguous") {
      ambiguousMatches.push(event.title ?? "unknown");
      continue;
    }

    if (!matchResult) {
      unmatchedMarketTitles.push(event.title ?? "unknown");
      continue;
    }

    const game = matchResult;
    alreadyMatched.add(game.gamePk);

    const awayPrices = teamPrices.get(canonicalAbbr(game.away.abbreviation));
    const homePrices = teamPrices.get(canonicalAbbr(game.home.abbreviation));

    const eventSlug = event.slug ?? null;

    gameResults.set(game.gamePk, {
      away: {
        ...game.away,
        yesPrice: awayPrices?.yesPrice ?? null,
        noPrice: awayPrices?.noPrice ?? null,
      },
      home: {
        ...game.home,
        yesPrice: homePrices?.yesPrice ?? null,
        noPrice: homePrices?.noPrice ?? null,
      },
      matched: true,
      eventId: event.id != null ? String(event.id) : null,
      eventTitle: event.title ?? null,
      eventSlug,
      marketUrl: eventSlug
        ? `https://polymarket.com/event/${eventSlug}`
        : null,
      marketStatus: event.closed ? "closed" : event.active ? "active" : "inactive",
    });
  }

  // Build final games list — include ALL schedule games
  const games: MoneylineGame[] = scheduleGames
    .map((game) => {
      const matched = gameResults.get(game.gamePk);
      if (matched) {
        return {
          gamePk: game.gamePk,
          gameDate: game.gameDate,
          status: game.status,
          venue: game.venue,
          ...matched,
        } as MoneylineGame;
      }

      return {
        gamePk: game.gamePk,
        gameDate: game.gameDate,
        status: game.status,
        venue: game.venue,
        away: { ...game.away, yesPrice: null, noPrice: null },
        home: { ...game.home, yesPrice: null, noPrice: null },
        matched: false,
        eventId: null,
        eventTitle: null,
        eventSlug: null,
        marketUrl: null,
        marketStatus: null,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime(),
    );

  const matchedCount = games.filter((g) => g.matched).length;

  const response: MoneylineApiResponse = {
    source: "polymarket",
    date,
    updatedAt: new Date().toISOString(),
    stale: false,
    matchedCount,
    totalGames: games.length,
    games,
  };

  if (isDev) {
    response.diagnostics = {
      unmatchedMarketTitles: [...new Set(unmatchedMarketTitles)],
      ambiguousMatches: [...new Set(ambiguousMatches)],
      rejectedMarketTitles: rejectedMarketTitles.slice(0, 50),
    };
  }

  return response;
}

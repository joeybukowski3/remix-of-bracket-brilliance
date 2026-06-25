const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const SPORTSGAMEODDS_BASE = "https://api.sportsgameodds.com/v2";
const ODDS_API_IO_BASE = "https://api.odds-api.io/v3";
const SPORT = "baseball_mlb";
const TIMEOUT_MS = 20000;

const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "JoeKnowsBall/1.0",
};

export const BOOK_PREFERENCE = [
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",
  "caesars",
  "espnbet",
  "betrivers",
  "pointsbet",
  "bovada",
];

const TEAM_ABBR = {
  "Arizona Diamondbacks": "ARI",  "Atlanta Braves": "ATL",       "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",        "Chicago Cubs": "CHC",         "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN",       "Cleveland Guardians": "CLE",  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",        "Houston Astros": "HOU",       "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",    "Los Angeles Dodgers": "LAD",  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",     "Minnesota Twins": "MIN",      "New York Mets": "NYM",
  "New York Yankees": "NYY",      "Oakland Athletics": "ATH",    "Athletics": "ATH",
  "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT",   "San Diego Padres": "SD",
  "San Francisco Giants": "SF",   "Seattle Mariners": "SEA",     "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",         "Texas Rangers": "TEX",        "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

const ABBR_ALIASES = {
  ARI: "ARI", AZ: "ARI",
  ATH: "ATH", OAK: "ATH",
  CHW: "CWS", CWS: "CWS",
  KC: "KC", KCR: "KC",
  SD: "SD", SDP: "SD",
  SF: "SF", SFG: "SF",
  TB: "TB", TBR: "TB",
  WAS: "WSH", WSH: "WSH",
};

function safeMessage(err) {
  return String(err?.message ?? err ?? "unknown error").replace(/[?&]apiKey=[^&\s]+/gi, "?apiKey=[redacted]").slice(0, 160);
}

function normalizeBookKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeTeamAbbr(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (ABBR_ALIASES[upper]) return ABBR_ALIASES[upper];
  if (upper.length <= 3 && /^[A-Z]+$/.test(upper)) return upper;
  return TEAM_ABBR[raw] ?? raw.split(" ").pop().slice(0, 3).toUpperCase();
}

export function americanToImplied(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

export function parseAmericanOdds(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  const text = String(value).trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatAmerican(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? `+${price}` : `${price}`;
}

function makeMoneyline(awayTeam, homeTeam, awayPrice, homePrice) {
  const away = parseAmericanOdds(awayPrice);
  const home = parseAmericanOdds(homePrice);
  if (away == null || home == null) return null;
  const awayAbbr = normalizeTeamAbbr(awayTeam);
  const homeAbbr = normalizeTeamAbbr(homeTeam);
  if (!awayAbbr || !homeAbbr) return null;
  return {
    key: `${awayAbbr}@${homeAbbr}`,
    value: {
      away: { team: awayTeam, price: away, american: formatAmerican(away), implied: americanToImplied(away) },
      home: { team: homeTeam, price: home, american: formatAmerican(home), implied: americanToImplied(home) },
    },
  };
}

function hasUsableMoneylines(moneylines) {
  return Object.values(moneylines ?? {}).some((entry) => (
    parseAmericanOdds(entry?.away?.price ?? entry?.away?.american) != null
    && parseAmericanOdds(entry?.home?.price ?? entry?.home?.american) != null
  ));
}

async function fetchJson(url, { fetchFn = fetch, label, timeoutMs = TIMEOUT_MS, headers = HEADERS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { headers, signal: controller.signal });
    const remaining = res.headers?.get?.("x-requests-remaining") ?? res.headers?.get?.("x-ratelimit-remaining") ?? null;
    const used = res.headers?.get?.("x-requests-used") ?? null;
    if (label) console.log(`  [${label}] status=${res.status} remaining=${remaining ?? "?"} used=${used ?? "?"}`);
    const bodyText = await res.text();
    const exhausted = remaining === "0";
    if (!res.ok || exhausted) {
      throw new Error(`HTTP ${res.status}${exhausted ? " no remaining requests" : ""} ${bodyText.slice(0, 120)}`);
    }
    let data = null;
    try {
      data = bodyText ? JSON.parse(bodyText) : null;
    } catch (_) {
      throw new Error(`malformed JSON from ${label ?? "provider"}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function bestOddsApiBook(bookmakers, marketKey) {
  if (!Array.isArray(bookmakers) || !bookmakers.length) return null;
  for (const pref of BOOK_PREFERENCE) {
    const book = bookmakers.find((b) => normalizeBookKey(b.key) === normalizeBookKey(pref) || normalizeBookKey(b.title) === normalizeBookKey(pref));
    const market = book?.markets?.find((m) => m.key === marketKey);
    if (market?.outcomes?.length) return market;
  }
  return bookmakers
    .flatMap((b) => b.markets?.filter((m) => m.key === marketKey) ?? [])
    .sort((a, b) => (b.outcomes?.length ?? 0) - (a.outcomes?.length ?? 0))[0] ?? null;
}

export function normalizeTheOddsApiMoneylines(events) {
  if (!Array.isArray(events)) throw new Error("The Odds API response was not an array");
  if (events.length === 0) throw new Error("The Odds API returned no MLB events");
  const moneylines = {};
  for (const ev of events) {
    const awayTeam = ev?.away_team;
    const homeTeam = ev?.home_team;
    const market = bestOddsApiBook(ev?.bookmakers, "h2h");
    if (!awayTeam || !homeTeam || !market) continue;
    const awayOut = market.outcomes?.find((o) => o.name === awayTeam);
    const homeOut = market.outcomes?.find((o) => o.name === homeTeam);
    const row = makeMoneyline(awayTeam, homeTeam, awayOut?.price, homeOut?.price);
    if (row) moneylines[row.key] = row.value;
  }
  if (!hasUsableMoneylines(moneylines)) throw new Error("The Odds API returned no usable moneyline prices");
  return moneylines;
}

export async function fetchTheOddsApiMlbMoneylines({ apiKey, fetchFn = fetch } = {}) {
  if (!apiKey) throw new Error("ODDS_API_KEY missing");
  const url = `${ODDS_API_BASE}/sports/${SPORT}/odds/?apiKey=${encodeURIComponent(apiKey)}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
  const events = await fetchJson(url, { fetchFn, label: "the-odds-api:h2h" });
  return normalizeTheOddsApiMoneylines(events);
}

function getSgoTeamName(team) {
  return team?.names?.short ?? team?.names?.medium ?? team?.names?.long ?? team?.teamID ?? "";
}

function pickSgoPrice(odd) {
  const byBookmaker = odd?.byBookmaker ?? {};
  for (const pref of BOOK_PREFERENCE) {
    const match = Object.entries(byBookmaker).find(([bookKey, book]) => {
      return normalizeBookKey(bookKey) === normalizeBookKey(pref) && book?.available !== false;
    });
    const price = parseAmericanOdds(match?.[1]?.odds);
    if (price != null) return price;
  }
  return parseAmericanOdds(odd?.bookOdds ?? odd?.fairOdds);
}

export function normalizeSportsGameOddsMoneylines(payload) {
  const events = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : null;
  if (!events) throw new Error("SportsGameOdds response was not an event array");
  if (events.length === 0) throw new Error("SportsGameOdds returned no MLB events");
  const moneylines = {};
  for (const ev of events) {
    const odds = Object.values(ev?.odds ?? {});
    const homeOdd = odds.find((odd) => odd?.betTypeID === "ml" && odd?.sideID === "home" && odd?.periodID === "game");
    const awayOdd = odds.find((odd) => odd?.betTypeID === "ml" && odd?.sideID === "away" && odd?.periodID === "game");
    if (!homeOdd || !awayOdd) continue;
    const awayTeam = getSgoTeamName(ev?.teams?.away);
    const homeTeam = getSgoTeamName(ev?.teams?.home);
    const row = makeMoneyline(awayTeam, homeTeam, pickSgoPrice(awayOdd), pickSgoPrice(homeOdd));
    if (row) moneylines[row.key] = row.value;
  }
  if (!hasUsableMoneylines(moneylines)) throw new Error("SportsGameOdds returned no usable moneyline prices");
  return moneylines;
}

export async function fetchSportsGameOddsMlbMoneylines({ apiKey, fetchFn = fetch } = {}) {
  if (!apiKey) throw new Error("SPORTSGAMEODDS_API_KEY missing");
  const params = new URLSearchParams({
    apiKey,
    leagueID: "MLB",
    oddsAvailable: "true",
    includeAltLines: "false",
    limit: "100",
  });
  const payload = await fetchJson(`${SPORTSGAMEODDS_BASE}/events?${params.toString()}`, { fetchFn, label: "sportsgameodds:events" });
  return normalizeSportsGameOddsMoneylines(payload);
}

function normalizeOddsApiIoBookName(value) {
  const key = normalizeBookKey(value);
  if (key === "draftkings") return "draftkings";
  if (key === "fanduel") return "fanduel";
  if (key === "betmgm") return "betmgm";
  if (key === "caesars") return "caesars";
  if (key === "espnbet") return "espnbet";
  if (key === "betrivers") return "betrivers";
  if (key === "pointsbet") return "pointsbet";
  if (key === "bovada") return "bovada";
  return key;
}

function pickOddsApiIoMarket(eventOdds) {
  const bookmakers = eventOdds?.bookmakers ?? {};
  for (const pref of BOOK_PREFERENCE) {
    const entry = Object.entries(bookmakers).find(([book]) => normalizeOddsApiIoBookName(book) === normalizeBookKey(pref));
    const market = entry?.[1]?.find?.((m) => String(m?.name ?? "").toUpperCase() === "ML");
    if (market?.odds?.[0]) return market.odds[0];
  }
  for (const markets of Object.values(bookmakers)) {
    const market = markets?.find?.((m) => String(m?.name ?? "").toUpperCase() === "ML");
    if (market?.odds?.[0]) return market.odds[0];
  }
  return null;
}

function decimalToAmerican(value) {
  const decimal = Number.parseFloat(String(value));
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : -Math.round(100 / (decimal - 1));
}

function parseOddsApiIoPrice(value) {
  const american = parseAmericanOdds(value);
  if (american != null && Math.abs(american) >= 100) return american;
  return decimalToAmerican(value);
}

function normalizeOddsApiIoOddsPayload(payload) {
  return Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : payload ? [payload] : [];
}

export function normalizeOddsApiIoMoneylines(payload) {
  const events = normalizeOddsApiIoOddsPayload(payload);
  if (events.length === 0) throw new Error("Odds-API.io returned no odds events");
  const moneylines = {};
  for (const ev of events) {
    const market = pickOddsApiIoMarket(ev);
    const awayTeam = ev?.away ?? ev?.awayTeam ?? ev?.participants?.away?.name;
    const homeTeam = ev?.home ?? ev?.homeTeam ?? ev?.participants?.home?.name;
    const awayPrice = parseOddsApiIoPrice(market?.away);
    const homePrice = parseOddsApiIoPrice(market?.home);
    const row = makeMoneyline(awayTeam, homeTeam, awayPrice, homePrice);
    if (row) moneylines[row.key] = row.value;
  }
  if (!hasUsableMoneylines(moneylines)) throw new Error("Odds-API.io returned no usable moneyline prices");
  return moneylines;
}

export async function fetchOddsApiIoMlbMoneylines({ apiKey, fetchFn = fetch } = {}) {
  if (!apiKey) throw new Error("ODDS_API_IO_KEY missing");
  const eventsParams = new URLSearchParams({
    apiKey,
    sport: "baseball",
    league: "mlb",
    limit: "50",
  });
  const eventsPayload = await fetchJson(`${ODDS_API_IO_BASE}/events?${eventsParams.toString()}`, { fetchFn, label: "odds-api-io:events" });
  const events = Array.isArray(eventsPayload?.data) ? eventsPayload.data : Array.isArray(eventsPayload) ? eventsPayload : [];
  const eventIds = events.map((ev) => ev?.id ?? ev?.eventId).filter(Boolean).slice(0, 10);
  if (eventIds.length === 0) throw new Error("Odds-API.io returned no MLB events");
  const oddsParams = new URLSearchParams({
    apiKey,
    eventIds: eventIds.join(","),
    bookmakers: "DraftKings,FanDuel,BetMGM,Caesars,ESPN BET,BetRivers,PointsBet,Bovada",
  });
  const oddsPayload = await fetchJson(`${ODDS_API_IO_BASE}/odds/multi?${oddsParams.toString()}`, { fetchFn, label: "odds-api-io:odds" });
  return normalizeOddsApiIoMoneylines(oddsPayload);
}

export async function fetchEspnMlbMoneylines({ fetchFn = fetch } = {}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");
  // Step 1: get event IDs from the ESPN scoreboard (1 call, includes team abbrs)
  const scoreboard = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${today}&limit=25`,
    { fetchFn, label: "espn:scoreboard" }
  );
  const events = scoreboard?.events;
  if (!Array.isArray(events) || events.length === 0) throw new Error("ESPN scoreboard returned no MLB events");

  // Build a map of eventId -> { awayAbbr, homeAbbr }
  const eventMeta = {};
  for (const ev of events) {
    const id = ev?.id;
    const comp = ev?.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const awayAbbr = competitors.find((c) => c.homeAway === "away")?.team?.abbreviation;
    const homeAbbr = competitors.find((c) => c.homeAway === "home")?.team?.abbreviation;
    if (id && awayAbbr && homeAbbr) eventMeta[id] = { awayAbbr, homeAbbr };
  }

  // Step 2: fetch odds for each event from the core API (parallel)
  const oddsResults = await Promise.all(
    Object.keys(eventMeta).map(async (id) => {
      try {
        const data = await fetchJson(
          `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${id}/competitions/${id}/odds`,
          { fetchFn, label: `espn:odds:${id}` }
        );
        return { id, data };
      } catch {
        return { id, data: null };
      }
    })
  );

  const moneylines = {};
  for (const { id, data } of oddsResults) {
    const meta = eventMeta[id];
    if (!meta || !data) continue;
    const item = data?.items?.[0];
    const awayML = item?.awayTeamOdds?.moneyLine;
    const homeML = item?.homeTeamOdds?.moneyLine;
    const row = makeMoneyline(meta.awayAbbr, meta.homeAbbr, awayML, homeML);
    if (row) moneylines[row.key] = row.value;
  }
  if (!hasUsableMoneylines(moneylines)) throw new Error("ESPN returned no usable moneyline prices");
  return moneylines;
}

// sport_id 4 = MLB in TheRundown API
const THERUNDOWN_BASE = "https://therundown.io/api/v2";

export async function fetchTheRundownMlbMoneylines({ apiKey, fetchFn = fetch } = {}) {
  if (!apiKey) throw new Error("THERUNDOWNAPI missing");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const url = `${THERUNDOWN_BASE}/sports/4/events/${today}?key=${apiKey}&include=scores&limit=30`;
  const payload = await fetchJson(url, { fetchFn, label: "therundown:events" });
  const events = payload?.events ?? [];
  if (!Array.isArray(events) || events.length === 0) throw new Error("TheRundown returned no MLB events");

  const moneylines = {};
  for (const ev of events) {
    // TheRundown v2: teams[0]=away, teams[1]=home; lines array has per-book odds
    const teams = ev?.teams ?? [];
    const awayTeam = teams[0]?.name;
    const homeTeam = teams[1]?.name;
    // Pick first available affiliate line with moneyline prices
    const lines = Array.isArray(ev?.lines) ? ev.lines : Object.values(ev?.lines ?? {});
    let awayPrice = null;
    let homePrice = null;
    for (const line of lines) {
      const aw = line?.moneyline?.moneyline_away;
      const hm = line?.moneyline?.moneyline_home;
      if (aw != null && hm != null && aw !== 0 && hm !== 0) {
        awayPrice = aw;
        homePrice = hm;
        break;
      }
    }
    const row = makeMoneyline(awayTeam, homeTeam, awayPrice, homePrice);
    if (row) moneylines[row.key] = row.value;
  }
  if (!hasUsableMoneylines(moneylines)) throw new Error("TheRundown returned no usable moneyline prices");
  return moneylines;
}

export async function getMlbMoneylinesWithFallbacks({
  oddsApiKey,
  sportsGameOddsApiKey,
  oddsApiIoKey,
  theRundownApiKey,
  fetchFn = fetch,
  logger = console,
} = {}) {
  const providerErrors = [];
  const providers = [
    ["the-odds-api",   () => fetchTheOddsApiMlbMoneylines({ apiKey: oddsApiKey, fetchFn })],
    ["sportsgameodds", () => fetchSportsGameOddsMlbMoneylines({ apiKey: sportsGameOddsApiKey, fetchFn })],
    ["odds-api-io",    () => fetchOddsApiIoMlbMoneylines({ apiKey: oddsApiIoKey, fetchFn })],
    ["therundown",     () => fetchTheRundownMlbMoneylines({ apiKey: theRundownApiKey, fetchFn })],
    ["espn",           () => fetchEspnMlbMoneylines({ fetchFn })],
  ];

  for (const [source, load] of providers) {
    try {
      const moneylines = await load();
      return {
        moneylines,
        metadata: {
          source,
          fallbackUsed: source !== "the-odds-api",
          providerErrors,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      const message = `${source}: ${safeMessage(err)}`;
      providerErrors.push(message);
      const missingKey = (source === "sportsgameodds" && !sportsGameOddsApiKey) || (source === "odds-api-io" && !oddsApiIoKey) || (source === "therundown" && !theRundownApiKey);
      if (missingKey) {
        logger.debug?.(`[mlb-moneylines] ${message}`);
      } else {
        logger.warn?.(`[mlb-moneylines] ${message}`);
      }
    }
  }

  return {
    moneylines: {},
    metadata: {
      source: "none",
      fallbackUsed: true,
      providerErrors,
      generatedAt: new Date().toISOString(),
    },
  };
}

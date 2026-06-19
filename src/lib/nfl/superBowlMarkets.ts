import { NFL_POWER_RATINGS, type NflPowerTeam } from "../../data/nflPreseason2026.js";

export type PolymarketMarket = {
  id?: string | number;
  slug?: string;
  question?: string;
  title?: string;
  groupItemTitle?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  active?: boolean;
  closed?: boolean;
  resolved?: boolean;
};

export type PolymarketEvent = {
  id?: string | number;
  title?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  resolved?: boolean;
  markets?: PolymarketMarket[];
};

export type SuperBowlMarketTeam = {
  team: string;
  abbr: string;
  marketId: string | null;
  marketSlug: string | null;
  price: number | null;
  probability: number | null;
  marketRank: number | null;
};

const TEAM_ALIASES: Record<string, string[]> = {
  ari: ["arizona cardinals", "cardinals"],
  atl: ["atlanta falcons", "falcons"],
  bal: ["baltimore ravens", "ravens"],
  buf: ["buffalo bills", "bills"],
  car: ["carolina panthers", "panthers"],
  chi: ["chicago bears", "bears"],
  cin: ["cincinnati bengals", "bengals"],
  cle: ["cleveland browns", "browns"],
  dal: ["dallas cowboys", "cowboys"],
  den: ["denver broncos", "broncos"],
  det: ["detroit lions", "lions"],
  gb: ["green bay packers", "packers"],
  hou: ["houston texans", "texans"],
  ind: ["indianapolis colts", "colts"],
  jax: ["jacksonville jaguars", "jaguars"],
  kc: ["kansas city chiefs", "chiefs"],
  lac: ["la chargers", "los angeles chargers", "chargers"],
  lar: ["la rams", "los angeles rams", "rams"],
  lv: ["las vegas raiders", "raiders"],
  mia: ["miami dolphins", "dolphins"],
  min: ["minnesota vikings", "vikings"],
  ne: ["new england patriots", "patriots"],
  no: ["new orleans saints", "saints"],
  nyg: ["ny giants", "new york giants", "giants"],
  nyj: ["ny jets", "new york jets", "jets"],
  phi: ["philadelphia eagles", "eagles"],
  pit: ["pittsburgh steelers", "steelers"],
  sea: ["seattle seahawks", "seahawks"],
  sf: ["san francisco 49ers", "49ers", "niners"],
  tb: ["tampa bay buccaneers", "buccaneers", "bucs"],
  ten: ["tennessee titans", "titans"],
  wsh: ["washington commanders", "washington", "commanders"],
};

function text(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseStringArray(value: unknown): string[] | null {
  const source = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })()
    : value;

  if (!Array.isArray(source)) return null;
  return source.map((item) => String(item));
}

export function parseYesPrice(outcomes: unknown, outcomePrices: unknown): number | null {
  const labels = parseStringArray(outcomes);
  const prices = parseStringArray(outcomePrices);
  if (!labels || !prices || labels.length !== prices.length) return null;

  const yesIndex = labels.findIndex((outcome) => text(outcome) === "yes");
  if (yesIndex < 0) return null;

  const price = Number(prices[yesIndex]);
  return Number.isFinite(price) && price >= 0 && price <= 1 ? price : null;
}

export function matchNflTeam(value: string, teams: NflPowerTeam[] = NFL_POWER_RATINGS): NflPowerTeam | null {
  const source = text(value);
  if (!source) return null;

  for (const team of teams) {
    const aliases = TEAM_ALIASES[team.abbr] ?? [team.team];
    if (aliases.some((alias) => new RegExp(`(?:^|\\s)${text(alias)}(?:\\s|$)`).test(source))) {
      return team;
    }
  }

  return null;
}

export function getMarketTitle(market: PolymarketMarket): string {
  return [market.groupItemTitle, market.question, market.title, market.slug]
    .filter(Boolean)
    .join(" ");
}

export function getRecognizedTeamMarketCount(event: PolymarketEvent): number {
  const matched = new Set<string>();
  for (const market of event.markets ?? []) {
    const team = matchNflTeam(getMarketTitle(market));
    if (team) matched.add(team.abbr);
  }
  return matched.size;
}

export function validateSuperBowlEvent(event: PolymarketEvent): string | null {
  const title = text(`${event.title ?? ""} ${event.slug ?? ""}`);
  if (!event.active || event.closed || event.resolved) return "event is not active and unresolved";
  if (!/(super bowl|nfl champion)/.test(title) || !/(winner|champion|win)/.test(title)) {
    return "event does not represent the Super Bowl winner";
  }
  if (getRecognizedTeamMarketCount(event) < 28) return "event does not contain enough recognizable NFL team markets";
  return null;
}

export function buildDenseMarketRanks<T extends { price: number | null; team: string }>(teams: T[]): T[] {
  const sorted = [...teams].sort((a, b) => {
    if (a.price == null && b.price == null) return a.team.localeCompare(b.team);
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return b.price - a.price || a.team.localeCompare(b.team);
  });

  let rank = 0;
  let previousPrice: number | null = null;
  return sorted.map((team) => {
    if (team.price == null) return { ...team, marketRank: null };
    if (previousPrice === null || team.price !== previousPrice) rank += 1;
    previousPrice = team.price;
    return { ...team, marketRank: rank };
  });
}

export function normalizeSuperBowlEvent(event: PolymarketEvent): {
  teams: SuperBowlMarketTeam[];
  unmatchedMarketTitles: string[];
} {
  const byAbbr = new Map<string, SuperBowlMarketTeam>();
  const unmatchedMarketTitles: string[] = [];

  for (const market of event.markets ?? []) {
    const title = getMarketTitle(market);
    const team = matchNflTeam(title);
    if (!team) {
      if (title) unmatchedMarketTitles.push(title);
      continue;
    }

    const price = parseYesPrice(market.outcomes, market.outcomePrices);
    const existing = byAbbr.get(team.abbr);
    if (!existing || (existing.price == null && price != null)) {
      byAbbr.set(team.abbr, {
        team: team.team,
        abbr: team.abbr,
        marketId: market.id == null ? null : String(market.id),
        marketSlug: market.slug ?? null,
        price,
        probability: price == null ? null : price * 100,
        marketRank: null,
      });
    }
  }

  const canonicalTeams = NFL_POWER_RATINGS.map((team) => (
    byAbbr.get(team.abbr) ?? {
      team: team.team,
      abbr: team.abbr,
      marketId: null,
      marketSlug: null,
      price: null,
      probability: null,
      marketRank: null,
    }
  ));

  return {
    teams: buildDenseMarketRanks(canonicalTeams),
    unmatchedMarketTitles: [...new Set(unmatchedMarketTitles)],
  };
}

export function calculateRankGap(marketRank: number | null, powerRank: number): number | null {
  return marketRank == null ? null : marketRank - powerRank;
}

export function getRankGapSignal(gap: number | null): "Potential Value" | "Model Higher" | "Aligned" | "Market Higher" | "Large Market Premium" | "No Market" {
  if (gap == null) return "No Market";
  if (gap >= 5) return "Potential Value";
  if (gap >= 2) return "Model Higher";
  if (gap >= -1) return "Aligned";
  if (gap >= -4) return "Market Higher";
  return "Large Market Premium";
}

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARKET_TRANSITION_GAME_COUNT,
  completedGamesFor,
  createMarketResolver,
  currentMarketFor,
  formatAtsRecord,
  formatMoneyline,
  formatOuRecord,
  formatSignedDecimal,
  formatSpread,
  formatTotal,
  formatWinRecord,
  hasAnyMarket,
  resolveMarketPeriods,
  type MarketArtifact,
} from "@/lib/nfl/marketData";

const ROOT = resolve(__dirname, "../../..");
const ARTIFACT = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/matchup-market.json"), "utf8")
) as MarketArtifact;

const SLUGS = new Map([
  ["new-england-patriots", "ne"],
  ["seattle-seahawks", "sea"],
  ["kansas-city-chiefs", "kc"],
  ["philadelphia-eagles", "phi"],
]);

describe("display transition", () => {
  it("shows 2025 Season + 2025 Last 8 when neither team has played in 2026", () => {
    expect(resolveMarketPeriods(0, 0)).toEqual(["2025-season", "2025-last8"]);
  });

  it("moves to 2025 Last 8 + 2026 Season once any 2026 game exists", () => {
    expect(resolveMarketPeriods(1, 0)).toEqual(["2025-last8", "2026-season"]);
    expect(resolveMarketPeriods(0, 1)).toEqual(["2025-last8", "2026-season"]);
    expect(resolveMarketPeriods(5, 5)).toEqual(["2025-last8", "2026-season"]);
  });

  it("keeps both teams in the developing state when a bye splits them", () => {
    // 6 vs 5 must NOT advance: the two sides would be on different windows.
    expect(resolveMarketPeriods(6, 5)).toEqual(["2025-last8", "2026-season"]);
    expect(resolveMarketPeriods(5, 6)).toEqual(["2025-last8", "2026-season"]);
  });

  it("switches to 2026 Season + 2026 Last 5 once both teams reach the threshold", () => {
    expect(MARKET_TRANSITION_GAME_COUNT).toBe(6);
    expect(resolveMarketPeriods(6, 6)).toEqual(["2026-season", "2026-last5"]);
    expect(resolveMarketPeriods(10, 10)).toEqual(["2026-season", "2026-last5"]);
    expect(resolveMarketPeriods(17, 12)).toEqual(["2026-season", "2026-last5"]);
  });

  it("never blends the two seasons into one period", () => {
    for (const pair of [[0, 0], [3, 1], [6, 6], [12, 9]] as const) {
      const periods = resolveMarketPeriods(pair[0], pair[1]);
      const seasons = new Set(periods.map((p) => p.slice(0, 4)));
      // Each period belongs to exactly one season; no combined key exists.
      expect(periods.every((p) => p.startsWith("2025") || p.startsWith("2026"))).toBe(true);
      expect(seasons.size).toBeLessThanOrEqual(2);
    }
  });
});

describe("formatting", () => {
  it("shows pushes in ATS and O/U records", () => {
    expect(formatAtsRecord({ W: 7, L: 4, P: 1 })).toBe("7-4-1");
    expect(formatOuRecord({ O: 6, U: 5, P: 1 })).toBe("6-5-1");
    expect(formatAtsRecord({ W: 12, L: 5, P: 0 })).toBe("12-5-0");
  });

  it("omits the tie column from W/L unless a tie happened", () => {
    expect(formatWinRecord({ W: 12, L: 5, T: 0 })).toBe("12-5");
    expect(formatWinRecord({ W: 12, L: 4, T: 1 })).toBe("12-4-1");
  });

  it("formats spreads with an explicit sign and PK at zero", () => {
    expect(formatSpread(-3.5)).toBe("−3.5");
    expect(formatSpread(3.5)).toBe("+3.5");
    expect(formatSpread(0)).toBe("PK");
    expect(formatSpread(null)).toBe("N/A");
  });

  it("formats American odds with an explicit sign", () => {
    expect(formatMoneyline(-205)).toBe("−205");
    expect(formatMoneyline(170)).toBe("+170");
    expect(formatMoneyline(null)).toBe("N/A");
  });

  it("formats totals and signed decimals", () => {
    expect(formatTotal(44.5)).toBe("44.5");
    expect(formatTotal(null)).toBe("N/A");
    expect(formatSignedDecimal(6.18)).toBe("+6.2");
    expect(formatSignedDecimal(-1.03)).toBe("−1.0");
    expect(formatSignedDecimal(null)).toBe("N/A");
  });

  it("never renders a missing value as zero", () => {
    expect(formatSignedDecimal(null)).not.toBe("+0.0");
    expect(formatSpread(null)).not.toBe("0");
    expect(formatMoneyline(null)).not.toBe("0");
  });
});

describe("current market lookup", () => {
  it("reports an unpriced game as having no market", () => {
    expect(hasAnyMarket(null)).toBe(false);
    expect(
      hasAnyMarket({
        gameId: "x", season: 2026, week: 1, seasonType: "REG", homeAbbr: "a", awayAbbr: "b",
        neutralSite: false, spread: { home: null, away: null },
        moneyline: { home: null, away: null }, total: null, rawSpreadLine: null,
      })
    ).toBe(false);
  });

  it("returns null for an unknown game id", () => {
    expect(currentMarketFor(ARTIFACT, "1999_01_XXX_YYY")).toBeNull();
    expect(currentMarketFor(null, "2026_01_NE_SEA")).toBeNull();
  });
});

describe("generated artifact", () => {
  it("declares schema, attribution and source without naming a sportsbook", () => {
    expect(ARTIFACT.schemaVersion).toBe("nfl-matchup-market-v1");
    expect(ARTIFACT.attribution).toBe("Market data: nflverse / nfldata");
    const json = JSON.stringify(ARTIFACT);
    for (const book of ["DraftKings", "FanDuel", "Pinnacle", "BetMGM", "Caesars", "ESPN BET"]) {
      expect(json, book).not.toContain(book);
    }
  });

  it("records provenance without fabricating a per-line timestamp", () => {
    expect(ARTIFACT.provenance.sourceUrl).toContain("nflverse/nfldata");
    expect(ARTIFACT.provenance.perRowTimestampAvailable).toBe(false);
    expect(Date.parse(ARTIFACT.provenance.retrievedAt)).not.toBeNaN();
    // Upstream commit is best-effort; when present it must be well formed.
    if (ARTIFACT.provenance.upstreamCommitSha) {
      expect(ARTIFACT.provenance.upstreamCommitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(Date.parse(ARTIFACT.provenance.upstreamCommitAt!)).not.toBeNaN();
    }
  });

  it("contains no projection, edge, pick or probability field", () => {
    // Scanned over the data only — the _meta notes deliberately state in prose
    // that these are NOT produced, so including them would match trivially.
    const { _meta, ...data } = ARTIFACT;
    const json = JSON.stringify(data);
    expect(json).not.toMatch(
      /projectedSpread|fairSpread|modelEdge|winProb|recommendation|confidence|expectedValue|kelly/i
    );
    // "pickemGames" is a legitimate count; a pick/selection field is not.
    expect(json).not.toMatch(/"(pick|selection|bet|play)"\s*:/i);
  });

  it("carries all four periods with 32 teams in the completed 2025 season", () => {
    expect(Object.keys(ARTIFACT.periods).sort()).toEqual([
      "2025-last8", "2025-season", "2026-last5", "2026-season",
    ]);
    expect(Object.keys(ARTIFACT.periods["2025-season"].teams)).toHaveLength(32);
    expect(Object.keys(ARTIFACT.periods["2025-last8"].teams)).toHaveLength(32);
  });

  it("reports zero completed 2026 games, so the matchup starts in the 2025 state", () => {
    const completed2026 = Object.values(ARTIFACT.completedGames["2026"]);
    expect(completed2026.every((n) => n === 0)).toBe(true);
    expect(
      resolveMarketPeriods(
        completedGamesFor(ARTIFACT, 2026, "ne"),
        completedGamesFor(ARTIFACT, 2026, "sea")
      )
    ).toEqual(["2025-season", "2025-last8"]);
  });

  it("gives every 2025 team exactly 17 completed regular-season games", () => {
    for (const [abbr, profile] of Object.entries(ARTIFACT.periods["2025-season"].teams)) {
      expect(profile.games, abbr).toBe(17);
      const atsTotal = profile.ats.W + profile.ats.L + profile.ats.P;
      const ouTotal = profile.overUnder.O + profile.overUnder.U + profile.overUnder.P;
      expect(atsTotal, abbr).toBe(17);
      expect(ouTotal, abbr).toBe(17);
    }
  });

  it("keeps neutral games out of home and away splits but inside the overall record", () => {
    for (const [abbr, p] of Object.entries(ARTIFACT.periods["2025-season"].teams)) {
      const homeCount = p.homeAts.W + p.homeAts.L + p.homeAts.P;
      const awayCount = p.awayAts.W + p.awayAts.L + p.awayAts.P;
      expect(homeCount, abbr).toBe(p.homeGames);
      expect(awayCount, abbr).toBe(p.awayGames);
      expect(p.homeGames + p.awayGames + p.neutralGames, abbr).toBe(p.games);
    }
  });

  it("keeps pick'em games out of favourite/underdog splits but inside the overall record", () => {
    for (const [abbr, p] of Object.entries(ARTIFACT.periods["2025-season"].teams)) {
      expect(p.favoriteGames + p.underdogGames + p.pickemGames, abbr).toBe(p.games);
    }
  });

  it("caps the Last 8 window at eight games", () => {
    for (const [abbr, p] of Object.entries(ARTIFACT.periods["2025-last8"].teams)) {
      expect(p.games, abbr).toBe(8);
    }
  });

  it("ranks only the two differential metrics", () => {
    const p = ARTIFACT.periods["2025-season"].teams.sea;
    expect(p.ranks?.atsDifferential).toBeGreaterThanOrEqual(1);
    expect(p.ranks?.pointDifferential).toBeGreaterThanOrEqual(1);
    expect(Object.keys(p.ranks!).sort()).toEqual(["atsDifferential", "pointDifferential"]);
  });

  it("reproduces the audited 2025 season profiles exactly", () => {
    const cases = [
      { abbr: "ne", ats: "12-5-0", ou: "11-6-0", home: "5-4-0", away: "7-1-0", fav: "8-3-0", dog: "4-2-0" },
      { abbr: "sea", ats: "12-5-0", ou: "9-8-0", home: "4-4-0", away: "8-1-0", fav: "10-4-0", dog: "2-1-0" },
      // KC's Week 1 was in Sao Paulo, so it is excluded from the away split:
      // the audit's raw 1-7 away line becomes 1-6 once neutral games are removed.
      { abbr: "kc", ats: "6-11-0", ou: "4-13-0", home: "5-4-0", away: "1-6-0", fav: "4-10-0", dog: "2-1-0" },
      { abbr: "phi", ats: "10-7-0", ou: "7-10-0", home: "4-4-0", away: "6-3-0", fav: "8-7-0", dog: "2-0-0" },
    ];
    for (const c of cases) {
      const p = ARTIFACT.periods["2025-season"].teams[c.abbr];
      expect(formatAtsRecord(p.ats), `${c.abbr} ATS`).toBe(c.ats);
      expect(formatOuRecord(p.overUnder), `${c.abbr} O/U`).toBe(c.ou);
      expect(formatAtsRecord(p.homeAts), `${c.abbr} home`).toBe(c.home);
      expect(formatAtsRecord(p.awayAts), `${c.abbr} away`).toBe(c.away);
      expect(formatAtsRecord(p.favoriteAts), `${c.abbr} fav`).toBe(c.fav);
      expect(formatAtsRecord(p.underdogAts), `${c.abbr} dog`).toBe(c.dog);
    }
    // KC is the only one of the four with a neutral-site game.
    expect(ARTIFACT.periods["2025-season"].teams.kc.neutralGames).toBe(1);
    expect(ARTIFACT.periods["2025-season"].teams.ne.neutralGames).toBe(0);
  });

  it("reproduces the audited 2025 Last 8 records", () => {
    const cases: [string, string, string][] = [
      ["ne", "6-2-0", "6-2-0"],
      ["sea", "5-3-0", "3-5-0"],
      ["kc", "1-7-0", "1-7-0"],
      ["phi", "4-4-0", "2-6-0"],
    ];
    for (const [abbr, ats, ou] of cases) {
      const p = ARTIFACT.periods["2025-last8"].teams[abbr];
      expect(formatAtsRecord(p.ats), `${abbr} last8 ATS`).toBe(ats);
      expect(formatOuRecord(p.overUnder), `${abbr} last8 O/U`).toBe(ou);
    }
  });

  it("orients the 2026_01_NE_SEA current market correctly", () => {
    const m = currentMarketFor(ARTIFACT, "2026_01_NE_SEA")!;
    expect(m.homeAbbr).toBe("sea");
    expect(m.awayAbbr).toBe("ne");
    // Orientation, not numeric staleness: SEA is home and favoured, so its
    // conventional spread is negative and NE's is the positive mirror.
    expect(m.rawSpreadLine).toBeGreaterThan(0);
    expect(m.spread.home).toBe(-m.rawSpreadLine!);
    expect(m.spread.away).toBe(m.rawSpreadLine);
    expect(m.spread.home).toBeLessThan(0);
    expect(m.spread.away).toBeGreaterThan(0);
    // The favourite's moneyline must be the negative one.
    expect(m.moneyline.home!).toBeLessThan(0);
    expect(m.moneyline.away!).toBeGreaterThan(0);
    expect(m.total).toBeGreaterThan(0);
  });

  it("leaves unpriced 2026 games fully null rather than omitting them", () => {
    const unpriced = Object.values(ARTIFACT.currentMarket).filter((m) => m.spread.home == null);
    expect(unpriced.length).toBeGreaterThan(0);
    for (const m of unpriced.slice(0, 20)) {
      expect(m.spread).toEqual({ home: null, away: null });
      expect(m.rawSpreadLine).toBeNull();
    }
    expect(Object.keys(ARTIFACT.currentMarket)).toHaveLength(272);
  });
});

describe("metric resolver", () => {
  const resolve = createMarketResolver(ARTIFACT, SLUGS, "2025-season");

  it("resolves every market metric for a known team", () => {
    expect(resolve("seattle-seahawks", "mkt.atsRecord")?.formattedValue).toBe("12-5-0");
    expect(resolve("seattle-seahawks", "mkt.overUnderRecord")?.formattedValue).toBe("9-8-0");
    expect(resolve("seattle-seahawks", "mkt.record")?.formattedValue).toMatch(/^\d+-\d+/);
    expect(resolve("seattle-seahawks", "mkt.homeAtsRecord")?.formattedValue).toBe("4-4-0");
    expect(resolve("seattle-seahawks", "mkt.awayAtsRecord")?.formattedValue).toBe("8-1-0");
    expect(resolve("seattle-seahawks", "mkt.atsDifferential")?.formattedValue).toMatch(/^[+−]\d/);
    expect(resolve("seattle-seahawks", "mkt.atsDifferentialSplit")?.formattedValue).toContain(" / ");
  });

  it("ranks only the differentials", () => {
    expect(resolve("seattle-seahawks", "mkt.atsDifferential")?.rank).toBe(1);
    expect(resolve("seattle-seahawks", "mkt.pointDifferential")?.rank).toBe(1);
    expect(resolve("seattle-seahawks", "mkt.atsRecord")?.rank).toBeNull();
    expect(resolve("seattle-seahawks", "mkt.overUnderRecord")?.rank).toBeNull();
    expect(resolve("seattle-seahawks", "mkt.homeAtsRecord")?.rank).toBeNull();
  });

  it("returns null for unknown teams, metrics and a missing artifact", () => {
    expect(resolve("not-a-team", "mkt.atsRecord")).toBeNull();
    expect(resolve("seattle-seahawks", "off.epaPerPlay")).toBeNull();
    expect(createMarketResolver(null, SLUGS, "2025-season")("seattle-seahawks", "mkt.atsRecord")).toBeNull();
  });

  it("returns null for a period with no data", () => {
    const empty = createMarketResolver(ARTIFACT, SLUGS, "2026-season");
    expect(empty("seattle-seahawks", "mkt.atsRecord")).toBeNull();
  });
});

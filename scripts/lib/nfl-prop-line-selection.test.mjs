import { describe, expect, it } from "vitest";
import {
  buildYardageQuote,
  buildYardageQuotes,
  canonicalPropMarket,
  isMilestoneProviderMarket,
  PASSING_YARDS_MARKET,
  RECEIVING_YARDS_MARKET,
  RUSHING_YARDS_MARKET,
  selectCanonicalLine,
  selectCanonicalLines,
} from "./nfl-prop-line-selection.mjs";
import { APPROVED_SPORTSBOOKS } from "./nfl-book-classification.mjs";

function row(overrides = {}) {
  return {
    event_id: "evt1",
    home_team: "Los Angeles Rams",
    away_team: "San Francisco 49ers",
    bookmaker: "draftkings",
    player: "Brock Purdy",
    market_key: "player_passing_yards",
    line: 245.5,
    over_price: -115,
    under_price: -105,
    last_update: "2026-08-26T10:00:00Z",
    ...overrides,
  };
}

describe("canonicalPropMarket", () => {
  it("maps both observed aliases per market", () => {
    expect(canonicalPropMarket("player_passing_yards")).toBe(PASSING_YARDS_MARKET);
    expect(canonicalPropMarket("player_pass_yds")).toBe(PASSING_YARDS_MARKET);
    expect(canonicalPropMarket("player_rushing_yards")).toBe(RUSHING_YARDS_MARKET);
    expect(canonicalPropMarket("player_rush_yds")).toBe(RUSHING_YARDS_MARKET);
    expect(canonicalPropMarket("player_receiving_yards")).toBe(RECEIVING_YARDS_MARKET);
    expect(canonicalPropMarket("player_reception_yds")).toBe(RECEIVING_YARDS_MARKET);
  });

  it("excludes the milestone/ladder family by market-key family, not a flag", () => {
    expect(canonicalPropMarket("player_passing_yards_milestones")).toBeNull();
    expect(canonicalPropMarket("player_rushing_yards_milestones")).toBeNull();
    expect(canonicalPropMarket("player_receiving_yards_milestones")).toBeNull();
  });

  it("returns null for an unrecognized market key", () => {
    expect(canonicalPropMarket("player_anytime_td")).toBeNull();
  });
});

describe("isMilestoneProviderMarket", () => {
  it("flags milestone/ladder keys as a defensive fallback", () => {
    expect(isMilestoneProviderMarket("player_passing_yards_milestones")).toBe(true);
    expect(isMilestoneProviderMarket("player_rush_yds_alt")).toBe(true);
    expect(isMilestoneProviderMarket("player_passing_yards")).toBe(false);
  });
});

describe("buildYardageQuote", () => {
  it("builds a quote from a standard two-sided row", () => {
    const quote = buildYardageQuote(row());
    expect(quote).toMatchObject({
      canonicalMarket: PASSING_YARDS_MARKET,
      bookmaker: "draftkings",
      bookClass: "sportsbook",
      player: "brock purdy",
      point: 245.5,
      overPrice: -115,
      underPrice: -105,
      twoSided: true,
    });
  });

  it("rejects a milestone-family row", () => {
    expect(buildYardageQuote(row({ market_key: "player_passing_yards_milestones" }))).toBeNull();
  });

  it("rejects a row with no line", () => {
    expect(buildYardageQuote(row({ line: null }))).toBeNull();
  });

  it("rejects a row with neither price", () => {
    expect(buildYardageQuote(row({ over_price: null, under_price: null }))).toBeNull();
  });

  it("accepts a one-sided row as a quote (rejection of one-sidedness happens at selection, not ingestion)", () => {
    const quote = buildYardageQuote(row({ under_price: null }));
    expect(quote?.twoSided).toBe(false);
  });

  it("classifies an unapproved book correctly", () => {
    expect(buildYardageQuote(row({ bookmaker: "prizepicks" }))?.bookClass).toBe("dfs");
    expect(buildYardageQuote(row({ bookmaker: "novig" }))?.bookClass).toBe("exchange");
  });
});

describe("buildYardageQuotes", () => {
  it("counts rejected rows separately from built quotes", () => {
    const { quotes, rejected } = buildYardageQuotes([row(), row({ market_key: "player_passing_yards_milestones" }), row({ line: null })]);
    expect(quotes).toHaveLength(1);
    expect(rejected).toBe(2);
  });
});

describe("selectCanonicalLine", () => {
  it("selects the two-sided approved-book quote", () => {
    const { quotes } = buildYardageQuotes([row()]);
    const { selection, diagnostics } = selectCanonicalLine(quotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });
    expect(selection).toMatchObject({ bookmaker: "draftkings", point: 245.5, over: "-115", under: "-105" });
    expect(diagnostics.reason).toBe("two_sided_approved_book_consensus");
  });

  it("never falls back to a non-approved book even if it is the only two-sided quote", () => {
    const rows = [row({ bookmaker: "novig", over_price: -110, under_price: -110 })];
    const { quotes } = buildYardageQuotes(rows);
    const { selection, diagnostics } = selectCanonicalLine(quotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });
    expect(selection).toBeNull();
    expect(diagnostics.rejected).toBe("no_approved_sportsbook_quote");
  });

  it("never falls back to a one-sided approved-book quote", () => {
    const rows = [row({ under_price: null })];
    const { quotes } = buildYardageQuotes(rows);
    const { selection, diagnostics } = selectCanonicalLine(quotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });
    expect(selection).toBeNull();
    expect(diagnostics.rejected).toBe("approved_book_present_but_one_sided_only");
  });

  it("picks the consensus threshold across approved books, ties broken to the lower point", () => {
    const rows = [
      row({ bookmaker: "draftkings", line: 245.5 }),
      row({ bookmaker: "fanduel", line: 245.5 }),
      row({ bookmaker: "betmgm", line: 250.5 }),
    ];
    const { quotes } = buildYardageQuotes(rows);
    const { selection } = selectCanonicalLine(quotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });
    expect(selection?.point).toBe(245.5);
  });

  it("applies deterministic approved-book priority when thresholds tie", () => {
    const rows = [
      row({ bookmaker: "bovada", line: 245.5, over_price: -120, under_price: 100 }),
      row({ bookmaker: "draftkings", line: 245.5, over_price: -115, under_price: -105 }),
    ];
    const { quotes } = buildYardageQuotes(rows);
    const { selection } = selectCanonicalLine(quotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });
    expect(selection?.bookmaker).toBe("draftkings");
  });
});

describe("selectCanonicalLines", () => {
  it("groups by player + event so a name collision across two games never merges", () => {
    const rows = [row({ event_id: "evt1" }), row({ event_id: "evt2", home_team: "Seattle Seahawks", away_team: "New England Patriots" })];
    const { quotes } = buildYardageQuotes(rows);
    const { selections } = selectCanonicalLines(quotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });
    expect(selections).toHaveLength(2);
    expect(new Set(selections.map((s) => s.eventId))).toEqual(new Set(["evt1", "evt2"]));
  });

  it("reports rejections for players with no usable approved-book market", () => {
    const rows = [row({ bookmaker: "prizepicks", under_price: null })];
    const { quotes } = buildYardageQuotes(rows);
    const { selections, rejections } = selectCanonicalLines(quotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });
    expect(selections).toHaveLength(0);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].rejected).toBe("no_approved_sportsbook_quote");
  });
});

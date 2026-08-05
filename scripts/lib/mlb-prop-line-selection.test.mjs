import { describe, expect, it } from "vitest";
import {
  HR_MARKET,
  K_MARKET,
  buildPropQuotes,
  canonicalPropMarket,
  selectPrimaryLines,
} from "./mlb-prop-line-selection.mjs";

const K_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "pinnacle", "bovada", "bet365"];
const HR_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "pinnacle", "bovada"];

/** Build one provider row the way ParlayAPI emits them. */
function row(player, market, bookmaker, line, over, under = null) {
  return {
    player,
    market_key: market,
    bookmaker,
    line,
    over_price: over,
    under_price: under,
  };
}

function selectK(rows, options = {}) {
  const { quotes } = buildPropQuotes(rows);
  return selectPrimaryLines(
    quotes.filter((quote) => quote.canonicalMarket === K_MARKET),
    { bookRanking: K_BOOKS, requireTwoSided: true, ...options },
  );
}

function selectHr(rows, options = {}) {
  const { quotes } = buildPropQuotes(rows);
  return selectPrimaryLines(
    quotes.filter((quote) => quote.canonicalMarket === HR_MARKET),
    { bookRanking: HR_BOOKS, requireTwoSided: false, ...options },
  );
}

/** Deterministic shuffles so "provider order" is exercised, not simulated. */
function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [];
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([items[index], ...tail]);
  }
  return out;
}

describe("canonical market admission", () => {
  it("maps primary provider market keys onto canonical markets", () => {
    expect(canonicalPropMarket("player_strikeouts")).toBe(K_MARKET);
    expect(canonicalPropMarket("pitcher_strikeouts")).toBe(K_MARKET);
    expect(canonicalPropMarket("player_home_runs")).toBe(HR_MARKET);
    expect(canonicalPropMarket("batter_home_runs")).toBe(HR_MARKET);
  });

  it("does not admit alternate, milestone, inning or combo markets", () => {
    const rejected = [
      "player_strikeouts_alt",
      "player_home_runs_alt",
      "player_home_runs_milestones",
      "player_strikeouts_thrown_milestones",
      "player_1st_inning_pitcher_strikeouts",
      "player_combined_pitcher_strikeouts_thrown",
      "player_either_batter_home_runs",
    ];
    for (const market of rejected) {
      expect(canonicalPropMarket(market)).not.toBe(K_MARKET);
      expect(canonicalPropMarket(market)).not.toBe(HR_MARKET);
    }
  });

  it("drops provider rows whose player field is not a name", () => {
    const { quotes } = buildPropQuotes([
      row("1", "player_home_runs", "draftkings", 1, 163),
      row("2", "player_home_runs", "draftkings", 2, 1900),
      row("Aaron Judge", "player_home_runs", "draftkings", 0.5, 310),
    ]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].player).toBe("aaron judge");
  });
});

describe("strikeout primary line selection", () => {
  // Strikeout test 1 -- the reported failure shape.
  it("selects the two-sided line, not the long-odds ladder rung", () => {
    const rows = [
      row("Bryan Woo", "player_strikeouts", "draftkings", 5.5, -120, -110),
      row("Bryan Woo", "player_strikeouts", "draftkings", 6.5, 150),
      row("Bryan Woo", "player_strikeouts", "draftkings", 7.5, 250),
      row("Bryan Woo", "player_strikeouts", "draftkings", 11, 1600),
    ];
    const { selections } = selectK(rows);
    const woo = selections.get("bryan woo");
    expect(woo.point).toBe(5.5);
    expect(woo.over).toBe("-120");
    expect(woo.under).toBe("-110");
  });

  // Strikeout test 2 -- modal threshold across books, never an average.
  it("uses the modal threshold across books rather than averaging", () => {
    const rows = [
      row("Paul Skenes", "player_strikeouts", "draftkings", 5.5, -120, -110),
      row("Paul Skenes", "player_strikeouts", "fanduel", 5.5, -115, -115),
      row("Paul Skenes", "player_strikeouts", "betmgm", 5.5, -125, -105),
      row("Paul Skenes", "player_strikeouts", "caesars", 6.5, 140, -170),
    ];
    const { selections } = selectK(rows);
    expect(selections.get("paul skenes").point).toBe(5.5);
  });

  // Strikeout test 3 -- Over and Under must come from one threshold.
  it("never pairs an Over with an Under from a different threshold", () => {
    const rows = [
      row("Bryan Woo", "player_strikeouts", "draftkings", 5.5, -120, -110),
      row("Bryan Woo", "player_strikeouts", "draftkings", 6.5, 150, -190),
    ];
    const { selections, diagnostics } = selectK(rows);
    const woo = selections.get("bryan woo");
    expect(woo.point).toBe(5.5);
    expect(woo.over).toBe("-120");
    expect(woo.under).toBe("-110");

    const detail = diagnostics.find((entry) => entry.player === "bryan woo");
    for (const quote of [...detail.overQuotes, ...detail.underQuotes]) {
      expect(quote.price).not.toBe("+150");
      expect(quote.price).not.toBe("-190");
    }
  });

  // Strikeout tests 4 and 5 -- provider ordering must not change the result.
  it("is invariant to provider array order in every permutation", () => {
    const rows = [
      row("Bryan Woo", "player_strikeouts", "draftkings", 11, 1600),
      row("Bryan Woo", "player_strikeouts", "draftkings", 5.5, -120, -110),
      row("Bryan Woo", "player_strikeouts", "fanduel", 5.5, -118, -112),
      row("Bryan Woo", "player_strikeouts", "draftkings", 7.5, 250),
    ];
    const results = permutations(rows).map((ordering) => {
      const woo = selectK(ordering).selections.get("bryan woo");
      return `${woo.point}|${woo.over}|${woo.under}|${woo.bookmaker}`;
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("5.5|-120|-110|draftkings");
  });

  // Missing-side test.
  it("rejects a pitcher whose only offerings are one-sided ladder rungs", () => {
    const rows = [
      row("Casey Mize", "player_strikeouts", "draftkings", 6, 400),
      row("Casey Mize", "player_strikeouts", "draftkings", 8, 1060),
    ];
    const { selections, rejections } = selectK(rows);
    expect(selections.has("casey mize")).toBe(false);
    expect(rejections[0].rejected).toBe("requires_two_sided_market");
    expect(rejections[0].warnings).toContain("no_two_sided_market");
  });

  it("keeps a one-sided rung from replacing a two-sided line at another threshold", () => {
    const rows = [
      row("Reid Detmers", "player_strikeouts", "bovada", 9.5, 3300),
      row("Reid Detmers", "player_strikeouts", "draftkings", 4.5, 105, -135),
    ];
    const { selections } = selectK(rows);
    expect(selections.get("reid detmers").point).toBe(4.5);
  });

  it("excludes DFS pick'em sources from sourcing a strikeout line", () => {
    const rows = [
      row("Hunter Brown", "player_strikeouts", "underdog", 6.5, -120, -110),
      row("Hunter Brown", "player_strikeouts", "draftkings", 5.5, -119, -152),
    ];
    const { selections } = selectK(rows, { disallowedBooks: new Set(["underdog", "prizepicks", "sleeper"]) });
    const brown = selections.get("hunter brown");
    expect(brown.point).toBe(5.5);
    expect(brown.bookmaker).toBe("draftkings");
  });

  it("reports the books and prices behind the selected threshold", () => {
    const rows = [
      row("Paul Skenes", "player_strikeouts", "draftkings", 6.5, -120, -110),
      row("Paul Skenes", "player_strikeouts", "fanduel", 6.5, -115, -115),
      row("Paul Skenes", "player_strikeouts", "draftkings", 11, 990),
    ];
    const detail = selectK(rows).diagnostics.find((entry) => entry.player === "paul skenes");
    expect(detail.selectedPoint).toBe(6.5);
    expect(detail.booksAtPoint).toEqual(["draftkings", "fanduel"]);
    expect(detail.overQuotes).toEqual([
      { bookmaker: "draftkings", price: "-120" },
      { bookmaker: "fanduel", price: "-115" },
    ]);
    expect(detail.underQuotes).toHaveLength(2);
    expect(detail.reason).toBe("two_sided_consensus");
    expect(detail.pointsOffered).toEqual([
      { point: 6.5, books: 2, twoSidedBooks: 2 },
      { point: 11, books: 1, twoSidedBooks: 0 },
    ]);
  });
});

describe("home run primary line selection", () => {
  // HR test 1 -- the canonical "to hit a home run" market wins.
  it("selects the canonical HR market over 2+ and 3+ ladder rungs", () => {
    const rows = [
      row("Shohei Ohtani", "player_home_runs", "draftkings", 0.5, 310),
      row("Shohei Ohtani", "player_home_runs", "draftkings", 1, 1100),
      row("Shohei Ohtani", "player_home_runs", "draftkings", 2, 2100),
      row("Shohei Ohtani", "player_home_runs", "fanduel", 0.5, 320),
    ];
    const { selections } = selectHr(rows);
    const ohtani = selections.get("shohei ohtani");
    expect(ohtani.point).toBe(0.5);
    expect(ohtani.yesLikePrice ?? ohtani.over).toBe("+310");
  });

  // HR test 2 -- deterministic under every provider ordering.
  it("is invariant to provider array order in every permutation", () => {
    const rows = [
      row("Yordan Alvarez", "player_home_runs", "draftkings", 2, 2700),
      row("Yordan Alvarez", "player_home_runs", "draftkings", 0.5, 285),
      row("Yordan Alvarez", "player_home_runs", "betmgm", 0.5, 290),
      row("Yordan Alvarez", "player_home_runs", "draftkings", 1, 950),
    ];
    const results = permutations(rows).map((ordering) => {
      const alvarez = selectHr(ordering).selections.get("yordan alvarez");
      return `${alvarez.point}|${alvarez.over}|${alvarez.bookmaker}`;
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("0.5|+285|draftkings");
  });

  it("keeps one-sided HR markets, which are normal for this prop", () => {
    const rows = [
      row("Aaron Judge", "player_home_runs", "draftkings", 0.5, 260),
      row("Aaron Judge", "player_home_runs", "fanduel", 0.5, 255),
    ];
    const { selections } = selectHr(rows);
    expect(selections.get("aaron judge").point).toBe(0.5);
    expect(selections.get("aaron judge").under).toBeNull();
  });

  it("does not let a thinly offered high rung outvote the canonical market", () => {
    const rows = [
      row("Junior Caminero", "player_home_runs", "draftkings", 3, 10000),
      row("Junior Caminero", "player_home_runs", "draftkings", 0.5, 380),
    ];
    const { selections } = selectHr(rows);
    expect(selections.get("junior caminero").point).toBe(0.5);
  });
});

describe("provider-declared alternate metadata", () => {
  it("prefers a provider-declared primary market over a declared alternate", () => {
    const { quotes } = buildPropQuotes([
      { ...row("Bryan Woo", "player_strikeouts", "draftkings", 11, 1600), is_alternate: true },
      { ...row("Bryan Woo", "player_strikeouts", "draftkings", 5.5, -120, -110), is_alternate: false },
    ]);
    const { selections, diagnostics } = selectPrimaryLines(quotes, {
      bookRanking: K_BOOKS,
      requireTwoSided: true,
    });
    expect(selections.get("bryan woo").point).toBe(5.5);
    expect(diagnostics[0].reason).toBe("provider_primary_metadata");
  });

  it("retains the alternate flag on every quote instead of discarding it", () => {
    const { quotes } = buildPropQuotes([
      { ...row("Bryan Woo", "player_strikeouts", "draftkings", 11, 1600), is_alternate: true },
    ]);
    expect(quotes[0].isAlternate).toBe(true);
    expect(quotes[0].providerMarket).toBe("player_strikeouts");
    expect(quotes[0].canonicalMarket).toBe(K_MARKET);
  });
});

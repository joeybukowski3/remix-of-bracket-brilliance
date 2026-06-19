import { describe, expect, it } from "vitest";
import {
  buildDenseMarketRanks,
  calculateRankGap,
  getRankGapSignal,
  matchNflTeam,
  normalizeSuperBowlEvent,
  parseYesPrice,
  validateSuperBowlEvent,
  type PolymarketEvent,
} from "./superBowlMarkets";

const validEvent: PolymarketEvent = {
  id: "super-bowl-2027",
  title: "Super Bowl Winner 2027",
  slug: "super-bowl-winner-2027",
  active: true,
  closed: false,
  markets: [
    { id: "sea", question: "Will the Seattle Seahawks win Super Bowl LXI?", outcomes: "[\"Yes\",\"No\"]", outcomePrices: "[\"0.145\",\"0.855\"]" },
    { id: "lar", groupItemTitle: "Los Angeles Rams", outcomes: ["No", "Yes"], outcomePrices: ["0.86", "0.14"] },
    ...Array.from({ length: 26 }, (_, index) => ({
      id: `team-${index}`,
      question: [
        "Denver Broncos", "New England Patriots", "Buffalo Bills", "Green Bay Packers",
        "Houston Texans", "Jacksonville Jaguars", "Detroit Lions", "LA Chargers",
        "Indianapolis Colts", "Baltimore Ravens", "Philadelphia Eagles", "San Francisco 49ers",
        "Minnesota Vikings", "New Orleans Saints", "Chicago Bears", "Kansas City Chiefs",
        "Atlanta Falcons", "Pittsburgh Steelers", "Tampa Bay Buccaneers", "Dallas Cowboys",
        "NY Giants", "Cleveland Browns", "Arizona Cardinals", "Washington Commanders",
        "Miami Dolphins", "Cincinnati Bengals",
      ][index],
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.01", "0.99"],
    })),
  ],
};

describe("Super Bowl prediction-market normalization", () => {
  it("parses JSON-encoded outcomes and selects the Yes outcome by name", () => {
    expect(parseYesPrice("[\"No\",\"Yes\"]", "[\"0.8\",\"0.2\"]")).toBe(0.2);
  });

  it("rejects missing and malformed prices", () => {
    expect(parseYesPrice("[\"Yes\",\"No\"]", "[\"suspended\",\"0.5\"]")).toBeNull();
    expect(parseYesPrice("not json", "[\"0.2\",\"0.8\"]")).toBeNull();
    expect(parseYesPrice("[\"Yes\",\"No\"]", "[\"1.2\",\"-0.2\"]")).toBeNull();
  });

  it("matches NFL aliases to canonical power-rating teams", () => {
    expect(matchNflTeam("Will the Los Angeles Rams win?")?.abbr).toBe("lar");
    expect(matchNflTeam("Washington to win the Super Bowl")?.abbr).toBe("wsh");
    expect(matchNflTeam("49ers championship market")?.abbr).toBe("sf");
    expect(matchNflTeam("Raiders to win")?.abbr).toBe("lv");
  });

  it("creates dense market ranks and alphabetizes tied display rows", () => {
    const ranked = buildDenseMarketRanks([
      { team: "Zebra", price: 0.15 },
      { team: "Alpha", price: 0.15 },
      { team: "Bravo", price: 0.1 },
      { team: "No Price", price: null },
    ]);

    expect(ranked.map((team) => [team.team, team.marketRank])).toEqual([
      ["Alpha", 1],
      ["Zebra", 1],
      ["Bravo", 2],
      ["No Price", null],
    ]);
  });

  it("calculates rank gaps and classifies signals", () => {
    expect(calculateRankGap(11, 3)).toBe(8);
    expect(calculateRankGap(null, 3)).toBeNull();
    expect(getRankGapSignal(8)).toBe("Potential Value");
    expect(getRankGapSignal(2)).toBe("Model Higher");
    expect(getRankGapSignal(0)).toBe("Aligned");
    expect(getRankGapSignal(-3)).toBe("Market Higher");
    expect(getRankGapSignal(-8)).toBe("Large Market Premium");
    expect(getRankGapSignal(null)).toBe("No Market");
  });

  it("normalizes team markets without omitting missing canonical teams", () => {
    const normalized = normalizeSuperBowlEvent({
      ...validEvent,
      markets: validEvent.markets?.slice(0, 2),
    });
    expect(normalized.teams).toHaveLength(32);
    expect(normalized.teams.find((team) => team.abbr === "sea")?.price).toBe(0.145);
    expect(normalized.teams.find((team) => team.abbr === "ten")?.price).toBeNull();
  });

  it("prevents an unrelated event from passing Super Bowl validation", () => {
    expect(validateSuperBowlEvent({
      id: "gatorade",
      title: "Super Bowl Gatorade Shower Color",
      active: true,
      closed: false,
      markets: validEvent.markets,
    })).toContain("does not represent");

    expect(validateSuperBowlEvent({
      ...validEvent,
      markets: validEvent.markets?.slice(0, 2),
    })).toContain("enough recognizable");
  });
});

import { describe, expect, it } from "vitest";
import { computeTeamPercentiles, formatPercentile } from "@/lib/fantasy/teamPercentiles";

/** 32 teams, values 1..32 so expectations are easy to reason about. */
function leaguePopulation() {
  return Array.from({ length: 32 }, (_, index) => ({
    teamAbbr: `t${index + 1}`,
    value: index + 1,
  }));
}

describe("computeTeamPercentiles", () => {
  it("anchors the best team at 100 and the worst at 0", () => {
    const p = computeTeamPercentiles(leaguePopulation(), "higher-is-better");
    expect(p.get("t32")).toBe(100);
    expect(p.get("t1")).toBe(0);
  });

  it("puts the league middle near 50", () => {
    const p = computeTeamPercentiles(leaguePopulation(), "higher-is-better");
    // 16th and 17th of 32 straddle the midpoint.
    expect(p.get("t16")).toBeCloseTo(48.4, 1);
    expect(p.get("t17")).toBeCloseTo(51.6, 1);
  });

  it("inverts for a lower-is-better metric without touching the values", () => {
    const p = computeTeamPercentiles(leaguePopulation(), "lower-is-better");
    expect(p.get("t1")).toBe(100);
    expect(p.get("t32")).toBe(0);
    expect(p.get("t17")).toBeCloseTo(48.4, 1);
  });

  it("gives tied teams an identical percentile regardless of input order", () => {
    const population = [
      { teamAbbr: "a", value: 5 },
      { teamAbbr: "b", value: 1 },
      { teamAbbr: "c", value: 5 },
      { teamAbbr: "d", value: 3 },
    ];
    const p = computeTeamPercentiles(population, "higher-is-better");
    expect(p.get("a")).toBe(p.get("c"));
    // Two teams sit strictly below the tied pair: 2/3 of the field.
    expect(p.get("a")).toBeCloseTo(66.7, 1);
    expect(p.get("b")).toBe(0);

    const reversed = computeTeamPercentiles([...population].reverse(), "higher-is-better");
    for (const team of ["a", "b", "c", "d"]) {
      expect(reversed.get(team)).toBe(p.get(team));
    }
  });

  it("excludes missing teams from the population instead of scoring them zero", () => {
    const p = computeTeamPercentiles(
      [
        { teamAbbr: "a", value: 10 },
        { teamAbbr: "b", value: null },
        { teamAbbr: "c", value: 20 },
        { teamAbbr: "d", value: Number.NaN },
      ],
      "higher-is-better",
    );
    expect(p.has("b")).toBe(false);
    expect(p.has("d")).toBe(false);
    // Only a and c form the population, so they take the exact endpoints.
    expect(p.get("a")).toBe(0);
    expect(p.get("c")).toBe(100);
  });

  it("returns an empty map when no team has a value", () => {
    const p = computeTeamPercentiles(
      [
        { teamAbbr: "a", value: null },
        { teamAbbr: "b", value: null },
      ],
      "higher-is-better",
    );
    expect(p.size).toBe(0);
  });

  it("scores a lone team 50 rather than an arbitrary endpoint", () => {
    const p = computeTeamPercentiles([{ teamAbbr: "a", value: 4 }], "higher-is-better");
    expect(p.get("a")).toBe(50);
  });

  it("refuses to grade a context-only metric", () => {
    expect(computeTeamPercentiles(leaguePopulation(), "context-only").size).toBe(0);
  });
});

describe("formatPercentile", () => {
  it("rounds to a compact integer", () => {
    expect(formatPercentile(0)).toBe("0");
    expect(formatPercentile(48.387)).toBe("48");
    expect(formatPercentile(100)).toBe("100");
  });

  it("reports missing data rather than a number", () => {
    expect(formatPercentile(null)).toBe("N/A");
    expect(formatPercentile(undefined)).toBe("N/A");
    expect(formatPercentile(Number.NaN)).toBe("N/A");
  });
});

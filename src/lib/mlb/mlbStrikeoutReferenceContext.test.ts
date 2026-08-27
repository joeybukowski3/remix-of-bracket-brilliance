import { describe, expect, it } from "vitest";
import {
  buildLeagueReferenceContext,
  // @ts-expect-error -- plain JS module, no type declarations
} from "../../../scripts/lib/mlb-strikeout-reference-context.mjs";
import {
  approximateWrcPlusFromWoba,
  // @ts-expect-error -- plain JS module, no type declarations
} from "../../../scripts/lib/mlb-wrc-plus.mjs";

function pa(date: string, gamePk: string, strikeout: number, wobaValue: number, options: { hand?: "L" | "R"; site?: "home" | "away"; runs?: number } = {}) {
  return { date, gamePk, strikeout, wobaValue, wobaDenom: 1, pitcherHand: options.hand ?? "R", site: options.site ?? "home", runsScored: options.runs ?? 0 };
}

describe("MLB strikeout visual-reference context", () => {
  it("uses the repository's documented league-normalized wRC+ formula and fallback", () => {
    const expected = Math.round((((0.34 - 0.31) / 1.157) + 0.122) / 0.122 * 100);
    expect(approximateWrcPlusFromWoba(0.34, 0.31, 0.122)).toBe(expected);
    expect(approximateWrcPlusFromWoba(0.34, 0.31, null)).toBe(expected);
  });

  it("ranks higher wRC+/wOBA and higher opponent K% as 1st", () => {
    const rowsByTeam = new Map([
      ["AAA", [pa("2026-08-03", "1", 1, 0.7), pa("2026-08-02", "2", 1, 0.5)]],
      ["BBB", [pa("2026-08-03", "3", 0, 0.2), pa("2026-08-02", "4", 0, 0.1)]],
    ]);
    const context = buildLeagueReferenceContext(rowsByTeam, "2026-08-04", "R", { expectedTeamCount: 2 });
    expect(context.get("AAA")).toMatchObject({ opponentKRateRankL30: 1, opponentWrcPlusRankL30: 1 });
    expect(context.get("BBB")).toMatchObject({ opponentKRateRankL30: 2, opponentWrcPlusRankL30: 2 });
  });

  it("uses only rows before the historical game date and the 30-day window ending the prior day", () => {
    const rowsByTeam = new Map([
      ["AAA", [
        pa("2026-07-05", "1", 1, 0.4),
        pa("2026-08-04", "2", 0, 0),
        pa("2026-08-05", "3", 0, 0),
        pa("2026-07-04", "4", 0, 0),
      ]],
      ["BBB", [pa("2026-08-03", "5", 1, 0.3), pa("2026-08-02", "6", 0, 0.3)]],
    ]);
    const context = buildLeagueReferenceContext(rowsByTeam, "2026-08-04", "R", { expectedTeamCount: 2 });
    expect(context.get("AAA")).toMatchObject({ cutoffDate: "2026-08-04", opponentKRateRankL30: 1, opponentWrcPlusRankL30: 1 });
  });

  it("keeps handedness and home/away rankings separate", () => {
    const rowsByTeam = new Map([
      ["AAA", [pa("2026-08-03", "1", 1, 0.8, { hand: "L", site: "away" }), pa("2026-08-02", "2", 0, 0.1, { hand: "R", site: "home" })]],
      ["BBB", [pa("2026-08-03", "3", 0, 0.2, { hand: "L", site: "away" }), pa("2026-08-02", "4", 1, 0.7, { hand: "R", site: "home" })]],
    ]);
    const context = buildLeagueReferenceContext(rowsByTeam, "2026-08-04", "L", { expectedTeamCount: 2 });
    expect(context.get("AAA")).toMatchObject({ opponentKRateRankL30VsHand: 1, opponentWrcPlusRankL30VsHand: 1, opponentWrcPlusRankL30Home: 2, opponentWrcPlusRankL30Away: 1 });
    const rightHandedContext = buildLeagueReferenceContext(rowsByTeam, "2026-08-04", "R", { expectedTeamCount: 2 });
    expect(rightHandedContext.get("AAA")).toMatchObject({ opponentKRateRankL30VsHand: 2, opponentWrcPlusRankL30VsHand: 2 });
  });

  it("ranks the rounded repository wRC+ approximation rather than raw wOBA", () => {
    const rowsByTeam = new Map([
      ["AAA", [pa("2026-08-03", "1", 0, 0.3)]],
      ["BBB", [pa("2026-08-03", "2", 0, 0.300001)]],
    ]);
    const context = buildLeagueReferenceContext(rowsByTeam, "2026-08-04", "R", { expectedTeamCount: 2 });
    // Both values round to the same integer wRC+; deterministic alphabetical
    // tie-breaking proves the raw-wOBA ordering is not being used.
    expect(context.get("AAA")?.opponentWrcPlusRankL30).toBe(1);
    expect(context.get("BBB")?.opponentWrcPlusRankL30).toBe(2);
  });

  it("withholds league ranks when any expected MLB team lacks the comparison sample", () => {
    const rowsByTeam = new Map([
      ["AAA", [pa("2026-08-03", "1", 1, 0.4)]],
      ["BBB", [pa("2026-08-03", "2", 0, 0.3)]],
    ]);
    const context = buildLeagueReferenceContext(rowsByTeam, "2026-08-04", "R", { expectedTeamCount: 3 });
    expect(context.get("AAA")).toMatchObject({ opponentKRateRankL30: null, opponentWrcPlusRankL30: null });
    expect(context.get("BBB")).toMatchObject({ opponentKRateRankL30: null, opponentWrcPlusRankL30: null });
  });
});

import { describe, expect, it } from "vitest";
import { computeScheduleCoverage, detectPremiumGate } from "./scheduleCoverage.mjs";

const WEEK1_CANONICAL_IDS = new Set([
  "2026_01_NE_SEA",
  "2026_01_ARI_LAC",
  "2026_01_DAL_PHI",
  "2026_01_KC_LAC", // placeholder-style extra ids just to pad the set to 16
  "2026_01_BUF_NYJ",
  "2026_01_CIN_CLE",
  "2026_01_BAL_PIT",
  "2026_01_DEN_TEN",
  "2026_01_HOU_IND",
  "2026_01_JAX_MIA",
  "2026_01_MIN_CHI",
  "2026_01_ATL_CAR",
  "2026_01_NO_TB",
  "2026_01_GB_DET",
  "2026_01_LA_SF",
  "2026_01_NYG_WAS",
]);

describe("detectPremiumGate", () => {
  it("detects the known paywall marker", () => {
    expect(detectPremiumGate("<p>Premium members have access to the rest of these NFL picks</p>")).toBe(true);
  });

  it("returns false when the marker is absent", () => {
    expect(detectPremiumGate("<div>ordinary page content</div>")).toBe(false);
  });

  it("is defensive against non-string input", () => {
    expect(detectPremiumGate(null)).toBe(false);
    expect(detectPremiumGate(undefined)).toBe(false);
  });
});

describe("computeScheduleCoverage", () => {
  it("reports the documented 2026 Week 1 unauthenticated shape: 2/2 sources, 2 panels, 2 matched, 16 canonical, 14 not captured", () => {
    const coverage = computeScheduleCoverage({
      sourcePagesExpected: 2,
      windowResults: [
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_NE_SEA"], premiumGateDetected: true },
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_ARI_LAC"], premiumGateDetected: true },
      ],
      canonicalGameIds: WEEK1_CANONICAL_IDS,
    });

    expect(coverage.sourcePagesExpected).toBe(2);
    expect(coverage.sourcePagesFetched).toBe(2);
    expect(coverage.panelsDiscovered).toBe(2);
    expect(coverage.panelsParsed).toBe(2);
    expect(coverage.canonicalMatched).toBe(2);
    expect(coverage.canonicalWeekGameCount).toBe(16);
    expect(coverage.canonicalNotCaptured).toHaveLength(14);
    expect(coverage.unmatchedParsed).toEqual([]);
    expect(coverage.duplicateCanonicalMatches).toEqual([]);
    expect(coverage.accessScope).toBe("public-only");
    expect(coverage.premiumGateDetected).toBe(true);
  });

  it("does not treat premium-gated canonical games as parser failures", () => {
    const coverage = computeScheduleCoverage({
      sourcePagesExpected: 2,
      windowResults: [
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_NE_SEA"], premiumGateDetected: true },
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_ARI_LAC"], premiumGateDetected: true },
      ],
      canonicalGameIds: WEEK1_CANONICAL_IDS,
    });

    // The 14 uncaptured canonical games surface only as canonicalNotCaptured,
    // never as unmatchedParsed or duplicateCanonicalMatches -- those fields
    // are reserved for genuine parse/match problems.
    expect(coverage.unmatchedParsed).toEqual([]);
    expect(coverage.duplicateCanonicalMatches).toEqual([]);
    expect(coverage.panelsDiscovered).toBe(coverage.panelsParsed);
  });

  it("surfaces a parsed matchup that does not match any canonical schedule game as unmatchedParsed", () => {
    const coverage = computeScheduleCoverage({
      sourcePagesExpected: 2,
      windowResults: [
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_NE_SEA"], premiumGateDetected: true },
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_XX_YY"], premiumGateDetected: true },
      ],
      canonicalGameIds: WEEK1_CANONICAL_IDS,
    });

    expect(coverage.unmatchedParsed).toEqual(["2026_01_XX_YY"]);
    expect(coverage.canonicalMatched).toBe(1);
    expect(coverage.duplicateCanonicalMatches).toEqual([]);
  });

  it("surfaces two panels resolving to the same canonical gameId as duplicateCanonicalMatches", () => {
    const coverage = computeScheduleCoverage({
      sourcePagesExpected: 2,
      windowResults: [
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_NE_SEA"], premiumGateDetected: true },
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_NE_SEA"], premiumGateDetected: true },
      ],
      canonicalGameIds: WEEK1_CANONICAL_IDS,
    });

    expect(coverage.duplicateCanonicalMatches).toEqual(["2026_01_NE_SEA"]);
    expect(coverage.canonicalMatched).toBe(1);
    expect(coverage.panelsParsed).toBe(2);
  });

  it("counts a fetch failure without inflating panelsDiscovered/parsed", () => {
    const coverage = computeScheduleCoverage({
      sourcePagesExpected: 2,
      windowResults: [
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_NE_SEA"], premiumGateDetected: true },
        { fetched: false, panelsDiscovered: 0, parsedGameIds: [], premiumGateDetected: false },
      ],
      canonicalGameIds: WEEK1_CANONICAL_IDS,
    });

    expect(coverage.sourcePagesFetched).toBe(1);
    expect(coverage.sourcePagesExpected).toBe(2);
    expect(coverage.panelsDiscovered).toBe(1);
    expect(coverage.panelsParsed).toBe(1);
  });

  it("does not count a panel with an unresolved team (null gameId) as parsed", () => {
    const coverage = computeScheduleCoverage({
      sourcePagesExpected: 2,
      windowResults: [
        { fetched: true, panelsDiscovered: 1, parsedGameIds: ["2026_01_NE_SEA"], premiumGateDetected: true },
        { fetched: true, panelsDiscovered: 1, parsedGameIds: [null], premiumGateDetected: true },
      ],
      canonicalGameIds: WEEK1_CANONICAL_IDS,
    });

    expect(coverage.panelsDiscovered).toBe(2);
    expect(coverage.panelsParsed).toBe(1);
  });
});

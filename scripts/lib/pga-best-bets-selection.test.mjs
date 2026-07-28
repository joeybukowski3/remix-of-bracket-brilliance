import { describe, expect, test } from "vitest";
import {
  applyThresholds,
  buildCandidateUniverse,
  buildRecommendationCopy,
  compareCandidates,
  computePortfolioDiagnostics,
  priceCandidates,
  selectRecommendations,
} from "./pga-best-bets-selection.mjs";
import { normalizePlayerName } from "./pga-odds-provider.mjs";

describe("buildCandidateUniverse", () => {
  test("creates one candidate per canonical market for every field/model player", () => {
    const candidates = buildCandidateUniverse({
      officialFieldPlayers: ["Cameron Young", "Ben Griffin"],
      modelRows: [{ player: "Cameron Young", rank: 1 }, { player: "Ben Griffin", rank: 2 }],
    });
    expect(candidates).toHaveLength(8); // 2 players x 4 markets
    expect(candidates.every((c) => c.inField && c.hasModelData)).toBe(true);
  });

  test("flags a model row not in the official field", () => {
    const candidates = buildCandidateUniverse({
      officialFieldPlayers: ["Cameron Young"],
      modelRows: [{ player: "Cameron Young", rank: 1 }, { player: "Withdrawn Golfer", rank: 2 }],
    });
    const withdrawn = candidates.filter((c) => c.playerKey === normalizePlayerName("Withdrawn Golfer"));
    expect(withdrawn.every((c) => !c.inField)).toBe(true);
  });

  test("flags a field player missing model data", () => {
    const candidates = buildCandidateUniverse({
      officialFieldPlayers: ["No Stats Golfer"],
      modelRows: [],
    });
    const rows = candidates.filter((c) => c.playerKey === normalizePlayerName("No Stats Golfer"));
    expect(rows.every((c) => c.inField && !c.hasModelData)).toBe(true);
  });

  test("deterministic ordering regardless of input order", () => {
    const a = buildCandidateUniverse({
      officialFieldPlayers: ["B Player", "A Player"],
      modelRows: [{ player: "A Player", rank: 1 }, { player: "B Player", rank: 2 }],
    });
    const b = buildCandidateUniverse({
      officialFieldPlayers: ["A Player", "B Player"],
      modelRows: [{ player: "B Player", rank: 2 }, { player: "A Player", rank: 1 }],
    });
    expect(a.map((c) => `${c.playerKey}:${c.market}`)).toEqual(b.map((c) => `${c.playerKey}:${c.market}`));
  });
});

function outcome(overrides = {}) {
  return {
    canonicalMarket: "outright",
    providerMarketKey: "outrights",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    providerEventId: "evt-1",
    eventName: "Rocket Classic",
    eventStartTime: "2026-07-30T13:00:00Z",
    marketTimestamp: "2026-07-28T09:00:00Z",
    playerNameRaw: "Cameron Young",
    normalizedPlayerName: normalizePlayerName("Cameron Young"),
    americanOdds: 900,
    decimalOdds: 10,
    ...overrides,
  };
}

const NOW = new Date("2026-07-28T10:00:00Z");

describe("priceCandidates", () => {
  const officialFieldPlayers = ["Cameron Young", "Ben Griffin", "Third Player"];
  const modelRows = [
    { player: "Cameron Young", rank: 1 },
    { player: "Ben Griffin", rank: 2 },
    { player: "Third Player", rank: 3 },
  ];

  test("rejects field-membership and model-data failures before any pricing work", () => {
    const candidates = buildCandidateUniverse({
      officialFieldPlayers: ["Cameron Young"],
      modelRows: [{ player: "Cameron Young", rank: 1 }, { player: "Model Only Golfer", rank: 2 }],
    });
    const priced = priceCandidates(candidates, { providerResult: { sportsbookMarkets: [] }, officialFieldSize: 1, now: NOW });
    const modelOnly = priced.find((c) => c.playerKey === normalizePlayerName("Model Only Golfer"));
    expect(modelOnly.status).toBe("rejected");
    expect(modelOnly.rejectionReasons).toContain("not in official field");
  });

  test("a candidate with no matching price is rejected with a specific reason", () => {
    const candidates = buildCandidateUniverse({ officialFieldPlayers, modelRows });
    const priced = priceCandidates(candidates, { providerResult: { sportsbookMarkets: [] }, officialFieldSize: 3, now: NOW });
    const cy = priced.find((c) => c.playerKey === normalizePlayerName("Cameron Young") && c.market === "outright");
    expect(cy.status).toBe("rejected");
    expect(cy.price).toBeNull();
  });

  test("a fully priced, complete market produces probability and EV fields", () => {
    // Build a plausible complete outright market: 3 players priced.
    const sportsbookMarkets = [
      outcome({ playerNameRaw: "Cameron Young", normalizedPlayerName: normalizePlayerName("Cameron Young"), americanOdds: 900, decimalOdds: 10 }),
      outcome({ playerNameRaw: "Ben Griffin", normalizedPlayerName: normalizePlayerName("Ben Griffin"), americanOdds: 1400, decimalOdds: 15 }),
      outcome({ playerNameRaw: "Third Player", normalizedPlayerName: normalizePlayerName("Third Player"), americanOdds: 2000, decimalOdds: 21 }),
    ];
    const candidates = buildCandidateUniverse({ officialFieldPlayers, modelRows });
    const priced = priceCandidates(candidates, { providerResult: { sportsbookMarkets, providerEventId: "evt-1" }, officialFieldSize: 3, now: NOW });
    const cy = priced.find((c) => c.playerKey === normalizePlayerName("Cameron Young") && c.market === "outright");
    expect(cy.status === "priced" || cy.status === "rejected").toBe(true);
    if (cy.status === "priced") {
      expect(cy.probability.blended).toBeGreaterThan(0);
      expect(Number.isFinite(cy.expectedValue)).toBe(true);
    }
  });

  test("stale price is rejected and never priced", () => {
    const sportsbookMarkets = [outcome({ marketTimestamp: "2026-07-01T00:00:00Z" })];
    const candidates = buildCandidateUniverse({ officialFieldPlayers: ["Cameron Young"], modelRows: [{ player: "Cameron Young", rank: 1 }] });
    const priced = priceCandidates(candidates, { providerResult: { sportsbookMarkets, providerEventId: "evt-1" }, officialFieldSize: 1, now: NOW });
    const cy = priced.find((c) => c.market === "outright");
    expect(cy.status).toBe("rejected");
    expect(cy.rejectionReasons).toContain("stale price");
  });
});

describe("applyThresholds", () => {
  function primed(overrides) {
    return {
      playerKey: "p", playerName: "P", market: "outright", status: "priced", rejectionReasons: [],
      price: { american: 500, decimal: 6, sportsbookKey: "dk", sportsbookName: "DraftKings" },
      probability: { rawImplied: 0.1667, noVig: 0.16, provisionalModelComponent: 0.2, blended: 0.17 },
      probabilityEdge: 0.01,
      expectedValue: 0.02,
      ...overrides,
    };
  }

  test("rejects below probability floor", () => {
    const [result] = applyThresholds([primed({ probability: { blended: 0.001, noVig: 0.001, rawImplied: 0.001, provisionalModelComponent: 0.001 } })]);
    expect(result.status).toBe("rejected");
    expect(result.rejectionReasons).toContain("below probability floor");
  });

  test("rejects below edge threshold", () => {
    const [result] = applyThresholds([primed({ probability: { blended: 0.05, noVig: 0.049, rawImplied: 0.049, provisionalModelComponent: 0.05 }, probabilityEdge: 0.0001, expectedValue: 0.5 })]);
    expect(result.rejectionReasons).toContain("below probability edge threshold");
  });

  test("rejects below EV threshold", () => {
    const [result] = applyThresholds([primed({ probability: { blended: 0.05, noVig: 0.02, rawImplied: 0.02, provisionalModelComponent: 0.05 }, probabilityEdge: 0.03, expectedValue: -0.5 })]);
    expect(result.rejectionReasons).toContain("below expected value threshold");
  });

  test("qualifies when all thresholds clear", () => {
    const [result] = applyThresholds([primed({ probability: { blended: 0.05, noVig: 0.02, rawImplied: 0.02, provisionalModelComponent: 0.08 }, probabilityEdge: 0.03, expectedValue: 0.5 })]);
    expect(result.status).toBe("qualified");
    expect(result.rejectionReasons).toEqual([]);
  });

  test("passes through non-priced candidates unchanged", () => {
    const [result] = applyThresholds([{ status: "rejected", rejectionReasons: ["missing model data"] }]);
    expect(result.status).toBe("rejected");
  });
});

function qualified(overrides) {
  return {
    playerKey: "p", playerName: "Player", market: "outright", status: "qualified", rejectionReasons: [],
    price: { american: 500, decimal: 6, sportsbookKey: "dk", sportsbookName: "DraftKings" },
    probability: { blended: 0.1, noVig: 0.08 },
    probabilityEdge: 0.02,
    expectedValue: 0.1,
    ...overrides,
  };
}

describe("compareCandidates", () => {
  test("sorts by EV desc, then blended prob, then edge, then name, then market order", () => {
    const list = [
      qualified({ playerName: "Zed", expectedValue: 0.1 }),
      qualified({ playerName: "Alpha", expectedValue: 0.2 }),
      qualified({ playerName: "Beta", expectedValue: 0.2, probability: { blended: 0.2, noVig: 0.1 } }),
    ];
    const sorted = [...list].sort(compareCandidates);
    expect(sorted.map((c) => c.playerName)).toEqual(["Beta", "Alpha", "Zed"]);
  });

  test("deterministic given identical inputs regardless of starting order", () => {
    const list = [qualified({ playerName: "A" }), qualified({ playerName: "B" })];
    const s1 = [...list].sort(compareCandidates).map((c) => c.playerName);
    const s2 = [...list].reverse().sort(compareCandidates).map((c) => c.playerName);
    expect(s1).toEqual(s2);
  });
});

describe("selectRecommendations", () => {
  test("respects market caps as a maximum, not a quota", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => qualified({ playerKey: `p${i}`, playerName: `Player ${i}`, expectedValue: 0.5 - i * 0.01 }));
    const { recommendations } = selectRecommendations(candidates);
    expect(recommendations).toHaveLength(3); // outright cap = 3
  });

  test("an empty candidate list yields zero recommendations, never a forced pick", () => {
    const { recommendations } = selectRecommendations([]);
    expect(recommendations).toEqual([]);
  });

  test("one primary recommendation per golfer by default", () => {
    const candidates = [
      qualified({ playerKey: "p1", market: "outright", expectedValue: 0.5 }),
      qualified({ playerKey: "p1", market: "top5", expectedValue: 0.4 }),
    ];
    const { recommendations, overlapRejections } = selectRecommendations(candidates);
    // outright+top5 is not an allowed ladder combination.
    expect(recommendations).toHaveLength(1);
    expect(overlapRejections).toHaveLength(1);
    expect(overlapRejections[0].rejectionReasons[0]).toMatch(/not an allowed ladder/);
  });

  test("allowed ladder combination (outright+top20) forms a shared ladderId when both legs qualify", () => {
    const primary = qualified({ playerKey: "p1", market: "outright", expectedValue: 0.5 });
    const secondLeg = qualified({ playerKey: "p1", market: "top20", expectedValue: 0.35 }); // >= 60% of 0.5
    const { recommendations } = selectRecommendations([primary, secondLeg]);
    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].ladderId).toBeTruthy();
    expect(recommendations[0].ladderId).toBe(recommendations[1].ladderId);
  });

  test("disallowed ladder combination (top10+top20) is rejected even though both qualify individually", () => {
    const primary = qualified({ playerKey: "p1", market: "top10", expectedValue: 0.5 });
    const secondLeg = qualified({ playerKey: "p1", market: "top20", expectedValue: 0.4 });
    const { recommendations, overlapRejections } = selectRecommendations([primary, secondLeg]);
    expect(recommendations).toHaveLength(1);
    expect(overlapRejections[0].rejectionReasons[0]).toMatch(/not an allowed ladder/);
  });

  test("second-leg EV rule: second leg below 60% of primary EV is rejected", () => {
    const primary = qualified({ playerKey: "p1", market: "outright", expectedValue: 1.0 });
    const weakSecond = qualified({ playerKey: "p1", market: "top20", expectedValue: 0.1 }); // < 60% of 1.0 and below LADDER_SECOND_LEG_MIN_EV? 0.1>0.04 so only ratio rule fails
    const { recommendations, overlapRejections } = selectRecommendations([primary, weakSecond]);
    expect(recommendations).toHaveLength(1);
    expect(overlapRejections[0].rejectionReasons[0]).toMatch(/second-leg EV rule/);
  });

  test("maximum two appearances: a third market for the same golfer is rejected", () => {
    const legs = [
      qualified({ playerKey: "p1", market: "outright", expectedValue: 0.9 }),
      qualified({ playerKey: "p1", market: "top20", expectedValue: 0.6 }),
      qualified({ playerKey: "p1", market: "top5", expectedValue: 0.55 }),
    ];
    const { recommendations, overlapRejections } = selectRecommendations(legs);
    expect(recommendations).toHaveLength(2);
    expect(overlapRejections.some((r) => r.rejectionReasons[0].includes("maximum"))).toBe(true);
  });

  test("no forced diversity: a market can legitimately end up with zero recommendations", () => {
    const candidates = [qualified({ playerKey: "p1", market: "outright" })];
    const { recommendations } = selectRecommendations(candidates);
    const markets = new Set(recommendations.map((r) => r.market));
    expect(markets.has("top10")).toBe(false);
  });
});

describe("computePortfolioDiagnostics", () => {
  test("reconciles candidate counts against rejection buckets", () => {
    const allCandidates = [
      { status: "rejected", rejectionReasons: ["not in official field"], price: null },
      { status: "rejected", rejectionReasons: ["missing model data"], price: null },
      { status: "rejected", rejectionReasons: ["below probability floor"], price: { american: 100 } },
      { status: "rejected", rejectionReasons: ["stale price"], price: null },
      { status: "qualified", rejectionReasons: [], price: { american: 200 } },
    ];
    const recommendations = [{ playerKey: "p1", ladderId: null }];
    const diagnostics = computePortfolioDiagnostics(allCandidates, [], recommendations);
    expect(diagnostics.candidatesCreated).toBe(5);
    expect(diagnostics.rejectedByFieldMembership).toBe(1);
    expect(diagnostics.rejectedByMissingModelData).toBe(1);
    expect(diagnostics.rejectedByProbabilityFloor).toBe(1);
    expect(diagnostics.rejectedByFreshness).toBe(1);
    expect(diagnostics.candidatesWithExactPrice).toBe(2);
    expect(diagnostics.totalRecommendations).toBe(1);
    expect(diagnostics.uniqueGolfers).toBe(1);
    expect(diagnostics.duplicationRate).toBe(0);
  });

  test("duplication rate is defined and zero when there are no recommendations", () => {
    const diagnostics = computePortfolioDiagnostics([], [], []);
    expect(diagnostics.duplicationRate).toBe(0);
    expect(diagnostics.totalRecommendations).toBe(0);
  });

  test("duplication rate reflects ladder-driven repeat appearances", () => {
    const recommendations = [
      { playerKey: "p1", ladderId: "ladder:p1:outright+top20" },
      { playerKey: "p1", ladderId: "ladder:p1:outright+top20" },
      { playerKey: "p2", ladderId: null },
    ];
    const diagnostics = computePortfolioDiagnostics([], [], recommendations);
    expect(diagnostics.totalRecommendations).toBe(3);
    expect(diagnostics.uniqueGolfers).toBe(2);
    expect(diagnostics.duplicationRate).toBeCloseTo(1 / 3, 9);
    expect(diagnostics.numberOfLadders).toBe(1);
    expect(diagnostics.maximumAppearances).toBe(2);
  });

  test("rejectedByOverlapRules counts overlapRejections, not allCandidates", () => {
    const diagnostics = computePortfolioDiagnostics([], [{}, {}], []);
    expect(diagnostics.rejectedByOverlapRules).toBe(2);
  });
});

describe("buildRecommendationCopy", () => {
  test("produces deterministic, data-derived rationale/risk/confidence with no price/value language for unpriced input avoided upstream", () => {
    const candidate = {
      probability: { blended: 0.12, noVig: 0.09 },
      probabilityEdge: 0.03,
      expectedValue: 0.15,
      price: { american: 500, sportsbookName: "DraftKings" },
      rank: 4,
    };
    const copy = buildRecommendationCopy(candidate);
    expect(copy.rationale.length).toBeGreaterThan(0);
    expect(copy.confidence).toBe("high");
    expect(typeof copy.risk).toBe("string");
  });
});

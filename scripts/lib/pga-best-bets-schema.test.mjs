import { describe, expect, test } from "vitest";
import {
  assertFiniteAndSerializable,
  buildLaddersArray,
  buildModelLeans,
  buildRecommendationEntry,
  buildUnavailableArtifact,
  buildV3Artifact,
  containsForbiddenLeanLanguage,
  deriveV2Compatibility,
  deriveV2CompatibilityFromLeans,
  sanitizeModelLeansArticle,
  sanitizeModelLeansPreview,
  sanitizeModelLeansText,
  validatePortfolioDiagnostics,
  validateV3Artifact,
} from "./pga-best-bets-schema.mjs";

function candidate(overrides = {}) {
  return {
    playerKey: "cameron young", playerName: "Cameron Young", market: "outright",
    rank: 1, powerRank: 2, ladderId: null,
    price: { american: 900, decimal: 10, sportsbookName: "DraftKings", sportsbookKey: "draftkings", fetchedAt: "2026-07-28T09:00:00Z", eventId: "evt-1" },
    probability: { blended: 0.12, rawImplied: 0.1, noVig: 0.095, provisionalModelComponent: 0.18 },
    probabilityEdge: 0.025,
    expectedValue: 0.2,
    ...overrides,
  };
}

const copy = { rationale: ["Blended probability 12.0% vs. no-vig 9.5%."], risk: "Provisional model edge; no historical calibration.", confidence: "moderate" };

describe("buildRecommendationEntry", () => {
  test("maps candidate + copy fields into the V3 recommendation shape", () => {
    const entry = buildRecommendationEntry(candidate(), copy);
    expect(entry.player).toBe("Cameron Young");
    expect(entry.market).toBe("outright");
    expect(entry.odds.sportsbook).toBe("DraftKings");
    expect(entry.probability.model).toBe(0.12);
    expect(entry.probabilityEdge).toBe(0.025);
    expect(entry.confidence).toBe("moderate");
  });
});

describe("buildLaddersArray", () => {
  test("groups recommendations sharing a ladderId into one ladder entry", () => {
    const recs = [
      buildRecommendationEntry(candidate({ ladderId: "ladder:cy:outright+top20" }), copy),
      buildRecommendationEntry(candidate({ market: "top20", ladderId: "ladder:cy:outright+top20" }), copy),
    ];
    const ladders = buildLaddersArray(recs);
    expect(ladders).toHaveLength(1);
    expect(ladders[0].legs.sort()).toEqual(["outright", "top20"]);
  });

  test("no ladder entries when nothing carries a ladderId", () => {
    expect(buildLaddersArray([buildRecommendationEntry(candidate(), copy)])).toEqual([]);
  });
});

describe("deriveV2Compatibility", () => {
  test("every entry has real topStats/bullets arrays so the legacy page cannot crash", () => {
    const recs = [buildRecommendationEntry(candidate(), copy)];
    const sections = deriveV2Compatibility(recs);
    expect(Array.isArray(sections.outrights[0].topStats)).toBe(true);
    expect(Array.isArray(sections.outrights[0].bullets)).toBe(true);
    expect(sections.top5).toEqual([]);
  });

  test("combines multi-market odds for a golfer with two ladder legs into one odds object", () => {
    const recs = [
      buildRecommendationEntry(candidate({ ladderId: "L" }), copy),
      buildRecommendationEntry(candidate({ market: "top20", price: { ...candidate().price, american: 250 }, ladderId: "L" }), copy),
    ];
    const sections = deriveV2Compatibility(recs);
    expect(sections.outrights[0].odds.outright).toBe("+900");
    expect(sections.top20[0].odds.top20).toBe("+250");
    // Both entries share the same combined odds object.
    expect(sections.outrights[0].odds.top20).toBe("+250");
  });
});

describe("deriveV2CompatibilityFromLeans", () => {
  test("lean-derived entries carry no odds and are flagged isModelLeanOnly", () => {
    const leans = buildModelLeans([{ player: "A", playerKey: "a", rank: 1, powerRank: 1, provisionalModelProbability: { outright: 0.1, top5: 0.3, top10: 0.5, top20: 0.7 } }]);
    const sections = deriveV2CompatibilityFromLeans(leans);
    expect(sections.outrights[0].odds).toBeNull();
    expect(sections.outrights[0].isModelLeanOnly).toBe(true);
  });
});

describe("containsForbiddenLeanLanguage", () => {
  test("flags price/value/odds language", () => {
    expect(containsForbiddenLeanLanguage("This price looks like value")).toBe(true);
    expect(containsForbiddenLeanLanguage("Strong course fit based on approach play")).toBe(false);
  });

  test("flags every specifically required blocked term/phrase", () => {
    const blocked = [
      "The odds favor him this week.",
      "Priced through DraftKings and FanDuel.",
      "Available at most sportsbooks.",
      "This looks like market value at the number.",
      "The price is generous here.",
      "A classic overlay situation.",
      "The market has this mispriced.",
      "Mispricing is evident in this line.",
      "Strong expected value on this pick.",
      "The EV here is clearly positive.",
      "There's an edge at the number.",
    ];
    for (const text of blocked) expect(containsForbiddenLeanLanguage(text)).toBe(true);
  });

  test("does not flag ordinary golf analysis prose", () => {
    expect(containsForbiddenLeanLanguage("Strong approach play and a favorable course fit this week.")).toBe(false);
    expect(containsForbiddenLeanLanguage("He is even par through two rounds.")).toBe(false);
  });
});

describe("sanitizeModelLeansText", () => {
  test("passes through clean text untouched", () => {
    const text = "Strong approach play supports this player's course fit.";
    expect(sanitizeModelLeansText(text)).toBe(text);
  });

  test("strips only the offending sentence, keeping the rest", () => {
    const text = "Strong course fit here. The price looks like great value. Recent form is solid.";
    const result = sanitizeModelLeansText(text);
    expect(result).not.toMatch(/price|value/i);
    expect(result).toContain("Strong course fit here.");
    expect(result).toContain("Recent form is solid.");
  });

  test("substitutes a factual fallback when every sentence is offending", () => {
    const result = sanitizeModelLeansText("The odds show great value. This is a clear overlay.");
    expect(containsForbiddenLeanLanguage(result)).toBe(false);
    expect(result.length).toBeGreaterThan(0);
  });

  test("passes through non-string/empty input unchanged", () => {
    expect(sanitizeModelLeansText(null)).toBeNull();
    expect(sanitizeModelLeansText(undefined)).toBeUndefined();
    expect(sanitizeModelLeansText("")).toBe("");
  });
});

describe("sanitizeModelLeansPreview", () => {
  test("sanitizes all three preview fields", () => {
    const preview = {
      tournamentOverview: "A great course. The odds here are generous.",
      modelExplainer: "SG Approach carries the most weight this week.",
      pickApproach: "This is priced as clear value against the field.",
    };
    const result = sanitizeModelLeansPreview(preview);
    expect(containsForbiddenLeanLanguage(result.tournamentOverview)).toBe(false);
    expect(result.modelExplainer).toBe(preview.modelExplainer);
    expect(containsForbiddenLeanLanguage(result.pickApproach)).toBe(false);
  });

  test("passes through null preview unchanged", () => {
    expect(sanitizeModelLeansPreview(null)).toBeNull();
  });
});

describe("sanitizeModelLeansArticle", () => {
  function article(overrides = {}) {
    return {
      title: "Weekly Model Context",
      dek: "A look at this week's field.",
      introduction: "Solid course fit across the board.",
      conclusion: "Strong model context this week.",
      sections: [{ heading: "Overview", body: "Good approach numbers." }],
      keyTakeaways: [{ text: "Strong course fit.", players: ["A"] }],
      playersToApproachCautiously: [{ player: "B", reason: "Limited recent form." }],
      ...overrides,
    };
  }

  test("leaves clean prose fully intact", () => {
    const clean = article();
    expect(sanitizeModelLeansArticle(clean)).toEqual(clean);
  });

  test("sanitizes introduction, conclusion, and dek", () => {
    const result = sanitizeModelLeansArticle(article({
      dek: "This week's board offers real value.",
      introduction: "The odds are generous across the field.",
      conclusion: "A clear overlay on the top play.",
    }));
    expect(containsForbiddenLeanLanguage(result.dek)).toBe(false);
    expect(containsForbiddenLeanLanguage(result.introduction)).toBe(false);
    expect(containsForbiddenLeanLanguage(result.conclusion)).toBe(false);
  });

  test("relabels an offending section heading and sanitizes its body", () => {
    const result = sanitizeModelLeansArticle(article({
      sections: [{ heading: "Best Value Play", body: "This price looks mispriced relative to the field." }],
    }));
    expect(containsForbiddenLeanLanguage(result.sections[0].heading)).toBe(false);
    expect(containsForbiddenLeanLanguage(result.sections[0].body)).toBe(false);
  });

  test("drops an offending keyTakeaway entirely rather than rewriting it", () => {
    const result = sanitizeModelLeansArticle(article({
      keyTakeaways: [
        { text: "Strong course fit.", players: ["A"] },
        { text: "Clear value at this price.", players: ["A"] },
      ],
    }));
    expect(result.keyTakeaways).toEqual([{ text: "Strong course fit.", players: ["A"] }]);
  });

  test("drops an offending caution entry entirely rather than rewriting it", () => {
    const result = sanitizeModelLeansArticle(article({
      playersToApproachCautiously: [
        { player: "B", reason: "Limited recent form." },
        { player: "C", reason: "The odds imply real risk here." },
      ],
    }));
    expect(result.playersToApproachCautiously).toEqual([{ player: "B", reason: "Limited recent form." }]);
  });

  test("passes through null article unchanged", () => {
    expect(sanitizeModelLeansArticle(null)).toBeNull();
  });
});

describe("buildModelLeans", () => {
  function row(player, probs, rank = 1) {
    return { player, playerKey: player.toLowerCase(), rank, powerRank: rank, provisionalModelProbability: probs };
  }

  test("caps total leans and per-market leans per MODEL_LEANS_CAPS", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(`Player ${i}`, { outright: 0.5 - i * 0.01, top5: 0.5 - i * 0.01, top10: 0.5 - i * 0.01, top20: 0.5 - i * 0.01 }, i + 1));
    const leans = buildModelLeans(rows);
    expect(leans.length).toBeLessThanOrEqual(10);
    const byMarket = { outright: 0, top5: 0, top10: 0, top20: 0 };
    for (const lean of leans) byMarket[lean.marketContext] += 1;
    expect(byMarket.outright).toBeLessThanOrEqual(2);
    expect(byMarket.top5).toBeLessThanOrEqual(2);
    expect(byMarket.top10).toBeLessThanOrEqual(3);
    expect(byMarket.top20).toBeLessThanOrEqual(3);
  });

  test("leans never include EV, odds, sportsbook, or value claims", () => {
    const rows = [row("Solo Golfer", { outright: 0.2, top5: 0.4, top10: 0.6, top20: 0.8 })];
    const leans = buildModelLeans(rows);
    for (const lean of leans) {
      expect(lean).not.toHaveProperty("expectedValue");
      expect(lean).not.toHaveProperty("odds");
      expect(lean).not.toHaveProperty("probabilityEdge");
      expect(containsForbiddenLeanLanguage(lean.note)).toBe(false);
    }
  });

  test("deterministic ordering by probability descending, name ascending on ties", () => {
    const rows = [
      row("Zed", { outright: 0.3, top5: 0.3, top10: 0.3, top20: 0.3 }),
      row("Alpha", { outright: 0.3, top5: 0.3, top10: 0.3, top20: 0.3 }),
    ];
    const leans = buildModelLeans(rows);
    const outrightLeans = leans.filter((l) => l.marketContext === "outright");
    expect(outrightLeans[0].player).toBe("Alpha");
  });
});

describe("buildV3Artifact / buildUnavailableArtifact", () => {
  const baseArgs = {
    tournament: "Rocket Classic", generatedAt: "2026-07-28T10:00:00Z",
    sourceStatus: { model: "available", grok: "available", odds: "available", article: "available" },
    oddsDiagnostics: { providerKey: "the-odds-api" },
    portfolioDiagnostics: { totalRecommendations: 1, uniqueGolfers: 1, duplicationRate: 0, maximumAppearances: 1, numberOfLadders: 0, oddsCoverage: 1, staleOddsCount: 0, candidatesCreated: 4, candidatesWithExactPrice: 1, rejectedByProbabilityFloor: 0, rejectedByProbabilityEdge: 0, rejectedByExpectedValue: 0, rejectedByFreshness: 0, rejectedByFieldMembership: 0, rejectedByMissingModelData: 0, rejectedByOverlapRules: 0 },
  };

  test("official-best-bets artifact validates and carries derived V2 arrays", () => {
    const recommendations = [buildRecommendationEntry(candidate(), copy)];
    const artifact = buildV3Artifact({ ...baseArgs, status: "official-best-bets", recommendations });
    const { valid, errors } = validateV3Artifact(artifact);
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
    expect(artifact.outrights).toHaveLength(1);
    expect(artifact.schemaVersion).toBe(3);
  });

  test("model-leans-only artifact has empty recommendations/ladders and populated leans", () => {
    const leans = buildModelLeans([{ player: "A", playerKey: "a", rank: 1, powerRank: 1, provisionalModelProbability: { outright: 0.1, top5: 0.3, top10: 0.5, top20: 0.7 } }]);
    const artifact = buildV3Artifact({ ...baseArgs, status: "model-leans-only", recommendations: [], modelLeans: leans, reason: "verified market prices unavailable" });
    const { valid } = validateV3Artifact(artifact);
    expect(valid).toBe(true);
    expect(artifact.recommendations).toEqual([]);
    expect(artifact.ladders).toEqual([]);
    expect(artifact.modelLeans.length).toBeGreaterThan(0);
  });

  test("unavailable artifact has empty recommendations/ladders/leans and V2 arrays", () => {
    const artifact = buildUnavailableArtifact({ tournament: "Rocket Classic", generatedAt: "2026-07-28T10:00:00Z", reason: "no verified odds provider match" });
    const { valid } = validateV3Artifact(artifact);
    expect(valid).toBe(true);
    expect(artifact.status).toBe("unavailable");
    expect(artifact.recommendations).toEqual([]);
    expect(artifact.modelLeans).toEqual([]);
    expect(artifact.outrights).toEqual([]);
  });

  test("rejects an official-best-bets artifact with zero recommendations", () => {
    const artifact = buildV3Artifact({ ...baseArgs, status: "official-best-bets", recommendations: [] });
    const { valid, errors } = validateV3Artifact(artifact);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("at least one recommendation"))).toBe(true);
  });

  test("throws when constructing a non-terminal status via buildV3Artifact", () => {
    expect(() => buildV3Artifact({ ...baseArgs, status: "unavailable" })).toThrow();
  });

  test("rejects a model-leans-only artifact that smuggles priced recommendations", () => {
    const recommendations = [buildRecommendationEntry(candidate(), copy)];
    const artifact = buildV3Artifact({ ...baseArgs, status: "model-leans-only", recommendations });
    const { valid, errors } = validateV3Artifact(artifact);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("must not carry priced recommendations"))).toBe(true);
  });

  test("rejects a model-leans-only artifact whose preview/article prose contains unsanitized price/value language", () => {
    const leans = buildModelLeans([{ player: "A", playerKey: "a", rank: 1, powerRank: 1, provisionalModelProbability: { outright: 0.1, top5: 0.3, top10: 0.5, top20: 0.7 } }]);
    const artifact = buildV3Artifact({ ...baseArgs, status: "model-leans-only", recommendations: [], modelLeans: leans });
    artifact.preview = { tournamentOverview: "Great course.", modelExplainer: "Fine.", pickApproach: "This looks like real value at the number." };
    artifact.article = {
      title: "T", introduction: "Solid field.", conclusion: "Strong context.",
      sections: [{ heading: "Overview", body: "The odds here are generous." }],
      keyTakeaways: [], playersToApproachCautiously: [],
    };
    const { valid, errors } = validateV3Artifact(artifact);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("preview.pickApproach"))).toBe(true);
    expect(errors.some((e) => e.includes("article section"))).toBe(true);
  });

  test("accepts a model-leans-only artifact whose prose has already been sanitized", () => {
    const leans = buildModelLeans([{ player: "A", playerKey: "a", rank: 1, powerRank: 1, provisionalModelProbability: { outright: 0.1, top5: 0.3, top10: 0.5, top20: 0.7 } }]);
    const artifact = buildV3Artifact({ ...baseArgs, status: "model-leans-only", recommendations: [], modelLeans: leans });
    artifact.preview = sanitizeModelLeansPreview({ tournamentOverview: "Great course.", modelExplainer: "Fine.", pickApproach: "This looks like real value at the number." });
    artifact.article = sanitizeModelLeansArticle({
      title: "T", introduction: "Solid field.", conclusion: "Strong context.",
      sections: [{ heading: "Overview", body: "The odds here are generous." }],
      keyTakeaways: [], playersToApproachCautiously: [],
    });
    const { valid, errors } = validateV3Artifact(artifact);
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  test("every emitted value is JSON-serializable and finite", () => {
    const recommendations = [buildRecommendationEntry(candidate(), copy)];
    const artifact = buildV3Artifact({ ...baseArgs, status: "official-best-bets", recommendations });
    expect(() => assertFiniteAndSerializable(artifact)).not.toThrow();
    expect(() => JSON.parse(JSON.stringify(artifact))).not.toThrow();
  });

  test("rejects an artifact containing NaN/Infinity", () => {
    const recommendations = [{ ...buildRecommendationEntry(candidate(), copy), expectedValue: NaN }];
    const artifact = buildV3Artifact({ ...baseArgs, status: "official-best-bets", recommendations });
    const { valid, errors } = validateV3Artifact(artifact);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("Non-finite"))).toBe(true);
  });

  test("deterministic artifact output for identical input", () => {
    const recommendations = [buildRecommendationEntry(candidate(), copy)];
    const a = buildV3Artifact({ ...baseArgs, status: "official-best-bets", recommendations });
    const b = buildV3Artifact({ ...baseArgs, status: "official-best-bets", recommendations });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("validatePortfolioDiagnostics", () => {
  test("passes a reconciled diagnostics object", () => {
    const diagnostics = { totalRecommendations: 3, uniqueGolfers: 2, duplicationRate: 1 / 3, candidatesCreated: 20, candidatesWithExactPrice: 10 };
    expect(validatePortfolioDiagnostics(diagnostics).valid).toBe(true);
  });

  test("flags candidatesWithExactPrice exceeding candidatesCreated", () => {
    const diagnostics = { totalRecommendations: 1, uniqueGolfers: 1, duplicationRate: 0, candidatesCreated: 5, candidatesWithExactPrice: 6 };
    const { valid, errors } = validatePortfolioDiagnostics(diagnostics);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("candidatesWithExactPrice"))).toBe(true);
  });

  test("flags an incorrect duplicationRate", () => {
    const diagnostics = { totalRecommendations: 4, uniqueGolfers: 2, duplicationRate: 0, candidatesCreated: 10, candidatesWithExactPrice: 4 };
    const { valid, errors } = validatePortfolioDiagnostics(diagnostics);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("duplicationRate"))).toBe(true);
  });
});

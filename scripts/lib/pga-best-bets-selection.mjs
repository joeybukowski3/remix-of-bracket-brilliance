/**
 * Deterministic PGA Best Bets candidate generation, thresholding, market
 * caps, overlap/ladder rules, and portfolio diagnostics.
 *
 * This module never calls Grok, never fetches odds, and never makes a
 * randomized choice. Given the same field, model rows, and provider odds, it
 * always produces byte-identical output -- selection is frozen before any
 * prose generation happens (see scripts/generate-pga-best-bets.mjs).
 */

import {
  ALLOWED_LADDER_COMBINATIONS,
  BLEND_WEIGHTS,
  CANONICAL_MARKETS,
  EXPECTED_VALUE_THRESHOLDS,
  LADDER_MIN_MARKET_DISTANCE,
  LADDER_SECOND_LEG_EV_RATIO,
  LADDER_SECOND_LEG_MIN_EV,
  MARKET_CAPS,
  MAX_GOLFER_APPEARANCES,
  PROBABILITY_EDGE_THRESHOLDS,
  PROBABILITY_FLOORS,
} from "../config/pga-best-bets-config.mjs";
import { computeMarketCompleteness, normalizePlayerName, selectBestPrice } from "./pga-odds-provider.mjs";
import { noVigProbability, rawImpliedProbability } from "./pga-odds-math.mjs";
import { buildFieldStrengthMap, computeFinishProbabilities } from "./pga-probability-model.mjs";

const MODEL_MARKET_KEY = Object.freeze({ outright: "win", top5: "top5", top10: "top10", top20: "top20" });

function marketIndex(market) {
  return CANONICAL_MARKETS.indexOf(market);
}

/**
 * Build the full candidate universe: every player who is EITHER in the
 * official field OR has a model row, crossed with all four canonical
 * markets. Field-membership and model-data rejections are resolved here,
 * before any pricing work -- so `candidatesCreated` always reconciles with
 * the rejection counters below (see computePortfolioDiagnostics).
 */
export function buildCandidateUniverse({ officialFieldPlayers, modelRows }) {
  const fieldKeys = new Map((officialFieldPlayers ?? []).map((name) => [normalizePlayerName(name), name]));
  const modelByKey = new Map();
  for (const row of modelRows ?? []) {
    const key = normalizePlayerName(row?.player ?? "");
    if (!key) continue;
    if (!modelByKey.has(key)) modelByKey.set(key, row);
  }

  const universeKeys = new Set([...fieldKeys.keys(), ...modelByKey.keys()]);
  const candidates = [];
  for (const key of universeKeys) {
    const inField = fieldKeys.has(key);
    const modelRow = modelByKey.get(key) ?? null;
    const playerName = fieldKeys.get(key) ?? modelRow?.player ?? key;
    for (const market of CANONICAL_MARKETS) {
      candidates.push({
        playerKey: key,
        playerName,
        market,
        inField,
        hasModelData: Boolean(modelRow),
        rank: Number.isFinite(Number(modelRow?.rank)) ? Number(modelRow.rank) : null,
        powerRank: Number.isFinite(Number(modelRow?.powerRank)) ? Number(modelRow.powerRank) : null,
      });
    }
  }
  // Deterministic order: player key, then canonical market order.
  candidates.sort((a, b) => a.playerKey.localeCompare(b.playerKey) || marketIndex(a.market) - marketIndex(b.market));
  return candidates;
}

/**
 * Group a provider result's normalized sportsbook outcomes by
 * (sportsbookKey, canonicalMarket) -- the unit a no-vig completeness check
 * and overround calculation must operate over (one book's full market
 * snapshot), never a cross-book or recommended-only slice.
 */
function groupOutcomesByBookAndMarket(sportsbookMarkets) {
  const grouped = new Map();
  for (const outcome of sportsbookMarkets ?? []) {
    const key = `${outcome.sportsbookKey}::${outcome.canonicalMarket}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(outcome);
  }
  return grouped;
}

/**
 * Price, no-vig, provisional-model, and blended-probability enrichment for
 * every candidate in `candidates`, using `providerResult` (see
 * pga-odds-provider.mjs) and the field-relative probability model. Returns a
 * new array; candidates failing field-membership or model-data checks are
 * returned unpriced with their rejection already recorded.
 */
export function priceCandidates(candidates, { providerResult, officialFieldSize, now = new Date() }) {
  const outcomesByBookMarket = groupOutcomesByBookAndMarket(providerResult?.sportsbookMarkets);
  const modeledFieldSize = new Set(candidates.filter((c) => c.hasModelData).map((c) => c.playerKey)).size;

  const modelRowsForStrength = candidates
    .filter((c) => c.hasModelData && c.market === CANONICAL_MARKETS[0])
    .map((c) => ({ playerKey: c.playerKey, rank: c.rank }));
  const fieldStrengthMap = buildFieldStrengthMap(modelRowsForStrength);

  return candidates.map((candidate) => {
    const rejectionReasons = [];
    if (!candidate.inField) rejectionReasons.push("not in official field");
    if (!candidate.hasModelData) rejectionReasons.push("missing model data");
    if (rejectionReasons.length) {
      return { ...candidate, status: "rejected", rejectionReasons, price: null };
    }

    const bestPriceResult = selectBestPrice(providerResult?.sportsbookMarkets ?? [], {
      canonicalMarket: candidate.market,
      normalizedPlayerName: candidate.playerKey,
      providerEventId: providerResult?.providerEventId ?? null,
      now,
    });

    if (!bestPriceResult.price) {
      return {
        ...candidate,
        status: "rejected",
        rejectionReasons: bestPriceResult.rejectionReasons.length ? bestPriceResult.rejectionReasons : ["no exact-market price available"],
        price: null,
      };
    }

    const bookKey = `${bestPriceResult.price.sportsbookKey}::${candidate.market}`;
    const bookOutcomes = outcomesByBookMarket.get(bookKey) ?? [];
    const completeness = computeMarketCompleteness(bookOutcomes, { officialFieldSize, modeledFieldSize });
    if (!completeness.completenessPassed) {
      return {
        ...candidate,
        status: "rejected",
        rejectionReasons: ["no-vig completeness check failed for the pricing sportsbook's market snapshot"],
        price: bestPriceResult.price,
        completeness,
      };
    }

    const rawImplied = rawImpliedProbability(bestPriceResult.price.decimal);
    const noVig = noVigProbability(bestPriceResult.price.decimal, completeness.overround);
    if (noVig == null) {
      return { ...candidate, status: "rejected", rejectionReasons: ["unable to compute no-vig probability"], price: bestPriceResult.price, completeness };
    }

    const provisionalModelProbability = computeFinishProbabilities(fieldStrengthMap, candidate.playerKey)[MODEL_MARKET_KEY[candidate.market]];
    const weights = BLEND_WEIGHTS[candidate.market];
    const blendedModelProbability = weights.market * noVig + weights.model * provisionalModelProbability;
    const probabilityEdge = blendedModelProbability - noVig;
    const expectedValue = blendedModelProbability * bestPriceResult.price.decimal - 1;

    return {
      ...candidate,
      status: "priced",
      rejectionReasons: [],
      price: bestPriceResult.price,
      completeness,
      probability: {
        rawImplied,
        noVig,
        provisionalModelComponent: provisionalModelProbability,
        blended: blendedModelProbability,
      },
      probabilityEdge,
      expectedValue,
    };
  });
}

/**
 * Apply probability-floor, edge, and EV thresholds to priced candidates.
 * Every candidate keeps an explicit status and (if rejected) one or more
 * exact reasons -- never silently dropped.
 */
export function applyThresholds(pricedCandidates) {
  return pricedCandidates.map((candidate) => {
    if (candidate.status !== "priced") return candidate;
    const reasons = [];
    if (candidate.probability.blended < PROBABILITY_FLOORS[candidate.market]) reasons.push("below probability floor");
    if (candidate.probabilityEdge < PROBABILITY_EDGE_THRESHOLDS[candidate.market]) reasons.push("below probability edge threshold");
    if (candidate.expectedValue < EXPECTED_VALUE_THRESHOLDS[candidate.market]) reasons.push("below expected value threshold");
    if (reasons.length) return { ...candidate, status: "rejected", rejectionReasons: reasons };
    return { ...candidate, status: "qualified", rejectionReasons: [] };
  });
}

/** Deterministic candidate comparator: EV desc, blended prob desc, edge desc, name asc, market order asc. */
export function compareCandidates(a, b) {
  return (
    b.expectedValue - a.expectedValue
    || b.probability.blended - a.probability.blended
    || b.probabilityEdge - a.probabilityEdge
    || a.playerName.localeCompare(b.playerName)
    || marketIndex(a.market) - marketIndex(b.market)
  );
}

function isAllowedLadderCombo(marketA, marketB) {
  const [lo, hi] = [marketA, marketB].sort((m1, m2) => marketIndex(m1) - marketIndex(m2));
  return ALLOWED_LADDER_COMBINATIONS.some(([a, b]) => a === lo && b === hi);
}

/**
 * Greedy deterministic selection over already-qualified candidates: applies
 * market caps (maximums, never quotas), one-primary-per-golfer, a maximum of
 * two appearances via an allowed ladder combination only, and the
 * second-leg EV rule. Never substitutes a weaker pick to fill a market and
 * never forces visual/market diversity.
 */
export function selectRecommendations(qualifiedCandidates) {
  const sorted = [...qualifiedCandidates].sort(compareCandidates);
  const marketCounts = Object.fromEntries(CANONICAL_MARKETS.map((m) => [m, 0]));
  const appearancesByPlayer = new Map();
  const accepted = [];
  const overlapRejections = [];

  for (const candidate of sorted) {
    const existing = appearancesByPlayer.get(candidate.playerKey) ?? [];

    if (existing.length === 0) {
      if (marketCounts[candidate.market] >= MARKET_CAPS[candidate.market]) continue;
      const entry = { ...candidate, ladderId: null };
      accepted.push(entry);
      marketCounts[candidate.market] += 1;
      appearancesByPlayer.set(candidate.playerKey, [entry]);
      continue;
    }

    if (existing.length >= MAX_GOLFER_APPEARANCES) {
      overlapRejections.push({ ...candidate, rejectionReasons: [`golfer already has the maximum of ${MAX_GOLFER_APPEARANCES} appearances`] });
      continue;
    }

    const primary = existing[0];
    if (!isAllowedLadderCombo(primary.market, candidate.market)) {
      overlapRejections.push({ ...candidate, rejectionReasons: [`market combination ${primary.market}+${candidate.market} is not an allowed ladder`] });
      continue;
    }
    if (Math.abs(marketIndex(candidate.market) - marketIndex(primary.market)) < LADDER_MIN_MARKET_DISTANCE) {
      overlapRejections.push({ ...candidate, rejectionReasons: ["ladder legs are not a meaningful finish-threshold distance apart"] });
      continue;
    }
    const minSecondLegEv = Math.max(LADDER_SECOND_LEG_MIN_EV[candidate.market], LADDER_SECOND_LEG_EV_RATIO * primary.expectedValue);
    if (candidate.expectedValue < minSecondLegEv) {
      overlapRejections.push({ ...candidate, rejectionReasons: ["second ladder leg does not clear the second-leg EV rule"] });
      continue;
    }
    if (marketCounts[candidate.market] >= MARKET_CAPS[candidate.market]) continue;

    const ladderId = `ladder:${candidate.playerKey}:${primary.market}+${candidate.market}`;
    primary.ladderId = ladderId;
    const entry = { ...candidate, ladderId };
    accepted.push(entry);
    marketCounts[candidate.market] += 1;
    appearancesByPlayer.set(candidate.playerKey, [...existing, entry]);
  }

  return { recommendations: accepted, overlapRejections };
}

function clampConfidence(edge, expectedValue) {
  if (edge >= 0.03 && expectedValue >= 0.12) return "high";
  if (edge >= 0.015 && expectedValue >= 0.06) return "moderate";
  return "low";
}

/** Deterministic, data-derived rationale/risk copy -- never Grok-authored. */
export function buildRecommendationCopy(candidate) {
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  const rationale = [
    `Blended model probability ${pct(candidate.probability.blended)} vs. no-vig market probability ${pct(candidate.probability.noVig)} (edge ${pct(candidate.probabilityEdge)}).`,
    `Expected value ${pct(candidate.expectedValue)} at ${candidate.price.american > 0 ? "+" : ""}${candidate.price.american} (${candidate.price.sportsbookName}).`,
  ];
  if (candidate.rank != null) rationale.push(`Tournament model rank #${candidate.rank}.`);
  const risk = candidate.probabilityEdge < 0.02
    ? "Edge over the market is modest; provisional model only, not historically calibrated."
    : "Provisional model edge; no historical calibration backs this estimate.";
  return {
    rationale,
    risk,
    confidence: clampConfidence(candidate.probabilityEdge, candidate.expectedValue),
  };
}

/**
 * Portfolio-level diagnostics, fully reconciled against the candidate
 * universe and final recommendations.
 *
 * `allCandidates` is every entry from priceCandidates+applyThresholds
 * (statuses: rejected/qualified). `overlapRejections` is
 * selectRecommendations' second return value -- qualified candidates that
 * lost only to a portfolio-level rule (market cap, appearance limit, ladder
 * combination, or second-leg EV), so every candidate created is accounted
 * for in exactly one bucket below.
 */
export function computePortfolioDiagnostics(allCandidates, overlapRejections, recommendations) {
  const totalRecommendations = recommendations.length;
  const uniqueGolfers = new Set(recommendations.map((r) => r.playerKey)).size;
  const duplicationRate = totalRecommendations > 0 ? (totalRecommendations - uniqueGolfers) / totalRecommendations : 0;
  const appearanceCounts = new Map();
  for (const rec of recommendations) appearanceCounts.set(rec.playerKey, (appearanceCounts.get(rec.playerKey) ?? 0) + 1);
  const maximumAppearances = appearanceCounts.size ? Math.max(...appearanceCounts.values()) : 0;
  const numberOfLadders = new Set(recommendations.map((r) => r.ladderId).filter(Boolean)).size;

  const reasonCount = (needle) => allCandidates.filter((c) => c.status === "rejected" && (c.rejectionReasons ?? []).some((r) => r.includes(needle))).length;

  const candidatesCreated = allCandidates.length;
  const candidatesWithExactPrice = allCandidates.filter((c) => Boolean(c.price)).length;
  const oddsCoverage = candidatesCreated > 0 ? candidatesWithExactPrice / candidatesCreated : 0;

  return {
    totalRecommendations,
    uniqueGolfers,
    duplicationRate,
    maximumAppearances,
    numberOfLadders,
    oddsCoverage,
    staleOddsCount: reasonCount("stale price"),
    candidatesCreated,
    candidatesWithExactPrice,
    rejectedByProbabilityFloor: reasonCount("below probability floor"),
    rejectedByProbabilityEdge: reasonCount("below probability edge threshold"),
    rejectedByExpectedValue: reasonCount("below expected value threshold"),
    rejectedByFreshness: reasonCount("stale price"),
    rejectedByFieldMembership: reasonCount("not in official field"),
    rejectedByMissingModelData: reasonCount("missing model data"),
    rejectedByOverlapRules: (overlapRejections ?? []).length,
  };
}

export { CANONICAL_MARKETS };

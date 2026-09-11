/**
 * WU2 -- source-quality and freshness policy for external NFL evidence.
 * Pure/deterministic; no AI, no network calls. This is the ranking the
 * normalizer (nfl-evidence-normalizer.ts) applies to every raw research
 * candidate before it is allowed to become trusted evidence.
 */

import type { EvidenceCategory, EvidenceSourceType } from "./nfl-evidence-types";

/**
 * Tier 1 (official) > Tier 2 (established reporting) > Tier 3 (reputable
 * secondary media/market/weather) > Tier 4 (other/unclassified). Lower
 * number is higher quality.
 */
export type SourceTier = 1 | 2 | 3 | 4;

const SOURCE_TIER_BY_TYPE: Record<EvidenceSourceType, SourceTier> = {
  official_nfl: 1,
  official_team: 1,
  injury_report: 1,
  beat_reporter: 2,
  national_reporter: 2,
  sports_media: 3,
  weather_provider: 3,
  sportsbook: 3,
  other: 4,
};

export function sourceTier(sourceType: EvidenceSourceType): SourceTier {
  return SOURCE_TIER_BY_TYPE[sourceType];
}

/**
 * Each category has a strongly preferred tier of source, per the
 * architecture spec -- not every category trusts the same "best" source.
 * This is informational (surfaced to confidence scoring), not a hard gate:
 * a beat-reporter injury claim is still usable, just not "verified"-grade
 * on its own the way an official injury report is.
 */
const PREFERRED_TIER_BY_CATEGORY: Record<EvidenceCategory, SourceTier> = {
  injury: 1,
  availability: 1,
  personnel: 2,
  depth_chart: 2,
  coaching: 2,
  scheme: 2,
  usage: 2,
  matchup: 2,
  news: 2,
  weather: 3,
  market: 3,
  scheduling: 1,
  travel: 2,
  situational: 2,
  quote: 1, // original press-conference/team transcript preferred
  other: 4,
};

export function preferredTierForCategory(category: EvidenceCategory): SourceTier {
  return PREFERRED_TIER_BY_CATEGORY[category];
}

/**
 * Source-name/type heuristics for content this repo will not treat as
 * trustworthy by default -- anonymous social posts, SEO aggregation, rumor
 * accounts, betting-tout claims dressed up as reporting, and AI-generated
 * summaries with no primary sourcing. These never hard-fail normalization
 * (the record is retained per the append-only/never-silently-drop rule) but
 * they force verificationStatus down to "rejected" -- see
 * nfl-evidence-normalizer.ts's applySourceQualityPolicy().
 */
const REJECTED_SOURCE_NAME_PATTERN =
  /\b(rumor|unverified|anonymous|anon\b|tout|touts|parlay\s*guru|ai[- ]generated|aggregator)\b/i;

export function isRejectedSourceByPolicy(input: { sourceType: EvidenceSourceType; sourceName: string; url: string | null }): boolean {
  if (REJECTED_SOURCE_NAME_PATTERN.test(input.sourceName)) return true;
  // "other" with no URL at all cannot be traced -- policy-reject by default.
  if (input.sourceType === "other" && !input.url) return true;
  return false;
}

/**
 * "Sharp"/"smart money"/"professional action" language is banned by the
 * editorial contract (architecture §14) unless the market claim itself is
 * backed by a source capable of actually knowing that (sportsbook, or
 * national/beat reporting with access to bet-percentage data) -- not a
 * generic media recap.
 */
const SHARP_MONEY_PATTERN = /\b(sharp money|smart money|professional action|sharp action)\b/i;
const SOURCE_TYPES_ALLOWED_TO_CLAIM_SHARP_MONEY: ReadonlySet<EvidenceSourceType> = new Set([
  "sportsbook",
  "national_reporter",
  "beat_reporter",
  "official_nfl",
]);

export function isUnsupportedSharpMoneyClaim(input: { category: EvidenceCategory; claim: string; sourceType: EvidenceSourceType }): boolean {
  if (input.category !== "market") return false;
  if (!SHARP_MONEY_PATTERN.test(input.claim)) return false;
  return !SOURCE_TYPES_ALLOWED_TO_CLAIM_SHARP_MONEY.has(input.sourceType);
}

/**
 * Freshness thresholds, hours-since-publication (or since retrieval when
 * publishedAt is unknown), measured back from kickoff. Documented explicitly
 * per category rather than one global number, per architecture guidance
 * ("Friday/Saturday update > Monday report" for injuries; "24h forecast >
 * 5-day forecast" for weather).
 */
const FRESHNESS_HOURS_BY_CATEGORY: Record<EvidenceCategory, { fresh: number; aging: number }> = {
  injury: { fresh: 48, aging: 96 }, // Fri/Sat update fresh; Monday-of-following-week+ is stale
  availability: { fresh: 48, aging: 96 },
  depth_chart: { fresh: 72, aging: 144 },
  personnel: { fresh: 72, aging: 168 },
  coaching: { fresh: 96, aging: 168 }, // current-week statement vs. stale preseason-era comment
  scheme: { fresh: 168, aging: 336 },
  usage: { fresh: 168, aging: 336 },
  matchup: { fresh: 168, aging: 336 },
  news: { fresh: 72, aging: 168 },
  weather: { fresh: 24, aging: 120 }, // 24h forecast fresh; 5-day forecast is the aging ceiling
  market: { fresh: 24, aging: 72 },
  scheduling: { fresh: 168, aging: 336 },
  travel: { fresh: 168, aging: 336 },
  situational: { fresh: 168, aging: 336 },
  quote: { fresh: 96, aging: 168 },
  other: { fresh: 48, aging: 96 },
};

export function freshnessThresholdsForCategory(category: EvidenceCategory): { fresh: number; aging: number } {
  return FRESHNESS_HOURS_BY_CATEGORY[category];
}

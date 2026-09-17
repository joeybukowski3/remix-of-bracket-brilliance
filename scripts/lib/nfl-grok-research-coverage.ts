/**
 * WU3.1 -- pure, post-hoc research-coverage summary. Never influences what
 * Grok is asked to do (see nfl-grok-research-adapter.ts's buildResearchPrompt,
 * unchanged by this module) and never fabricates a finding to fill a gap.
 * This only classifies what already came back from one research pass so a
 * future orchestrator can tell:
 *
 *   "no weather finding because nothing material surfaced"
 * apart from
 *   "the model never actually checked weather"
 *
 * The second is detected mechanically by matching the model's own
 * web_search_call query strings (see nfl-grok-research-parsing.ts's
 * searchQueries) against category keywords -- not by asking the model to
 * self-report, which cannot be trusted any more than any other prose claim.
 */

import type { EvidenceCategory, RawEvidenceCandidate } from "./nfl-evidence-types";

export const RESEARCH_COVERAGE_AREAS = ["injuryAvailability", "personnel", "coachingScheme", "weather", "marketContext"] as const;
export type ResearchCoverageArea = (typeof RESEARCH_COVERAGE_AREAS)[number];

export type ResearchCoverageStatus = "covered" | "partial" | "none";

export interface ResearchCoverageSummary {
  injuryAvailability: ResearchCoverageStatus;
  personnel: ResearchCoverageStatus;
  coachingScheme: ResearchCoverageStatus;
  weather: ResearchCoverageStatus;
  marketContext: ResearchCoverageStatus;
  /** Areas where zero findings were accepted, but a search query indicates the model actually looked -- i.e. "checked, found nothing material," not "never checked." */
  searchedButNoMaterialFinding: ResearchCoverageArea[];
}

/**
 * Maps each evidence category to the coverage area it counts toward. Several
 * categories map to null -- they exist in the evidence schema for other
 * purposes (nfl-evidence-types.ts) but aren't one of the five coverage areas
 * this report tracks.
 */
const CATEGORY_TO_AREA: Record<EvidenceCategory, ResearchCoverageArea | null> = {
  injury: "injuryAvailability",
  availability: "injuryAvailability",
  personnel: "personnel",
  depth_chart: "personnel",
  usage: "personnel",
  coaching: "coachingScheme",
  scheme: "coachingScheme",
  quote: "coachingScheme",
  weather: "weather",
  market: "marketContext",
  matchup: null,
  news: null,
  scheduling: null,
  travel: null,
  situational: null,
  other: null,
};

/** Mechanical, keyword-based proxy for "a search query targeted this area" -- not NLP, deliberately conservative. */
const AREA_SEARCH_QUERY_PATTERN: Record<ResearchCoverageArea, RegExp> = {
  injuryAvailability: /injur|practice report|questionable|doubtful|inactive/i,
  personnel: /transaction|sign|trade|elevat|waive|roster move|depth chart|personnel/i,
  coachingScheme: /coach|coordinator|scheme|press conference|comment/i,
  weather: /weather|forecast|wind|rain|snow|temperature/i,
  marketContext: /odds|spread|point spread|betting line|\btotal\b/i,
};

function statusForCount(count: number): ResearchCoverageStatus {
  if (count >= 2) return "covered";
  if (count === 1) return "partial";
  return "none";
}

/**
 * Summarizes coverage from ACCEPTED candidates only (rejected/untrusted
 * findings do not count as coverage) plus the raw search-query strings the
 * provider's own web_search_call items reported. Never requires every area
 * to have a finding -- "none" is a legitimate, honestly-reported outcome.
 */
export function summarizeResearchCoverage(candidates: readonly RawEvidenceCandidate[], searchQueries: readonly string[]): ResearchCoverageSummary {
  const counts: Record<ResearchCoverageArea, number> = {
    injuryAvailability: 0,
    personnel: 0,
    coachingScheme: 0,
    weather: 0,
    marketContext: 0,
  };

  for (const candidate of candidates) {
    const area = CATEGORY_TO_AREA[candidate.category];
    if (area) counts[area] += 1;
  }

  const searchedAreas = new Set<ResearchCoverageArea>();
  for (const query of searchQueries) {
    for (const area of RESEARCH_COVERAGE_AREAS) {
      if (AREA_SEARCH_QUERY_PATTERN[area].test(query)) searchedAreas.add(area);
    }
  }

  const searchedButNoMaterialFinding = RESEARCH_COVERAGE_AREAS.filter((area) => counts[area] === 0 && searchedAreas.has(area));

  return {
    injuryAvailability: statusForCount(counts.injuryAvailability),
    personnel: statusForCount(counts.personnel),
    coachingScheme: statusForCount(counts.coachingScheme),
    weather: statusForCount(counts.weather),
    marketContext: statusForCount(counts.marketContext),
    searchedButNoMaterialFinding,
  };
}

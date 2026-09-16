/**
 * WU7.9 -- deterministic, zero-fabrication adapter that previews the new
 * long-form article layout for a snapshot written BEFORE the editorial
 * article schema existed (no `marketDecision.editorialArticle`). It
 * reorganizes already-persisted thesis/matchupFactors/failureModes/side and
 * total rationale into the new section shape -- it never invents prose, and
 * a section the legacy data cannot support is omitted (`null`/empty)
 * rather than fabricated.
 *
 * This is a PREVIEW of layout/typography/section flow/provider switching/
 * betting summary/Research & Sources, never a stand-in for the finished
 * long-form article a future Stage B call will actually write. The result's
 * `isLegacyPreview: true` marks that distinction unambiguously so the UI can
 * disclose it -- see src/lib/nfl/aiHandicapPresentation.ts's
 * AiHandicapEditorialArticle doc comment.
 */

import type { EditorialArticle, FailureMode, MatchupFactor, SideOpinionState, SnapshotAnalysisState, TotalOpinionState } from "./nfl-snapshot-types";

export interface LegacyEditorialInput {
  homeTeam: string;
  awayTeam: string;
  week: number;
  displayName: string;
  analysisState: SnapshotAnalysisState;
  /** Public-safe, already-formatted side/total pick text (e.g. "ATL +2.5", "PASS", "Over 43.5") -- reused verbatim from the same formatting the rest of the presentation card uses, never recomputed here. */
  sideSummary: string;
  totalSummary: string;
}

function titleCaseArea(area: string): string {
  return area
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * WU7.9 -- `MatchupFactor.finding` predates the "no machine language in the
 * reader-facing article" rule and was deliberately written as a "FACT: ...
 * INTERPRETATION: ..." pair with occasional raw snake_case metric names (see
 * nfl-snapshot-types.ts's MatchupFactor doc comment) -- exactly the shape
 * that rule now forbids. This is a purely mechanical label/formatting strip
 * (never a rewrite of the underlying claim, never an invented word), so the
 * legacy preview can surface these findings in the article body without
 * leaking internal formatting. The unedited original stays visible verbatim
 * in Research & Sources for auditability.
 */
function stripLegacyMachineLanguage(text: string): string {
  return text
    .replace(/\s*FACT:\s*/gi, " ")
    .replace(/\s*INTERPRETATION:\s*/gi, " ")
    .replace(/\b([a-zA-Z]+(?:_[a-zA-Z]+)+)\b/g, (token) => token.replace(/_/g, " "))
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The thesis's own first sentence, used as the article dek -- never a rewritten or invented subheadline. Falls back to the whole thesis when no sentence boundary is found. */
function firstSentence(text: string): string {
  const match = /^(.*?[.!?])(\s|$)/.exec(text.trim());
  return match ? match[1] : text.trim();
}

function buildFinalWord(displayName: string, sideSummary: string, side: SideOpinionState, totalSummary: string, total: TotalOpinionState): string[] {
  const sidePart = sideSummary === "PASS" ? "passes on the side" : `leans ${sideSummary} on the side${side.confidence != null ? ` (confidence ${side.confidence}/10)` : ""}`;
  const totalPart = totalSummary === "PASS" ? "passes on the total" : `leans ${totalSummary} on the total${total.confidence != null ? ` (confidence ${total.confidence}/10)` : ""}`;
  return [
    `${displayName} ${sidePart} and ${totalPart}.`,
    `This is a layout preview built from ${displayName}'s existing pre-editorial analysis, not the finished long-form article this matchup will receive under the new weekly format.`,
  ];
}

/**
 * Builds a legacy preview article from a snapshot's persisted
 * `analysisState` alone. `matchupFactors` tagged `area: "personnel"` become
 * the Personnel & Availability section (a real, distinct category already
 * present in the source data); every other factor becomes a Matchup Key so
 * nothing is dropped or duplicated across sections. `failureModes` map
 * directly onto Swing Factors (both are already "scenario" + "why it
 * matters" pairs). Sections with no supporting legacy data (offense-vs-
 * defense breakdowns, trenches, game script) are omitted rather than
 * invented.
 */
export function buildLegacyEditorialArticle(input: LegacyEditorialInput): EditorialArticle {
  const { homeTeam, awayTeam, week, displayName, analysisState, sideSummary, totalSummary } = input;
  const factors: MatchupFactor[] = analysisState.matchupFactors ?? [];
  const personnelFactors = factors.filter((factor) => factor.area === "personnel");
  const otherFactors = factors.filter((factor) => factor.area !== "personnel");
  const failureModes: FailureMode[] = analysisState.failureModes ?? [];
  const thesis = analysisState.thesis?.trim() ? stripLegacyMachineLanguage(analysisState.thesis) : null;
  const sideRationale = analysisState.side.rationale ? stripLegacyMachineLanguage(analysisState.side.rationale) : null;
  const totalRationale = analysisState.total.rationale ? stripLegacyMachineLanguage(analysisState.total.rationale) : null;

  return {
    isLegacyPreview: true,
    headline: `${awayTeam.toUpperCase()} at ${homeTeam.toUpperCase()} -- Week ${week}: ${displayName}'s Handicap`,
    dek: thesis ? firstSentence(thesis) : `${displayName}'s independent read on this matchup.`,
    openingRead: thesis ? [thesis] : [],
    awayOffenseVsHomeDefense: null,
    homeOffenseVsAwayDefense: null,
    trenchesAndGameControl: null,
    personnelAndAvailability: personnelFactors.length > 0 ? personnelFactors.map((factor) => stripLegacyMachineLanguage(factor.finding)) : null,
    gameScript: null,
    matchupKeys: otherFactors.map((factor) => ({ title: titleCaseArea(factor.area), analysis: stripLegacyMachineLanguage(factor.finding) })),
    swingFactors: failureModes.map((mode) => ({ title: stripLegacyMachineLanguage(mode.scenario), analysis: stripLegacyMachineLanguage(mode.whyItMatters) })),
    sideAnalysis: sideRationale ? [sideRationale] : null,
    totalAnalysis: totalRationale ? [totalRationale] : null,
    finalWord: buildFinalWord(displayName, sideSummary, analysisState.side, totalSummary, analysisState.total),
  };
}

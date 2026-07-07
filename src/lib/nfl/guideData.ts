/**
 * Season-keyed normalized NFL guide data (PR-5).
 *
 * This is a normalization layer over the existing 2026 guide computation in
 * guide2026.ts — values are migrated, never invented, so public guide
 * behavior is unchanged. Future seasons add an entry to NFL_SEASON_GUIDES.
 *
 * Deliberately does NOT read public/data/nfl/<season>/power-ratings.json:
 * the PR-4 model is experimental and no public surface may consume it yet.
 */

import {
  NFL_GUIDE_BOUNCE_BACKS,
  NFL_GUIDE_PLAYOFFS,
  NFL_GUIDE_REGRESSION_CANDIDATES,
  NFL_GUIDE_SUPER_BOWL_PICK,
  NFL_GUIDE_TEAMS,
  type NflGuideQuestion,
} from "@/lib/nfl/guide2026";
import type { NflConfidenceLabel, NflMarketLean, NflRegressionSignal } from "@/lib/nfl/guideLabels";

export type NflGuideTeamNormalized = {
  slug: string;
  abbr: string;
  teamName: string;
  division: string;
  conference: "AFC" | "NFC";
  /** Computed model fields */
  projectedWins: number;
  marketWinTotal: number | null;
  modelVsMarketGap: number | null;
  recommendationLabel: NflMarketLean;
  confidenceLabel: NflConfidenceLabel;
  regressionGap: number;
  regressionSignal: NflRegressionSignal;
  powerRank: number;
  offenseRank: number;
  defenseRank: number;
  scheduleRank: number | null;
  scheduleLabel: string;
  record2025: string;
  /** Editorial (template-generated from the numbers above in guide2026.ts) */
  headline: string;
  editorialSummary: string;
  strengths: string[];
  concerns: string[];
  keyQuestions: NflGuideQuestion[];
};

export type NflConferencePicks = {
  divisionWinners: string[]; // slugs
  wildCards: string[];
  conferenceChampion: string;
};

export type NflSeasonGuide = {
  season: number;
  methodologyVersion: string;
  disclaimer: string;
  teams: NflGuideTeamNormalized[];
  teamBySlug: Map<string, NflGuideTeamNormalized>;
  teamByAbbr: Map<string, NflGuideTeamNormalized>;
  picks: {
    AFC: NflConferencePicks;
    NFC: NflConferencePicks;
    superBowlPick: string;
    bounceBacks: string[];
    regressionCandidates: string[];
  };
};

function normalizeTeams(): NflGuideTeamNormalized[] {
  return NFL_GUIDE_TEAMS.map((team) => ({
    slug: team.slug,
    abbr: team.abbr,
    teamName: team.team,
    division: team.division,
    conference: team.conference,
    projectedWins: team.projectedWins,
    marketWinTotal: team.winTotal,
    modelVsMarketGap: team.modelEdge,
    recommendationLabel: team.marketLean,
    confidenceLabel: team.marketConfidence,
    regressionGap: team.regressionGap,
    regressionSignal: team.regressionSignal,
    powerRank: team.powerRank,
    offenseRank: team.offRank,
    defenseRank: team.defRank,
    scheduleRank: team.scheduleRank,
    scheduleLabel: team.scheduleLabel,
    record2025: team.record2025,
    headline: team.headline,
    editorialSummary: team.summary,
    strengths: team.strengths,
    concerns: team.concerns,
    keyQuestions: team.questions,
  }));
}

function buildGuide2026(): NflSeasonGuide {
  const teams = normalizeTeams();
  return {
    season: 2026,
    methodologyVersion: "nfl-guide-2026-v1",
    disclaimer:
      "Preseason guide baseline computed from the 2025 performance composite and schedule ranks. Informational only.",
    teams,
    teamBySlug: new Map(teams.map((team) => [team.slug, team])),
    teamByAbbr: new Map(teams.map((team) => [team.abbr, team])),
    picks: {
      AFC: {
        divisionWinners: NFL_GUIDE_PLAYOFFS.AFC.divisionWinners.map((team) => team.slug),
        wildCards: NFL_GUIDE_PLAYOFFS.AFC.wildCards.map((team) => team.slug),
        conferenceChampion: NFL_GUIDE_PLAYOFFS.AFC.conferenceChampion.slug,
      },
      NFC: {
        divisionWinners: NFL_GUIDE_PLAYOFFS.NFC.divisionWinners.map((team) => team.slug),
        wildCards: NFL_GUIDE_PLAYOFFS.NFC.wildCards.map((team) => team.slug),
        conferenceChampion: NFL_GUIDE_PLAYOFFS.NFC.conferenceChampion.slug,
      },
      superBowlPick: NFL_GUIDE_SUPER_BOWL_PICK.slug,
      bounceBacks: NFL_GUIDE_BOUNCE_BACKS.map((team) => team.slug),
      regressionCandidates: NFL_GUIDE_REGRESSION_CANDIDATES.map((team) => team.slug),
    },
  };
}

export const NFL_SEASON_GUIDES: Record<number, NflSeasonGuide> = {
  2026: buildGuide2026(),
};

export function getNflSeasonGuide(season: number): NflSeasonGuide | null {
  return NFL_SEASON_GUIDES[season] ?? null;
}

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
  NFL_GUIDE_DIVISIONS,
  NFL_GUIDE_PLAYOFFS,
  NFL_GUIDE_REGRESSION_CANDIDATES,
  NFL_GUIDE_SUPER_BOWL_PICK,
  NFL_GUIDE_TEAMS,
  NFL_GUIDE_TOP_MARKET_EDGES,
  type NflGuideQuestion,
  type NflGuideTeam,
} from "@/lib/nfl/guide2026";
import type { NflConfidenceLabel, NflMarketLean, NflRegressionSignal } from "@/lib/nfl/guideLabels";

// Formatting/description helpers used by guide pages; re-exported so pages
// can import everything guide-related from this module.
export { formatSigned, getScheduleDescription } from "@/lib/nfl/guide2026";

export type NflGuideTeamNormalized = {
  slug: string;
  abbr: string;
  teamName: string;
  division: string;
  conference: "AFC" | "NFC";
  /** Team primary color (matches canonical teams.json primaryColor). */
  color: string;
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
  /** 2025 composite model percentages (used by dashboard matchup cards). */
  overallPct: number;
  offensePct: number;
  defensePct: number;
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

export type NflConferenceProjectionNormalized = {
  divisionWinners: NflGuideTeamNormalized[];
  wildCards: NflGuideTeamNormalized[];
  conferenceChampion: NflGuideTeamNormalized;
};

export type NflSeasonGuide = {
  season: number;
  methodologyVersion: string;
  disclaimer: string;
  teams: NflGuideTeamNormalized[];
  teamBySlug: Map<string, NflGuideTeamNormalized>;
  teamByAbbr: Map<string, NflGuideTeamNormalized>;
  /** Division cards in display order (teams pre-sorted by projection, as on /nfl/guide). */
  divisions: { division: string; teams: NflGuideTeamNormalized[] }[];
  /** Teams sorted by absolute model-vs-market gap (largest first). */
  topMarketEdges: NflGuideTeamNormalized[];
  superBowlPick: NflGuideTeamNormalized;
  bounceBacks: NflGuideTeamNormalized[];
  regressionCandidates: NflGuideTeamNormalized[];
  playoffProjection: {
    AFC: NflConferenceProjectionNormalized;
    NFC: NflConferenceProjectionNormalized;
  };
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
    color: team.color,
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
    overallPct: team.ovrPct,
    offensePct: team.offPct,
    defensePct: team.defPct,
    headline: team.headline,
    editorialSummary: team.summary,
    strengths: team.strengths,
    concerns: team.concerns,
    keyQuestions: team.questions,
  }));
}

function buildGuide2026(): NflSeasonGuide {
  const teams = normalizeTeams();
  const teamBySlug = new Map(teams.map((team) => [team.slug, team]));
  // Derived collections mirror guide2026's ordering exactly (migration, not
  // re-sorting) so page output cannot drift from the legacy behavior.
  const toNormalized = (legacy: NflGuideTeam) => teamBySlug.get(legacy.slug)!;
  return {
    season: 2026,
    methodologyVersion: "nfl-guide-2026-v1",
    disclaimer:
      "Preseason guide baseline computed from the 2025 performance composite and schedule ranks. Informational only.",
    teams,
    teamBySlug,
    teamByAbbr: new Map(teams.map((team) => [team.abbr, team])),
    divisions: NFL_GUIDE_DIVISIONS.map(({ division, teams: divisionTeams }) => ({
      division,
      teams: divisionTeams.map(toNormalized),
    })),
    topMarketEdges: NFL_GUIDE_TOP_MARKET_EDGES.map(toNormalized),
    superBowlPick: toNormalized(NFL_GUIDE_SUPER_BOWL_PICK),
    bounceBacks: NFL_GUIDE_BOUNCE_BACKS.map(toNormalized),
    regressionCandidates: NFL_GUIDE_REGRESSION_CANDIDATES.map(toNormalized),
    playoffProjection: {
      AFC: {
        divisionWinners: NFL_GUIDE_PLAYOFFS.AFC.divisionWinners.map(toNormalized),
        wildCards: NFL_GUIDE_PLAYOFFS.AFC.wildCards.map(toNormalized),
        conferenceChampion: toNormalized(NFL_GUIDE_PLAYOFFS.AFC.conferenceChampion),
      },
      NFC: {
        divisionWinners: NFL_GUIDE_PLAYOFFS.NFC.divisionWinners.map(toNormalized),
        wildCards: NFL_GUIDE_PLAYOFFS.NFC.wildCards.map(toNormalized),
        conferenceChampion: toNormalized(NFL_GUIDE_PLAYOFFS.NFC.conferenceChampion),
      },
    },
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

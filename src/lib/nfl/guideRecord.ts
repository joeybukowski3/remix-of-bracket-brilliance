import { NFL_POWER_RATINGS } from "@/data/nflPreseason2026";
import { getNflOffseasonProfile, type NflOffseasonProfile } from "@/data/nflOffseason2026";
import {
  NFL_CANONICAL_TEAMS,
  NFL_FINAL_EIGHT_METRICS,
  NFL_FULL_SEASON_METRICS,
  NFL_PRESEASON_RATINGS,
  NFL_PRESEASON_RATINGS_META,
  NFL_RATINGS_SOURCE_SEASON,
  type NflCanonicalTeam,
} from "@/lib/nfl/guideSources";
import { getNflVsinGuideTeam, type NflVsinGuideTeam } from "@/lib/nfl/vsinGuide2026";
import {
  getWarrenSharpScheduleProfile,
  type WarrenSharpScheduleProfile,
} from "@/lib/nfl/warrenSharpSchedule2026";

export const NFL_GUIDE_SEASON = 2026;

/** Fixed presentation order. AFC before NFC, then East/North/South/West. */
export const NFL_GUIDE_DIVISION_ORDER = [
  "AFC East",
  "AFC North",
  "AFC South",
  "AFC West",
  "NFC East",
  "NFC North",
  "NFC South",
  "NFC West",
] as const;

export type NflGuideDivisionName = (typeof NFL_GUIDE_DIVISION_ORDER)[number];

/** JoeKnowsBall model output (nfl-power-v0.3.0). */
export type NflGuideModel = {
  rank: number;
  publicRating: number;
  offenseRating: number;
  defenseRating: number;
  fullSeasonComposite: number;
  finalEightComposite: number;
  uncertaintyBand: string | null;
};

/** Completed prior season, from the nflverse-derived metrics artifact. */
export type NflGuidePreviousSeason = {
  wins: number;
  losses: number;
  ties: number;
  offEpaRank: number | null;
  defEpaRank: number | null;
  pointDiffRank: number | null;
  pythagoreanExpectedWins: number | null;
  expectedWinsDelta: number | null;
};

export type NflGuideFinalEight = {
  offEpaRank: number | null;
  defEpaRank: number | null;
  netEpaRank: number | null;
};

export type NflGuideMarket = {
  winTotal: number;
};

export type NflGuideRecord = NflCanonicalTeam & {
  division: NflGuideDivisionName;
  model: NflGuideModel | null;
  previousSeason: NflGuidePreviousSeason | null;
  finalEight: NflGuideFinalEight | null;
  market: NflGuideMarket | null;
  schedule: WarrenSharpScheduleProfile | null;
  vsin: NflVsinGuideTeam | null;
  offseason: NflOffseasonProfile | null;
};

const ratingByAbbr = new Map(NFL_PRESEASON_RATINGS.map((rating) => [rating.abbr, rating]));
const fullSeasonByAbbr = new Map(NFL_FULL_SEASON_METRICS.map((team) => [team.abbr, team]));
const finalEightByAbbr = new Map(NFL_FINAL_EIGHT_METRICS.map((team) => [team.abbr, team]));
const marketByAbbr = new Map(NFL_POWER_RATINGS.map((team) => [team.abbr, team]));

function isGuideDivision(division: string): division is NflGuideDivisionName {
  return (NFL_GUIDE_DIVISION_ORDER as readonly string[]).includes(division);
}

function buildRecord(team: NflCanonicalTeam): NflGuideRecord | null {
  if (!isGuideDivision(team.division)) return null;

  const rating = ratingByAbbr.get(team.abbr);
  const fullSeason = fullSeasonByAbbr.get(team.abbr);
  const finalEight = finalEightByAbbr.get(team.abbr);
  const market = marketByAbbr.get(team.abbr);

  return {
    ...team,
    division: team.division,
    model: rating
      ? {
          rank: rating.rank,
          publicRating: rating.publicRating,
          offenseRating: rating.offenseRating,
          defenseRating: rating.defenseRating,
          fullSeasonComposite: rating.historical.fullSeasonComposite,
          finalEightComposite: rating.historical.l8AdjustedComposite,
          uncertaintyBand: rating.uncertainty?.band ?? null,
        }
      : null,
    previousSeason: fullSeason
      ? {
          wins: fullSeason.wins,
          losses: fullSeason.losses,
          ties: fullSeason.ties,
          offEpaRank: fullSeason.metrics.offEpaPerPlay.rank,
          defEpaRank: fullSeason.metrics.defEpaPerPlay.rank,
          pointDiffRank: fullSeason.metrics.pointDiffPerGame.rank,
          pythagoreanExpectedWins: fullSeason.pythagoreanExpectedWins,
          expectedWinsDelta: fullSeason.expectedWinsDelta,
        }
      : null,
    finalEight: finalEight
      ? {
          offEpaRank: finalEight.metrics.offEpaPerPlay.rank,
          defEpaRank: finalEight.metrics.defEpaPerPlay.rank,
          netEpaRank: finalEight.metrics.netEpaPerPlay.rank,
        }
      : null,
    market: market?.winTotal != null ? { winTotal: market.winTotal } : null,
    schedule: getWarrenSharpScheduleProfile(team.abbr),
    vsin: getNflVsinGuideTeam(team.abbr),
    offseason: getNflOffseasonProfile(team.abbr) ?? null,
  };
}

/** Deterministic: model rank ascending, unrated teams last, name as tiebreaker. */
function byModelRank(a: NflGuideRecord, b: NflGuideRecord) {
  const rankA = a.model?.rank ?? Number.POSITIVE_INFINITY;
  const rankB = b.model?.rank ?? Number.POSITIVE_INFINITY;
  return rankA - rankB || a.name.localeCompare(b.name);
}

export const NFL_GUIDE_RECORDS: NflGuideRecord[] = NFL_CANONICAL_TEAMS
  .map(buildRecord)
  .filter((record): record is NflGuideRecord => record !== null)
  .sort(byModelRank);

export const NFL_GUIDE_RECORD_BY_SLUG = new Map(
  NFL_GUIDE_RECORDS.map((record) => [record.slug, record]),
);

export type NflGuideDivision = {
  division: NflGuideDivisionName;
  conference: "AFC" | "NFC";
  teams: NflGuideRecord[];
};

export const NFL_GUIDE_DIVISIONS: NflGuideDivision[] = NFL_GUIDE_DIVISION_ORDER.map((division) => ({
  division,
  conference: division.startsWith("AFC") ? ("AFC" as const) : ("NFC" as const),
  teams: NFL_GUIDE_RECORDS.filter((record) => record.division === division).sort(byModelRank),
}));

export const NFL_GUIDE_CONFERENCES = (["AFC", "NFC"] as const).map((conference) => ({
  conference,
  divisions: NFL_GUIDE_DIVISIONS.filter((entry) => entry.conference === conference),
}));

/**
 * Provenance for the model spine, surfaced in the guide header so the Stage-1
 * validation status is never implied to be a finished public model.
 */
export const NFL_GUIDE_MODEL_STATUS = {
  modelVersion: NFL_PRESEASON_RATINGS_META?.modelVersion ?? null,
  validationStatus: NFL_PRESEASON_RATINGS_META?.validationStatus ?? null,
  generatedAt: NFL_PRESEASON_RATINGS_META?.generatedAt ?? null,
  season: NFL_GUIDE_SEASON,
  sourceSeason: NFL_RATINGS_SOURCE_SEASON,
} as const;

export function formatNflRecord(previousSeason: NflGuidePreviousSeason): string {
  const { wins, losses, ties } = previousSeason;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function formatSignedNumber(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

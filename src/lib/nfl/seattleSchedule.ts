import { z } from "zod";
import rawSeattleSchedule from "../../data/nflSeattleSchedule2026.json";
import { NFL_GUIDE_RECORDS, type NflGuideRecord } from "@/lib/nfl/guideRecord";
import { getWarrenSharpScheduleProfile } from "@/lib/nfl/warrenSharpSchedule2026";

/**
 * Seattle-only pilot schedule contract. Joins three already-approved sources
 * (ESPN schedule snapshot, Warren Sharp rest-edge data, the v0.3 guide
 * record) into one normalized per-game record. No probability field exists
 * here: see docs/nfl-guide/seattle-probability-proposal.md for the
 * unimplemented probability contract awaiting approval.
 */

const gameSchema = z.object({
  id: z.string(),
  week: z.number(),
  date: z.string(),
  opponentAbbr: z.string(),
  opponentName: z.string(),
  homeAway: z.enum(["home", "away", "neutral"]),
  venue: z.string().nullable(),
});

const scheduleFileSchema = z.object({
  source: z.object({
    title: z.string(),
    endpoint: z.string(),
    team: z.string(),
    season: z.number(),
    snapshotAt: z.string(),
  }),
  games: z.array(gameSchema),
});

const parsed = scheduleFileSchema.parse(rawSeattleSchedule);

export const SEATTLE_SCHEDULE_SOURCE = Object.freeze({
  title: parsed.source.title,
  season: parsed.source.season,
  snapshotAt: parsed.source.snapshotAt,
});

export type NflRestLabel = "advantage" | "disadvantage" | "neutral";

export type NflSeattleScheduleGame = {
  week: number;
  date: string;
  opponentAbbr: string;
  opponentName: string;
  opponentLogoUrl: string | null;
  opponentPrimaryColor: string | null;
  homeAway: "home" | "away" | "neutral";
  venue: string | null;
  isDivisionalGame: boolean;
  opponent: {
    v03Rank: number | null;
    v03PublicRating: number | null;
    v03OffenseRating: number | null;
    v03DefenseRating: number | null;
    marketWinTotal: number | null;
  };
  matchupEdge: {
    /** Seattle offense rating minus opponent defense rating (positive favors Seattle). */
    offenseVsOpponentDefense: number | null;
    /** Seattle defense rating minus opponent offense rating (positive favors Seattle). */
    defenseVsOpponentOffense: number | null;
    /** Seattle public rating minus opponent public rating (positive favors Seattle). Not a probability. */
    overallRatingGap: number | null;
  };
  rest: {
    /** Warren Sharp's net rest-day edge for this game (Seattle relative to opponent). */
    edgeDays: number;
    label: NflRestLabel;
    /** True when fewer than 6 days separate this game from Seattle's previous game. */
    isShortWeek: boolean;
  };
  rationale: string;
};

export type NflSeattleByeWeek = { week: number };

const REST_NEUTRAL_BAND = 1;
const SHORT_WEEK_MAX_DAYS = 6;

function restLabel(edgeDays: number): NflRestLabel {
  if (edgeDays > REST_NEUTRAL_BAND) return "advantage";
  if (edgeDays < -REST_NEUTRAL_BAND) return "disadvantage";
  return "neutral";
}

function daysBetween(laterIso: string, earlierIso: string): number {
  const later = new Date(laterIso).getTime();
  const earlier = new Date(earlierIso).getTime();
  return Math.round((later - earlier) / (1000 * 60 * 60 * 24));
}

function buildRationale(params: {
  opponentName: string;
  homeAway: "home" | "away" | "neutral";
  opponent: NflSeattleScheduleGame["opponent"];
  matchupEdge: NflSeattleScheduleGame["matchupEdge"];
  rest: NflSeattleScheduleGame["rest"];
}): string {
  const { opponentName, homeAway, opponent, matchupEdge, rest } = params;
  const locationPhrase = homeAway === "home" ? "Home" : homeAway === "away" ? "Away" : "Neutral site";
  const parts = [`${locationPhrase} vs. ${opponentName}${opponent.v03Rank != null ? ` (NFL v0.3 rank #${opponent.v03Rank})` : ""}.`];

  if (matchupEdge.overallRatingGap != null) {
    const gap = matchupEdge.overallRatingGap;
    parts.push(
      gap >= 0.5
        ? `Seattle rates ${gap.toFixed(1)} points higher overall.`
        : gap <= -0.5
          ? `Opponent rates ${Math.abs(gap).toFixed(1)} points higher overall.`
          : "Overall ratings are close.",
    );
  }

  if (rest.label !== "neutral") {
    parts.push(
      rest.label === "advantage"
        ? `Seattle has a rest advantage (${rest.edgeDays > 0 ? "+" : ""}${rest.edgeDays} days).`
        : `Seattle has a rest disadvantage (${rest.edgeDays} days).`,
    );
  }
  if (rest.isShortWeek) parts.push("Short week.");

  return parts.join(" ");
}

function findOpponentRecord(abbr: string): NflGuideRecord | null {
  return NFL_GUIDE_RECORDS.find((record) => record.abbr === abbr) ?? null;
}

function buildGame(
  raw: z.infer<typeof gameSchema>,
  seattle: NflGuideRecord,
  previousGameDate: string | null,
): NflSeattleScheduleGame {
  const opponentRecord = findOpponentRecord(raw.opponentAbbr);
  const sharpWeek = getWarrenSharpScheduleProfile("sea")?.weeklyRestEdges.find((w) => w.week === raw.week) ?? null;
  const edgeDays = sharpWeek?.restEdgeDays ?? 0;

  const opponent: NflSeattleScheduleGame["opponent"] = {
    v03Rank: opponentRecord?.model?.rank ?? null,
    v03PublicRating: opponentRecord?.model?.publicRating ?? null,
    v03OffenseRating: opponentRecord?.model?.offenseRating ?? null,
    v03DefenseRating: opponentRecord?.model?.defenseRating ?? null,
    marketWinTotal: opponentRecord?.market?.winTotal ?? null,
  };

  const matchupEdge: NflSeattleScheduleGame["matchupEdge"] = {
    offenseVsOpponentDefense:
      seattle.model && opponent.v03DefenseRating != null
        ? seattle.model.offenseRating - opponent.v03DefenseRating
        : null,
    defenseVsOpponentOffense:
      seattle.model && opponent.v03OffenseRating != null
        ? seattle.model.defenseRating - opponent.v03OffenseRating
        : null,
    overallRatingGap:
      seattle.model && opponent.v03PublicRating != null
        ? seattle.model.publicRating - opponent.v03PublicRating
        : null,
  };

  const rest: NflSeattleScheduleGame["rest"] = {
    edgeDays,
    label: restLabel(edgeDays),
    isShortWeek: previousGameDate != null && daysBetween(raw.date, previousGameDate) < SHORT_WEEK_MAX_DAYS,
  };

  return {
    week: raw.week,
    date: raw.date,
    opponentAbbr: raw.opponentAbbr,
    opponentName: opponentRecord?.name ?? raw.opponentName,
    opponentLogoUrl: opponentRecord?.logoUrl ?? null,
    opponentPrimaryColor: opponentRecord?.primaryColor ?? null,
    homeAway: raw.homeAway,
    venue: raw.venue,
    isDivisionalGame: opponentRecord != null && opponentRecord.division === seattle.division,
    opponent,
    matchupEdge,
    rest,
    rationale: buildRationale({ opponentName: opponentRecord?.name ?? raw.opponentName, homeAway: raw.homeAway, opponent, matchupEdge, rest }),
  };
}

function buildSeattleSchedule(): NflSeattleScheduleGame[] {
  const seattle = findOpponentRecord("sea");
  if (!seattle) return [];

  const sortedRaw = [...parsed.games].sort((a, b) => a.week - b.week);
  const games: NflSeattleScheduleGame[] = [];
  let previousDate: string | null = null;
  for (const raw of sortedRaw) {
    games.push(buildGame(raw, seattle, previousDate));
    previousDate = raw.date;
  }
  return games;
}

export const NFL_SEATTLE_SCHEDULE_2026: NflSeattleScheduleGame[] = buildSeattleSchedule();

/** Seattle's 2026 bye week, derived from the Warren Sharp weekly data (the only source that marks it). */
export const NFL_SEATTLE_BYE_WEEK_2026: NflSeattleByeWeek | null = (() => {
  const byeWeek = getWarrenSharpScheduleProfile("sea")?.weeklyRestEdges.find((w) => w.bye);
  return byeWeek ? { week: byeWeek.week } : null;
})();

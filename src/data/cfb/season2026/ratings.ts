import generated from "../../../../data/generated/cfb/2026-preseason-ratings-v1.json";
import type { CfbJkbRatings } from "../types";

type GeneratedV1Row = {
  teamId: string;
  rank: number;
  jkbPower: number;
  jkbOffense: number;
  jkbDefense: number;
  sosPlayedRating: null;
  sosPlayedRank: null;
  sosRemainingRating: number;
  sosRemainingRank: number;
};

const rows = generated.rows as GeneratedV1Row[];

/** Generated JKB preseason v1 ratings. Do not hand-edit; run npm run cfb:build-v1. */
export const CFB_V1_RATINGS_2026: CfbJkbRatings[] = rows.map((row) => ({
  teamId: row.teamId,
  jkbRank: row.rank,
  previousJkbRank: null,
  jkbPowerRating: row.jkbPower,
  offensiveRating: row.jkbOffense,
  defensiveRating: row.jkbDefense,
  sosPlayedRating: row.sosPlayedRating,
  sosPlayedRank: row.sosPlayedRank,
  sosRemainingRating: row.sosRemainingRating,
  sosRemainingRank: row.sosRemainingRank,
}));

export const CFB_V1_RATINGS_BY_TEAM: Record<string, CfbJkbRatings> = Object.fromEntries(
  CFB_V1_RATINGS_2026.map((rating) => [rating.teamId, rating]),
);

export const CFB_V1_MODEL_VERSION = generated.modelVersion;

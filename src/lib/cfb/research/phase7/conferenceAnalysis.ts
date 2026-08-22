import { MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { groupBy, mae } from "./statsUtils";
import type { MissDatasetRow } from "./types";

export type ConferenceAccuracyRow = {
  conference: string;
  n: number;
  modelMae: number | null;
  marketMae: number | null;
  modelMinusMarketMae: number | null;
};

function toRow(label: string, rows: readonly MissDatasetRow[]): ConferenceAccuracyRow {
  const modelMaeVal = mae(rows.map((r) => r.modelMarginError));
  const marketMaeVal = mae(rows.filter((r) => r.marketMarginError !== null).map((r) => r.marketMarginError as number));
  const enough = rows.length >= MIN_BUCKET_SAMPLE_SIZE;
  return {
    conference: label,
    n: rows.length,
    modelMae: enough ? modelMaeVal : null,
    marketMae: enough ? marketMaeVal : null,
    modelMinusMarketMae: enough && modelMaeVal !== null && marketMaeVal !== null ? modelMaeVal - marketMaeVal : null,
  };
}

export type ConferenceAnalysisResult = {
  byHomeConference: ConferenceAccuracyRow[];
  conferenceVsConference: ConferenceAccuracyRow[]; // same conference on both sides
  nonconference: ConferenceAccuracyRow;
  overallConferenceGames: ConferenceAccuracyRow;
};

/** Section 14 — diagnostic only; conference is never added as a model feature here. */
export function buildConferenceAnalysis(rows: readonly MissDatasetRow[]): ConferenceAnalysisResult {
  const byHomeConferenceGroups = groupBy(
    rows.filter((r) => r.homeConference !== null),
    (r) => r.homeConference as string,
  );
  const byHomeConference = [...byHomeConferenceGroups.entries()]
    .map(([conference, group]) => toRow(conference, group))
    .sort((a, b) => b.n - a.n);

  const conferenceGames = rows.filter((r) => r.homeConference !== null && r.homeConference === r.awayConference);
  const conferenceVsConferenceGroups = groupBy(conferenceGames, (r) => r.homeConference as string);
  const conferenceVsConference = [...conferenceVsConferenceGroups.entries()]
    .map(([conference, group]) => toRow(conference, group))
    .sort((a, b) => b.n - a.n);

  const nonconferenceGames = rows.filter((r) => r.homeConference !== r.awayConference);

  return {
    byHomeConference,
    conferenceVsConference,
    nonconference: toRow("nonconference", nonconferenceGames),
    overallConferenceGames: toRow("conference_vs_conference_overall", conferenceGames),
  };
}

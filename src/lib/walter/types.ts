/**
 * Types for the /walter private research dashboard's public artifact
 * (public/data/walter/{season}/week-{NN}.json), produced by
 * scripts/publish-walter-week.mjs from the normalized captures written by
 * scripts/capture-walter-week.mjs (see scripts/lib/walter/normalizeGame.mjs
 * and diffCapture.mjs for the source of truth these mirror).
 */

export type WalterCaptureType = "wednesday" | "thursday" | "saturday" | "sunday";

export const WALTER_CAPTURE_TYPES: WalterCaptureType[] = ["wednesday", "thursday", "saturday", "sunday"];

export interface WalterTeamRef {
  name: string | null;
  abbr: string | null;
}

export interface WalterInjuryMention {
  team: "away" | "home";
  sourceLabel: string;
  sentence: string;
}

export interface WalterSourceBreakdownEntry {
  order: number;
  topic: string;
  concerns: "away" | "home" | "matchup";
  paraphrase: string;
  excerpt: string;
}

export interface WalterGameCapture {
  schemaVersion: string;
  season: number;
  week: number;
  captureType: WalterCaptureType;
  capturedAt: string;
  game: {
    gameId: string | null;
    away: WalterTeamRef;
    home: WalterTeamRef;
    kickoffEt: string | null;
    window: string;
  };
  source: {
    url: string;
    fetchedAt: string;
    detectedUpdateLabel: string | null;
  };
  snapshot: {
    thesis: string | null;
    teamAdvantage: { away: string | null; home: string | null };
    keyMatchup: string | null;
  };
  teamBreakdowns: { away: string[]; home: string[] };
  injuries: WalterInjuryMention[];
  uncommonAngles: string[];
  betting: {
    pick: { team: string | null; spread: string | null; units: number | null };
    total: string | null;
    lineMovement: string | null;
    vegasAction: string | null;
  };
  sourceBreakdown: WalterSourceBreakdownEntry[];
  parseStatus: "ok" | "partial" | "failed";
  parseWarnings: string[];
}

export interface WalterCaptureDelta {
  comparedTo: WalterCaptureType | null;
  new: string[];
  changed: string[];
  removed: string[];
  newInjuries: string[];
  pickChanges: string[];
}

export interface WalterPublicGame {
  gameId: string;
  away: WalterTeamRef;
  home: WalterTeamRef;
  kickoffEt: string | null;
  window: string;
  captures: Partial<Record<WalterCaptureType, WalterGameCapture | null>>;
  deltas: Partial<Record<WalterCaptureType, WalterCaptureDelta | null>>;
}

export interface WalterIngestionStatus {
  status: "ok" | "partial" | "failed" | "pending";
  capturedAt: string | null;
  gamesDiscovered: number;
  gamesWritten: number;
  gamesFailed: number;
}

export interface WalterWeekArtifact {
  schemaVersion: string;
  season: number;
  week: number;
  publishedAt: string;
  ingestion: Record<WalterCaptureType, WalterIngestionStatus>;
  games: WalterPublicGame[];
}

export interface WalterSeasonIndex {
  schemaVersion: string;
  season: number;
  weeks: number[];
}

export function latestAvailableCapture(game: WalterPublicGame): WalterCaptureType | null {
  for (const type of [...WALTER_CAPTURE_TYPES].reverse()) {
    if (game.captures[type]) return type;
  }
  return null;
}

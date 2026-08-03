/**
 * Injury availability consumption (Phase 4).
 *
 * Reads the generated public/data/nfl/matchup-injuries.json artifact. nflverse
 * is never called from the browser.
 *
 * Three status fields are kept strictly separate and are never merged into one
 * designation:
 *
 *   gameStatus      OUT / DOUBTFUL / QUESTIONABLE / null  (official weekly report)
 *   practiceStatus  DNP / LIMITED / FULL / null           (participation only)
 *   reserveStatus   RESERVE / null                        (long-term roster)
 *
 * Reserve is generic on purpose: nflverse publishes no authoritative dictionary
 * for its RES/* sub-codes, so IR, PUP and NFI are not distinguished here.
 *
 * Snap shares are offensive OR defensive for the player's own unit. Special
 * teams is never used — not for the displayed percentage, not for relevance,
 * not for ordering.
 *
 * Attribution: nflverse; snap counts originate with Pro-Football-Reference.
 */

import type {
  NflGameStatus,
  NflInjuryEntry,
  NflInjuryResolver,
  NflInjuryUnit,
  NflPracticeStatus,
  NflReserveStatus,
} from "@/lib/nfl/matchupMetrics";

export const INJURIES_ARTIFACT_PATH = "/data/nfl/matchup-injuries.json";

type ArtifactSnapSeason = {
  offensePct: number | null;
  defensePct: number | null;
  gamesIncluded: number;
  gameIds: string[];
};

type ArtifactSnapLastGame = {
  gameId: string | null;
  week: number | null;
  offensePct: number | null;
  defensePct: number | null;
  played: boolean;
};

export type ArtifactInjuryEntry = {
  playerId: string;
  gsisId: string;
  pfrId: string | null;
  espnId: string | null;
  playerName: string;
  position: string;
  depthChartPosition: string | null;
  unit: NflInjuryUnit;
  gameStatus: NflGameStatus | null;
  practiceStatus: NflPracticeStatus | null;
  reserveStatus: NflReserveStatus | null;
  injuryDescription: string | null;
  snaps: { lastGame: ArtifactSnapLastGame; season: ArtifactSnapSeason };
};

export type ArtifactInjuryTeam = {
  nflverseAbbr: string;
  summary: { out: number; doubtful: number; questionable: number; reserve: number };
  entries: ArtifactInjuryEntry[];
};

export type InjuriesArtifact = {
  _meta: { schemaVersion: string; generatedAt: string; source: string; season: number | null; week: number | null };
  schemaVersion: string;
  attribution: string;
  currentSeason: number;
  dataSeason: number;
  dataWeek: number;
  /** True when the artifact's data predates the season the site is presenting. */
  isHistorical: boolean;
  availability: {
    currentSeasonAvailable: boolean;
    reason: string | null;
    seasons: { season: number; injuries: boolean; weeklyRosters: boolean; snapCounts: boolean; complete: boolean }[];
  };
  relevance: { rule: string; reserveMinSnapPct: number };
  teams: Record<string, ArtifactInjuryTeam>;
  provenance: unknown;
};

/** Compact secondary practice-participation label. Never replaces game status. */
export const PRACTICE_STATUS_LABELS: Record<NflPracticeStatus, string> = {
  DID_NOT_PARTICIPATE: "DNP",
  LIMITED: "Limited",
  FULL: "Full",
};

export const GAME_STATUS_LABELS: Record<NflGameStatus, string> = {
  OUT: "Out",
  DOUBTFUL: "Doubtful",
  QUESTIONABLE: "Questionable",
};

/**
 * The single designation shown in the Status column.
 *
 * Game status wins when present. Reserve is shown only when there is no game
 * designation. Practice status is never promoted into this slot — a player with
 * only a practice note is not injured and is already excluded upstream.
 */
export function displayStatusLabel(entry: {
  gameStatus: NflGameStatus | null;
  reserveStatus: NflReserveStatus | null;
}): string | null {
  if (entry.gameStatus != null) return GAME_STATUS_LABELS[entry.gameStatus];
  if (entry.reserveStatus === "RESERVE") return "Reserve";
  return null;
}

/** Status badge tone. Reserve is neutral: it is context, not a game designation. */
export function statusTone(entry: {
  gameStatus: NflGameStatus | null;
  reserveStatus: NflReserveStatus | null;
}): "out" | "doubtful" | "questionable" | "reserve" | null {
  if (entry.gameStatus === "OUT") return "out";
  if (entry.gameStatus === "DOUBTFUL") return "doubtful";
  if (entry.gameStatus === "QUESTIONABLE") return "questionable";
  if (entry.reserveStatus === "RESERVE") return "reserve";
  return null;
}

/**
 * Snap share display.
 *
 * null renders "N/A" (the player did not dress, or the join did not resolve —
 * nothing is known). 0 renders "0%" (he dressed and took no snaps on that side
 * of the ball, which is real information). The two are never conflated.
 */
export function formatSnapPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value)}%`;
}

/** The unit percentage for a player — offensive OR defensive, never combined. */
export function unitPct(
  unit: NflInjuryUnit,
  snaps: { offensePct: number | null; defensePct: number | null }
): number | null {
  const value = unit === "offense" ? snaps.offensePct : snaps.defensePct;
  return Number.isFinite(value) ? (value as number) : null;
}

function toEntry(source: ArtifactInjuryEntry): NflInjuryEntry {
  return {
    playerId: source.playerId,
    playerName: source.playerName,
    position: source.position,
    depthChartPosition: source.depthChartPosition ?? null,
    unit: source.unit,
    gameStatus: source.gameStatus ?? null,
    practiceStatus: source.practiceStatus ?? null,
    reserveStatus: source.reserveStatus ?? null,
    injuryDescription: source.injuryDescription ?? null,
    lastGameSnapPct: unitPct(source.unit, source.snaps.lastGame),
    seasonSnapPct: unitPct(source.unit, source.snaps.season),
  };
}

/**
 * Is the artifact safe to present as the current week's availability?
 *
 * The generator falls back to the most recent complete season when the current
 * one has not been published, and marks that `isHistorical`. Presenting a prior
 * season's injury report as though it were this week's would be a fabrication,
 * so the resolver returns nothing in that case and the section states plainly
 * that current-season data is not yet available.
 */
export function isCurrentSeasonData(artifact: InjuriesArtifact | null): boolean {
  if (!artifact) return false;
  return artifact.isHistorical !== true && artifact.availability?.currentSeasonAvailable === true;
}

/**
 * Build a team-slug resolver over the artifact.
 *
 * @param slugToAbbr maps the UI's guide slug to the canonical site abbreviation
 *                   the artifact is keyed by
 * @param allowHistorical opt-in for tests and historical replay; production
 *                        never presents a prior season as the current week
 */
export function createInjuryResolver(
  artifact: InjuriesArtifact | null,
  slugToAbbr: ReadonlyMap<string, string>,
  { allowHistorical = false }: { allowHistorical?: boolean } = {}
): NflInjuryResolver {
  if (!artifact?.teams) return () => null;
  if (!allowHistorical && !isCurrentSeasonData(artifact)) return () => null;

  return (teamSlug: string) => {
    const abbr = slugToAbbr.get(teamSlug);
    if (!abbr) return null;
    const team = artifact.teams[abbr];
    if (!team) return null;
    return {
      entries: team.entries.map(toEntry),
      summary: team.summary,
    };
  };
}

/** Compact "2 Out · 1 Doubtful · 3 Questionable · 2 Reserve" summary parts. */
export function summaryParts(summary: {
  out: number;
  doubtful: number;
  questionable: number;
  reserve: number;
}): string[] {
  const parts: string[] = [];
  if (summary.out > 0) parts.push(`${summary.out} Out`);
  if (summary.doubtful > 0) parts.push(`${summary.doubtful} Doubtful`);
  if (summary.questionable > 0) parts.push(`${summary.questionable} Questionable`);
  if (summary.reserve > 0) parts.push(`${summary.reserve} Reserve`);
  return parts;
}

/** One-line explanation of why the section is empty, when it is. */
export function describeUnavailable(artifact: InjuriesArtifact | null): string {
  if (!artifact) return "Injury report not connected.";
  if (!isCurrentSeasonData(artifact)) {
    return (
      artifact.availability?.reason ??
      `${artifact.currentSeason} injury and snap data has not been published yet.`
    );
  }
  return "No reported injuries.";
}

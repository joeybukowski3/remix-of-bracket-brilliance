/**
 * WU2.2 -- pure core for building a production SubjectIdentitySource from
 * already-parsed repo artifacts (nflverse weekly rosters, depth charts,
 * public/data/nfl/coaching-ratings.json). No filesystem/network access here
 * -- see nfl-evidence-subject-identity-loader.ts for the thin I/O wrapper
 * that reads the three source files and calls buildSubjectIdentitySource().
 *
 * Reuses existing repo identity engines rather than building new ones:
 *   - normalizeRosterTeamAbbr (nfl-roster-identity.mjs) for CSV team-code
 *     normalization (JAC/JAX, LA/LAR, WAS/WSH, AZ/ARI, etc.).
 *   - normalizeNflPropName (nfl-prop-name-normalizer.mjs) to detect
 *     duplicate/collision-prone normalized names within a team.
 *
 * Temporal safety (see module docstring in the architecture doc and the
 * WU2.2 work order):
 *   - roster_weekly_<season>.csv is the only source with an explicit week
 *     column; selectRosterWeek() NEVER picks a week greater than requested
 *     ("no future-week leakage") -- it prefers an exact match, else the
 *     latest prior week in the same season, else null (unavailable).
 *   - depth_charts_<season>.csv carries no week column at all (it is a
 *     single rolling "current" snapshot) -- it is used ONLY to backfill a
 *     missing `position` on an already roster-resolved player, never as a
 *     source of roster membership or team assignment by itself.
 *   - coaching-ratings.json is a current-season snapshot; it is only trusted
 *     when its `_meta.season` matches the requested season. A prior-season
 *     artifact is never used to answer "who coaches this team now".
 */

import { normalizeRosterTeamAbbr } from "./nfl-roster-identity.mjs";
import { normalizeNflPropName } from "./nfl-prop-name-normalizer.mjs";
import type {
  SubjectCoachEntry,
  SubjectIdentitySource,
  SubjectIdentitySourceMeta,
  SubjectIdentitySourceStatus,
  SubjectRosterEntry,
} from "./nfl-evidence-types";

export interface WeeklyRosterRow {
  season: string | number;
  week: string | number;
  team: string;
  gsis_id?: string | null;
  pfr_id?: string | null;
  espn_id?: string | null;
  full_name: string;
  position?: string | null;
  depth_chart_position?: string | null;
  status?: string | null;
}

export interface DepthChartRow {
  team: string;
  player_name: string;
  gsis_id?: string | null;
  pos_abb?: string | null;
}

export interface CoachingRatingsCoach {
  coach_id: string;
  coach: string;
  team: string;
}

export interface CoachingRatingsArtifact {
  _meta?: { season?: number | null } | null;
  coaches?: CoachingRatingsCoach[] | null;
}

export interface GameFacts {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string; // lowercase abbr
  awayTeam: string; // lowercase abbr
}

export interface BuildSubjectIdentitySourceInput {
  gameFacts: GameFacts;
  weeklyRosterRows: readonly WeeklyRosterRow[]; // may span multiple weeks/seasons; filtered internally
  depthChartRows: readonly DepthChartRow[]; // current-snapshot only, no week column
  coachingRatings: CoachingRatingsArtifact | null;
  now?: () => string; // injectable clock for deterministic tests; defaults to real time
}

/**
 * Picks the roster week to use for a pregame snapshot. Never selects a week
 * later than requested (would leak future roster information into an
 * earlier/current pregame evidence context). Prefers an exact match, else
 * the latest available prior week in the same season.
 */
export function selectRosterWeek(availableWeeks: readonly number[], requestedWeek: number): { weekUsed: number | null; isCurrentWeek: boolean } {
  const eligible = availableWeeks.filter((week) => week <= requestedWeek);
  if (eligible.length === 0) return { weekUsed: null, isCurrentWeek: false };
  if (eligible.includes(requestedWeek)) return { weekUsed: requestedWeek, isCurrentWeek: true };
  const latestPrior = Math.max(...eligible);
  return { weekUsed: latestPrior, isCurrentWeek: false };
}

function buildDepthChartPositionIndex(depthChartRows: readonly DepthChartRow[]): Map<string, string> {
  // Keyed by `${team}|${normalizedName}` -- last row wins (the cache is a
  // single current snapshot, not a history, so there is no earlier-wins rule
  // to preserve).
  const index = new Map<string, string>();
  for (const row of depthChartRows) {
    const team = normalizeRosterTeamAbbr(row.team);
    const key = `${team}|${normalizeNflPropName(row.player_name)}`;
    if (row.pos_abb) index.set(key, row.pos_abb);
  }
  return index;
}

function buildPlayers(
  weeklyRosterRows: readonly WeeklyRosterRow[],
  depthChartRows: readonly DepthChartRow[],
  gameFacts: GameFacts
): { players: SubjectRosterEntry[]; weekUsed: number | null; isCurrentWeek: boolean; rosterSource: "weekly_roster" | "none" } {
  // Deliberately LEAGUE-WIDE, not scoped to this game's two teams: the whole
  // point of subject-identity validation is to catch a real player who is
  // rostered on a THIRD team being attributed to this game. Scoping the
  // source to just home/away would make that case invisible (it would look
  // like "unknown player" instead of "wrong-team player").
  const rowsForSeason = weeklyRosterRows.filter((row) => Number(row.season) === gameFacts.season);
  const availableWeeks = [...new Set(rowsForSeason.map((row) => Number(row.week)))].filter((week) => Number.isInteger(week));

  const { weekUsed, isCurrentWeek } = selectRosterWeek(availableWeeks, gameFacts.week);
  if (weekUsed == null) {
    return { players: [], weekUsed: null, isCurrentWeek: false, rosterSource: "none" };
  }

  const depthChartPositionIndex = buildDepthChartPositionIndex(depthChartRows);
  const rowsForWeek = rowsForSeason.filter((row) => Number(row.week) === weekUsed);

  // Collapse exact-duplicate rows for the same player (same gsis/pfr/espn id)
  // -- a genuine name collision between two DIFFERENT players is preserved
  // as two separate entries so validateSubjectIdentities() can flag it.
  const byPlayerId = new Map<string, SubjectRosterEntry>();
  for (const row of rowsForWeek) {
    const team = normalizeRosterTeamAbbr(row.team);
    const canonicalName = String(row.full_name ?? "").trim();
    if (!canonicalName) continue;
    const playerId = row.gsis_id || row.pfr_id || row.espn_id || `${team}:${normalizeNflPropName(canonicalName)}`;
    if (byPlayerId.has(playerId)) continue;
    const depthChartKey = `${team}|${normalizeNflPropName(canonicalName)}`;
    byPlayerId.set(playerId, {
      playerId,
      canonicalName,
      team,
      position: row.position || row.depth_chart_position || depthChartPositionIndex.get(depthChartKey) || null,
      rosterStatus: row.status || null,
      sourceRecord: "weekly_roster",
      week: weekUsed,
    });
  }

  return { players: [...byPlayerId.values()], weekUsed, isCurrentWeek, rosterSource: "weekly_roster" };
}

function buildCoaches(
  coachingRatings: CoachingRatingsArtifact | null,
  gameFacts: GameFacts
): { coaches: SubjectCoachEntry[]; seasonUsed: number | null; isCurrentSeason: boolean; coachSource: "coaching_ratings" | "none" } {
  const artifactSeason = coachingRatings?._meta?.season ?? null;
  if (!coachingRatings || artifactSeason == null || artifactSeason !== gameFacts.season) {
    // A missing artifact, or one from a season other than this game's, is
    // never trusted for "who coaches this team now" -- unavailable rather
    // than guessed.
    return { coaches: [], seasonUsed: artifactSeason, isCurrentSeason: false, coachSource: "none" };
  }

  // League-wide, for the same reason as buildPlayers() above -- a coach
  // conclusively associated with a third team must be visible here so the
  // validator can reject the wrong-team association, not just report
  // "unresolved".
  const coaches = (coachingRatings.coaches ?? [])
    .map(
      (entry): SubjectCoachEntry => ({
        coachId: entry.coach_id,
        canonicalName: entry.coach,
        team: normalizeRosterTeamAbbr(entry.team),
        // Only head-coach ratings exist in this artifact -- no
        // coordinator/staff source is authoritative in this repo, so no
        // other role is ever inferred (per WU2.2 scope).
        role: "head_coach",
        season: artifactSeason,
      })
    );

  return { coaches, seasonUsed: artifactSeason, isCurrentSeason: true, coachSource: "coaching_ratings" };
}

function deriveStatus(input: {
  rosterWeekUsed: number | null;
  rosterIsCurrentWeek: boolean;
  coachIsCurrentSeason: boolean;
  coachCount: number;
}): SubjectIdentitySourceStatus {
  const rosterAvailable = input.rosterWeekUsed != null;
  const coachAvailable = input.coachIsCurrentSeason && input.coachCount > 0;

  if (!rosterAvailable && !coachAvailable) return "unavailable";
  if (rosterAvailable && !input.rosterIsCurrentWeek) return "stale"; // fell back to a prior week
  if (rosterAvailable && coachAvailable) return "available";
  return "partial"; // exactly one of roster/coach is usable
}

/**
 * Builds a SubjectIdentitySource for one game from already-parsed source
 * rows. Pure/deterministic given fixed inputs; never mutates its arguments.
 */
export function buildSubjectIdentitySource(input: BuildSubjectIdentitySourceInput): SubjectIdentitySource {
  const now = input.now ?? (() => new Date().toISOString());
  const { gameFacts } = input;

  const { players, weekUsed, isCurrentWeek, rosterSource } = buildPlayers(input.weeklyRosterRows, input.depthChartRows, gameFacts);
  const { coaches, seasonUsed, isCurrentSeason, coachSource } = buildCoaches(input.coachingRatings, gameFacts);

  const notes: string[] = [];
  if (weekUsed == null) notes.push(`no pregame-safe roster week available for season ${gameFacts.season} week ${gameFacts.week}`);
  else if (!isCurrentWeek) notes.push(`roster fell back to week ${weekUsed} (requested week ${gameFacts.week} unavailable)`);
  if (input.depthChartRows.length === 0) notes.push("depth chart rows unavailable -- position enrichment limited to weekly roster data");
  if (!isCurrentSeason) notes.push(`coaching-ratings artifact season (${seasonUsed ?? "unknown"}) does not match requested season (${gameFacts.season})`);

  const meta: SubjectIdentitySourceMeta = {
    status: deriveStatus({ rosterWeekUsed: weekUsed, rosterIsCurrentWeek: isCurrentWeek, coachIsCurrentSeason: isCurrentSeason, coachCount: coaches.length }),
    season: gameFacts.season,
    requestedWeek: gameFacts.week,
    rosterWeekUsed: weekUsed,
    rosterIsCurrentWeek: isCurrentWeek,
    rosterSource,
    depthChartSource: input.depthChartRows.length > 0 ? "depth_chart" : "none",
    coachSeasonUsed: seasonUsed,
    coachIsCurrentSeason: isCurrentSeason,
    coachSource,
    generatedAt: now(),
    notes,
  };

  return { players, coaches, meta };
}

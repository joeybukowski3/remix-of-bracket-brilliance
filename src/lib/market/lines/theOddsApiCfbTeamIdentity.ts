/**
 * Deterministic mapping from a The Odds API college-football team name to a JKB
 * CFB team id.
 *
 * The Odds API returns full names with mascot ("Alabama Crimson Tide", "Ohio
 * State Buckeyes"). Resolution is a fixed, reviewed sequence — never fuzzy:
 *
 *   1. exact match on `"<name> <mascot>"` built from {@link CFB_TEAM_METADATA};
 *   2. exact match through {@link getJkbTeamIdForCfbdName} (covers the CFBD
 *      controlled name + its reviewed alias list);
 *   3. if the provided name ends with a known FBS mascot, strip it and retry
 *      step 2 on the remaining school name.
 *
 * Anything else returns `null`; the caller fails the game closed and reports it
 * unmatched rather than guessing.
 */

import {
  getJkbTeamIdForCfbdName,
  normalizeCfbdTeamName,
} from "../../../data/cfb/externalTeamMapping";
import { CFB_TEAM_METADATA } from "../../../data/cfb/teamMetadata";

const JKB_ID_BY_NAME_AND_MASCOT = new Map<string, string>();
const KNOWN_MASCOTS = new Set<string>();

for (const team of CFB_TEAM_METADATA) {
  JKB_ID_BY_NAME_AND_MASCOT.set(
    normalizeCfbdTeamName(`${team.name} ${team.mascot}`),
    team.id,
  );
  KNOWN_MASCOTS.add(normalizeCfbdTeamName(team.mascot));
}

function stripTrailingMascot(normalized: string): string | null {
  for (const mascot of KNOWN_MASCOTS) {
    if (normalized === mascot) continue;
    if (normalized.endsWith(` ${mascot}`)) {
      return normalized.slice(0, normalized.length - mascot.length - 1).trim();
    }
  }
  return null;
}

export function resolveTheOddsApiCfbTeamId(
  teamName: string | null | undefined,
): string | null {
  const raw = String(teamName ?? "").trim();
  if (raw === "") return null;

  const normalized = normalizeCfbdTeamName(raw);

  const withMascot = JKB_ID_BY_NAME_AND_MASCOT.get(normalized);
  if (withMascot !== undefined) return withMascot;

  const direct = getJkbTeamIdForCfbdName(raw);
  if (direct !== null) return direct;

  const stripped = stripTrailingMascot(normalized);
  if (stripped !== null && stripped !== "") {
    const viaStrip = getJkbTeamIdForCfbdName(stripped);
    if (viaStrip !== null) return viaStrip;
  }

  return null;
}

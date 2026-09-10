/**
 * Canonical NFL team colour resolver (presentation only).
 *
 * The matchup analyzer needs one honest source for "this team's colour" so the
 * directional comparison-bar fill can point at the favoured team in its own
 * palette rather than an ad-hoc per-component approximation. Every colour here
 * is read straight from the existing static team data
 * (`NFL_GUIDE_TEAMS` → `nflPreseason2026`), the same source the crest/logo
 * infrastructure already uses. Nothing new is invented and no colour drives a
 * ranking, an edge or a model output — it is a fill hue and nothing else.
 *
 * When an abbreviation cannot be resolved the caller is expected to fall back to
 * the sheet's neutral comparison token (`--sheet-even`), never to guess.
 */

import { NFL_GUIDE_TEAM_BY_ABBR } from "@/lib/nfl/guide2026";

/** Alternate abbreviations that appear in schedule / odds feeds. */
const ABBR_ALIASES: Record<string, string> = {
  was: "wsh",
  wft: "wsh",
  jac: "jax",
  la: "lar",
  lara: "lar",
  sd: "lac",
  oak: "lv",
  lvr: "lv",
  stl: "lar",
  gnb: "gb",
  kan: "kc",
  nwe: "ne",
  nor: "no",
  sfo: "sf",
  tam: "tb",
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeAbbr(abbr: string): string {
  const lower = abbr.trim().toLowerCase();
  return ABBR_ALIASES[lower] ?? lower;
}

/**
 * Resolve a team abbreviation to its canonical primary colour as a hex string,
 * or `null` when the abbreviation is unknown or the stored colour is unusable.
 */
export function nflTeamColor(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const team = NFL_GUIDE_TEAM_BY_ABBR.get(normalizeAbbr(abbr));
  const color = team?.color;
  if (!color || !HEX.test(color)) return null;
  return color;
}

/**
 * Colour for an already-resolved matchup team. Prefers the colour carried on the
 * normalized team record and falls back to the abbreviation lookup, so a team
 * built from a source without a colour still resolves.
 */
export function nflTeamColorFor(
  team: { abbr?: string | null; color?: string | null } | null | undefined
): string | null {
  if (!team) return null;
  if (team.color && HEX.test(team.color)) return team.color;
  return nflTeamColor(team.abbr);
}

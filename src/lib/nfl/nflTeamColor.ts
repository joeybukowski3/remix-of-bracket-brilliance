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

/**
 * Presentation-only brand accents for comparisons where two primary colours
 * are hard to distinguish. Ordered from the team's strongest non-primary
 * identity colour to quieter fallbacks; white is intentionally omitted because
 * these colours are drawn on a light chart surface.
 */
const NFL_TEAM_CHART_ACCENTS: Record<string, readonly string[]> = {
  ari: ["#000000", "#ffb612"], atl: ["#000000", "#a5acaf"],
  bal: ["#9e7c0c", "#c60c30"], buf: ["#c60c30", "#002244"],
  car: ["#101820", "#bfc0bf"], chi: ["#c83803"],
  cin: ["#000000"], cle: ["#ff3c00", "#311d00"],
  dal: ["#869397", "#7f9695"], den: ["#002244"],
  det: ["#101820", "#b0b7bc"], gb: ["#ffb612"],
  hou: ["#a71930"], ind: ["#1d252c", "#a2aaad"],
  jax: ["#d7a22a", "#101820"], kc: ["#ffb81c"],
  lac: ["#ffc20e", "#001433"], lar: ["#ffd100", "#ff8200"],
  lv: ["#a5acaf"], mia: ["#fc4c02", "#005778"],
  min: ["#ffc62f", "#000000"], ne: ["#c60c30", "#b0b7bc"],
  no: ["#101820", "#d3bc8d"], nyg: ["#a71930", "#a5acaf"],
  nyj: ["#000000"], phi: ["#a5acaf", "#000000"],
  pit: ["#101820"], sf: ["#b3995d", "#000000"],
  sea: ["#69be28", "#a5acaf"], tb: ["#ff7900", "#0a0a08"],
  ten: ["#c8102e", "#4b92db"], wsh: ["#ffb612", "#000000"],
};

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

/** Available non-primary chart colours for an already-resolved NFL team. */
export function nflTeamChartAccentsFor(
  team: { abbr?: string | null } | null | undefined
): readonly string[] {
  if (!team?.abbr) return [];
  return NFL_TEAM_CHART_ACCENTS[normalizeAbbr(team.abbr)] ?? [];
}

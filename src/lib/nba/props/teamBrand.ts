/**
 * Team identity for the props board: colors, a logo address and the contrast arithmetic that keeps them legible.
 *
 * Colors are each franchise's primary and secondary brand colors. `primary` is always dark enough to read as an accent
 * line against the white row (checked by a test for all 30 teams), so a pale brand color is never used for it; badge lettering
 * is white or dark ink, whichever reads better on the fill (readableOn).
 * Browser-safe, no React.
 *
 * Logos: the site already shows team logos from ESPN's public image host for MLB, NFL and college teams
 * (mlbTeamLogos.ts, nflPreseason2026.ts, ncaaTeams.ts). NBA uses the same host and path convention and no image is bundled
 * or copied into the repository. The page never depends on it: an image that fails to load is replaced by a badge in the
 * team's own colors (TeamLogo.tsx).
 */
import { canonicalTeamCode } from "./canonical";

export interface TeamBrand {
  primary: string;
  secondary: string;
  /** The slug in ESPN's NBA logo path (it differs from the franchise code for a few teams). */
  logoSlug: string;
}

/** Portland's red is deepened a shade from its brand value so white lettering clears AA on it. */
export const TEAM_BRANDS: Readonly<Record<string, TeamBrand>> = Object.freeze({
  ATL: { primary: "#C8102E", secondary: "#C1D32F", logoSlug: "atl" },
  BOS: { primary: "#007A33", secondary: "#BA9653", logoSlug: "bos" },
  BKN: { primary: "#000000", secondary: "#FFFFFF", logoSlug: "bkn" },
  CHA: { primary: "#1D1160", secondary: "#00788C", logoSlug: "cha" },
  CHI: { primary: "#CE1141", secondary: "#000000", logoSlug: "chi" },
  CLE: { primary: "#860038", secondary: "#FDBB30", logoSlug: "cle" },
  DAL: { primary: "#00538C", secondary: "#B8C4CA", logoSlug: "dal" },
  DEN: { primary: "#0E2240", secondary: "#FEC524", logoSlug: "den" },
  DET: { primary: "#C8102E", secondary: "#1D42BA", logoSlug: "det" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C", logoSlug: "gs" },
  HOU: { primary: "#CE1141", secondary: "#C4CED4", logoSlug: "hou" },
  IND: { primary: "#002D62", secondary: "#FDBB30", logoSlug: "ind" },
  LAC: { primary: "#C8102E", secondary: "#1D428A", logoSlug: "lac" },
  LAL: { primary: "#552583", secondary: "#FDB927", logoSlug: "lal" },
  MEM: { primary: "#5D76A9", secondary: "#12173F", logoSlug: "mem" },
  MIA: { primary: "#98002E", secondary: "#F9A01B", logoSlug: "mia" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6", logoSlug: "mil" },
  MIN: { primary: "#0C2340", secondary: "#236192", logoSlug: "min" },
  NOP: { primary: "#0C2340", secondary: "#C8102E", logoSlug: "no" },
  NYK: { primary: "#006BB6", secondary: "#F58426", logoSlug: "ny" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24", logoSlug: "okc" },
  ORL: { primary: "#0077C0", secondary: "#C4CED4", logoSlug: "orl" },
  PHI: { primary: "#006BB6", secondary: "#ED174C", logoSlug: "phi" },
  PHX: { primary: "#1D1160", secondary: "#E56020", logoSlug: "phx" },
  POR: { primary: "#D0112B", secondary: "#000000", logoSlug: "por" },
  SAC: { primary: "#5A2D81", secondary: "#63727A", logoSlug: "sac" },
  SAS: { primary: "#000000", secondary: "#C4CED4", logoSlug: "sa" },
  TOR: { primary: "#CE1141", secondary: "#000000", logoSlug: "tor" },
  UTA: { primary: "#002B5C", secondary: "#F9A01B", logoSlug: "utah" },
  WAS: { primary: "#002B5C", secondary: "#E31837", logoSlug: "wsh" },
});

/** Used when a team is missing or unknown: a neutral slate, so nothing is ever colored by guess. */
export const NEUTRAL_BRAND: TeamBrand = Object.freeze({ primary: "#475569", secondary: "#94A3B8", logoSlug: "" });

export const brandFor = (team: string | null | undefined): TeamBrand => {
  const code = team ? canonicalTeamCode(team) : null;
  return (code && TEAM_BRANDS[code]) || NEUTRAL_BRAND;
};

export const teamLogoUrl = (team: string | null | undefined): string | null => {
  const { logoSlug } = brandFor(team);
  return logoSlug ? `https://a.espncdn.com/i/teamlogos/nba/500/${logoSlug}.png` : null;
};

const channel = (hex: string, index: number): number => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((i) => {
    const c = channel(hex, i) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#RRGGBB" colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK = "#0F172A";

/** Whichever of white or dark ink reads better on a fill: the lettering of a team badge. */
export const readableOn = (fill: string): string => (contrastRatio("#FFFFFF", fill) >= contrastRatio(INK, fill) ? "#FFFFFF" : INK);

/** A color mixed toward white: `amount` is the share of the color kept (0-1). Opaque, so a frozen cell never shows what scrolls under it. */
export function tintOnWhite(hex: string, amount: number): string {
  const part = (i: number) => Math.round(255 - (255 - channel(hex, i)) * amount).toString(16).padStart(2, "0");
  return `#${part(0)}${part(1)}${part(2)}`.toUpperCase();
}

/** Share of the team color kept in the player cell's wash. Low enough that dark ink stays far above AA on every team. */
export const PLAYER_WASH_AMOUNT = 0.16;

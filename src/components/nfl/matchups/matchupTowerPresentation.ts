import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { nflTeamChartAccentsFor } from "@/lib/nfl/nflTeamColor";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const SIMILAR_COLOR_DISTANCE = 110;
const MIN_LIGHT_SURFACE_CONTRAST = 1.35;

type Rgb = { r: number; g: number; b: number };

function parseHex(color: string): Rgb | null {
  if (!HEX.test(color)) return null;
  const normalized = color.slice(1);
  const value = normalized.length === 3
    ? normalized.split("").map((digit) => digit + digit).join("")
    : normalized;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

/** A compact red-mean RGB distance, weighted to match human colour perception. */
function perceptualColorDistance(first: string, second: string): number {
  const a = parseHex(first);
  const b = parseHex(second);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const redMean = (a.r + b.r) / 2;
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return Math.sqrt(
    (2 + redMean / 256) * red * red
    + 4 * green * green
    + (2 + (255 - redMean) / 256) * blue * blue
  );
}

function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const linear = ([rgb.r, rgb.g, rgb.b] as const).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastAgainstWhite(color: string): number {
  const luminance = relativeLuminance(color);
  return luminance == null ? 0 : 1.05 / (luminance + 0.05);
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export type TowerComparisonColors = {
  away: string;
  home: string;
  awayUsesAlternate: boolean;
};

/**
 * Preserve both team primaries unless they are visually close. When they are,
 * home keeps its primary and away receives the most distinct usable brand
 * accent available for the light plotting surface.
 */
export function resolveTowerComparisonColors({
  awayTeam,
  homeTeam,
  awayPrimary,
  homePrimary,
  awayAlternates,
}: {
  awayTeam: NflMatchupTeam;
  homeTeam: NflMatchupTeam;
  awayPrimary: string;
  homePrimary: string;
  awayAlternates?: readonly string[];
}): TowerComparisonColors {
  const stableHomePrimary = HEX.test(homePrimary) ? homePrimary : homeTeam.color;
  if (perceptualColorDistance(awayPrimary, stableHomePrimary) >= SIMILAR_COLOR_DISTANCE) {
    return { away: awayPrimary, home: stableHomePrimary, awayUsesAlternate: false };
  }

  const candidates = awayAlternates ?? nflTeamChartAccentsFor(awayTeam);
  const distinctCandidates = [...new Set(candidates.map((color) => color.toLowerCase()))]
    .filter((color) => HEX.test(color))
    .filter((color) => color !== awayPrimary.toLowerCase())
    .filter((color) => contrastAgainstWhite(color) >= MIN_LIGHT_SURFACE_CONTRAST)
    .map((color) => ({ color, distance: perceptualColorDistance(color, stableHomePrimary) }));
  const alternate = distinctCandidates.find(({ distance }) => distance >= SIMILAR_COLOR_DISTANCE)?.color
    ?? [...distinctCandidates].sort((a, b) => b.distance - a.distance)[0]?.color;

  return {
    away: alternate ?? awayPrimary,
    home: stableHomePrimary,
    awayUsesAlternate: alternate != null,
  };
}

/** High-contrast rank text for a solid team-colour badge. */
export function towerColorText(color: string): "#ffffff" | "#0f172a" {
  const luminance = relativeLuminance(color);
  if (luminance == null) return "#ffffff";
  const whiteContrast = contrastRatio(luminance, 1);
  const darkContrast = contrastRatio(luminance, relativeLuminance("#0f172a") ?? 0);
  return darkContrast > whiteContrast ? "#0f172a" : "#ffffff";
}

/** Already-resolved presentation data. Charts never derive ranks or metric winners. */
export type MatchupTowerSidePresentation = {
  team: NflMatchupTeam;
  color: string;
  identityLabel: string;
  accessibleIdentityLabel?: string;
  formatted: string;
  rank: number | null;
  heightPercent: number | null;
};

export type MatchupTowerMetricPresentation = {
  id: string;
  label: string;
  shortLabel?: string;
  contextLabel?: string;
  pairingLabel?: string;
  away: MatchupTowerSidePresentation;
  home: MatchupTowerSidePresentation;
  badge?: { label: string; color: string };
};

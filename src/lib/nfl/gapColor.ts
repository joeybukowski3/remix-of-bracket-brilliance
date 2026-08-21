/**
 * White -> bright green scale for a model-vs-market spread gap badge, keyed
 * only to the magnitude of the gap (direction/sign is conveyed by the badge
 * text, e.g. "IND +6.7"). Used by both the Weekly Game Board and the Largest
 * Model-vs-Market Gaps list so the same numeric gap always renders the same
 * color in both places.
 */

const GAP_COLOR_CEILING = 10;
const WHITE = { r: 255, g: 255, b: 255 };
const BRIGHT_GREEN = { r: 16, g: 185, b: 129 };

export type GapBadgeColor = {
  backgroundColor: string;
  color: string;
};

const FALLBACK_COLOR: GapBadgeColor = { backgroundColor: "#f1f5f9", color: "#64748b" };
const READABLE_DARK_TEXT = "#0f172a";

export function modelMarketGapBadgeColor(absoluteGap: number | null): GapBadgeColor {
  if (absoluteGap === null) return FALLBACK_COLOR;
  const intensity = Math.min(Math.abs(absoluteGap), GAP_COLOR_CEILING) / GAP_COLOR_CEILING;
  const r = Math.round(WHITE.r + (BRIGHT_GREEN.r - WHITE.r) * intensity);
  const g = Math.round(WHITE.g + (BRIGHT_GREEN.g - WHITE.g) * intensity);
  const b = Math.round(WHITE.b + (BRIGHT_GREEN.b - WHITE.b) * intensity);
  return { backgroundColor: `rgb(${r} ${g} ${b})`, color: READABLE_DARK_TEXT };
}

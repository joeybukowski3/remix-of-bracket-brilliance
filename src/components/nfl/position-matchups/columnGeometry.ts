/**
 * Single source of truth for the Position Matchup table's column geometry.
 * Every column width lives here once, as a `clamp()` string, and is shared
 * by the <colgroup> (which drives the fixed table layout), the sticky Opp
 * column's `left` offset, and the responsive font/padding scale below --
 * nothing else in the table computes or duplicates a width, so header and
 * body cells can never drift out of alignment when a sort re-renders rows.
 */
// No spaces inside these clamp() strings: they double as CSS (inline `style`) and as
// Tailwind arbitrary-value class fragments (`text-[clamp(...)]`), and a space inside a
// className token breaks the DOM class list -- it gets read back as multiple classes.
export const POSITION_MATCHUP_COLUMN_WIDTH = {
  team: "clamp(48px,6vw,132px)",
  opponent: "clamp(56px,4vw,96px)",
  /** FOR / ALLOWED sub-columns. */
  sub: "clamp(48px,4.2vw,92px)",
  /** Wider than FOR/ALLOWED: the combined "Very Strong (+18)" rating label needs more room. */
  edge: "clamp(80px,7vw,168px)",
} as const;

/** The sticky Opp column's left offset must equal the Team column's rendered width exactly. */
export const POSITION_MATCHUP_OPPONENT_LEFT = POSITION_MATCHUP_COLUMN_WIDTH.team;

/** Responsive text/padding scale shared by header and body cells so both grow together on large screens. */
export const POSITION_MATCHUP_SCALE = {
  headerFontSize: "clamp(9px,0.62vw,11px)",
  bodyFontSize: "clamp(11px,0.78vw,15px)",
  edgePillFontSize: "clamp(8px,0.55vw,10px)",
  cellPaddingX: "clamp(2px,0.4vw,10px)",
} as const;

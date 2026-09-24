/**
 * Single source of truth for the Position Matchup table's column geometry.
 * Every column width lives here once, as a `clamp()` string, and is shared
 * by the <colgroup> (which drives the fixed table layout), the sticky Opp
 * column's `left` offset, and the responsive font/padding scale below --
 * nothing else in the table computes or duplicates a width, so header and
 * body cells can never drift out of alignment when a sort re-renders rows.
 */
export const POSITION_MATCHUP_COLUMN_WIDTH = {
  team: "clamp(48px,6vw,132px)",
  opponent: "clamp(56px,4vw,96px)",
  /** FOR / ALLOWED sub-columns. */
  sub: "clamp(48px,4.2vw,92px)",
  /** Wider than FOR/ALLOWED: the combined "Very Strong (+18)" rating label needs more room. */
  edge: "clamp(104px,7vw,168px)",
} as const;

/** Explicit table width prevents a spanning header from changing the fixed column layout. */
export const POSITION_MATCHUP_TABLE_WIDTH = `calc(${[
  POSITION_MATCHUP_COLUMN_WIDTH.team,
  POSITION_MATCHUP_COLUMN_WIDTH.opponent,
  ...Array.from({ length: 4 }, () => [POSITION_MATCHUP_COLUMN_WIDTH.sub, POSITION_MATCHUP_COLUMN_WIDTH.sub, POSITION_MATCHUP_COLUMN_WIDTH.edge]).flat(),
].join(" + ")})`;

/** The sticky Opp column's left offset must equal the Team column's rendered width exactly. */
export const POSITION_MATCHUP_OPPONENT_LEFT = POSITION_MATCHUP_COLUMN_WIDTH.team;

/** Complete literal classes keep the responsive scale in Tailwind's generated CSS. */
export const POSITION_MATCHUP_SCALE = {
  headerFontClass: "text-[clamp(9px,0.62vw,11px)]",
  bodyFontClass: "text-[clamp(11px,0.78vw,15px)]",
  edgePillFontClass: "text-[clamp(9px,0.62vw,10px)]",
  cellPaddingXClass: "px-[clamp(2px,0.4vw,10px)]",
} as const;

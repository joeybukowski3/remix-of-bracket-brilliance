/**
 * Shared type and layout scale for the matchup analyzer.
 *
 * Mirrors the `T` token object and row geometry in
 * `/design/jkb-full-page-reference.jsx`, which is the authoritative spec for
 * sizing, spacing and proportion on this page. Components read these tokens
 * rather than repeating sizes — per-component literals are how the four row
 * types drifted to three different label sizes before.
 *
 * This lives in its own module because both `MatchupRankBadge` and
 * `MatchupValuePills` need it and the latter imports the former; defining the
 * tokens in either would create a cycle.
 *
 * Colour bands are NOT defined here. Tier colour stays in `rankTier.ts`, which
 * this scale never touches.
 */

// ---------------------------------------------------------------------------
// Type scale
// ---------------------------------------------------------------------------

/** Small coloured label above a section title. Reference: 11px/800, 0.09em. */
export const MATCHUP_EYEBROW =
  "text-[11px] font-extrabold uppercase tracking-[0.09em] text-emerald-700";

/** Section title. Reference: 22px/800. */
export const MATCHUP_SECTION_TITLE =
  "text-[14px] font-extrabold uppercase leading-tight tracking-[0.01em] text-slate-900";

/** Section subtitle beneath the title. Reference: 13px. */
export const MATCHUP_SECTION_SUB = "text-[13px] leading-5 text-slate-500";

/**
 * The headline size, carried by BOTH the metric label and the rank number.
 *
 * The reference makes this the page's key relationship: a row's metric name and
 * its rank figure are the two things a reader compares, and they must be
 * visually identical. Reference: 20px/800.
 */
export const MATCHUP_PRIMARY_TEXT = "text-[13px]";

/**
 * The centred metric name — "EPA / Play", "Pass Block vs Pass Rush".
 *
 * The period caption beneath it is a separate token and stays smaller.
 */
export const MATCHUP_METRIC_LABEL = `${MATCHUP_PRIMARY_TEXT} font-extrabold leading-tight text-slate-800`;

/**
 * Period caption under a metric label — "2025 Last 8", "2025 Season".
 * Reference: 12px/700. It was 9px, far too small against a 20px label.
 */
export const MATCHUP_PERIOD_CAPTION =
  "text-[10px] font-bold tracking-[0.04em] text-slate-500";

/** The raw value beside a rank. Secondary to the rank. Reference: 14px/700. */
export const MATCHUP_VALUE_TEXT = "text-[11px] font-bold tabular-nums text-slate-600";

/**
 * Unit panel header — team name plus role.
 *
 * Reference: 22px/800, deliberately LARGER than the 20px rows beneath it. The
 * shipped page had this inverted, with a 17px header over 22px rows.
 */
export const MATCHUP_PANEL_TITLE =
  "text-[15px] font-extrabold leading-tight text-slate-900";

/** "Attacking" / "Defending" under a panel title. Reference: 12px/800. */
export const MATCHUP_PANEL_CAPTION =
  "text-[12px] font-extrabold uppercase leading-4 tracking-[0.09em] text-slate-500";

/** Group band inside a unit panel. Reference: slate ink, 15px/900, 0.14em. */
export const MATCHUP_GROUP_BAND =
  "bg-slate-800 px-3 py-[7px] text-center text-[12px] font-black uppercase tracking-[0.1em] text-slate-50";

// ---------------------------------------------------------------------------
// Row geometry
// ---------------------------------------------------------------------------

/**
 * Row width caps, and the placement classes that go with them.
 *
 * From `sm` up the row is the reference's three-column geometry. Below it the
 * columns collapse to a stacked pair with the label spanning above, because the
 * rank pill has a 74px minimum by design and a 76px side column cannot hold it
 * plus its value — the pill alone would overflow. Narrowing the column is not
 * available without shrinking the pill, which the reference explicitly rejects.
 *
 * The reference centres each row inside a fixed maximum with fixed side
 * columns, so the rank pill always sits adjacent to the metric label however
 * wide the viewport is. Without this the values drift to the page edges once
 * the panels go full width — the defect these caps exist to fix.
 *
 * Side columns narrow below `sm`, where 230px would not fit at all.
 */
export const MATCHUP_UNIT_ROW_GRID =
  "mx-auto grid w-full max-w-[1080px] grid-cols-2 items-center gap-x-3 sm:grid-cols-[minmax(72px,0.7fr)_minmax(0,1.25fr)_minmax(72px,0.7fr)] sm:gap-x-0";

/** Statistical Comparison is the narrower of the two. Reference: 780 / 190. */
export const MATCHUP_STAT_ROW_GRID =
  "mx-auto grid w-full max-w-[780px] grid-cols-2 items-center gap-x-3 sm:grid-cols-[minmax(72px,0.75fr)_minmax(0,1.2fr)_minmax(72px,0.75fr)] sm:gap-x-0";

/**
 * Rank chip geometry at the headline size.
 *
 * Sized around the number — padding plus a minimum width — rather than the
 * number being shrunk to fit a fixed chip. Reference: 5px/14px padding,
 * minWidth 74, radius 10, 2px border.
 */
export const MATCHUP_PRIMARY_BADGE =
  "min-w-[48px] rounded px-2 py-[3px]";


/** Label cell: spans the stacked row on mobile, centre column from `sm` up. */
export const MATCHUP_ROW_LABEL_CELL =
  "col-span-2 row-start-1 sm:col-span-1 sm:col-start-2 sm:row-start-1";

/** Away cell: left of the stacked pair on mobile, left column from `sm` up. */
export const MATCHUP_ROW_AWAY_CELL = "col-start-1 row-start-2 sm:row-start-1";

/** Home cell: right of the stacked pair on mobile, right column from `sm` up. */
export const MATCHUP_ROW_HOME_CELL =
  "col-start-2 row-start-2 sm:col-start-3 sm:row-start-1";

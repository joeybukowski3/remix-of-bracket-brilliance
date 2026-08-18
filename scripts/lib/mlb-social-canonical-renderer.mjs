/**
 * mlb-social-canonical-renderer.mjs
 *
 * Phase 3 canonical rendering layer. Consumes a frozen `SocialPostPlan` (see
 * mlb-social-post-plan.mjs) directly: no fetching, no reselection, no
 * re-ranking, no recomputation of any displayed value. `plan.rows`, in the
 * order they arrive, are exactly what gets drawn.
 *
 * Deliberately isolated from mlb-social-graphic-renderer.mjs's own
 * `renderMlbSocialSvg`/`writeMlbSocialGraphic` (the live/legacy K + HR
 * table export) -- this module adds NEW entry points rather than changing
 * the legacy ones, so the current live graphic is unaffected. It DOES reuse
 * that module's SVG primitives (text, icon, triangle, colors, team-logo
 * resolvers, the PNG rasterizer) since those are presentation-neutral
 * building blocks, not the legacy layout/copy itself.
 *
 * VISUAL SYSTEM (redesign correction pass): dark navy/stadium-broadcast
 * card, matching the approved JoeKnowsBall reference cards -- gold masthead,
 * oversized white title, orange (HR) / blue (K) accent panel, dark compact
 * table body, dark footer strip. This pass is visual-only: plan
 * consumption, row order, row content, and the frozen-plan contract below
 * are all unchanged from the prior canonical renderer.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createLocalMlbLogoResolver,
  createRemoteMlbLogoResolver,
  escapeXml,
  formatCount,
  formatMetric,
  FONT_STACK,
  rasterizeSvgToPng,
  renderTeamLogo,
  statColor,
  countColor,
  text,
  triangle,
  truncateText,
} from "./mlb-social-graphic-renderer.mjs";

export const CANONICAL_GEOMETRY = Object.freeze({
  width: 1600,
  height: 900,
  padding: 56,
  // Masthead / title / metadata band sits above the panel; panel is the
  // bordered orange (HR) / blue (K) broadcast board. The panel is sized to
  // its actual row content (see computePanelLayout) and centered within the
  // fixed [panelBandTop, panelBandBottom] band rather than stretched to
  // fill it -- a 2-row card gets a tight panel with the dark stadium
  // background carrying the extra space, instead of two rows stretched
  // across a mostly-empty table. The panelTop/panelBottom/rowsTop/rowsBottom
  // values below are the 5-row (widest) reference case, kept as the outer
  // safe bounds every row count's dynamic layout stays within.
  panelBandTop: 200,
  panelBandBottom: 816,
  panelHeaderHeight: 56,
  headerToRowsGap: 46,
  rowHeight: 96,
  panelBottomPadding: 14,
  panelTop: 210,
  panelBottom: 806,
  columnLabelsY: 290,
  columnRuleY: 302,
  rowsTop: 312,
  rowsBottom: 792,
  footerRuleY: 816,
});

/** Dark stadium-broadcast palette, distinct from the legacy light-card COLORS above (kept only for shared score/stat color-tier helpers). */
const STADIUM = Object.freeze({
  bgTop: "#0A1220",
  bgMid: "#0D1826",
  bgBottom: "#050910",
  panelBody: "#0E1826",
  panelBodyAlt: "#141F30",
  panelBorderFaint: "#1E2A3E",
  gold: "#F2B134",
  goldBright: "#FFDD8A",
  white: "#F7FAFC",
  textSecondary: "#9AA8BC",
  textFaint: "#6C7A8F",
  hrTop: "#FB923C",
  hrBottom: "#C2410C",
  kTop: "#3B82F6",
  kBottom: "#1D3F8F",
  green: "#22C55E",
  under: "#0EA5E9",
  red: "#EF4444",
  navyBadge: "#1B2637",
  rowDivider: "#1C283A",
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Rough left-to-right text width estimate for placing icon/divider segments -- not pixel-exact, just enough to center a metadata strip's mixed icon+text content. */
function estimateTextWidth(value, size, letterSpacing = 0) {
  return normalizeText(value).length * (size * 0.58 + letterSpacing);
}

/**
 * Model-style tier-color grading for the HR Score pill (and its row's
 * left-edge accent stripe): gold = elite, green = strong, teal/blue =
 * medium, muted slate = below threshold / no score. Distinct from the
 * legacy renderer's own 4-tier `hrScoreStyle` (green/light-green/gold/
 * orange, all roughly equal-weight) -- this pass wants gold reserved for
 * genuinely elite rows so the eye lands there first, per the polish brief.
 */
function hrScoreTier(value) {
  if (value == null) return { pillFill: "#334155", pillText: "#E2E8F0", accent: "#3B4B63" };
  if (value >= 85) return { pillFill: STADIUM.gold, pillText: STADIUM.navyBadge, accent: STADIUM.gold };
  if (value >= 75) return { pillFill: STADIUM.green, pillText: "#FFFFFF", accent: STADIUM.green };
  if (value >= 65) return { pillFill: STADIUM.under, pillText: "#FFFFFF", accent: STADIUM.under };
  return { pillFill: "#334155", pillText: "#E2E8F0", accent: "#3B4B63" };
}

/**
 * Tier-color grading for the K row's Edge box (and its row's left-edge
 * accent stripe): a strong positive edge reads as gold, a solid edge as
 * green, a small edge as teal/blue, and any negative edge stays red
 * regardless of magnitude (a bad edge is a bad edge). Replaces the old
 * green-or-red-only treatment, which made every positive edge look equally
 * strong.
 */
function edgeTier(edge) {
  if (edge == null || edge === 0) return { pillFill: "rgba(255,255,255,0.05)", pillText: "#E2E8F0", accent: "#3B4B63" };
  if (edge < 0) return { pillFill: "rgba(239,68,68,0.14)", pillText: STADIUM.red, accent: STADIUM.red };
  if (edge >= 1.5) return { pillFill: "rgba(242,177,52,0.16)", pillText: STADIUM.gold, accent: STADIUM.gold };
  if (edge >= 0.8) return { pillFill: "rgba(34,197,94,0.14)", pillText: STADIUM.green, accent: STADIUM.green };
  return { pillFill: "rgba(14,165,233,0.14)", pillText: STADIUM.under, accent: STADIUM.under };
}

function formatSlateDate(slateDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(slateDate));
  if (!match) return normalizeText(slateDate);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date).toUpperCase();
}

/**
 * "9:15 AM ET" from an ISO `generatedAt`, or null when absent/unparsable --
 * the metadata strip omits the generated-time segment entirely rather than
 * fabricate one, per the redesign brief's ban on inventing a status.
 */
function formatGeneratedTime(generatedAt) {
  const date = new Date(normalizeText(generatedAt));
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date);
  return `${formatted} ET`;
}

/**
 * Panel geometry for a given row count: the panel (header bar + column
 * labels + rows) is sized to its own content at a FIXED, dense row height
 * -- never stretched -- then centered within the fixed panelBandTop..
 * panelBandBottom band. Fewer rows produce a shorter, tighter panel with
 * the dark stadium background/masthead/footer carrying the extra vertical
 * space (per the redesign brief), rather than two rows stretched across a
 * mostly-empty table. A 5-row plan fills almost the entire band, matching
 * the CANONICAL_GEOMETRY reference values above.
 */
function computePanelLayout(rowCount) {
  const { panelBandTop, panelBandBottom, panelHeaderHeight, headerToRowsGap, rowHeight, panelBottomPadding } = CANONICAL_GEOMETRY;
  const contentHeight = panelHeaderHeight + headerToRowsGap + rowCount * rowHeight + panelBottomPadding;
  const band = panelBandBottom - panelBandTop;
  const panelTop = panelBandTop + Math.max(0, (band - contentHeight) / 2);
  const panelBottom = panelTop + contentHeight;
  const rowsTop = panelTop + panelHeaderHeight + headerToRowsGap;
  return {
    panelTop,
    panelBottom,
    rowsTop,
    columnLabelsY: panelTop + panelHeaderHeight + 24,
    columnRuleY: panelTop + panelHeaderHeight + 36,
    rowHeight,
  };
}

/**
 * Deterministic vertical slot for each of 1..rowCount rows, at the fixed
 * dense row height, starting at that row count's own centered panel top
 * (see computePanelLayout). Always nested within the static
 * CANONICAL_GEOMETRY.rowsTop/rowsBottom outer bounds (the 5-row case).
 */
export function computeCanonicalRowLayout(rowCount) {
  const { rowsTop, rowHeight } = computePanelLayout(rowCount);
  return Array.from({ length: rowCount }, (_, index) => ({
    top: rowsTop + index * rowHeight,
    height: rowHeight,
  }));
}

/** A single stadium floodlight: a fanned grid of small white dots with a soft glow behind it, mirrored for the right corner. */
function renderStadiumLight(id, cx, cy, mirrored) {
  const rows = [5, 4, 3, 2];
  const spacingX = 15;
  const spacingY = 13;
  let dots = "";
  for (const [rowIndex, count] of rows.entries()) {
    const rowY = cy + rowIndex * spacingY;
    const rowWidth = (count - 1) * spacingX;
    for (let column = 0; column < count; column += 1) {
      const dotX = cx - rowWidth / 2 + column * spacingX;
      dots += `<circle cx="${dotX}" cy="${rowY}" r="4.2" fill="#F8FAFC"/>`;
    }
  }
  const rotation = mirrored ? 18 : -18;
  return (
    `<g opacity="0.92" transform="rotate(${rotation} ${cx} ${cy})">` +
    `<circle cx="${cx}" cy="${cy + 26}" r="70" fill="url(#${id})"/>` +
    dots +
    `</g>`
  );
}

/** Small baseball glyph (stitched circle) used inside the gold wordmark and the HR panel header. */
function renderBaseball(cx, cy, radius) {
  return (
    `<g><circle cx="${cx}" cy="${cy}" r="${radius}" fill="#F8FAFC" stroke="#B8C2CE" stroke-width="1"/>` +
    `<path d="M ${cx - radius * 0.72} ${cy - radius * 0.5} Q ${cx} ${cy - radius * 0.1} ${cx - radius * 0.72} ${cy + radius * 0.5}" stroke="#D34C4C" stroke-width="${Math.max(1.4, radius * 0.09)}" fill="none"/>` +
    `<path d="M ${cx + radius * 0.72} ${cy - radius * 0.5} Q ${cx} ${cy - radius * 0.1} ${cx + radius * 0.72} ${cy + radius * 0.5}" stroke="#D34C4C" stroke-width="${Math.max(1.4, radius * 0.09)}" fill="none"/>` +
    `</g>`
  );
}

/** Small calendar glyph -- metadata-strip icon for the slate date segment. */
function iconCalendar(cx, cy, size, color) {
  const s = size;
  const x = cx - s / 2;
  const y = cy - s / 2;
  return (
    `<g>` +
    `<rect x="${x}" y="${y + 2}" width="${s}" height="${s - 2}" rx="1.6" fill="none" stroke="${color}" stroke-width="1.3"/>` +
    `<line x1="${x}" y1="${y + 5.5}" x2="${x + s}" y2="${y + 5.5}" stroke="${color}" stroke-width="1.3"/>` +
    `<line x1="${x + s * 0.28}" y1="${y}" x2="${x + s * 0.28}" y2="${y + 4}" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<line x1="${x + s * 0.72}" y1="${y}" x2="${x + s * 0.72}" y2="${y + 4}" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>` +
    `</g>`
  );
}

/** Small clock glyph -- metadata-strip icon for the generated-time segment. */
function iconClock(cx, cy, size, color) {
  const r = size / 2;
  return (
    `<g>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1.3"/>` +
    `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r * 0.55}" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.42}" y2="${cy + r * 0.16}" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>` +
    `</g>`
  );
}

/** Globe glyph -- footer icon beside the site URL. */
function iconGlobe(cx, cy, size, color) {
  const r = size / 2;
  return (
    `<g>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.42}" ry="${r}" fill="none" stroke="${color}" stroke-width="1.1"/>` +
    `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${color}" stroke-width="1.1"/>` +
    `</g>`
  );
}

/** Crossed-line X (formerly Twitter) glyph -- footer icon beside the handle, drawn as the real X mark rather than a boxed letter. */
function iconX(cx, cy, size, color) {
  const r = size / 2;
  return (
    `<g stroke="${color}" stroke-width="2" stroke-linecap="round">` +
    `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}"/>` +
    `<line x1="${cx - r}" y1="${cy + r}" x2="${cx + r}" y2="${cy - r}"/>` +
    `</g>`
  );
}

/**
 * Short angled motion-trail lines behind the HR panel's baseball icon,
 * echoing the reference card's "speed streak" treatment. Deliberately
 * staggered lengths/angles/opacity (not three equal parallel bars) so it
 * reads as a speed streak rather than a hamburger-menu glyph.
 */
function renderMotionTrail(cx, cy, color) {
  let svg = `<g stroke="${color}" stroke-linecap="round">`;
  for (const [dx, dy, len, width, opacity] of [
    [-24, -9, 20, 2.2, 0.35],
    [-20, 0, 26, 2.8, 0.6],
    [-24, 9, 16, 2.2, 0.35],
  ]) {
    svg += `<line x1="${cx + dx - len}" y1="${cy + dy - dy * 0.4}" x2="${cx + dx}" y2="${cy + dy}" stroke-width="${width}" opacity="${opacity}"/>`;
  }
  svg += "</g>";
  return svg;
}

/**
 * Team-logo visibility fix: every logo sits on a solid WHITE circular plate
 * with a thin section-accent ring, instead of directly on the dark panel
 * background. A dark crest (e.g. NYY's navy interlocking letters) reads
 * clearly against white the way it never could against a dark plate --
 * this applies uniformly to every team, not a per-team patch.
 */
function renderLogoBadge(cx, cy, team, resolveLogo, accent) {
  let svg = `<circle cx="${cx}" cy="${cy}" r="31" fill="#0B1220"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="31" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.5"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="27" fill="#FFFFFF"/>`;
  svg += renderTeamLogo(cx, cy, team, resolveLogo);
  return svg;
}

function renderBackground(kind) {
  const { width, height } = CANONICAL_GEOMETRY;
  let svg = "<defs>";
  svg += `<linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${STADIUM.bgTop}"/>` +
    `<stop offset="55%" stop-color="${STADIUM.bgMid}"/>` +
    `<stop offset="100%" stop-color="${STADIUM.bgBottom}"/>` +
    `</linearGradient>`;
  svg += `<radialGradient id="lightGlow" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16"/>` +
    `<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>` +
    `</radialGradient>`;
  svg += `<radialGradient id="mastheadGlow" cx="50%" cy="0%" r="75%">` +
    `<stop offset="0%" stop-color="${STADIUM.gold}" stop-opacity="0.14"/>` +
    `<stop offset="100%" stop-color="${STADIUM.gold}" stop-opacity="0"/>` +
    `</radialGradient>`;
  svg += `<linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${STADIUM.goldBright}"/>` +
    `<stop offset="100%" stop-color="${STADIUM.gold}"/>` +
    `</linearGradient>`;
  svg += `<linearGradient id="hrHeaderGradient" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="${STADIUM.hrBottom}"/>` +
    `<stop offset="100%" stop-color="${STADIUM.hrTop}"/>` +
    `</linearGradient>`;
  svg += `<linearGradient id="kHeaderGradient" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="${STADIUM.kBottom}"/>` +
    `<stop offset="100%" stop-color="${STADIUM.kTop}"/>` +
    `</linearGradient>`;
  svg += "</defs>";
  svg += `<rect width="${width}" height="${height}" fill="url(#bgGradient)"/>`;
  svg += `<rect width="${width}" height="260" fill="url(#mastheadGlow)"/>`;
  svg += renderStadiumLight("lightGlow", 128, 58, false);
  svg += renderStadiumLight("lightGlow", width - 128, 58, true);
  const accent = kind === "hr" ? STADIUM.hrTop : STADIUM.kTop;
  svg += `<rect x="0" y="0" width="${width}" height="6" fill="${accent}" opacity="0.85"/>`;
  return svg;
}

function renderMasthead({ kind, slateDate, generatedAt }) {
  const { width, padding } = CANONICAL_GEOMETRY;
  const centerX = width / 2;

  let svg = "";
  // Gold "JOE KNOWS BALL" wordmark with a baseball standing in for the "O" in KNOWS.
  // A dark offset shadow pass sits behind the gold gradient text for a subtle
  // embossed separation from the background, closer to the reference cards'
  // richer gold treatment than flat gradient text alone.
  const wordLeft = "JOE KN";
  const wordRight = "WS BALL";
  const ballGapHalf = 20;
  const wordmarkOpts = { size: 34, weight: 800, anchor: "end", letterSpacing: 2 };
  svg += text(centerX - ballGapHalf - 4 + 1.5, 68, wordLeft, { ...wordmarkOpts, fill: "#000000", tabular: false });
  svg += text(centerX + ballGapHalf + 4 + 1.5, 68, wordRight, { ...wordmarkOpts, anchor: "start", fill: "#000000", tabular: false });
  svg += text(centerX - ballGapHalf - 4, 66, wordLeft, { ...wordmarkOpts, fill: "url(#goldText)" });
  svg += text(centerX + ballGapHalf + 4, 66, wordRight, { ...wordmarkOpts, anchor: "start", fill: "url(#goldText)" });
  svg += renderBaseball(centerX, 55, 19);

  // Oversized white product title.
  const title = kind === "hr" ? "MLB HOME RUN TARGETS" : "MLB STRIKEOUT PROPS";
  svg += text(centerX, 138, title, { size: 58, weight: 900, fill: STADIUM.white, anchor: "middle", letterSpacing: 0.5 });

  // Compact metadata strip -- slate date always shown (calendar icon), with
  // a generated-time segment (clock icon) shown only when the plan actually
  // carries a parsable generatedAt. Never a fabricated "MORNING MODEL" /
  // "CONFIRMED UPDATE" style status badge -- icons carry the meaning
  // instead of invented status words.
  const dateLabel = formatSlateDate(slateDate);
  const generatedLabel = formatGeneratedTime(generatedAt);
  const iconSize = 15;
  const iconGap = 8;
  const segGap = 16;
  const metaSize = 16;
  const metaLetterSpacing = 0.8;
  const dateWidth = estimateTextWidth(dateLabel, metaSize, metaLetterSpacing);
  const generatedWidth = generatedLabel ? estimateTextWidth(generatedLabel, metaSize, metaLetterSpacing) : 0;
  let contentWidth = iconSize + iconGap + dateWidth;
  if (generatedLabel) contentWidth += segGap + 1 + segGap + iconSize + iconGap + generatedWidth;

  const metaCenterY = 181;
  const metaTextY = 187;
  const pillWidth = Math.min(960, Math.max(240, contentWidth + 44));
  const pillX = centerX - pillWidth / 2;
  svg += `<rect x="${pillX}" y="164" width="${pillWidth}" height="34" rx="17" fill="rgba(242,177,52,0.08)" stroke="${STADIUM.gold}" stroke-width="1.25"/>`;

  let cursor = centerX - contentWidth / 2;
  svg += iconCalendar(cursor + iconSize / 2, metaCenterY, iconSize, STADIUM.goldBright);
  cursor += iconSize + iconGap;
  svg += text(cursor, metaTextY, dateLabel, { size: metaSize, weight: 700, fill: STADIUM.goldBright, anchor: "start", letterSpacing: metaLetterSpacing });
  cursor += dateWidth;
  if (generatedLabel) {
    cursor += segGap;
    svg += `<line x1="${cursor}" y1="170" x2="${cursor}" y2="192" stroke="${STADIUM.gold}" stroke-width="1" opacity="0.45"/>`;
    cursor += 1 + segGap;
    svg += iconClock(cursor + iconSize / 2, metaCenterY, iconSize, STADIUM.goldBright);
    cursor += iconSize + iconGap;
    svg += text(cursor, metaTextY, generatedLabel, { size: metaSize, weight: 700, fill: STADIUM.goldBright, anchor: "start", letterSpacing: metaLetterSpacing });
  }

  svg += `<line x1="${padding}" y1="${CANONICAL_GEOMETRY.panelBandTop}" x2="${width - padding}" y2="${CANONICAL_GEOMETRY.panelBandTop}" stroke="${STADIUM.panelBorderFaint}" stroke-width="1"/>`;
  return svg;
}

/** Column header labels for the compact table body -- positions mirror the row-content x coordinates below. */
const HR_COLUMNS = [
  ["RANK", 96, "middle"],
  ["PLAYER", 210, "start"],
  ["HR SCORE", 850, "middle"],
  ["ODDS", 1050, "middle"],
  ["BARREL%", 1200, "middle"],
  ["HARD-HIT%", 1360, "middle"],
  ["L7 HR", 1500, "middle"],
];

const K_COLUMNS = [
  ["RANK", 96, "middle"],
  ["PITCHER", 210, "start"],
  ["SIDE / LINE", 990, "middle"],
  ["ODDS", 1200, "middle"],
  ["PROJ K", 1350, "middle"],
  ["EDGE", 1500, "middle"],
];

function renderPanelFrame(kind, panelLayout) {
  const { width, padding, panelHeaderHeight } = CANONICAL_GEOMETRY;
  const { panelTop, panelBottom, columnLabelsY, columnRuleY } = panelLayout;
  const left = padding - 8;
  const right = width - padding + 8;
  const accent = kind === "hr" ? STADIUM.hrTop : STADIUM.kTop;
  const headerGradient = kind === "hr" ? "url(#hrHeaderGradient)" : "url(#kHeaderGradient)";

  let svg = "";
  // Panel body (dark interior for the table rows).
  svg += `<rect x="${left}" y="${panelTop}" width="${right - left}" height="${panelBottom - panelTop}" rx="16" fill="${STADIUM.panelBody}"/>`;
  // Header bar (colored, HR = orange / K = blue).
  svg += `<rect x="${left}" y="${panelTop}" width="${right - left}" height="${panelHeaderHeight}" rx="16" fill="${headerGradient}"/>`;
  svg += `<rect x="${left}" y="${panelTop + panelHeaderHeight / 2}" width="${right - left}" height="${panelHeaderHeight / 2}" fill="${headerGradient}"/>`;
  const panelTitle = kind === "hr" ? "TOP HOME RUN TARGETS" : "STRIKEOUT PROP TARGETS";
  svg += text(padding + 6, panelTop + panelHeaderHeight / 2 + 9, panelTitle, { size: 25, weight: 800, fill: "#FFFFFF", anchor: "start", letterSpacing: 0.6 });
  if (kind === "hr") {
    const ballY = panelTop + panelHeaderHeight / 2;
    svg += renderMotionTrail(right - 34, ballY, "rgba(255,255,255,0.7)");
    svg += renderBaseball(right - 34, ballY, 15);
  } else {
    const kBadgeX = right - 34;
    const kBadgeY = panelTop + panelHeaderHeight / 2;
    svg += `<circle cx="${kBadgeX}" cy="${kBadgeY}" r="17" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2"/>`;
    svg += `<circle cx="${kBadgeX}" cy="${kBadgeY}" r="15" fill="rgba(255,255,255,0.18)"/>`;
    svg += text(kBadgeX, kBadgeY + 7, "K", { size: 17, weight: 900, fill: "#FFFFFF", anchor: "middle" });
  }

  // Column labels.
  const columns = kind === "hr" ? HR_COLUMNS : K_COLUMNS;
  for (const [label, x, anchor] of columns) {
    svg += text(x, columnLabelsY, label, { size: 14, weight: 800, fill: STADIUM.textFaint, anchor, letterSpacing: 0.8 });
  }
  svg += `<line x1="${padding}" y1="${columnRuleY}" x2="${width - padding}" y2="${columnRuleY}" stroke="${STADIUM.rowDivider}" stroke-width="1"/>`;

  // Outer border, drawn last so it frames both header and body cleanly.
  svg += `<rect x="${left}" y="${panelTop}" width="${right - left}" height="${panelBottom - panelTop}" rx="16" fill="none" stroke="${accent}" stroke-width="2.5"/>`;
  return svg;
}

function rowGroupOpenTag(index, row) {
  const content = row?.content ?? {};
  return `<g data-plan-row="${index}" data-player-id="${escapeXml(row?.playerId ?? "")}" data-game-id="${escapeXml(row?.gameId ?? "")}" data-player-name="${escapeXml(row?.playerName ?? "")}" data-game-label="${escapeXml(row?.gameLabel ?? "")}" data-is-doubleheader="${row?.isDoubleheader ? "true" : "false"}" data-kind="${escapeXml(content.kind ?? "")}">`;
}

/** Rank 1-3 get a solid gold/silver/bronze medal badge -- a positional (not metric-driven) premium treatment for the top of the board; ranks 4-5 get a plain outlined badge, same circular grammar throughout. */
const MEDAL_COLORS = ["#F2B134", "#C7CDD6", "#C98A4B"];

function renderRankBadge(index, top, height) {
  const middle = top + height / 2;
  const rank = String(index + 1).padStart(2, "0");
  const medal = MEDAL_COLORS[index];
  if (medal) {
    return (
      `<circle cx="96" cy="${middle}" r="19" fill="${medal}"/>` +
      text(96, middle + 7, rank, { size: 20, weight: 800, fill: STADIUM.navyBadge, anchor: "middle" })
    );
  }
  return (
    `<circle cx="96" cy="${middle}" r="19" fill="none" stroke="${STADIUM.panelBorderFaint}" stroke-width="1.5"/>` +
    text(96, middle + 7, rank, { size: 20, weight: 800, fill: STADIUM.textSecondary, anchor: "middle" })
  );
}

function renderCanonicalKRow(row, index, resolveLogo, slot) {
  const { top, height } = slot;
  const { padding, width } = CANONICAL_GEOMETRY;
  const middle = top + height / 2;
  const content = row?.content ?? {};
  const hasLine = content.side === "OVER" || content.side === "UNDER";
  const isOver = content.side === "OVER";
  const edge = toFiniteNumber(content.edge);

  const tier = edgeTier(edge);

  let svg = rowGroupOpenTag(index, row);
  if (index % 2 === 0) svg += `<rect x="${padding - 8}" y="${top}" width="${width - 2 * (padding - 8)}" height="${height}" fill="${STADIUM.panelBodyAlt}"/>`;
  if (index > 0) svg += `<line x1="${padding}" y1="${top}" x2="${width - padding}" y2="${top}" stroke="${STADIUM.rowDivider}" stroke-width="1"/>`;
  // Tier-colored left-edge accent, driven by this row's Edge grade.
  svg += `<rect x="${padding - 4}" y="${top + 6}" width="4" height="${height - 12}" rx="2" fill="${tier.accent}"/>`;

  svg += renderRankBadge(index, top, height);

  const logoX = 160;
  svg += renderLogoBadge(logoX, middle, row?.team, resolveLogo, STADIUM.kTop);

  const nameX = logoX + 50;
  const pitcherName = truncateText(row?.playerName || "Unknown", 22);
  svg += text(nameX, top + height * 0.4, pitcherName, { size: pitcherName.length > 16 ? 30 : 34, weight: 800, fill: STADIUM.white, anchor: "start", tabular: false });
  svg += text(nameX, top + height * 0.4 + 30, truncateText(row?.gameLabel || "", 34), { size: 19, weight: 600, fill: STADIUM.textSecondary, anchor: "start", tabular: false });

  const badgeX = 900;
  const badgeFill = hasLine ? (isOver ? STADIUM.green : STADIUM.under) : STADIUM.navyBadge;
  svg += `<rect x="${badgeX}" y="${middle - 30}" width="176" height="60" rx="12" fill="${badgeFill}"/>`;
  if (hasLine) {
    svg += triangle(badgeX + 20, middle - 2, isOver ? "up" : "down", 8, "#fff");
    svg += text(badgeX + 100, middle - 3, `${content.side} ${formatMetric(content.kLine)}`, { size: 23, weight: 800, fill: "#fff" });
  } else {
    svg += text(badgeX + 88, middle - 3, "NO LINE", { size: 22, weight: 800, fill: "#fff" });
  }

  // Secondary-tier stats: plain white, smaller than the badge/edge box, so
  // the eye lands on Side/Line then Edge before Odds/Proj K.
  const oddsX = 1200;
  svg += text(oddsX, middle - 3, content.odds ?? "N/A", { size: 21, weight: 700, fill: STADIUM.textSecondary, anchor: "middle" });

  const projX = 1350;
  svg += text(projX, middle - 3, formatMetric(content.projectedKs), { size: 22, weight: 700, fill: STADIUM.white, anchor: "middle" });

  // Primary emphasis after the pitcher name: the tier-graded Edge box --
  // gold for a strong positive edge, green for solid, teal for small, red
  // for negative -- bigger and bolder than Odds/Proj K.
  const edgeX = 1500;
  const edgeLabel = edge == null ? "N/A" : `${edge > 0 ? "+" : ""}${edge.toFixed(1)}`;
  svg += `<rect x="${edgeX - 54}" y="${middle - 27}" width="108" height="54" rx="11" fill="${tier.pillFill}" stroke="${tier.accent}" stroke-width="1.75"/>`;
  svg += text(edgeX, middle + 9, edgeLabel, { size: 27, weight: 800, fill: tier.pillText, anchor: "middle" });

  return `${svg}</g>`;
}

/**
 * Chosen supporting metrics for the canonical HR row: barrel rate, hard-hit
 * rate, and L7 home runs. Selected over the legacy card's full five-column
 * set (which also showed L30 and a text opposing-pitcher line) because:
 *   - barrel%/hard-hit% are the two process metrics already carrying an
 *     established color-tier meaning on the site (statColor thresholds),
 *     so they read instantly without new legend-learning
 *   - L7 is the more actionable recency signal for a same-day social card;
 *     L30 is highly correlated with L7 on most rows and mostly adds density
 *     without adding a distinct read
 *   - opposingPitcher is still present as context inside the row's
 *     gameLabel/matchup line, just not repeated as its own metric column
 * This keeps the row at 3 supporting numbers plus HR Score + odds, matching
 * the "2-3 supporting metrics" ceiling in the design brief.
 */
export const HR_CANONICAL_SUPPORTING_METRICS = Object.freeze(["barrelRate", "hardHitRate", "last7HR"]);

function renderCanonicalHrRow(row, index, resolveLogo, slot) {
  const { top, height } = slot;
  const { padding, width } = CANONICAL_GEOMETRY;
  const middle = top + height / 2;
  const content = row?.content ?? {};

  const tier = hrScoreTier(content.hrScore);

  let svg = rowGroupOpenTag(index, row);
  if (index % 2 === 0) svg += `<rect x="${padding - 8}" y="${top}" width="${width - 2 * (padding - 8)}" height="${height}" fill="${STADIUM.panelBodyAlt}"/>`;
  if (index > 0) svg += `<line x1="${padding}" y1="${top}" x2="${width - padding}" y2="${top}" stroke="${STADIUM.rowDivider}" stroke-width="1"/>`;
  // Tier-colored left-edge accent, driven by this row's HR Score grade.
  svg += `<rect x="${padding - 4}" y="${top + 6}" width="4" height="${height - 12}" rx="2" fill="${tier.accent}"/>`;

  svg += renderRankBadge(index, top, height);

  const logoX = 160;
  svg += renderLogoBadge(logoX, middle, row?.team, resolveLogo, STADIUM.hrTop);

  const nameX = logoX + 50;
  const playerName = truncateText(row?.playerName || "Unknown", 20);
  svg += text(nameX, top + height * 0.4, playerName, { size: playerName.length > 16 ? 30 : 34, weight: 800, fill: STADIUM.white, anchor: "start", tabular: false });
  svg += text(nameX, top + height * 0.4 + 30, truncateText(row?.gameLabel || "", 34), { size: 19, weight: 600, fill: STADIUM.textSecondary, anchor: "start", tabular: false });

  // Primary emphasis after the player name: the tier-graded HR Score pill --
  // gold for elite, green for strong, teal for medium, muted slate below
  // that -- bigger and bolder than everything to its right.
  const scorePillX = 790;
  svg += `<rect x="${scorePillX}" y="${middle - 28}" width="124" height="56" rx="12" fill="${tier.pillFill}"/>`;
  svg += text(scorePillX + 62, middle + 10, formatMetric(content.hrScore), { size: 28, weight: 800, fill: tier.pillText });

  // Odds: informational, not itself tiered -- kept plain/white so it reads
  // as secondary to the HR Score pill rather than competing with it.
  const oddsX = 1050;
  svg += text(oddsX, middle + 8, content.odds ?? "N/A", { size: 23, weight: 700, fill: STADIUM.white, anchor: "middle" });

  // Supporting metrics: smaller and lighter-weight than name/score/odds --
  // they only brighten (via statColor/countColor's own tiering) when a
  // value is genuinely notable, staying muted otherwise.
  const barrelX = 1200;
  svg += text(barrelX, middle + 7, formatMetric(content.barrelRate, 1, "%"), { size: 19, weight: 700, fill: statColor(content.barrelRate, 20, 16), anchor: "middle" });

  const hardHitX = 1360;
  svg += text(hardHitX, middle + 7, formatMetric(content.hardHitRate, 1, "%"), { size: 19, weight: 700, fill: statColor(content.hardHitRate, 54, 50), anchor: "middle" });

  const l7X = 1500;
  svg += text(l7X, middle + 7, formatCount(content.last7HR), { size: 20, weight: 700, fill: countColor(content.last7HR, 3, 2), anchor: "middle" });

  return `${svg}</g>`;
}

function renderFooter(kind) {
  const { width, padding, height, footerRuleY } = CANONICAL_GEOMETRY;
  const right = width - padding;
  let svg = `<line x1="${padding}" y1="${footerRuleY}" x2="${right}" y2="${footerRuleY}" stroke="${STADIUM.panelBorderFaint}" stroke-width="1"/>`;
  svg += text(width / 2, footerRuleY + 26, "For entertainment and trend analysis only. Not betting advice. 21+", { size: 14.5, weight: 600, fill: STADIUM.textFaint, anchor: "middle", tabular: false });

  const footerBarTop = footerRuleY + 42;
  svg += `<rect x="0" y="${footerBarTop}" width="${width}" height="${height - footerBarTop}" fill="${STADIUM.bgBottom}"/>`;
  const barMiddle = footerBarTop + (height - footerBarTop) / 2 + 5;

  svg += iconGlobe(padding + 9, barMiddle - 6, 18, STADIUM.textSecondary);
  svg += text(padding + 26, barMiddle - 1, "joeknowsball.com", { size: 17, weight: 700, fill: STADIUM.textSecondary, anchor: "start", tabular: false });

  const dividerX = width / 2;
  svg += `<line x1="${dividerX}" y1="${barMiddle - 16}" x2="${dividerX}" y2="${barMiddle + 4}" stroke="${STADIUM.panelBorderFaint}" stroke-width="1"/>`;

  const handleX = width / 2 + 220;
  svg += iconX(handleX - 2, barMiddle - 6, 15, STADIUM.textSecondary);
  svg += text(handleX + 16, barMiddle - 1, "@_joeknowsball_", { size: 17, weight: 700, fill: STADIUM.textSecondary, anchor: "start", tabular: false });
  void kind;
  return svg;
}

/**
 * Renders the canonical K or HR social card SVG for one frozen
 * `SocialPostPlan`. Rows render in exactly `plan.rows` order -- never
 * re-sorted, filtered, or padded. Supports 1-5 rows (composition guarantees
 * 2-5 in practice; a lone-row plan is accepted defensively rather than
 * assumed impossible).
 */
export function renderCanonicalSocialSvg({ plan, resolveLogo = createLocalMlbLogoResolver() }) {
  const kind = plan?.product === "mlb-hr-props" ? "hr" : plan?.product === "mlb-k-props" ? "k" : null;
  if (!kind) throw new Error(`renderCanonicalSocialSvg: unsupported plan.product "${plan?.product}".`);

  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  if (rows.length < 1) throw new Error(`Canonical ${kind.toUpperCase()} social graphic requires at least 1 row; received 0.`);
  if (rows.length > 5) throw new Error(`Canonical ${kind.toUpperCase()} social graphic accepts at most 5 rows; received ${rows.length}.`);

  const panelLayout = computePanelLayout(rows.length);
  const layout = computeCanonicalRowLayout(rows.length);
  const { width, height } = CANONICAL_GEOMETRY;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT_STACK}" data-social-kind="${kind}" data-canonical="true" data-slate-date="${escapeXml(plan?.slateDate ?? "")}">`;
  svg += renderBackground(kind);
  svg += renderMasthead({ kind, slateDate: plan?.slateDate, generatedAt: plan?.generatedAt });
  svg += renderPanelFrame(kind, panelLayout);
  for (const [index, row] of rows.entries()) {
    svg += kind === "hr" ? renderCanonicalHrRow(row, index, resolveLogo, layout[index]) : renderCanonicalKRow(row, index, resolveLogo, layout[index]);
  }
  svg += renderFooter(kind);
  svg += "</svg>";
  return svg;
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([\w-]+)="([^"]*)"/g;
  for (const match of source.matchAll(pattern)) attributes[match[1]] = match[2];
  return attributes;
}

/** Ordered list of {playerId, gameId, playerName, gameLabel, kind} actually rendered, for consistency checks against the plan/caption. */
export function extractCanonicalRenderedRows(svg) {
  const rows = [];
  const pattern = /<g\s+([^>]*\bdata-plan-row="\d+"[^>]*)>/g;
  for (const match of String(svg).matchAll(pattern)) {
    const attributes = parseAttributes(match[1]);
    rows.push({
      playerId: attributes["data-player-id"] ?? "",
      gameId: attributes["data-game-id"] ?? "",
      playerName: attributes["data-player-name"] ?? "",
      gameLabel: attributes["data-game-label"] ?? "",
      isDoubleheader: attributes["data-is-doubleheader"] === "true",
      kind: attributes["data-kind"] ?? "",
    });
  }
  return rows;
}

/**
 * Writes the canonical SVG + PNG for one plan to disk. Mirrors
 * writeMlbSocialGraphic's shape (svg/svgPath/pngPath/renderedRows) but is a
 * distinct entry point -- it never touches the legacy renderer's own
 * output, and callers decide the output paths (Phase 3's dry-run CLI points
 * these at artifacts/mlb-x-dry-run/<slateDate>/, never at the live
 * artifacts/mlb-*-props-x.png paths the image-bundle system watches).
 */
export async function writeCanonicalSocialGraphic({ plan, svgPath, pngPath, resolveLogo, browser, fetchImpl }) {
  const logoResolver = resolveLogo ?? (await createRemoteMlbLogoResolver({ teams: (plan?.rows ?? []).map((row) => row?.team), fetchImpl }));
  const svg = renderCanonicalSocialSvg({ plan, resolveLogo: logoResolver });
  mkdirSync(path.dirname(svgPath), { recursive: true });
  writeFileSync(svgPath, `${svg}\n`, "utf8");
  await rasterizeSvgToPng(svg, pngPath, { browser });
  return { svg, svgPath, pngPath, renderedRows: extractCanonicalRenderedRows(svg) };
}

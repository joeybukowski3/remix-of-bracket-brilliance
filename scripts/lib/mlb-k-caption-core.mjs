/**
 * Pure caption/validation logic for the K props X poster
 * (post-mlb-strikeout-props-to-x.mjs), split out so it's testable without
 * importing the main script (which runs its own main() immediately at
 * module load, since it's a CLI entry point).
 *
 * Direction (OVER/UNDER) and the projection/edge numbers are never
 * recomputed here -- they're scraped directly off the page's own
 * data-k-side/data-k-projected-ks/data-k-projection-edge attributes
 * (see SocialTableK in MlbGameDetail.tsx, which already computes them via
 * getProjectionEdgeInfo), so this module can never silently drift out of
 * sync with what the page itself displays.
 */

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isAmericanOdds(value) {
  return /^[+-]\d+$/.test(normalizeText(value));
}

export function isPlaceholderText(value) {
  const normalized = normalizeText(value).toUpperCase();
  return !normalized || normalized === "TBD" || normalized === "TBA" || normalized === "N/A" || normalized === "NA" || normalized === "NULL" || normalized === "UNKNOWN";
}

export function formatPropLine(value) {
  const number = toFiniteNumber(value);
  if (number == null || number <= 0) return "";
  return Number.isInteger(number) ? number.toFixed(0) : String(number);
}

/** projectedKs - kLine, already signed (positive = OVER, negative = UNDER). Formats with an explicit "+" for positive values; toFixed already carries the "-" for negative ones. */
export function formatSignedEdge(edge) {
  if (edge == null || !Number.isFinite(edge)) return "";
  return `${edge > 0 ? "+" : ""}${edge.toFixed(1)}`;
}

/** The market price for whichever side the row's own direction favors -- oddsUnder for an UNDER row, oddsOver otherwise. Never mixes the two. */
export function getFavoredOdds(row) {
  return row.direction === "under" ? row.oddsUnder : row.oddsOver;
}

export function formatDateLabel(dateValue) {
  const raw = normalizeText(dateValue);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The page (selectTopSocialKRows) already ranks by absolute edge and caps
// at 5 rows before this script ever sees them, and filterEligibleKRows
// already dropped every non-VALID row -- so "rows" here is already 0-5
// rows, each with a real market line >= the starter threshold (see
// MIN_ELIGIBLE_K_LINE in kPropStatus.ts), a real projection, and coherent
// odds. Only a genuine data-integrity problem (a row that slipped through
// without a usable direction/odds/projection) should block the whole
// post; there is no product reason to require a minimum of 3 -- 1-2
// strong edges are still worth posting, and 0 is a clean skip, never a
// forced/padded table.
export function validateRows(rows) {
  if (rows.length < 1) return "Skipping: no eligible K prop rows are available.";

  for (const [index, row] of rows.entries()) {
    const label = `row ${index + 1}`;
    if (isPlaceholderText(row.pitcher)) return `Skipping: ${label} pitcher name is missing or a placeholder.`;
    if (isPlaceholderText(row.team)) return `Skipping: ${label} team is missing or a placeholder.`;
    if (!Number.isFinite(row.strikeoutScore)) return `Skipping: ${label} K score is missing or invalid.`;
    if (!formatPropLine(row.kLine)) return `Skipping: ${label} K line is missing.`;
    if (row.direction !== "over" && row.direction !== "under") return `Skipping: ${label} (${row.pitcher || "unknown"}) has no clear OVER/UNDER direction.`;
    if (!Number.isFinite(row.projectedKs)) return `Skipping: ${label} projection is missing.`;
    if (!Number.isFinite(row.projectionEdge)) return `Skipping: ${label} projection edge is missing.`;
    if (!isAmericanOdds(getFavoredOdds(row))) return `Skipping: ${label} ${row.direction} price is missing.`;
  }

  return "";
}

export function buildCaption({ date, rows }) {
  const rowsError = validateRows(rows);
  if (rowsError) return { skipped: true, reason: rowsError, caption: "", topProps: [] };

  const topProps = rows;
  const dateLabel = formatDateLabel(date);
  const blocks = topProps.map((row, index) => {
    const directionLabel = row.direction === "under" ? "UNDER" : "OVER";
    const odds = getFavoredOdds(row);
    const header = `${index + 1}. ${row.pitcher} (${row.team}) vs ${row.opponent}`;
    const pickLine = `${directionLabel} ${formatPropLine(row.kLine)} Ks (${odds})`;
    const projectionLine = `Projection: ${row.projectedKs.toFixed(1)}`;
    const edgeLine = `Edge: ${formatSignedEdge(row.projectionEdge)}`;
    return [header, pickLine, projectionLine, edgeLine].join("\n");
  });

  const caption = [
    `JoeKnowsBall MLB K Props - ${dateLabel}`,
    "",
    ...blocks.flatMap((block, index) => (index === 0 ? [block] : ["", block])),
    "",
    "Free Access to Full Table at Link in Bio",
    "",
    "#MLB #MLBPicks #Strikeouts #MLBBetting",
  ].join("\n");

  if (caption.length > 280) {
    const shortLines = topProps.map((row, index) => {
      const directionLabel = row.direction === "under" ? "UNDER" : "OVER";
      const odds = getFavoredOdds(row);
      return `${index + 1}. ${row.pitcher} ${row.team} — ${directionLabel} ${formatPropLine(row.kLine)} (${odds}) · Edge ${formatSignedEdge(row.projectionEdge)}`;
    });
    const shortCaption = [
      `MLB K Props - ${dateLabel}`,
      "",
      ...shortLines,
      "",
      "Full table: link in bio",
      "#MLB #Strikeouts",
    ].join("\n");

    if (shortCaption.length > 280) {
      return { skipped: true, reason: `Skipping: generated caption is ${caption.length} characters (and ${shortCaption.length} shortened); expected 280 or fewer.`, caption: "", topProps: [] };
    }
    return { skipped: false, reason: "", caption: shortCaption, topProps };
  }

  return { skipped: false, reason: "", caption, topProps };
}

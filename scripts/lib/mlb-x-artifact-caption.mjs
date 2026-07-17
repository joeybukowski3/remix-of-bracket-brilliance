/**
 * mlb-x-artifact-caption.mjs
 *
 * Caption builders that consume the immutable selection artifact directly --
 * NOT a live page scrape. The rows the caption is built from are returned as
 * `captionRows` so the poster can prove (via assertArtifactConsistency) that
 * the caption, the screenshot, and the artifact all describe the same players
 * in the same order. Caption text/format mirrors the previous HR/K captions.
 */

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateLabel(dateValue) {
  const raw = normalizeText(dateValue);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPropLine(value) {
  const number = toFiniteNumber(value);
  if (number == null || number <= 0) return "";
  return Number.isInteger(number) ? number.toFixed(0) : String(number);
}

function formatSignedEdge(edge) {
  const value = toFiniteNumber(edge);
  if (value == null) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function buildHrCaptionFromArtifact(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  if (rows.length < 1) return { skipped: true, reason: "No confirmed HR rows to post.", caption: "", captionRows: [] };

  const dateLabel = formatDateLabel(artifact?.slateDate);
  const lines = rows.map((row, index) => {
    const score = toFiniteNumber(row.hrScore);
    return `${index + 1}. ${row.player} (${row.team}) - HR Score ${score != null ? score.toFixed(1) : "—"} | ${row.hrOddsYes ?? ""}`.trim();
  });

  const caption = [
    `JoeKnowsBall MLB HR Props - ${dateLabel}`,
    "",
    "Top model edges:",
    ...lines,
    "",
    "Free Access to Full Table at Link in Bio",
    "",
    "#MLB #MLBPicks #HomeRun #PropBets #MLBBetting",
  ].join("\n");

  if (caption.length <= 280) return { skipped: false, reason: "", caption, captionRows: rows };

  const shortLines = rows.map((row, index) => {
    const score = toFiniteNumber(row.hrScore);
    return `${index + 1}. ${row.player} ${row.team} — HR ${score != null ? score.toFixed(1) : "—"} | ${row.hrOddsYes ?? ""}`.trim();
  });
  const shortCaption = [`MLB HR Props - ${dateLabel}`, "", ...shortLines, "", "Full table: link in bio", "#MLB #HomeRun"].join("\n");
  if (shortCaption.length <= 280) return { skipped: false, reason: "", caption: shortCaption, captionRows: rows };
  return { skipped: true, reason: `Skipping: caption is ${caption.length} chars; expected 280 or fewer.`, caption: "", captionRows: [] };
}

/**
 * Approved static self-reply copy for the K value-post. Never varies by
 * data -- posted verbatim as a reply to the main K value post, carrying the
 * CTA/hashtags that used to live in the main caption. Exact wording per
 * product approval; only ever change it if a platform character-limit issue
 * forces a change, and report that before changing it (currently 116 chars,
 * far under the 280 limit, so no truncation risk today).
 */
export const K_VALUE_REPLY_CAPTION = [
  "Full table and custom models are FREE at JoeKnowsBall. Link in bio.",
  "",
  "#MLB #StrikeoutProps #MLBPicks #SportsAnalytics",
].join("\n");

/**
 * Main K value-post caption: leads with the top-ranked qualified play (rank
 * 1 in artifact.rows, already sorted by absolute projection edge in
 * mlb-k-x-selection-core.mjs), then lists the rest of the qualified board.
 * Deliberately contains NO CTA, URL, hashtags, or question -- that copy
 * moved to the self-reply (K_VALUE_REPLY_CAPTION above); this caption is
 * the value summary only.
 */
export function buildKCaptionFromArtifact(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  if (rows.length < 1) return { skipped: true, reason: "No confirmed K value plays to post.", caption: "", captionRows: [] };

  const dateLabel = formatDateLabel(artifact?.slateDate);
  const [top, ...rest] = rows;
  const topSide = normalizeText(top.side).toUpperCase() === "UNDER" ? "UNDER" : "OVER";
  const topProjected = toFiniteNumber(top.projectedKs);

  const topBlock = [
    `Top Value Play: ${top.pitcher} (${top.team}) vs ${top.opponent}`,
    `${topSide} ${formatPropLine(top.kLine)} Ks (${top.odds ?? ""}) — Model ${topProjected != null ? topProjected.toFixed(1) : "—"} K (${formatSignedEdge(top.projectionEdge)} edge)`,
  ].join("\n");

  const restLines = rest.map((row, index) => {
    const side = normalizeText(row.side).toUpperCase() === "UNDER" ? "UNDER" : "OVER";
    return `${index + 2}. ${row.pitcher} ${row.team} — ${side} ${formatPropLine(row.kLine)} (${row.odds ?? ""})`;
  });

  const caption = [`JoeKnowsBall MLB K Props - ${dateLabel}`, "", topBlock, ...(restLines.length ? ["", ...restLines] : [])].join("\n");

  if (caption.length <= 280) return { skipped: false, reason: "", caption, captionRows: rows };

  // Shorter fallback: still leads with the top play, compacts the rest onto
  // single lines with no per-row edge, still zero CTA/URL/hashtags/question.
  const shortRestLines = rest.map((row, index) => {
    const side = normalizeText(row.side).toUpperCase() === "UNDER" ? "UNDER" : "OVER";
    return `${index + 2}. ${row.pitcher} — ${side} ${formatPropLine(row.kLine)} (${row.odds ?? ""})`;
  });
  const shortTopBlock = `Top Play: ${top.pitcher} (${top.team}) — ${topSide} ${formatPropLine(top.kLine)} Ks (${top.odds ?? ""})`;
  const shortCaption = [`MLB K Props - ${dateLabel}`, "", shortTopBlock, ...(shortRestLines.length ? ["", ...shortRestLines] : [])].join("\n");
  if (shortCaption.length <= 280) return { skipped: false, reason: "", caption: shortCaption, captionRows: rows };
  return { skipped: true, reason: `Skipping: caption is ${caption.length} chars; expected 280 or fewer.`, caption: "", captionRows: [] };
}

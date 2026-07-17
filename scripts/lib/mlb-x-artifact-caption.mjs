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
 * Main K value-post caption: describes ONLY the top-ranked qualified play
 * (rank 1 in artifact.rows, already sorted by absolute projection edge in
 * mlb-k-x-selection-core.mjs) against the exact approved template. No date
 * heading, no remaining rows (the screenshot carries the rest of the
 * board), no odds, no CTA, no URL, no hashtags, no question -- that CTA/
 * hashtag copy lives only in the self-reply (K_VALUE_REPLY_CAPTION above).
 *
 * `captionRows` intentionally returns the FULL artifact.rows (not just the
 * described top row): it is a data-flow proof that this function operated
 * on the exact same row set/order that got rendered into the screenshot
 * (see assertArtifactConsistency in mlb-x-selection-artifact.mjs), not a
 * literal list of what the caption text mentions.
 */
export function buildKCaptionFromArtifact(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  if (rows.length < 1) return { skipped: true, reason: "No confirmed K value plays to post.", caption: "", captionRows: [] };

  const top = rows[0];
  const side = normalizeText(top.side).toUpperCase() === "UNDER" ? "Under" : "Over";
  const projectedKs = toFiniteNumber(top.projectedKs);
  const kLine = toFiniteNumber(top.kLine);
  const kLineLabel = kLine != null ? kLine.toFixed(1) : "—";

  const caption = [
    `${top.pitcher} leads today's qualified K value board.`,
    "",
    `Model projection: ${projectedKs != null ? projectedKs.toFixed(1) : "—"} K`,
    `Market line: ${kLineLabel} K`,
    `Recommended side: ${side} ${kLineLabel}`,
    `Projection edge: ${formatSignedEdge(top.projectionEdge)} K`,
  ].join("\n");

  if (caption.length <= 280) return { skipped: false, reason: "", caption, captionRows: rows };
  // No compact alternate wording -- the template is comfortably under 280
  // chars for any realistic pitcher name; a pathological case fails closed.
  return { skipped: true, reason: `Skipping: caption is ${caption.length} chars; expected 280 or fewer.`, caption: "", captionRows: [] };
}

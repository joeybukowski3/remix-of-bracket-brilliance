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

export function buildKCaptionFromArtifact(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  if (rows.length < 1) return { skipped: true, reason: "No confirmed K rows to post.", caption: "", captionRows: [] };

  const dateLabel = formatDateLabel(artifact?.slateDate);
  const blocks = rows.map((row, index) => {
    const side = normalizeText(row.side).toUpperCase() === "UNDER" ? "UNDER" : "OVER";
    const header = `${index + 1}. ${row.pitcher} (${row.team}) vs ${row.opponent}`;
    const pickLine = `${side} ${formatPropLine(row.kLine)} Ks (${row.odds ?? ""})`;
    const projected = toFiniteNumber(row.projectedKs);
    const projectionLine = `Projection: ${projected != null ? projected.toFixed(1) : "—"}`;
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

  if (caption.length <= 280) return { skipped: false, reason: "", caption, captionRows: rows };

  const shortLines = rows.map((row, index) => {
    const side = normalizeText(row.side).toUpperCase() === "UNDER" ? "UNDER" : "OVER";
    return `${index + 1}. ${row.pitcher} ${row.team} — ${side} ${formatPropLine(row.kLine)} (${row.odds ?? ""}) · Edge ${formatSignedEdge(row.projectionEdge)}`;
  });
  const shortCaption = [`MLB K Props - ${dateLabel}`, "", ...shortLines, "", "Full table: link in bio", "#MLB #Strikeouts"].join("\n");
  if (shortCaption.length <= 280) return { skipped: false, reason: "", caption: shortCaption, captionRows: rows };
  return { skipped: true, reason: `Skipping: caption is ${caption.length} chars; expected 280 or fewer.`, caption: "", captionRows: [] };
}

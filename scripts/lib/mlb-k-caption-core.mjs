function normalizeText(value) { return typeof value === "string" ? value.trim() : ""; }
function toFiniteNumber(value) { const parsed = Number(value); return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed; }
export function isAmericanOdds(value) { return /^[+-]\d+$/.test(normalizeText(value)); }
export function isPlaceholderText(value) { const v = normalizeText(value).toUpperCase(); return !v || ["TBD","TBA","N/A","NA","NULL","UNKNOWN"].includes(v); }
export function formatPropLine(value) { const n = toFiniteNumber(value); return n == null || n <= 0 ? "" : Number.isInteger(n) ? n.toFixed(0) : String(n); }
export function formatSignedEdge(edge) { return edge == null || !Number.isFinite(edge) ? "" : `${edge > 0 ? "+" : ""}${edge.toFixed(1)}`; }
export function getFavoredOdds(row) { return String(row?.direction ?? "").toLowerCase() === "under" ? row?.oddsUnder : row?.oddsOver; }
export function formatDateLabel(value) { const raw = normalizeText(value); if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }); const date = new Date(`${raw}T00:00:00`); return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

export function validateRows(rows) {
  if (!rows.length) return "Skipping: no eligible K prop rows are available.";
  for (const row of rows) {
    if (isPlaceholderText(row.pitcher) || isPlaceholderText(row.team)) return "Skipping: pitcher identity is missing.";
    if (!Number.isFinite(row.strikeoutScore) || !Number.isFinite(row.projectedKs)) return "Skipping: model data is missing.";
    if (!formatPropLine(row.kLine)) return "Skipping: K line is missing.";
    const direction = String(row.direction ?? "").toLowerCase();
    if (!["over","under"].includes(direction) || !Number.isFinite(row.projectionEdge) || !isAmericanOdds(getFavoredOdds({ ...row, direction }))) return "Skipping: market data is incomplete.";
  }
  return "";
}

export function buildCaption({ date, rows }) {
  const error = validateRows(rows);
  if (error) return { skipped: true, reason: error, caption: "", topProps: [] };
  const caption = [`MLB K Props - ${formatDateLabel(date)}`, ...rows.map((row, index) => `${index + 1}. ${row.pitcher} ${String(row.direction).toUpperCase()} ${formatPropLine(row.kLine)} (${getFavoredOdds(row)})`), "Full table: link in bio", "#MLB #Strikeouts"].join("\n");
  return caption.length <= 280 ? { skipped: false, reason: "", caption, topProps: rows } : { skipped: true, reason: "Skipping: caption exceeds 280 characters.", caption: "", topProps: [] };
}

import { compactPlayerName, editionSentenceFor, fitCaption, weightedLength } from "./mlb-x-caption-budget.mjs";
export const K_CANONICAL_LINK = "joeknowsball.com/mlb/strikeout-props";
export const K_HASHTAGS = "#MLB #StrikeoutProps";

export function buildKEditionCaption({ rows = [], languageMode, slateDate }) {
  const morning = languageMode === "morning" || languageMode === "morning_catch_up";
  const dateLabel = formatDateLabel(slateDate);
  const sentence = editionSentenceFor(languageMode);
  const variants = [{ full: true, team: true }, { full: true, team: false }, { full: false, team: false }];

  if (morning) {
    const eligible = rows.filter((row) => !isPlaceholderText(row?.pitcher) && !isPlaceholderText(row?.team) && toFiniteNumber(row?.strikeoutScore) != null && toFiniteNumber(row?.projectedKs) != null);
    if (!eligible.length) return { skipped: true, reason: "Skipping: no model-qualified K targets are available.", caption: "", captionRows: [], diagnostics: null };
    const line = (row, variant) => `• ${variant.full ? row.pitcher : compactPlayerName(row.pitcher)}${variant.team ? ` (${row.team})` : ""} — ${toFiniteNumber(row.projectedKs).toFixed(1)} projected K`;
    const render = ({ rowsA, variant }) => [`⚾ Top Strikeout Targets — ${dateLabel}`, "", ...rowsA.map((row) => line(row, variant)), "", sentence, K_CANONICAL_LINK, K_HASHTAGS].join("\n");
    const fitted = fitCaption({ groupA: eligible, groupB: [], render, variants, maxPerGroup: 5 });
    if (!fitted.ok) return { skipped: true, reason: "Skipping: morning K caption exceeds the character limit.", caption: "", captionRows: [], diagnostics: fitted.diagnostics };
    return { skipped: false, reason: "", caption: fitted.caption, captionRows: fitted.rowsA, omittedRows: eligible.slice(fitted.rowsA.length), languageMode, diagnostics: { ...fitted.diagnostics, weightedLength: weightedLength(fitted.caption) } };
  }

  const normalized = rows.map((row) => ({ ...row, direction: String(row?.direction ?? "").toLowerCase() }));
  const eligible = normalized.filter((row) => !validateRows([row]));
  if (!eligible.length) return { skipped: true, reason: "Skipping: no eligible K value rows are available.", caption: "", captionRows: [], diagnostics: null };
  const overs = eligible.filter((row) => row.direction === "over");
  const unders = eligible.filter((row) => row.direction === "under");
  const line = (row, variant) => `• ${variant.full ? row.pitcher : compactPlayerName(row.pitcher)}${variant.team ? ` (${row.team})` : ""} ${row.direction === "under" ? "U" : "O"}${formatPropLine(row.kLine)} ${getFavoredOdds(row)}`;
  const render = ({ rowsA, rowsB, variant }) => [`⚾ Updated Strikeout Props — ${dateLabel}`, ...(rowsA.length ? ["", "Overs", ...rowsA.map((row) => line(row, variant))] : []), ...(rowsB.length ? ["", "Unders", ...rowsB.map((row) => line(row, variant))] : []), "", sentence, K_CANONICAL_LINK, K_HASHTAGS].join("\n");
  const fitted = fitCaption({ groupA: overs, groupB: unders, render, variants });
  if (!fitted.ok) return { skipped: true, reason: "Skipping: confirmed K caption exceeds the character limit.", caption: "", captionRows: [], diagnostics: fitted.diagnostics };
  return { skipped: false, reason: "", caption: fitted.caption, captionRows: [...fitted.rowsA, ...fitted.rowsB], omittedRows: [...overs.slice(fitted.rowsA.length), ...unders.slice(fitted.rowsB.length)], languageMode, diagnostics: { ...fitted.diagnostics, weightedLength: weightedLength(fitted.caption) } };
}

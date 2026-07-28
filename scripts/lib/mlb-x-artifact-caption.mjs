function normalizeText(value) { return typeof value === "string" ? value.trim() : ""; }
function toFiniteNumber(value) { const parsed = Number(value); return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed; }
function formatDateLabel(value) { const raw = normalizeText(value); if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }); const date = new Date(`${raw}T00:00:00`); return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function formatSignedEdge(edge) { const value = toFiniteNumber(edge); return value == null ? "" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }

export function buildHrCaptionFromArtifact(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  if (!rows.length) return { skipped: true, reason: "No confirmed HR rows to post.", caption: "", captionRows: [] };
  const lines = rows.map((row, index) => `${index + 1}. ${row.player} (${row.team}) - HR Score ${toFiniteNumber(row.hrScore)?.toFixed(1) ?? "—"} | ${row.hrOddsYes ?? ""}`.trim());
  const caption = [`JoeKnowsBall MLB HR Props - ${formatDateLabel(artifact?.slateDate)}`, "", "Top model edges:", ...lines, "", "Free Access to Full Table at Link in Bio", "", "#MLB #MLBPicks #HomeRun #PropBets #MLBBetting"].join("\n");
  return caption.length <= 280 ? { skipped: false, reason: "", caption, captionRows: rows } : { skipped: true, reason: "Skipping: caption exceeds 280 characters.", caption: "", captionRows: [] };
}

export const K_VALUE_REPLY_CAPTION = ["Full table and custom models are FREE at JoeKnowsBall. Link in bio.", "", "#MLB #StrikeoutProps #MLBPicks #SportsAnalytics"].join("\n");

export function buildKCaptionFromArtifact(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  if (!rows.length) return { skipped: true, reason: "No confirmed K value plays to post.", caption: "", captionRows: [] };
  const top = rows[0];
  const side = normalizeText(top.side).toUpperCase() === "UNDER" ? "Under" : "Over";
  const projectedKs = toFiniteNumber(top.projectedKs);
  const kLine = toFiniteNumber(top.kLine);
  const lineLabel = kLine != null ? kLine.toFixed(1) : "—";
  const caption = [`${top.pitcher} leads today's qualified K value board.`, "", `Model projection: ${projectedKs != null ? projectedKs.toFixed(1) : "—"} K`, `Market line: ${lineLabel} K`, `Recommended side: ${side} ${lineLabel}`, `Projection edge: ${formatSignedEdge(top.projectionEdge)} K`].join("\n");
  return caption.length <= 280 ? { skipped: false, reason: "", caption, captionRows: rows } : { skipped: true, reason: "Skipping: caption exceeds 280 characters.", caption: "", captionRows: [] };
}

import { compactPlayerName, editionSentenceFor, fitCaption, weightedLength } from "./mlb-x-caption-budget.mjs";
export const HR_CANONICAL_LINK = "joeknowsball.com/mlb/hr-props";
export const HR_HASHTAGS = "#MLB #HomeRun";
export const HR_LONGSHOT_ODDS_FLOOR = 350;

function hasHrPrice(row) { return /^[+-]\d+$/.test(normalizeText(row?.hrOddsYes ?? row?.odds)); }
function isMorningLanguage(languageMode) { return languageMode === "morning" || languageMode === "morning_catch_up"; }

export function hrCategoryOf(row) {
  const explicit = normalizeText(row?.category).toLowerCase();
  if (explicit === "longshot" || explicit === "model") return { category: explicit, heuristic: false };
  const odds = Number(String(row?.hrOddsYes ?? row?.odds ?? "").replace("+", ""));
  return { category: Number.isFinite(odds) && odds >= HR_LONGSHOT_ODDS_FLOOR ? "longshot" : "model", heuristic: true };
}

export function classifyHrRows(rows = []) {
  const classified = rows.map((row) => ({ row, ...hrCategoryOf(row) }));
  const heuristicRows = classified.filter((entry) => entry.heuristic);
  return {
    classified,
    modelPlays: classified.filter((entry) => entry.category === "model").map((entry) => entry.row),
    longshots: classified.filter((entry) => entry.category === "longshot").map((entry) => entry.row),
    heuristicCount: heuristicRows.length,
    heuristicPlayers: heuristicRows.map((entry) => normalizeText(entry.row?.player)).filter(Boolean),
    usedHeuristic: heuristicRows.length > 0,
  };
}

export function buildHrEditionCaption({ rows = [], languageMode, slateDate }) {
  const morning = isMorningLanguage(languageMode);
  const dateLabel = formatDateLabel(slateDate);
  const sentence = editionSentenceFor(languageMode);
  const variants = [{ full: true, team: true }, { full: true, team: false }, { full: false, team: false }];

  if (morning) {
    const eligible = rows.filter((row) => normalizeText(row?.player) && toFiniteNumber(row?.hrScore) != null);
    if (!eligible.length) return { skipped: true, reason: "Skipping: no model-qualified HR targets are available.", caption: "", captionRows: [], diagnostics: null };
    const line = (row, variant) => `• ${variant.full ? row.player : compactPlayerName(row.player)}${variant.team && normalizeText(row.team) ? ` (${row.team})` : ""} — HR Score ${toFiniteNumber(row.hrScore).toFixed(1)}`;
    const render = ({ rowsA, variant }) => [`⚾ Top Home Run Targets — ${dateLabel}`, "", ...rowsA.map((row) => line(row, variant)), "", sentence, HR_CANONICAL_LINK, HR_HASHTAGS].join("\n");
    const fitted = fitCaption({ groupA: eligible, groupB: [], render, variants, maxPerGroup: 5 });
    if (!fitted.ok) return { skipped: true, reason: "Skipping: morning HR caption exceeds the character limit.", caption: "", captionRows: [], diagnostics: fitted.diagnostics };
    return { skipped: false, reason: "", caption: fitted.caption, captionRows: fitted.rowsA, omittedRows: eligible.slice(fitted.rowsA.length), languageMode, diagnostics: { ...fitted.diagnostics, weightedLength: weightedLength(fitted.caption), categoryHeuristicCount: 0, categoryHeuristicPlayers: [], usedCategoryHeuristic: false } };
  }

  const eligible = rows.filter((row) => normalizeText(row?.player) && hasHrPrice(row));
  if (!eligible.length) return { skipped: true, reason: "Skipping: no eligible priced HR rows are available.", caption: "", captionRows: [], diagnostics: null };
  const classification = classifyHrRows(eligible);
  const line = (row, variant) => `• ${variant.full ? row.player : compactPlayerName(row.player)}${variant.team && normalizeText(row.team) ? ` (${row.team})` : ""} ${normalizeText(row.hrOddsYes ?? row.odds)}`;
  const render = ({ rowsA, rowsB, variant }) => [`⚾ Updated Home Run Props — ${dateLabel}`, ...(rowsA.length ? ["", "Top model plays", ...rowsA.map((row) => line(row, variant))] : []), ...(rowsB.length ? ["", "Longshots", ...rowsB.map((row) => line(row, variant))] : []), "", sentence, HR_CANONICAL_LINK, HR_HASHTAGS].join("\n");
  const fitted = fitCaption({ groupA: classification.modelPlays, groupB: classification.longshots, render, variants });
  if (!fitted.ok) return { skipped: true, reason: "Skipping: confirmed HR caption exceeds the character limit.", caption: "", captionRows: [], diagnostics: fitted.diagnostics };
  return {
    skipped: false,
    reason: "",
    caption: fitted.caption,
    captionRows: [...fitted.rowsA, ...fitted.rowsB],
    omittedRows: [...classification.modelPlays.slice(fitted.rowsA.length), ...classification.longshots.slice(fitted.rowsB.length)],
    languageMode,
    diagnostics: { ...fitted.diagnostics, weightedLength: weightedLength(fitted.caption), categoryHeuristicCount: classification.heuristicCount, categoryHeuristicPlayers: classification.heuristicPlayers, usedCategoryHeuristic: classification.usedHeuristic },
  };
}

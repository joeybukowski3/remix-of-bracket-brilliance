/**
 * mlb-social-canonical-caption.mjs
 *
 * Phase 3 canonical caption layer. Consumes a frozen `SocialPostPlan` (see
 * mlb-social-post-plan.mjs) directly -- never re-derives, reranks, or
 * re-selects rows. `plan.rows`, in order, are exactly what a caption may
 * describe.
 *
 * Deliberately does NOT reuse the morning/confirmed caption builders
 * (mlb-k-caption-core.mjs's buildKEditionCaption, mlb-x-artifact-caption.mjs's
 * buildHrEditionCaption) -- those are edition-axis builders tied to the
 * legacy morning/confirmed language model, which the canonical product has
 * no concept of. It DOES reuse the shared budget/overflow primitives
 * (fitCaption, weightedLength, compactPlayerName) from mlb-x-caption-budget.mjs,
 * since that adaptive-length behavior is edition-agnostic.
 */
import { compactPlayerName, fitCaption, weightedLength, X_CHARACTER_LIMIT } from "./mlb-x-caption-budget.mjs";

export const K_CANONICAL_LINK = "joeknowsball.com/mlb/strikeout-props";
export const K_CANONICAL_HASHTAGS = "#MLB #StrikeoutProps";
export const HR_CANONICAL_LINK = "joeknowsball.com/mlb/hr-props";
export const HR_CANONICAL_HASHTAGS = "#MLB #HomeRunProps";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateLabel(slateDate) {
  const raw = normalizeText(slateDate);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Short doubleheader suffix for a caption line, e.g. " (G2)". Derived only
 * from the row's own `isDoubleheader`/`gameNumber` fields (never re-inferred
 * from anything else), and empty for a non-doubleheader row.
 */
function doubleheaderSuffix(row) {
  return row?.isDoubleheader && Number.isInteger(row?.gameNumber) ? ` (G${row.gameNumber})` : "";
}

function kRowLine(row, variant) {
  const content = row?.content ?? {};
  const who = variant.full ? row?.playerName : compactPlayerName(row?.playerName);
  const side = content.side === "UNDER" ? "U" : content.side === "OVER" ? "O" : "";
  const line = toFiniteNumber(content.kLine);
  const lineLabel = line == null ? "" : Number.isInteger(line) ? line.toFixed(0) : String(line);
  const odds = content.odds ? ` ${content.odds}` : "";
  const proj = toFiniteNumber(content.projectedKs);
  const projLabel = proj == null ? "" : ` — Proj ${proj.toFixed(1)}`;
  return `• ${who}${variant.team && row?.team ? ` (${row.team})` : ""}${doubleheaderSuffix(row)} ${side}${lineLabel} Ks${odds}${projLabel}`.trimEnd();
}

function hrRowLine(row, variant, index) {
  const content = row?.content ?? {};
  const who = variant.full ? row?.playerName : compactPlayerName(row?.playerName);
  const odds = content.odds ? ` ${content.odds}` : "";
  const score = toFiniteNumber(content.hrScore);
  const scoreLabel = score == null ? "" : ` — HR Score ${score.toFixed(1)}`;
  return `${index + 1}. ${who}${variant.team && row?.team ? ` (${row.team})` : ""}${doubleheaderSuffix(row)}${odds}${scoreLabel}`;
}

function buildCanonicalCaption({ plan, headline, link, hashtags, lineOf }) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  if (!rows.length) return { skipped: true, reason: "Skipping: plan has no rows.", caption: "", captionRows: [], omittedRows: [], diagnostics: null };

  const dateLabel = formatDateLabel(plan?.slateDate);
  const variants = [{ full: true, team: true }, { full: true, team: false }, { full: false, team: false }];
  const render = ({ rowsA, variant }) => [
    `${headline} — ${dateLabel}`,
    "",
    ...rowsA.map((row, index) => lineOf(row, variant, index)),
    "",
    `Full board: ${link}`,
    hashtags,
  ].join("\n");

  const fitted = fitCaption({ groupA: rows, groupB: [], render, variants, maxPerGroup: rows.length });
  if (!fitted.ok) {
    return { skipped: true, reason: "Skipping: canonical caption exceeds the character limit even at one row.", caption: "", captionRows: [], omittedRows: rows, diagnostics: fitted.diagnostics };
  }
  return {
    skipped: false,
    reason: "",
    caption: fitted.caption,
    captionRows: fitted.rowsA,
    omittedRows: rows.slice(fitted.rowsA.length),
    diagnostics: { ...fitted.diagnostics, weightedLength: weightedLength(fitted.caption) },
  };
}

/** @param {import("./mlb-social-post-plan.mjs").SocialPostPlan} plan */
export function buildKCanonicalCaption(plan) {
  return buildCanonicalCaption({
    plan,
    headline: "⚾ MLB Strikeout Props",
    link: K_CANONICAL_LINK,
    hashtags: K_CANONICAL_HASHTAGS,
    lineOf: kRowLine,
  });
}

/** @param {import("./mlb-social-post-plan.mjs").SocialPostPlan} plan */
export function buildHrCanonicalCaption(plan) {
  return buildCanonicalCaption({
    plan,
    headline: "💣 MLB Home Run Targets",
    link: HR_CANONICAL_LINK,
    hashtags: HR_CANONICAL_HASHTAGS,
    lineOf: hrRowLine,
  });
}

/**
 * Self-reply for rows that did not fit the primary canonical caption's
 * 280-character budget. Reuses the same fitCaption budgeting; only ever
 * built from `omittedRows` returned by buildKCanonicalCaption /
 * buildHrCanonicalCaption above, so the reply and primary post always trace
 * back to the same frozen plan. Part of ONE canonical post package -- never
 * a separately motivated "added player" post.
 *
 * @param {object[]} omittedRows
 * @param {"k"|"hr"} product
 */
export function buildCanonicalOmittedReply({ omittedRows = [], product }) {
  if (!omittedRows.length) return { shouldReply: false, caption: "", includedRows: [] };

  const lineOf = product === "hr" ? (row, variant) => hrRowLine(row, variant, 0).replace(/^1\.\s*/, "• ") : (row, variant) => kRowLine(row, variant);
  const variants = [{ full: true, team: true }, { full: false, team: false }];
  const render = ({ rowsA, variant }) => ["More model plays:", "", ...rowsA.map((row) => lineOf(row, variant))].join("\n");

  const fitted = fitCaption({ groupA: omittedRows, groupB: [], render, variants, maxPerGroup: omittedRows.length });
  if (!fitted.ok || fitted.rowsA.length === 0) {
    return { shouldReply: false, caption: "", includedRows: [] };
  }
  return { shouldReply: true, caption: fitted.caption, includedRows: fitted.rowsA };
}

export { weightedLength, X_CHARACTER_LIMIT };

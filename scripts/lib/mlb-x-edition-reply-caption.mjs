/**
 * Self-reply caption built from omittedRows -- the valid picks that did not
 * fit in the primary post's 280-character budget.
 *
 * The reply is optional content, never load-bearing: the edition sentence,
 * canonical link and hashtags all live in the primary caption already (see
 * buildKEditionCaption / buildHrEditionCaption), so a reply that fails or is
 * skipped never removes anything the primary post needs to stand on its own.
 * When there is nothing omitted, no reply is requested at all.
 */
import { compactPlayerName, fitCaption, weightedLength, X_CHARACTER_LIMIT } from "./mlb-x-caption-budget.mjs";

function kLine(row, variant) {
  const who = variant.name ? row.pitcher : compactPlayerName(row.pitcher);
  const side = row.direction === "under" ? "U" : "O";
  const line = Number(row.kLine);
  const odds = row.direction === "under" ? row.oddsUnder : row.oddsOver;
  return `• ${who} ${side}${Number.isFinite(line) ? (Number.isInteger(line) ? line.toFixed(0) : String(line)) : ""} Ks ${odds ?? ""}`.trimEnd();
}

function hrLine(row, variant) {
  const who = variant.name ? row.player : compactPlayerName(row.player);
  return `• ${who} ${row.hrOddsYes ?? row.odds ?? ""}`.trimEnd();
}

/**
 * @param {object[]} omittedRows valid rows that did not fit in the primary post
 * @param {"k"|"hr"} market
 * @returns {{ shouldReply: boolean, caption: string, includedRows: object[] }}
 */
export function buildOmittedRowsReply({ omittedRows = [], market }) {
  if (!omittedRows.length) return { shouldReply: false, caption: "", includedRows: [] };

  const line = market === "hr" ? hrLine : kLine;
  const variants = [{ name: true }, { name: false }];
  const render = ({ rowsA, variant }) => ["More model plays:", "", ...rowsA.map((row) => line(row, variant))].join("\n");

  const fitted = fitCaption({ groupA: omittedRows, groupB: [], render, variants, maxPerGroup: omittedRows.length });
  if (!fitted.ok || fitted.rowsA.length === 0) {
    // Nothing fits even at one row -- the reply is skipped, not forced. The
    // primary post already carries everything it needs.
    return { shouldReply: false, caption: "", includedRows: [] };
  }
  return { shouldReply: true, caption: fitted.caption, includedRows: fitted.rowsA };
}

export { weightedLength, X_CHARACTER_LIMIT };

import * as cheerio from "cheerio";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

function textOf($, node) {
  return $(node).text().replace(/\s+/g, " ").trim();
}

function isSummaryTable($, table) {
  const headings = $(table)
    .find("th")
    .map((_, th) => textOf($, th).toLowerCase())
    .get();
  return headings.includes("player")
    && headings.includes("matchup")
    && headings.includes("score")
    && headings.includes("opposing pitcher");
}

function mobileSummaryTable($, table) {
  const rows = $(table).find("tr").slice(1).toArray();
  if (!rows.length) return null;

  const cards = rows.map((row) => {
    const cells = $(row).children("td").toArray();
    if (cells.length < 4) return "";

    const playerHtml = $(cells[0]).html() || "";
    const matchupHtml = $(cells[1]).html() || "";
    const scoreHtml = $(cells[2]).html() || "";
    const pitcherHtml = $(cells[3]).html() || "";

    return `
      <tr>
        <td style="padding:0 0 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
            <tr>
              <td valign="top" style="padding:10px 12px;width:auto;min-width:0;font-family:${FONT};font-size:13px;line-height:1.35;color:${INK};overflow-wrap:anywhere;word-break:normal;">${playerHtml}
                <div style="margin-top:4px;font-family:${FONT};font-size:11px;line-height:1.35;color:${MUTED};white-space:normal;overflow-wrap:anywhere;word-break:normal;">${matchupHtml}</div>
              </td>
              <td width="64" valign="top" align="right" style="width:64px;padding:10px 10px 10px 4px;">${scoreHtml}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:8px 12px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:11px;line-height:1.35;color:${MUTED};">
                <span style="font-weight:700;color:${INK};">Opposing pitcher:</span> ${pitcherHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${cards}</table>`;
}

/**
 * Rewrites browser-friendly email HTML into markup that remains readable in
 * Gmail's narrow embedded mobile viewport. It intentionally uses only tables
 * and inline styles because many email clients strip media queries and style
 * blocks.
 */
export function makeNumerologyEmailMobileSafe(html) {
  const $ = cheerio.load(html, null, false);

  // Gmail can honor the legacy width attribute before the responsive style.
  // Keep max-width in CSS, but make the actual HTML attribute fluid.
  $("table").each((_, table) => {
    const style = $(table).attr("style") || "";
    if ($(table).attr("width") === "680" || /max-width\s*:\s*680px/i.test(style)) {
      $(table).attr("width", "100%");
      if (!/table-layout\s*:/i.test(style)) {
        $(table).attr("style", `${style}table-layout:auto;min-width:0;`);
      }
    }
  });

  $("table").each((_, table) => {
    if (!isSummaryTable($, table)) return;
    const replacement = mobileSummaryTable($, table);
    if (replacement) $(table).replaceWith(replacement);
  });

  // Prevent names and matchup text from collapsing into one-character lines.
  $("td, div, span").each((_, node) => {
    const style = $(node).attr("style") || "";
    if (/font-family/i.test(style) && !/word-break\s*:/i.test(style)) {
      $(node).attr("style", `${style}word-break:normal;overflow-wrap:anywhere;`);
    }
  });

  return $.html();
}

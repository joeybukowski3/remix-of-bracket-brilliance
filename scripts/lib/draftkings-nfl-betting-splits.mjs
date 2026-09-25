import { JSDOM } from "jsdom";

export const DK_SPLITS_URL = "https://dknetwork.draftkings.com/draftkings-sportsbook-betting-splits/";
export const DK_MARKETS = ["Spread", "Moneyline", "Total"];
const MARKET_KEY = { Spread: "spread", Moneyline: "moneyline", Total: "total" };
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function marketUrl(market, page = 1) {
  if (!DK_MARKETS.includes(market) || !Number.isInteger(page) || page < 1) throw new Error("Invalid DK market/page");
  const url = new URL(DK_SPLITS_URL);
  url.searchParams.set("itm_content", "NFL");
  url.searchParams.set("tb_edate", "n7days");
  url.searchParams.set("tb_eg", "88808");
  url.searchParams.set("tb_emt", market);
  if (page > 1) url.searchParams.set("tb_page", String(page));
  return url.href;
}

function percent(value) {
  const match = /^(\d{1,3})%$/.exec(clean(value));
  if (!match || Number(match[1]) > 100) throw new Error(`Invalid percentage: ${JSON.stringify(clean(value))}`);
  return Number(match[1]);
}

function americanOdds(value) {
  const normalized = clean(value).replace(/\u2212/g, "-");
  if (!/^[+-]\d{3,4}$/.test(normalized) || Math.abs(Number(normalized)) < 100) {
    throw new Error(`Invalid American odds: ${JSON.stringify(clean(value))}`);
  }
  return Number(normalized);
}

function parseSide(label, market) {
  if (market === "Moneyline") {
    if (!label) throw new Error("Missing team side");
    return { side: label, line: null };
  }
  if (market === "Total") {
    const match = /^(Over|Under)\s+((?:\d+(?:\.\d+)?)|PK|Pick(?:'em|em)?)$/i.exec(label);
    if (!match) throw new Error(`Invalid total side/line: ${JSON.stringify(label)}`);
    if (/^(?:PK|Pick)/i.test(match[2])) throw new Error("Pick'em is not a total line");
    return { side: match[1].toLowerCase(), line: Number(match[2]) };
  }
  const match = /^(.+?)\s+([+\-\u2212]\d+(?:\.\d+)?|PK|Pick(?:'em|em)?)$/i.exec(label);
  if (!match) throw new Error(`Invalid spread side/line: ${JSON.stringify(label)}`);
  const token = match[2].replace(/\u2212/g, "-");
  return { side: clean(match[1]), line: /^(?:PK|Pick)/i.test(token) ? 0 : Number(token) };
}

/**
 * Parses the server-rendered DKN page template: .tb-se is a matchup,
 * .tb-se-title-new is the authoritative away @ home heading, and .tb-sodd
 * contains side / odds / handle / bets in its four direct flex columns.
 * This function never fetches and does not infer orientation from side order.
 */
export function parseDraftKingsSplitsHtml(html, { market, capturedAt, page = 1, sourceUrl = marketUrl(market, page) }) {
  if (!DK_MARKETS.includes(market)) throw new Error(`Unsupported market: ${market}`);
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error("Invalid capturedAt");
  const document = new JSDOM(html).window.document;
  const games = [];
  const diagnostics = [];
  const blocks = [...document.querySelectorAll("#tbsedid .tb-se")];
  for (const [index, block] of blocks.entries()) {
    const heading = clean(block.querySelector(".tb-se-title-new a")?.textContent);
    const dateText = clean(block.querySelector(".tb-se-title > span")?.textContent);
    const matchup = /^(.+?)\s+@\s+(.+)$/.exec(heading);
    if (!matchup) {
      diagnostics.push({ code: "malformed_matchup", market: MARKET_KEY[market], page, index, sourceText: heading });
      continue;
    }
    const sides = [];
    let invalid = false;
    for (const row of block.querySelectorAll(".tb-sodd")) {
      const columns = [...row.children];
      const sourceText = clean(row.textContent);
      try {
        if (columns.length !== 4) throw new Error(`Expected four columns; got ${columns.length}`);
        const label = clean(columns[0].textContent);
        const side = parseSide(label, market);
        const odds = americanOdds(columns[1].querySelector(".tb-odd-s")?.textContent);
        const handlePct = percent(columns[2].textContent);
        const betsPct = percent(columns[3].textContent);
        sides.push({ ...side, odds, handlePct, betsPct, capturedAt, sourceText });
      } catch (error) {
        invalid = true;
        diagnostics.push({ code: "malformed_side", market: MARKET_KEY[market], page, index, matchupHeading: heading, sourceText, detail: error.message });
      }
    }
    const expected = market === "Total" ? ["over", "under"] : [clean(matchup[1]), clean(matchup[2])];
    const actual = sides.map((side) => side.side.toLowerCase());
    if (sides.length !== 2 || new Set(actual).size !== 2 || expected.some((side) => !actual.includes(side.toLowerCase()))) {
      invalid = true;
      diagnostics.push({ code: "incomplete_market", market: MARKET_KEY[market], page, index, matchupHeading: heading, sourceText: heading, detail: `Expected ${expected.join(" / ")}, found ${sides.map((s) => s.side).join(" / ")}` });
    }
    if (!invalid) {
      for (const field of ["handlePct", "betsPct"]) {
        const sum = sides[0][field] + sides[1][field];
        // Source values are whole percentages; each rounded side may differ by 1.
        if (sum < 99 || sum > 101) {
          invalid = true;
          diagnostics.push({ code: "percentage_structure", market: MARKET_KEY[market], page, index, matchupHeading: heading, sourceText: heading, detail: `${field} sum=${sum}` });
        }
      }
    }
    if (!invalid) games.push({ awaySource: clean(matchup[1]), homeSource: clean(matchup[2]), dateText, sides, market: MARKET_KEY[market], page, sourceUrl, capturedAt });
  }
  const pages = new Set([page]);
  for (const anchor of document.querySelectorAll(".tb_pagination a[href]")) {
    try {
      const url = new URL(anchor.getAttribute("href"), sourceUrl);
      const expectedUrl = new URL(marketUrl(market));
      if (url.origin !== expectedUrl.origin || url.pathname !== expectedUrl.pathname) continue;
      if (["itm_content", "tb_edate", "tb_eg", "tb_emt"].some((key) => url.searchParams.get(key) !== expectedUrl.searchParams.get(key))) continue;
      const raw = url.searchParams.get("tb_page");
      if (raw && /^[1-9]\d*$/.test(raw)) pages.add(Number(raw));
    } catch { /* An invalid pagination link is ignored, never fetched. */ }
  }
  return { market: MARKET_KEY[market], page, blocksSeen: blocks.length, sidesSeen: [...document.querySelectorAll("#tbsedid .tb-sodd")].length, games, diagnostics, observedPages: [...pages].sort((a, b) => a - b) };
}

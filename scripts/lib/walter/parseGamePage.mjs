import { JSDOM } from "jsdom";

/**
 * Parses a raw WalterFootball weekly picks page (one "window" page, e.g.
 * nflpicks{season}_{week}early.php) into one raw panel per game.
 *
 * DOM anchors this relies on (verified against a live fetch of
 * nflpicks2026_01early.php on 2026-09-09 -- see __fixtures__):
 *   - Each game lives in `div.panel[id]` (id is Walter's own shorthand, e.g.
 *     "NEP_SEA"; NOT used for team identity here -- see teamAbbreviations.mjs).
 *   - `.panel-heading` holds two `img[title]` tags (away team, home team, in
 *     that DOM order) plus a `<b>` with "{Away} (rec) at {Home} (rec)" and a
 *     "Line: ... Total: ..." line, then a trailing kickoff-datetime text node.
 *   - `.panel-body` holds `h3` section headers ("The Matchup. Edge: X.",
 *     "The Motivation...", "The Spread...", "The Vegas...", "The Trends...")
 *     followed by that section's paragraphs/list items, in document order.
 *   - Inline `<i>LABEL:</i>` tags inside "The Matchup" mark team-specific or
 *     topical subsections (e.g. "NEW ENGLAND OFFENSE:", "SAME-GAME PARLAY:").
 *   - `.panel-body div.thePick` holds the official pick block.
 *   - Premium-gated content (verified) lives entirely OUTSIDE `.panel` /
 *     `.panel-body` -- it appears as a `<p>` sibling after the panel closes.
 *     Scoping extraction to `.panel-body` therefore never crosses the
 *     paywall by construction; `containsPaywallMarker` below is a defensive
 *     double-check only, in case a future layout change moves that boundary.
 */

const PAYWALL_MARKER = "Premium members have access";

function textOf(node) {
  if (!node) return "";
  return node.textContent.replace(/\s+/g, " ").trim();
}

function containsPaywallMarker(text) {
  return text.includes(PAYWALL_MARKER);
}

function parseHeading(panelEl, warnings, panelId) {
  const heading = panelEl.querySelector(".panel-heading");
  if (!heading) {
    warnings.push(`panel ${panelId}: missing .panel-heading`);
    return { awayName: null, homeName: null, headerLine: "", kickoffText: "" };
  }

  const imgs = Array.from(heading.querySelectorAll("img[title]"));
  const awayName = imgs[0]?.getAttribute("title") ?? null;
  const homeName = imgs[1]?.getAttribute("title") ?? null;
  if (!awayName || !homeName) {
    warnings.push(`panel ${panelId}: could not read both team names from heading images`);
  }

  const boldEl = heading.querySelector("b");
  const boldText = textOf(boldEl);

  // boldText looks like: "New England Patriots (0-0) at Seattle Seahawks
  // (0-0) Line: Seahawks by 3.5. Total: 44.5." -- split off the "Line:" part.
  const lineMatch = boldText.match(/Line:.*$/);
  const headerLine = lineMatch ? lineMatch[0].trim() : "";

  // The kickoff datetime is the heading's own trailing text node, after the
  // closing </b>.
  const headingFullText = textOf(heading);
  const kickoffText = headingFullText.replace(boldText, "").trim();

  return { awayName, homeName, headerLine, kickoffText };
}

function edgeFromH3(h3El) {
  const text = textOf(h3El);
  const match = text.match(/Edge:\s*([^.]*)\.?\s*$/i);
  const edge = match ? match[1].trim() : "";
  return edge.length > 0 && edge.toLowerCase() !== "none" ? edge : null;
}

function collectSectionNodes(startH3) {
  const nodes = [];
  let node = startH3.nextElementSibling;
  while (node && node.tagName !== "H3") {
    nodes.push(node);
    node = node.nextElementSibling;
  }
  return nodes;
}

/**
 * Splits "The Matchup" section content into inline-label subsections (e.g.
 * "NEW ENGLAND OFFENSE:", "SAME-GAME PARLAY:") plus any leading prose that
 * appears before the first label (season-level fluff on early-week pages,
 * game-specific thesis prose on most others).
 */
function parseMatchupSection(nodes) {
  const leadingParagraphs = [];
  const labeledBlocks = [];
  let currentLabel = null;
  let currentText = [];

  function flush() {
    if (currentLabel) {
      labeledBlocks.push({ label: currentLabel, text: currentText.join(" ").trim() });
    }
    currentLabel = null;
    currentText = [];
  }

  for (const node of nodes) {
    if (node.tagName !== "P") continue;
    const iEl = node.querySelector(":scope > i");
    if (iEl) {
      flush();
      currentLabel = textOf(iEl).replace(/:\s*$/, "").trim();
      const rest = textOf(node).replace(textOf(iEl), "").trim();
      currentText = rest ? [rest] : [];
      continue;
    }

    const text = textOf(node);
    if (!text) continue;
    if (currentLabel) {
      currentText.push(text);
    } else {
      leadingParagraphs.push(text);
    }
  }
  flush();

  return { leadingParagraphs, labeledBlocks };
}

function parseSpreadSection(nodes) {
  const lines = {};
  for (const node of nodes) {
    const bEl = node.querySelector?.(":scope > b");
    if (!bEl) continue;
    const label = textOf(bEl).replace(/:\s*$/, "").trim();
    const value = textOf(node).replace(textOf(bEl), "").trim();
    if (label) lines[label] = value;
  }
  return lines;
}

function parseVegasSection(nodes) {
  const paragraphs = [];
  for (const node of nodes) {
    if (node.tagName === "P") {
      const text = textOf(node);
      if (text) paragraphs.push(text);
    }
  }
  return paragraphs;
}

function parseTrendsSection(nodes) {
  const items = [];
  const lines = {};
  for (const node of nodes) {
    const listItems = node.tagName === "LI" ? [node] : Array.from(node.querySelectorAll?.("li") ?? []);
    for (const li of listItems) {
      const bEl = li.querySelector(":scope > b");
      if (bEl) {
        const label = textOf(bEl).replace(/:\s*$/, "").trim();
        const value = textOf(li).replace(textOf(bEl), "").trim();
        if (label) lines[label] = value;
      } else {
        const text = textOf(li);
        if (text) items.push(text);
      }
    }
  }
  return { items, lines };
}

function parsePickBlock(panelEl, warnings, panelId) {
  const pickEl = panelEl.querySelector(".thePick");
  if (!pickEl) {
    warnings.push(`panel ${panelId}: missing .thePick block (no official pick found)`);
    return null;
  }
  const rawText = textOf(pickEl);
  return { rawText };
}

/**
 * Parses one WalterFootball weekly window page into raw per-game panels.
 * Never throws on a single bad panel -- collects a warning and continues, so
 * one malformed game never kills discovery of the rest of the page.
 */
export function parseWalterWindowPage(html, { sourceUrl = null } = {}) {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const panelEls = Array.from(document.querySelectorAll("div.panel[id]"));
  const games = [];
  const pageWarnings = [];

  if (panelEls.length === 0) {
    pageWarnings.push("no div.panel[id] elements found on page -- layout may have changed");
  }

  for (const panelEl of panelEls) {
    const panelId = panelEl.getAttribute("id") ?? "unknown";
    const warnings = [];

    const bodyEl = panelEl.querySelector(".panel-body");
    if (!bodyEl) {
      pageWarnings.push(`panel ${panelId}: missing .panel-body -- skipped`);
      continue;
    }

    const bodyText = textOf(bodyEl);
    if (containsPaywallMarker(bodyText)) {
      pageWarnings.push(
        `panel ${panelId}: paywall marker found inside .panel-body -- this should not happen per the verified DOM boundary; skipping to avoid reproducing premium content`,
      );
      continue;
    }

    const { awayName, homeName, headerLine, kickoffText } = parseHeading(panelEl, warnings, panelId);

    const h3s = Array.from(bodyEl.querySelectorAll(":scope > h3"));
    const sections = {};
    for (const h3 of h3s) {
      const label = textOf(h3).split(".")[0].trim().toLowerCase();
      const key = label.replace(/^the\s+/, "");
      const nodes = collectSectionNodes(h3);
      const edge = edgeFromH3(h3);

      if (key === "matchup") {
        sections.matchup = { edge, ...parseMatchupSection(nodes) };
      } else if (key === "motivation") {
        sections.motivation = { edge, text: nodes.map(textOf).filter(Boolean).join(" ") };
      } else if (key === "spread") {
        sections.spread = { edge, lines: parseSpreadSection(nodes) };
      } else if (key === "vegas") {
        sections.vegas = { edge, paragraphs: parseVegasSection(nodes) };
      } else if (key === "trends") {
        sections.trends = { edge, ...parseTrendsSection(nodes) };
      } else {
        warnings.push(`panel ${panelId}: unrecognized h3 section "${label}"`);
      }
    }

    for (const expected of ["matchup", "motivation", "spread", "vegas", "trends"]) {
      if (!sections[expected]) warnings.push(`panel ${panelId}: missing expected section "${expected}"`);
    }

    const pick = parsePickBlock(panelEl, warnings, panelId);

    games.push({
      walterPanelId: panelId,
      awayName,
      homeName,
      headerLine,
      kickoffText,
      sections,
      pick,
      sourceUrl,
      parseWarnings: warnings,
    });
  }

  return { games, pageWarnings };
}

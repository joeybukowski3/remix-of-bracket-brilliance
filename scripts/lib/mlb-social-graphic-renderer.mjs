import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { getEmailTeamLogoUrl } from "./mlb-team-email-assets.mjs";

export const SOCIAL_GRAPHIC_GEOMETRY = Object.freeze({
  width: 1600,
  height: 900,
  padding: 56,
  labelY: 150,
  labelHeight: 44,
  rowTop: 196,
  rowHeight: 112,
  footerTop: 772,
  rowCount: 5,
});

const COLORS = Object.freeze({
  navy: "#0F1B33",
  blue: "#1E5AA8",
  gray: "#5B6B7F",
  border: "#D9E0E8",
  green: "#13A66A",
  gold: "#F2B134",
  red: "#D9534F",
  // Restrained, genuinely blue (distinct from the navy background/header and
  // from the Over green/teal) -- Under badge fill only.
  under: "#1D63B3",
  negative: "#C0432E",
  zebra: "#F6F8FB",
  faint: "#C6D0DC",
});

const MEDAL_COLORS = ["#F2B134", "#B9C2CD", "#C98A4B"];
const FONT_STACK = "Arial,'Helvetica Neue',Helvetica,sans-serif";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function truncateText(value, maxCharacters) {
  const text = normalizeText(value);
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}

function text(x, y, value, { size = 26, weight = 700, fill = COLORS.navy, anchor = "middle", letterSpacing = 0, tabular = true } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${letterSpacing ? ` letter-spacing="${letterSpacing}"` : ""}${tabular ? ' style="font-variant-numeric:tabular-nums"' : ""}>${escapeXml(value)}</text>`;
}

function scoreStyle(value, thresholds) {
  if (value != null && value >= thresholds.green) return { fill: COLORS.green, text: "#fff" };
  if (value != null && value >= thresholds.gold) return { fill: COLORS.gold, text: COLORS.navy };
  if (value != null && value >= thresholds.navy) return { fill: COLORS.navy, text: "#fff" };
  return { fill: "#8A97A8", text: "#fff" };
}

/**
 * HR Score pill color -- same four hex colors and thresholds as the
 * website's SocialTableHR sc() function (src/pages/MlbGameDetail.tsx), so
 * the export matches the richer site table it links to. Unlike the generic
 * scoreStyle() above (still used for K Score, unchanged), a present numeric
 * HR Score never renders gray -- it always falls in one of four real,
 * visible tiers; only a genuinely missing (null) score stays muted, since
 * that's absent data, not a bad score.
 */
function hrScoreStyle(value) {
  if (value == null) return { fill: "#8A97A8", text: "#fff" };
  if (value >= 70) return { fill: "#22c55e", text: "#fff" };
  if (value >= 65) return { fill: "#4ade80", text: "#000" };
  if (value >= 62) return { fill: "#facc15", text: "#000" };
  return { fill: "#fb923c", text: "#fff" };
}

/**
 * Percentage-stat text color (Barrel%, Hard-Hit%) -- mirrors the website's
 * statCol(v, hi, mid) exactly: green at/above hi, light green at/above mid,
 * otherwise a muted (not hidden) gray. Data-driven, unlike a fixed color
 * regardless of value.
 */
function statColor(value, hi, mid) {
  if (value == null) return "#94a3b8";
  return value >= hi ? "#22c55e" : value >= mid ? "#86efac" : "#94a3b8";
}

/**
 * Count-stat text color (L7, L30 home runs) -- mirrors the website's inline
 * `v >= hi ? green : v >= mid ? gold : muted` bands exactly.
 */
function countColor(value, hi, mid) {
  if (value == null) return "#94a3b8";
  return value >= hi ? "#22c55e" : value >= mid ? "#facc15" : "#94a3b8";
}

function triangle(centerX, centerY, direction, size, color) {
  const points =
    direction === "up"
      ? `${centerX},${centerY - size} ${centerX + size},${centerY + size} ${centerX - size},${centerY + size}`
      : `${centerX - size},${centerY - size} ${centerX + size},${centerY - size} ${centerX},${centerY + size}`;
  return `<polygon points="${points}" fill="${color}"/>`;
}

function icon(kind, x, baselineY, size = 24) {
  const scale = size / 24;
  const top = baselineY - size + 4;
  const transform = `translate(${x} ${top}) scale(${scale})`;
  if (kind === "fire") {
    return `<g data-icon="fire" transform="${transform}"><path d="M12 1c1 5-3 6-3 10 0 2 1 3 3 4-1-4 4-5 3-10 4 3 6 7 6 11a9 9 0 1 1-18 0c0-4 2-7 6-10-1 4 1 5 3 6 1-4 0-7 0-11Z" fill="#F97316"/><path d="M12 11c3 2 4 4 3 7a3.5 3.5 0 0 1-7 0c0-2 1-4 4-7Z" fill="#FACC15"/></g>`;
  }
  if (kind === "barrel") {
    return `<g data-icon="barrel" transform="${transform}"><path d="M5 3h14l2 3v12l-2 3H5l-2-3V6l2-3Z" fill="#3B82F6" stroke="#1E3A8A" stroke-width="1.5"/><path d="M4 8h16M4 16h16M8 3v18M16 3v18" stroke="#DBEAFE" stroke-width="1.3"/></g>`;
  }
  if (kind === "burst") {
    return `<g data-icon="burst" transform="${transform}"><path d="m12 0 2.2 6.4L20 3l-1.7 6.5L24 12l-5.7 2.5L20 21l-5.8-3.4L12 24l-2.2-6.4L4 21l1.7-6.5L0 12l5.7-2.5L4 3l5.8 3.4L12 0Z" fill="#F97316"/><circle cx="12" cy="12" r="4" fill="#FDE047"/></g>`;
  }
  if (kind === "crown") {
    return `<g data-icon="crown" transform="${transform}"><path d="m2 7 5 5 5-8 5 8 5-5-2 12H4L2 7Z" fill="#F2B134" stroke="#B7791F" stroke-width="1.2"/><path d="M4 19h16v3H4z" fill="#B7791F"/></g>`;
  }
  if (kind === "trend") {
    return `<g data-icon="trend" transform="${transform}"><rect x="1" y="1" width="22" height="22" rx="4" fill="#DCFCE7"/><path d="m5 17 5-5 3 3 6-7" fill="none" stroke="#13A66A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 8h4v4" fill="none" stroke="#13A66A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  if (kind === "projection") {
    return `<g data-icon="projection" transform="${transform}"><path d="M3 21 21 3v18H3Z" fill="#DBEAFE" stroke="#1E5AA8" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 18h3m-1-3h3m-1-3h3m-1-3h3" stroke="#1E5AA8" stroke-width="1.4" stroke-linecap="round"/></g>`;
  }
  return "";
}

function formatMetric(value, decimals = 1, suffix = "") {
  return value == null ? "N/A" : `${value.toFixed(decimals)}${suffix}`;
}

function formatCount(value) {
  return value == null ? "N/A" : String(value);
}

export function calculateProjectionDifference(projectedStrikeouts, marketStrikeoutLine) {
  const projected = toFiniteNumber(projectedStrikeouts);
  const line = toFiniteNumber(marketStrikeoutLine);
  if (projected == null || line == null) return null;
  return Number((projected - line).toFixed(2));
}

export function recommendedStrikeoutSide(projectionDifference) {
  const difference = toFiniteNumber(projectionDifference);
  if (difference == null || difference === 0) return null;
  return difference > 0 ? "OVER" : "UNDER";
}

export function formatProjectionDifference(projectionDifference) {
  const difference = toFiniteNumber(projectionDifference);
  if (difference == null) return "N/A";
  if (difference > 0) return `+${difference.toFixed(1)}`;
  if (difference < 0) return `−${Math.abs(difference).toFixed(1)}`;
  return "0.0";
}

function sideOdds(row, side) {
  const value = side === "UNDER" ? row?.oddsUnder ?? row?.kOddsUnder : row?.oddsOver ?? row?.kOddsOver;
  return normalizeText(value) || null;
}

export function normalizeHomeRunRows(rows, limit = SOCIAL_GRAPHIC_GEOMETRY.rowCount) {
  return (Array.isArray(rows) ? rows : []).slice(0, Math.max(0, limit)).map((row, index) => ({
    rank: index + 1,
    playerId: row?.playerId ?? null,
    gameId: row?.gameId ?? null,
    player: normalizeText(row?.player ?? row?.name),
    team: normalizeText(row?.team).toUpperCase(),
    opponent: normalizeText(row?.opponent).toUpperCase(),
    opposingPitcher: normalizeText(row?.opposingPitcher) || "TBD",
    hrOdds: normalizeText(row?.hrOdds ?? row?.hrOddsYes ?? row?.odds) || null,
    hrScore: toFiniteNumber(row?.hrScore ?? row?.score),
    barrelPercent: toFiniteNumber(row?.barrelPercent ?? row?.barrelRate ?? row?.barrel),
    hardHitPercent: toFiniteNumber(row?.hardHitPercent ?? row?.hardHitRate ?? row?.hh),
    last7: toFiniteNumber(row?.last7 ?? row?.last7HR ?? row?.l7),
    last30: toFiniteNumber(row?.last30 ?? row?.last30HR ?? row?.l30),
  }));
}

/**
 * Normalizes K rows for rendering -- trusts the artifact's already-decided
 * order and already-derived side/edge values (mlb-k-x-selection-core.mjs's
 * selectConfirmedKRows already ranked and computed these); NEVER re-sorts
 * or re-filters here, mirroring normalizeHomeRunRows above exactly. The
 * five selected rows must render in precisely the order they arrive in.
 *
 * Falls back to computing projectionDifference/recommendedSide from
 * projectedKs - kLine only when the artifact-shaped fields
 * (projectionEdge/side) aren't present on a given row -- a per-row
 * convenience for direct/legacy callers, never a cross-row sort or filter.
 */
export function normalizeStrikeoutRows(rows, limit = SOCIAL_GRAPHIC_GEOMETRY.rowCount) {
  return (Array.isArray(rows) ? rows : []).slice(0, Math.max(0, limit)).map((row, index) => {
    const projectedStrikeouts = toFiniteNumber(row?.projectedStrikeouts ?? row?.projectedKs);
    const marketStrikeoutLine = toFiniteNumber(row?.marketStrikeoutLine ?? row?.kLine);
    const explicitEdge = toFiniteNumber(row?.projectionDifference ?? row?.projectionEdge);
    const projectionDifference = explicitEdge ?? calculateProjectionDifference(projectedStrikeouts, marketStrikeoutLine);
    const explicitSide = normalizeText(row?.recommendedSide ?? row?.side).toUpperCase();
    const recommendedSide = explicitSide === "OVER" || explicitSide === "UNDER" ? explicitSide : recommendedStrikeoutSide(projectionDifference);
    return {
      rank: index + 1,
      pitcherId: row?.pitcherId ?? null,
      gameId: row?.gameId ?? null,
      pitcher: normalizeText(row?.pitcher ?? row?.name),
      team: normalizeText(row?.team).toUpperCase(),
      opponent: normalizeText(row?.opponent).toUpperCase(),
      marketStrikeoutLine,
      projectedStrikeouts,
      projectedIP: toFiniteNumber(row?.projectedIP),
      projectionDifference,
      recommendedSide,
      recommendedOdds: normalizeText(row?.recommendedOdds ?? row?.odds) || sideOdds(row, recommendedSide),
      kScore: toFiniteNumber(row?.kScore ?? row?.strikeoutScore ?? row?.strikeoutMatchupScore),
    };
  });
}

export function getHomeRunIndicators(row) {
  const qualifying = [];
  // 70, matching the website's SocialTableHR fire-icon trigger (score >= 70).
  if (toFiniteNumber(row?.hrScore) >= 70) qualifying.push("score");
  if (toFiniteNumber(row?.barrelPercent) >= 18) qualifying.push("barrel");
  if (toFiniteNumber(row?.hardHitPercent) >= 55) qualifying.push("hardHit");
  if (toFiniteNumber(row?.last30) >= 8) qualifying.push("last30");
  if (toFiniteNumber(row?.last7) >= 3) qualifying.push("last7");
  return qualifying.slice(0, 3);
}

export function getStrikeoutIndicators(row) {
  const qualifying = [];
  const difference = toFiniteNumber(row?.projectionDifference);
  if (difference != null && Math.abs(difference) >= 1.5) qualifying.push("projection");
  if (toFiniteNumber(row?.kScore) >= 85) qualifying.push("score");
  return qualifying;
}

export function createLocalMlbLogoResolver({ logoDirectory = path.join(process.cwd(), "public", "logos", "mlb") } = {}) {
  const cache = new Map();
  return (team) => {
    const abbreviation = normalizeText(team).toLowerCase();
    if (!abbreviation || !/^[a-z0-9]+$/.test(abbreviation)) return null;
    if (cache.has(abbreviation)) return cache.get(abbreviation);
    const logoPath = path.join(logoDirectory, `${abbreviation}.svg`);
    if (!existsSync(logoPath)) {
      cache.set(abbreviation, null);
      return null;
    }
    const svg = readFileSync(logoPath, "utf8");
    if (!/<svg\b/i.test(svg) || /https?:\/\//i.test(svg.replace(/http:\/\/www\.w3\.org\/2000\/svg/gi, ""))) {
      cache.set(abbreviation, null);
      return null;
    }
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
    cache.set(abbreviation, dataUri);
    return dataUri;
  };
}

/**
 * Fetches each team's real MLB logo from the same ESPN CDN source already
 * used sitewide (getEmailTeamLogoUrl, mirroring src/lib/mlb/mlbTeamLogos.ts
 * -- the crest art rendered everywhere else in the app), and returns a
 * SYNCHRONOUS resolver usable by renderMlbSocialSvg's row rendering (which
 * must stay synchronous/offline-testable). Prefetches every team up front
 * so the synchronous render pass never blocks on the network.
 *
 * A team whose fetch fails (network error, non-200, timeout) falls back to
 * the local placeholder-badge SVG rather than failing the whole export --
 * this keeps rendering screenshot-safe even when ESPN's CDN is briefly
 * unreachable from CI. This is the resolver writeMlbSocialGraphic uses by
 * default for production renders; renderMlbSocialSvg itself keeps using
 * createLocalMlbLogoResolver as its own default so it stays deterministic
 * and network-free for direct/unit-test callers.
 */
export async function createRemoteMlbLogoResolver({ teams = [], fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const localFallback = createLocalMlbLogoResolver();
  const cache = new Map();
  const uniqueTeams = Array.from(new Set(teams.map((team) => normalizeText(team).toUpperCase()).filter(Boolean)));

  await Promise.all(
    uniqueTeams.map(async (team) => {
      try {
        const url = getEmailTeamLogoUrl(team);
        if (!url || !/^https?:\/\//i.test(url)) {
          cache.set(team, localFallback(team));
          return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
          response = await fetchImpl(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
        if (!response.ok) {
          cache.set(team, localFallback(team));
          return;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers?.get?.("content-type") || "image/png";
        cache.set(team, `data:${contentType};base64,${buffer.toString("base64")}`);
      } catch {
        cache.set(team, localFallback(team));
      }
    }),
  );

  return (team) => {
    const key = normalizeText(team).toUpperCase();
    return cache.get(key) ?? localFallback(team);
  };
}

function renderTeamLogo(centerX, centerY, team, resolveLogo) {
  const logoUri = typeof resolveLogo === "function" ? resolveLogo(team) : null;
  if (logoUri && logoUri.startsWith("data:image/")) {
    return `<image data-team-logo="${escapeXml(team)}" href="${escapeXml(logoUri)}" x="${centerX - 27}" y="${centerY - 27}" width="54" height="54" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return `<g data-team-logo-fallback="${escapeXml(team)}"><circle cx="${centerX}" cy="${centerY}" r="27" fill="#334155"/><circle cx="${centerX}" cy="${centerY}" r="27" fill="none" stroke="#CBD5E1" stroke-width="2"/>${text(centerX, centerY + 5, team || "MLB", { size: 15, weight: 800, fill: "#fff", letterSpacing: 0.3 })}</g>`;
}

function rowMetadata(kind, row, index) {
  if (kind === "hr") {
    return `<g data-social-row="${index}" data-player-id="${escapeXml(row.playerId ?? "")}" data-game-id="${escapeXml(row.gameId ?? "")}" data-player="${escapeXml(row.player)}" data-team="${escapeXml(row.team)}">`;
  }
  return `<g data-social-row="${index}" data-pitcher-id="${escapeXml(row.pitcherId ?? "")}" data-game-id="${escapeXml(row.gameId ?? "")}" data-pitcher="${escapeXml(row.pitcher)}" data-team="${escapeXml(row.team)}" data-side="${escapeXml(row.recommendedSide)}" data-odds="${escapeXml(row.recommendedOdds ?? "")}">`;
}

function formatSlateDate(slateDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(slateDate));
  if (!match) return normalizeText(slateDate);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function renderHeader(kind, slateDate, url) {
  const { width, padding } = SOCIAL_GRAPHIC_GEOMETRY;
  const right = width - padding;
  const boxX = padding;
  const boxY = 32;
  const boxSize = 46;
  const title = kind === "hr" ? "MLB HOME RUN PROPS" : "MLB STRIKEOUT VALUE PLAYS";
  const subtitle = kind === "hr" ? "Top Model Edges  •  Today’s Slate" : "Top Qualified Model vs. Market Edges";
  const titleSize = kind === "hr" ? 52 : 46;
  let svg = `<rect x="${boxX}" y="${boxY}" width="${boxSize}" height="${boxSize}" rx="12" fill="${COLORS.navy}"/>`;
  svg += `<circle cx="${boxX + boxSize / 2}" cy="${boxY + boxSize / 2}" r="14" fill="#fff"/>`;
  svg += `<path d="M${boxX + 8} ${boxY + 14} Q ${boxX + boxSize / 2} ${boxY + 22} ${boxX + boxSize - 8} ${boxY + 14}" stroke="${COLORS.red}" stroke-width="2" fill="none"/>`;
  svg += `<path d="M${boxX + 8} ${boxY + boxSize - 14} Q ${boxX + boxSize / 2} ${boxY + boxSize - 22} ${boxX + boxSize - 8} ${boxY + boxSize - 14}" stroke="${COLORS.red}" stroke-width="2" fill="none"/>`;
  svg += text(boxX + boxSize + 16, boxY + 22, "JOE KNOWS", { size: 19, weight: 800, anchor: "start", letterSpacing: 1.5 });
  svg += text(boxX + boxSize + 16, boxY + 42, "BALL", { size: 19, weight: 800, anchor: "start", letterSpacing: 1.5, fill: COLORS.blue });
  svg += text(right, boxY + 20, url.split("/")[0], { size: 19, weight: 700, fill: COLORS.blue, anchor: "end" });
  svg += text(padding, 128, title, { size: titleSize, weight: 800, anchor: "start", letterSpacing: 0.5 });
  svg += text(right, 112, subtitle, { size: 20, weight: 700, fill: COLORS.gray, anchor: "end" });
  svg += text(right, 138, formatSlateDate(slateDate), { size: 18, weight: 400, fill: COLORS.gray, anchor: "end" });
  svg += `<line x1="${padding}" y1="150" x2="${right}" y2="150" stroke="${COLORS.border}" stroke-width="1.5"/>`;
  return svg;
}

function renderColumnLabels(kind) {
  const labels =
    kind === "hr"
      ? [["#", 96, "middle"], ["PLAYER", 200, "start"], ["HR SCORE", 740, "middle"], ["BARREL%", 950, "middle"], ["HH%", 1130, "middle"], ["L7", 1290, "middle"], ["L30", 1430, "middle"]]
      : [["#", 96, "middle"], ["PITCHER", 200, "start"], ["BEST PLAY", 660, "middle"], ["PROJ / LINE", 880, "middle"], ["PROJ +/-", 1150, "middle"], ["K SCORE", 1420, "middle"]];
  let svg = "";
  for (const [label, x, anchor] of labels) {
    svg += text(x, 179, label, { size: 15, weight: 800, fill: "#7A8798", anchor, letterSpacing: 0.7 });
  }
  svg += `<line x1="56" y1="194" x2="1544" y2="194" stroke="${COLORS.border}" stroke-width="1"/>`;
  return svg;
}

function renderHomeRunRow(row, index, resolveLogo) {
  const top = SOCIAL_GRAPHIC_GEOMETRY.rowTop + index * SOCIAL_GRAPHIC_GEOMETRY.rowHeight;
  const middle = top + SOCIAL_GRAPHIC_GEOMETRY.rowHeight / 2;
  const indicators = new Set(getHomeRunIndicators(row));
  let svg = rowMetadata("hr", row, index);
  if (index % 2 === 0) svg += `<rect x="56" y="${top}" width="1488" height="112" fill="${COLORS.zebra}"/>`;
  if (index > 0) svg += `<line x1="56" y1="${top}" x2="1544" y2="${top}" stroke="#EEF1F5" stroke-width="1"/>`;
  if (row.rank <= 3) svg += `<rect x="56" y="${top + 16}" width="6" height="80" rx="3" fill="${MEDAL_COLORS[row.rank - 1]}"/>`;
  svg += text(96, middle + 12, row.rank, { size: 34, weight: 800 });
  svg += renderTeamLogo(158, middle, row.team, resolveLogo);
  const playerName = truncateText(row.player || "Unknown", 24);
  svg += text(200, top + 50, playerName, { size: playerName.length > 16 ? 30 : 34, weight: 800, anchor: "start", tabular: false });
  const odds = row.hrOdds ?? "N/A";
  const matchup = truncateText(`vs ${row.opposingPitcher || "TBD"}`, 31);
  svg += `<text x="200" y="${top + 82}" font-size="20" text-anchor="start"><tspan fill="${COLORS.blue}" font-weight="800">${escapeXml(odds)}</tspan><tspan fill="${COLORS.faint}">   •   </tspan><tspan fill="${COLORS.gray}">${escapeXml(matchup)}</tspan></text>`;
  const style = hrScoreStyle(row.hrScore);
  const pillX = 676;
  svg += `<rect x="${pillX}" y="${middle - 26}" width="128" height="52" rx="11" fill="${style.fill}"/>`;
  svg += text(740, middle + 9, formatMetric(row.hrScore), { size: 27, weight: 800, fill: style.text });
  if (indicators.has("score")) svg += icon("fire", 814, middle + 9, 26);
  svg += text(946, middle + 9, formatMetric(row.barrelPercent, 1, "%"), { size: 25, weight: 700, anchor: "end", fill: statColor(row.barrelPercent, 20, 16) });
  if (indicators.has("barrel")) svg += icon("barrel", 956, middle + 9, 24);
  svg += text(1126, middle + 9, formatMetric(row.hardHitPercent, 1, "%"), { size: 25, weight: 700, anchor: "end", fill: statColor(row.hardHitPercent, 54, 50) });
  if (indicators.has("hardHit")) svg += icon("burst", 1136, middle + 9, 24);
  svg += text(1286, middle + 9, formatCount(row.last7), { size: 26, weight: 800, anchor: "end", fill: countColor(row.last7, 3, 2) });
  if (indicators.has("last7")) svg += icon("trend", 1296, middle + 9, 24);
  svg += text(1426, middle + 9, formatCount(row.last30), { size: 26, weight: 800, anchor: "end", fill: countColor(row.last30, 8, 5) });
  if (indicators.has("last30")) svg += icon("crown", 1436, middle + 9, 24);
  return `${svg}</g>`;
}

function renderStrikeoutRow(row, index, resolveLogo) {
  const top = SOCIAL_GRAPHIC_GEOMETRY.rowTop + index * SOCIAL_GRAPHIC_GEOMETRY.rowHeight;
  const middle = top + SOCIAL_GRAPHIC_GEOMETRY.rowHeight / 2;
  const indicators = new Set(getStrikeoutIndicators(row));
  const difference = row.projectionDifference;
  const absoluteDifference = Math.abs(difference);
  const isOver = row.recommendedSide === "OVER";
  let svg = rowMetadata("k", row, index);
  if (index % 2 === 0) svg += `<rect x="56" y="${top}" width="1488" height="112" fill="${COLORS.zebra}"/>`;
  if (index > 0) svg += `<line x1="56" y1="${top}" x2="1544" y2="${top}" stroke="#EEF1F5" stroke-width="1"/>`;
  if (row.rank <= 3) svg += `<rect x="56" y="${top + 16}" width="6" height="80" rx="3" fill="${MEDAL_COLORS[row.rank - 1]}"/>`;
  svg += text(96, middle + 12, row.rank, { size: 34, weight: 800 });
  svg += renderTeamLogo(158, middle, row.team, resolveLogo);
  const pitcherName = truncateText(row.pitcher || "Unknown", 24);
  svg += text(200, top + 50, pitcherName, { size: pitcherName.length > 16 ? 30 : 34, weight: 800, anchor: "start", tabular: false });
  const projectedIP = toFiniteNumber(row.projectedIP);
  // Compact supporting field -- fits cleanly on the existing matchup line,
  // never its own column.
  const opponentLine = projectedIP != null ? `vs ${row.opponent || "TBD"}  ·  ${projectedIP.toFixed(1)} IP` : `vs ${row.opponent || "TBD"}`;
  svg += text(200, top + 82, truncateText(opponentLine, 40), { size: 20, weight: 400, fill: COLORS.gray, anchor: "start", tabular: false });
  const badgeX = 577;
  svg += `<rect x="${badgeX}" y="${middle - 30}" width="166" height="60" rx="12" fill="${isOver ? COLORS.green : COLORS.under}"/>`;
  svg += triangle(badgeX + 17, middle - 4, isOver ? "up" : "down", 7, "#fff");
  svg += text(670, middle - 4, `${row.recommendedSide} ${formatMetric(row.marketStrikeoutLine)}`, { size: 23, weight: 800, fill: "#fff" });
  svg += text(670, middle + 20, row.recommendedOdds ?? "N/A", { size: 16, weight: 600, fill: "rgba(255,255,255,.88)" });
  svg += `<text x="880" y="${middle - 6}" font-size="21" font-weight="800" fill="${COLORS.navy}" text-anchor="middle" style="font-variant-numeric:tabular-nums">${escapeXml(formatMetric(row.projectedStrikeouts))}<tspan font-size="12" font-weight="700" fill="${COLORS.gray}"> PROJ</tspan></text>`;
  svg += `<text x="880" y="${middle + 18}" font-size="18" font-weight="700" fill="${COLORS.gray}" text-anchor="middle" style="font-variant-numeric:tabular-nums">${escapeXml(formatMetric(row.marketStrikeoutLine))}<tspan font-size="11" font-weight="700" fill="${COLORS.faint}"> LINE</tspan></text>`;
  const edgeSize = absoluteDifference >= 1.5 ? 38 : absoluteDifference >= 1 ? 32 : 28;
  const edgeColor = difference > 0 ? COLORS.green : COLORS.negative;
  if (indicators.has("projection")) svg += icon("projection", 1008, middle + 11, 30);
  else svg += triangle(1034, middle - 3, difference > 0 ? "up" : "down", 10, edgeColor);
  svg += text(1136, middle + edgeSize * 0.34, formatProjectionDifference(difference), { size: edgeSize, weight: 800, fill: edgeColor, anchor: "end" });
  const style = scoreStyle(row.kScore, { green: 85, gold: 80, navy: 70 });
  svg += `<rect x="1357" y="${middle - 27}" width="126" height="54" rx="11" fill="${style.fill}"/>`;
  svg += text(1420, middle + 9, formatMetric(row.kScore), { size: 28, weight: 800, fill: style.text });
  if (indicators.has("score")) svg += icon("fire", 1491, middle + 9, 26);
  return `${svg}</g>`;
}

function renderFooter(kind, url) {
  const footerTop = SOCIAL_GRAPHIC_GEOMETRY.footerTop;
  let svg = `<line x1="56" y1="${footerTop}" x2="1544" y2="${footerTop}" stroke="${COLORS.border}" stroke-width="1.5"/>`;
  svg += `<text x="56" y="${footerTop + 34}" font-size="22" text-anchor="start"><tspan fill="${COLORS.gray}" font-weight="700">Full table: </tspan><tspan fill="${COLORS.blue}" font-weight="800">${escapeXml(url)}</tspan></text>`;
  const legend =
    kind === "hr"
      ? [["fire", "Elite HR Score"], ["barrel", "Barrel% ≥18"], ["burst", "Hard-Hit% ≥55"], ["crown", "L30 ≥8"], ["trend", "L7 ≥3"]]
      : [["projection", "Proj. edge ≥1.5 (replaces arrow)"], ["fire", "Elite K Score ≥85"]];
  let x = 56;
  for (const [iconName, label] of legend) {
    svg += icon(iconName, x, footerTop + 68, 18);
    x += 26;
    svg += text(x, footerTop + 68, label, { size: 14.5, weight: 600, fill: COLORS.gray, anchor: "start", tabular: false });
    x += label.length * 7.6 + 26;
  }
  svg += text(1544, footerTop + 30, "For entertainment and trend analysis only. Not betting advice.", { size: 15, weight: 600, fill: COLORS.gray, anchor: "end", tabular: false });
  svg += text(1544, footerTop + 52, "Please bet responsibly. 21+", { size: 15, weight: 600, fill: COLORS.gray, anchor: "end", tabular: false });
  return svg;
}

export function renderMlbSocialSvg({ kind, slateDate, rows, resolveLogo = createLocalMlbLogoResolver() }) {
  if (kind !== "hr" && kind !== "k") throw new Error(`Unsupported MLB social graphic kind: ${kind}`);
  const normalizedRows = kind === "hr" ? normalizeHomeRunRows(rows) : normalizeStrikeoutRows(rows);
  if (normalizedRows.length !== SOCIAL_GRAPHIC_GEOMETRY.rowCount) {
    throw new Error(`MLB ${kind.toUpperCase()} social graphic requires exactly ${SOCIAL_GRAPHIC_GEOMETRY.rowCount} rows; received ${normalizedRows.length}.`);
  }
  const url = kind === "hr" ? "JoeKnowsBall.com/mlb/hr-props" : "JoeKnowsBall.com/mlb/strikeout-props";
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" font-family="${FONT_STACK}" data-social-kind="${kind}" data-slate-date="${escapeXml(slateDate)}">`;
  svg += '<rect width="1600" height="900" fill="#fff"/>';
  svg += renderHeader(kind, slateDate, url);
  svg += renderColumnLabels(kind);
  for (const [index, row] of normalizedRows.entries()) {
    svg += kind === "hr" ? renderHomeRunRow(row, index, resolveLogo) : renderStrikeoutRow(row, index, resolveLogo);
  }
  svg += renderFooter(kind, url);
  svg += "</svg>";
  return svg;
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([\w-]+)="([^"]*)"/g;
  for (const match of source.matchAll(pattern)) attributes[match[1]] = decodeXml(match[2]);
  return attributes;
}

export function extractRenderedRowsFromSvg(svg) {
  const rows = [];
  const pattern = /<g\s+([^>]*\bdata-social-row="\d+"[^>]*)>/g;
  for (const match of String(svg).matchAll(pattern)) {
    const attributes = parseAttributes(match[1]);
    if (attributes["data-player"] !== undefined) {
      rows.push({
        playerId: attributes["data-player-id"] ?? "",
        gameId: attributes["data-game-id"] ?? "",
        player: attributes["data-player"] ?? "",
        team: attributes["data-team"] ?? "",
      });
    } else {
      rows.push({
        pitcherId: attributes["data-pitcher-id"] ?? "",
        gameId: attributes["data-game-id"] ?? "",
        pitcher: attributes["data-pitcher"] ?? "",
        team: attributes["data-team"] ?? "",
        side: attributes["data-side"] ?? "",
        odds: attributes["data-odds"] ?? "",
      });
    }
  }
  return rows;
}

export async function rasterizeSvgToPng(svg, outputPath, { browser: existingBrowser } = {}) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const browser = existingBrowser ?? (await chromium.launch({ headless: true }));
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    await page.setContent(`<style>html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff}svg{display:block}</style>${svg}`, { waitUntil: "load" });
    await page.locator("svg").screenshot({ path: outputPath, animations: "disabled" });
    await page.close();
  } finally {
    if (!existingBrowser) await browser.close();
  }
  return outputPath;
}

export async function writeMlbSocialGraphic({ kind, slateDate, rows, svgPath, pngPath, resolveLogo, browser, fetchImpl }) {
  // Production default: real ESPN-CDN team logos, prefetched for exactly the
  // teams appearing in this graphic. Callers (e.g. tests) that pass their
  // own resolveLogo -- typically createLocalMlbLogoResolver() for a fully
  // offline/deterministic render -- are left untouched.
  const logoResolver = resolveLogo ?? (await createRemoteMlbLogoResolver({ teams: (rows ?? []).map((row) => row?.team), fetchImpl }));
  const svg = renderMlbSocialSvg({ kind, slateDate, rows, resolveLogo: logoResolver });
  mkdirSync(path.dirname(svgPath), { recursive: true });
  writeFileSync(svgPath, `${svg}\n`, "utf8");
  await rasterizeSvgToPng(svg, pngPath, { browser });
  return { svg, svgPath, pngPath, renderedRows: extractRenderedRowsFromSvg(svg) };
}

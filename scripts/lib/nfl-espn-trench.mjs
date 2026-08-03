/**
 * ESPN Analytics trench win-rate ingestion helpers (Phase 3B).
 *
 * Pure logic only: article discovery filtering, module location, table parsing,
 * validation and freshness parsing. No I/O and no network, so everything here is
 * unit tested against fixtures.
 *
 * Source: the public ESPN news API
 *   GET https://now.core.api.espn.com/v1/sports/news/{articleId}?enable=inlines
 * `enable=inlines` is required: without it the response carries unresolved
 * <inlineN-wide> placeholders instead of the table modules.
 *
 * The rendered www.espn.com article path is AWS-WAF protected and is
 * deliberately never requested. This API host is public, unauthenticated and
 * requires no cookies.
 *
 * PBWR / RBWR / PRWR / RSWR are ESPN-created metrics built on NFL Next Gen Stats
 * player-tracking data. Published team values and ESPN's official ranks are
 * consumed verbatim — nothing is approximated, reconstructed, or derived from
 * sacks, pressure rate, player leaderboards or play-by-play.
 *
 * Attribution: ESPN Analytics / NFL Next Gen Stats.
 */

export const ESPN_NEWS_ENDPOINT = "https://now.core.api.espn.com/v1/sports/news";
export const ESPN_SEARCH_ENDPOINT = "https://site.web.api.espn.com/apis/search/v2";
export const ESPN_SOURCE_LABEL = "ESPN Analytics (NFL Next Gen Stats)";
export const ESPN_ATTRIBUTION = "ESPN Analytics / NFL Next Gen Stats";

/** The module is located by headline, never by array position. */
export const TEAM_MODULE_HEADLINE = "nfl team win rate rankings";

/** Analyzer metric key -> ESPN table column. The only place the two are tied. */
export const TRENCH_COLUMN_MAP = Object.freeze({
  "off.passBlockWinRate": "PBWR",
  "off.runBlockWinRate": "RBWR",
  "def.passRushWinRate": "PRWR",
  "def.runStopWinRate": "RSWR",
});

export const TRENCH_METRIC_KEYS = Object.freeze(Object.keys(TRENCH_COLUMN_MAP));
export const TRENCH_COLUMNS = Object.freeze(Object.values(TRENCH_COLUMN_MAP));

/** Known article IDs, usable as deterministic fixtures / historical fallbacks. */
export const KNOWN_ARTICLE_IDS = Object.freeze({ 2025: "46138675", 2024: "41040723" });

export const EXPECTED_TEAM_COUNT = 32;

export function newsUrl(articleId) {
  return `${ESPN_NEWS_ENDPOINT}/${articleId}?enable=inlines`;
}

// ---------------------------------------------------------------------------
// Article discovery
// ---------------------------------------------------------------------------

/**
 * Headline shape ESPN has used for every season of this leaderboard, e.g.
 * "2025 NFL pass rush, run stop, blocking win rate rankings".
 */
const HEADLINE_PATTERN = /^(\d{4})\s+NFL\b.*\bwin rate rankings\b/i;

export function parseLeaderboardHeadline(headline) {
  if (typeof headline !== "string") return null;
  const match = HEADLINE_PATTERN.exec(headline.trim());
  if (!match) return null;
  return { season: Number(match[1]), headline: headline.trim() };
}

/** Pull `{id}` out of an ESPN story URL. */
export function articleIdFromUrl(url) {
  if (typeof url !== "string") return null;
  const match = /\/id\/(\d+)\b/.exec(url);
  return match ? match[1] : null;
}

/**
 * Select the win-rate leaderboard article for one season from a search payload.
 *
 * Search results are noisy (unrelated NFL/NBA/cricket stories), so candidates
 * must match the leaderboard headline pattern *and* the requested season.
 * Two different article IDs claiming the same season is ambiguous and throws
 * rather than guessing.
 */
export function selectSeasonArticle(searchPayload, season) {
  const candidates = new Map();

  (function walk(node) {
    if (!node || typeof node !== "object") return;
    const title = node.displayName ?? node.headline;
    const url = node.link?.web;
    if (typeof title === "string" && typeof url === "string") {
      const parsed = parseLeaderboardHeadline(title);
      const id = articleIdFromUrl(url);
      if (parsed && id && parsed.season === season) {
        candidates.set(id, { articleId: id, season: parsed.season, headline: parsed.headline });
      }
    }
    for (const value of Object.values(node)) walk(value);
  })(searchPayload);

  const found = [...candidates.values()];
  if (found.length === 0) {
    return { article: null, candidates: found };
  }
  if (found.length > 1) {
    throw new Error(
      `Ambiguous article discovery for ${season}: ${found.map((c) => `${c.articleId} (${c.headline})`).join(" | ")}`
    );
  }
  return { article: found[0], candidates: found };
}

// ---------------------------------------------------------------------------
// Module location and parsing
// ---------------------------------------------------------------------------

function normalizeHeadline(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

/**
 * Find the team win-rate module inside a news payload, by headline.
 * Array position is never trusted: ESPN reorders and adds inline modules.
 */
export function findTeamModule(payload, { label }) {
  if (typeof payload === "string") {
    throw new Error(`${label}: response was text, not JSON (likely an HTML or WAF page)`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label}: response is not a JSON object`);
  }
  const headlines = payload.headlines;
  if (!Array.isArray(headlines) || headlines.length === 0) {
    throw new Error(`${label}: payload has no headlines`);
  }
  const article = headlines[0];
  const inlines = article.inlines;
  if (!Array.isArray(inlines) || inlines.length === 0) {
    throw new Error(`${label}: article has no inline modules (was enable=inlines used?)`);
  }

  const matches = inlines.filter((inline) => normalizeHeadline(inline?.headline) === TEAM_MODULE_HEADLINE);
  if (matches.length === 0) {
    throw new Error(
      `${label}: no inline module titled "${TEAM_MODULE_HEADLINE}" (found: ${inlines
        .map((i) => i?.headline ?? "?")
        .join(" | ")})`
    );
  }
  if (matches.length > 1) {
    throw new Error(`${label}: ${matches.length} modules titled "${TEAM_MODULE_HEADLINE}"`);
  }

  const module = matches[0];
  if (!module.json || !Array.isArray(module.json.header) || !Array.isArray(module.json.body)) {
    throw new Error(`${label}: team module has no structured json.header/json.body`);
  }
  return { article, module };
}

/**
 * Map the module header onto column indexes.
 * Header order is normalized rather than assumed, so ESPN can reorder columns
 * without breaking ingestion — but every expected column must be present
 * exactly once.
 */
export function resolveColumnIndexes(header, { label }) {
  const normalized = header.map((h) => (typeof h === "string" ? h.trim().toUpperCase() : ""));

  const teamIndex = normalized.indexOf("TEAM");
  if (teamIndex === -1) throw new Error(`${label}: header has no "team" column (${header.join(", ")})`);

  const indexes = { team: teamIndex };
  for (const column of TRENCH_COLUMNS) {
    const positions = normalized.reduce((acc, value, i) => (value === column ? [...acc, i] : acc), []);
    if (positions.length === 0) {
      throw new Error(`${label}: header is missing the "${column}" column (${header.join(", ")})`);
    }
    if (positions.length > 1) {
      throw new Error(`${label}: header has ${positions.length} "${column}" columns`);
    }
    indexes[column] = positions[0];
  }
  return indexes;
}

/** ESPN team slug from the anchor in the team cell: /name/buf/buffalo-bills */
export function parseTeamSlug(cell, { label, rowIndex }) {
  if (typeof cell !== "string") {
    throw new Error(`${label}: row ${rowIndex} team cell is not a string`);
  }
  const match = /\/nfl\/team\/_\/name\/([a-z0-9]+)\//i.exec(cell);
  if (!match) {
    throw new Error(`${label}: row ${rowIndex} team cell has no parseable team slug`);
  }
  return match[1].toLowerCase();
}

const CELL_PATTERN = /^\s*(\d{1,3})%\s*\((\d{1,2})\)\s*$/;

/**
 * Parse a `"31% (27)"` cell into the published integer percentage and ESPN's
 * official rank. Published precision is whole numbers; no decimal precision is
 * invented.
 */
export function parseTrenchCell(cell, { label, rowIndex, column }) {
  if (typeof cell !== "string") {
    throw new Error(`${label}: row ${rowIndex} ${column} cell is not a string`);
  }
  const match = CELL_PATTERN.exec(cell);
  if (!match) {
    throw new Error(`${label}: row ${rowIndex} ${column} cell "${cell}" is malformed (expected "31% (27)")`);
  }
  const valuePct = Number(match[1]);
  const espnRank = Number(match[2]);
  if (!Number.isInteger(valuePct) || valuePct < 0 || valuePct > 100) {
    throw new Error(`${label}: row ${rowIndex} ${column} percentage ${valuePct} outside 0-100`);
  }
  if (!Number.isInteger(espnRank) || espnRank < 1 || espnRank > EXPECTED_TEAM_COUNT) {
    throw new Error(`${label}: row ${rowIndex} ${column} rank ${espnRank} outside 1-${EXPECTED_TEAM_COUNT}`);
  }
  return { valuePct, espnRank };
}

/**
 * Parse and fully validate the team win-rate table.
 *
 * `teamMap` maps ESPN slug -> canonical repo abbreviation. Unknown slugs,
 * duplicates, wrong row counts, malformed cells and duplicated official ranks
 * all throw — nothing is dropped silently.
 */
export function parseTeamModule(module, { teamMap, label }) {
  const indexes = resolveColumnIndexes(module.json.header, { label });
  const rows = module.json.body;

  if (rows.length !== EXPECTED_TEAM_COUNT) {
    throw new Error(`${label}: expected ${EXPECTED_TEAM_COUNT} team rows, found ${rows.length}`);
  }

  const teams = {};
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) throw new Error(`${label}: row ${rowIndex} is not an array`);
    const slug = parseTeamSlug(row[indexes.team], { label, rowIndex });
    const abbr = teamMap.get(slug);
    if (!abbr) throw new Error(`${label}: unknown ESPN team slug "${slug}" in row ${rowIndex}`);
    if (teams[abbr]) throw new Error(`${label}: duplicate team "${abbr}" (slug ${slug})`);

    const metrics = {};
    for (const [metricKey, column] of Object.entries(TRENCH_COLUMN_MAP)) {
      metrics[metricKey] = parseTrenchCell(row[indexes[column]], { label, rowIndex, column });
    }
    teams[abbr] = { espnSlug: slug, metrics };
  });

  const missing = [...teamMap.values()].filter((abbr) => !teams[abbr]);
  if (missing.length > 0) {
    throw new Error(`${label}: missing canonical teams ${missing.join(", ")}`);
  }

  // ESPN ranks on finer internal precision than it publishes, so its official
  // ranks are a complete distinct 1-32 for each metric. Assert that invariant:
  // a break means the table shape or semantics changed.
  for (const metricKey of TRENCH_METRIC_KEYS) {
    const ranks = Object.values(teams).map((t) => t.metrics[metricKey].espnRank);
    const unique = new Set(ranks);
    if (unique.size !== EXPECTED_TEAM_COUNT) {
      throw new Error(
        `${label}: ${TRENCH_COLUMN_MAP[metricKey]} official ranks are not distinct 1-${EXPECTED_TEAM_COUNT} (${unique.size} unique)`
      );
    }
  }

  return teams;
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

const UPDATED_PATTERN = /Last updated:[^<\n]*/i;
const WEEK_PATTERN = /Through\s+(?:all\s+)?Week\s+(\d{1,2})\b/i;

/**
 * Extract ESPN's freshness marker from the article prose, e.g.
 * "Last updated: Through all Week 18 games, Jan. 6, 10:30 a.m. ET".
 *
 * The week is only reported when it parses unambiguously; otherwise callers
 * fall back to a "Season to Date" label and the full text is kept in
 * provenance. The week is never guessed.
 */
export function parseFreshness(story) {
  if (typeof story !== "string") return { throughWeek: null, sourceUpdatedText: null };
  const text = story.replace(/<[^>]+>/g, " ");
  const updated = UPDATED_PATTERN.exec(text);
  const sourceUpdatedText = updated ? updated[0].replace(/\s+/g, " ").trim() : null;
  const weekMatch = WEEK_PATTERN.exec(sourceUpdatedText ?? text);
  const week = weekMatch ? Number(weekMatch[1]) : null;
  const throughWeek = Number.isInteger(week) && week >= 1 && week <= 22 ? week : null;
  return { throughWeek, sourceUpdatedText };
}

// ---------------------------------------------------------------------------
// Team mapping
// ---------------------------------------------------------------------------

/**
 * ESPN team slug -> canonical repo abbreviation.
 *
 * ESPN's slugs are the same codes teams.json already uses as `abbr`
 * (including wsh / lar / lac), so this reuses the repository's canonical
 * identity rather than introducing a parallel mapping.
 */
export function buildEspnTeamMap(teamsJson) {
  const teams = teamsJson?.teams ?? [];
  if (teams.length !== EXPECTED_TEAM_COUNT) {
    throw new Error(`Expected ${EXPECTED_TEAM_COUNT} canonical teams, found ${teams.length}`);
  }
  const map = new Map();
  for (const team of teams) {
    if (!team.abbr) throw new Error(`Team ${team.slug ?? "?"} has no abbr`);
    if (map.has(team.abbr)) throw new Error(`Duplicate team abbr ${team.abbr}`);
    map.set(team.abbr, team.abbr);
  }
  return map;
}

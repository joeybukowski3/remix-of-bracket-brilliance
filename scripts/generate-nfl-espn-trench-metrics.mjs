/**
 * Generate public/data/nfl/matchup-trench-metrics.json — ESPN Analytics team
 * trench win rates (PBWR, RBWR, PRWR, RSWR) for the matchup analyzer.
 *
 * Independent of the Phase 2 conventional-stat generator and the Phase 3A RBSDM
 * generator: an ESPN failure can never block either of those, and a missing
 * trench artifact only leaves the trench rows at N/A.
 *
 * Source: https://now.core.api.espn.com/v1/sports/news/{articleId}?enable=inlines
 * Public, unauthenticated, no cookies. The rendered www.espn.com article path is
 * AWS-WAF protected and is never requested.
 *
 * Values and ranks are ESPN's published team figures, consumed verbatim.
 *
 * Usage:
 *   node scripts/generate-nfl-espn-trench-metrics.mjs
 *   node scripts/generate-nfl-espn-trench-metrics.mjs --dry-run
 *   node scripts/generate-nfl-espn-trench-metrics.mjs --seasons=2024,2025
 *   node scripts/generate-nfl-espn-trench-metrics.mjs --article=2025:46138675
 *   node scripts/generate-nfl-espn-trench-metrics.mjs --offline=<dir>
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ESPN_ATTRIBUTION,
  ESPN_NEWS_ENDPOINT,
  ESPN_SEARCH_ENDPOINT,
  ESPN_SOURCE_LABEL,
  EXPECTED_TEAM_COUNT,
  KNOWN_ARTICLE_IDS,
  TRENCH_COLUMN_MAP,
  TRENCH_METRIC_KEYS,
  buildEspnTeamMap,
  findTeamModule,
  newsUrl,
  parseFreshness,
  parseTeamModule,
  selectSeasonArticle,
} from "./lib/nfl-espn-trench.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const OUT_FILE = join(DATA_DIR, "matchup-trench-metrics.json");
const SCHEMA_VERSION = "nfl-matchup-trench-metrics-v1";

const REQUEST_SPACING_MS = 2500;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 4000;
const USER_AGENT = "JoeKnowsBall-nfl-matchup-analyzer/1.0 (+https://www.joeknowsball.com)";

const DEFAULT_SEASONS = [2025];

function parseArgs(argv) {
  const args = { seasons: DEFAULT_SEASONS, dryRun: false, offlineDir: null, overrides: {} };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) {
      args.seasons = raw.slice(10).split(",").map((s) => Number(s.trim())).filter(Number.isInteger);
    } else if (raw.startsWith("--article=")) {
      // --article=2025:46138675 — explicit override for recovery/manual use.
      const [season, id] = raw.slice(10).split(":");
      if (!season || !id) throw new Error(`--article expects <season>:<articleId>`);
      args.overrides[Number(season)] = id;
    } else if (raw.startsWith("--offline=")) args.offlineDir = resolve(raw.slice(10));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.seasons.length === 0) throw new Error("No valid seasons requested");
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

/** GET with a bounded retry for transient failures only. */
async function fetchJson(url, label, { offlineFile }) {
  if (offlineFile) {
    if (!existsSync(offlineFile)) throw new Error(`${label}: offline fixture missing (${offlineFile})`);
    return readJson(offlineFile);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const transient = response.status >= 500 || response.status === 429;
        if (!transient) throw new Error(`${label}: HTTP ${response.status}`);
        lastError = new Error(`${label}: HTTP ${response.status}`);
      } else {
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`${label}: response was not valid JSON (likely an HTML or WAF page)`);
        }
      }
    } catch (err) {
      if (err.message?.includes("not valid JSON") || /HTTP 4\d\d/.test(err.message ?? "")) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BACKOFF_MS * attempt);
  }
  throw lastError ?? new Error(`${label}: request failed`);
}

/**
 * Resolve a season's article id: explicit override, else public search
 * discovery, else the known historical id as a last-resort fallback.
 */
async function discoverArticleId(season, { overrides, offlineDir }) {
  if (overrides[season]) {
    return { articleId: overrides[season], discovery: "override" };
  }

  const url = `${ESPN_SEARCH_ENDPOINT}?region=us&lang=en&query=${encodeURIComponent(
    `${season} NFL win rate rankings`
  )}&limit=20`;
  const offlineFile = offlineDir ? join(offlineDir, `search_${season}.json`) : null;

  try {
    const payload = await fetchJson(url, `search ${season}`, { offlineFile });
    const { article } = selectSeasonArticle(payload, season);
    if (article) {
      console.log(`[nfl:trench] discovered ${season} article ${article.articleId} — "${article.headline}"`);
      return { articleId: article.articleId, discovery: "search", headline: article.headline };
    }
    console.log(`[nfl:trench] search found no ${season} leaderboard article`);
  } catch (err) {
    // Ambiguity is fatal; a transport failure can still fall back to a known id.
    if (/Ambiguous article discovery/.test(err.message)) throw err;
    console.log(`[nfl:trench] search failed for ${season}: ${err.message}`);
  }

  if (KNOWN_ARTICLE_IDS[season]) {
    console.log(`[nfl:trench] falling back to known ${season} article ${KNOWN_ARTICLE_IDS[season]}`);
    return { articleId: KNOWN_ARTICLE_IDS[season], discovery: "known-fallback" };
  }
  return { articleId: null, discovery: "none" };
}

async function buildSeason(season, { teamMap, overrides, offlineDir }) {
  const { articleId, discovery, headline } = await discoverArticleId(season, { overrides, offlineDir });
  if (!articleId) {
    return { season, skipped: `no article found for ${season}` };
  }

  if (!offlineDir) await sleep(REQUEST_SPACING_MS);
  const label = `${season} article ${articleId}`;
  const offlineFile = offlineDir ? join(offlineDir, `news_${articleId}.json`) : null;
  const payload = await fetchJson(newsUrl(articleId), label, { offlineFile });

  const { article, module } = findTeamModule(payload, { label });
  const teams = parseTeamModule(module, { teamMap, label });
  const { throughWeek, sourceUpdatedText } = parseFreshness(article.story);

  console.log(
    `[nfl:trench] ${label}: ${Object.keys(teams).length} teams, throughWeek=${throughWeek ?? "unparsed"}`
  );

  return {
    season,
    articleId,
    discovery,
    headline: headline ?? article.headline ?? null,
    throughWeek,
    sourceUpdatedText,
    sourceLastModified: article.lastModified ?? null,
    moduleId: module.id ?? null,
    moduleHeadline: module.headline ?? null,
    teams,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const teamsJson = readJson(join(DATA_DIR, "teams.json"));
  const teamMap = buildEspnTeamMap(teamsJson);

  const seasons = {};
  const seasonProvenance = [];
  const skipped = [];
  let first = true;

  for (const season of args.seasons) {
    if (!first && !args.offlineDir) await sleep(REQUEST_SPACING_MS);
    first = false;

    const built = await buildSeason(season, {
      teamMap,
      overrides: args.overrides,
      offlineDir: args.offlineDir,
    });

    if (built.skipped) {
      console.log(`[nfl:trench] ${built.skipped}`);
      skipped.push({ season, reason: built.skipped });
      continue;
    }

    const teams = {};
    for (const [abbr, entry] of Object.entries(built.teams)) {
      const metrics = {};
      for (const key of TRENCH_METRIC_KEYS) metrics[key] = entry.metrics[key];
      teams[abbr] = { espnSlug: entry.espnSlug, metrics };
    }

    seasons[String(season)] = {
      articleId: built.articleId,
      throughWeek: built.throughWeek,
      sourceUpdatedText: built.sourceUpdatedText,
      sourceLastModified: built.sourceLastModified,
      teams,
    };
    seasonProvenance.push({
      season,
      articleId: built.articleId,
      discovery: built.discovery,
      headline: built.headline,
      endpoint: newsUrl(built.articleId),
      moduleId: built.moduleId,
      moduleHeadline: built.moduleHeadline,
      throughWeek: built.throughWeek,
      sourceUpdatedText: built.sourceUpdatedText,
      sourceLastModified: built.sourceLastModified,
      teamsParsed: Object.keys(teams).length,
    });
  }

  if (Object.keys(seasons).length === 0) {
    throw new Error("No seasons could be built; refusing to overwrite a known-good artifact");
  }

  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: ESPN_SOURCE_LABEL,
    attribution: ESPN_ATTRIBUTION,
    endpointBase: ESPN_NEWS_ENDPOINT,
    metricColumns: TRENCH_COLUMN_MAP,
    seasons,
    provenance: {
      retrievedAt: new Date().toISOString(),
      seasons: seasonProvenance,
      skipped,
      notes: [
        "PBWR/RBWR/PRWR/RSWR are ESPN Analytics metrics built on NFL Next Gen Stats tracking data. Published team values and ESPN's official ranks are used verbatim.",
        "Nothing is approximated, reconstructed, or derived from sacks, pressure rate, player leaderboards or play-by-play.",
        "ESPN publishes whole-number percentages but ranks on finer internal precision, so its official 1-32 rank cannot be reproduced from the published values. Only the official rank is stored; no local rank is computed.",
        "Source granularity is cumulative season-to-date only. No Last 5, Last 8, weekly split, arbitrary window or cross-season blend exists or is created.",
        "Team-level numerators/denominators are not published, so the official team value cannot be recomputed.",
        "Retrieved from the public now.core.api.espn.com news API with enable=inlines. The WAF-protected www.espn.com article path is never requested.",
      ],
    },
  };

  console.log(
    `[nfl:trench] seasons=${Object.keys(seasons).join(",")} teams=${Object.values(seasons)
      .map((s) => Object.keys(s.teams).length)
      .join(",")}`
  );

  if (args.dryRun) {
    console.log("[nfl:trench] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
    }
    throw err;
  }
  console.log(`[nfl:trench] wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(`[nfl:trench] FAILED: ${err.message}`);
  console.error(`[nfl:trench] endpoint base: ${ESPN_NEWS_ENDPOINT}`);
  console.error(`[nfl:trench] expected ${EXPECTED_TEAM_COUNT} teams; existing artifact left untouched`);
  process.exit(1);
});

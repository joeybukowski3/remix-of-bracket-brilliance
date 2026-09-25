/** Current-only DraftKings Network HTML capture. No archive or application UI. */
import { readFileSync, statSync, mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DK_MARKETS, marketUrl, parseDraftKingsSplitsHtml } from "./lib/draftkings-nfl-betting-splits.mjs";
import { joinDraftKingsGames } from "./lib/draftkings-nfl-betting-splits-join.mjs";
import { currentSlateCoverage, DK_SPLITS_SCHEMA_VERSION, publicationIssues, validateDraftKingsSplitsArtifact } from "./lib/draftkings-nfl-betting-splits-artifact.mjs";
import { resolveCurrentWeek } from "./lib/nfl-market-coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/data/nfl/betting-splits/current.json");
const MAX_PAGES_PER_MARKET = 10;
const TIMEOUT_MS = 12000;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

export function parseArgs(argv) {
  const args = { dryRun: false, season: 2026, captureManifest: null, inputDir: null };
  for (let index = 2; index < argv.length; index++) {
    const item = argv[index];
    if (item === "--dry-run") args.dryRun = true;
    else if (/^--season=\d{4}$/.test(item)) args.season = Number(item.slice(9));
    else if (item.startsWith("--capture-manifest=")) args.captureManifest = resolve(item.slice("--capture-manifest=".length));
    else if (item === "--input-dir") {
      const path = argv[++index];
      if (!path || path.startsWith("--")) throw new Error("--input-dir requires a directory path");
      args.inputDir = resolve(path);
    }
    else if (item.startsWith("--input-dir=")) {
      const path = item.slice("--input-dir=".length);
      if (!path) throw new Error("--input-dir requires a directory path");
      args.inputDir = resolve(path);
    }
    else throw new Error(`Unknown argument: ${item}`);
  }
  if (args.captureManifest && !args.dryRun) throw new Error("--capture-manifest requires --dry-run; saved captures are never published");
  if (args.inputDir && !args.dryRun) throw new Error("--input-dir requires --dry-run; saved captures are never published");
  if (args.inputDir && args.captureManifest) throw new Error("Choose either --input-dir or --capture-manifest");
  return args;
}

export async function fetchPage(market, page, fetchImpl = fetch, clock = () => new Date().toISOString()) {
  const url = marketUrl(market, page);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/html" } });
  if (response.status !== 200) throw new Error(`${market} page ${page}: HTTP ${response.status}`);
  if (!/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) throw new Error(`${market} page ${page}: expected text/html`);
  const html = await response.text();
  const fetchedAt = clock();
  const bytes = Buffer.byteLength(html, "utf8");
  console.log(JSON.stringify({ market, page, status: response.status, bytes, fetchedAt, url }));
  const parsed = parseDraftKingsSplitsHtml(html, { market, page, sourceUrl: url, capturedAt: fetchedAt });
  if (!parsed.blocksSeen) throw new Error(`${market} page ${page}: no matchup blocks; refusing empty source`);
  return { parsed, fetchedAt, bytes, status: response.status, url };
}

function readCapturePage(market, page, manifest) {
  const matches = manifest.requests.filter((entry) => entry.market === market && entry.page === page);
  if (matches.length !== 1) throw new Error(`${market} page ${page}: expected one capture manifest entry`);
  const entry = matches[0];
  const url = marketUrl(market, page);
  if (entry.url !== url || entry.status !== 200 || !/^text\/html\b/i.test(entry.contentType) || !Number.isFinite(Date.parse(entry.fetchedAt))) throw new Error(`${market} page ${page}: invalid capture metadata`);
  const html = readFileSync(resolve(dirname(manifest.path), entry.file), "utf8");
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes !== entry.bytes) throw new Error(`${market} page ${page}: capture byte count mismatch`);
  console.log(JSON.stringify({ market, page, status: entry.status, bytes, fetchedAt: entry.fetchedAt, url, localCapture: true }));
  const parsed = parseDraftKingsSplitsHtml(html, { market, page, sourceUrl: url, capturedAt: entry.fetchedAt });
  if (!parsed.blocksSeen) throw new Error(`${market} page ${page}: no matchup blocks; refusing empty source`);
  return { parsed, fetchedAt: entry.fetchedAt, bytes, status: entry.status, url };
}

export function readInputDirPage(market, page, inputDir) {
  const path = join(inputDir, `${market.toLowerCase()}-page-${page}.html`);
  const html = readFileSync(path, "utf8");
  const capturedAt = statSync(path).mtime.toISOString();
  const url = marketUrl(market, page);
  const bytes = Buffer.byteLength(html, "utf8");
  console.log(JSON.stringify({ market, page, bytes, fileModifiedAt: capturedAt, url, localCapture: true }));
  const parsed = parseDraftKingsSplitsHtml(html, { market, page, sourceUrl: url, capturedAt });
  if (!parsed.blocksSeen) throw new Error(`${market} page ${page}: no matchup blocks; refusing empty source`);
  return { parsed, fetchedAt: capturedAt, bytes, status: 200, url };
}

export async function fetchMarket(market, loadPage = fetchPage) {
  const pages = [];
  const pending = [1];
  const seen = new Set();
  while (pending.length) {
    const page = pending.shift();
    if (seen.has(page)) continue;
    if (page > MAX_PAGES_PER_MARKET || seen.size >= MAX_PAGES_PER_MARKET) throw new Error(`${market}: pagination exceeded ${MAX_PAGES_PER_MARKET} pages`);
    if (seen.size && loadPage === fetchPage) await wait(300);
    const result = await loadPage(market, page);
    pages.push(result);
    seen.add(page);
    for (const next of result.parsed.observedPages) if (!seen.has(next) && !pending.includes(next)) pending.push(next);
    pending.sort((a, b) => a - b);
  }
  return pages;
}

export function makeArtifact(pages, teams, schedule, season, generatedAt = new Date().toISOString()) {
  const week = resolveCurrentWeek(schedule.filter((game) => game.season === season && game.seasonType === "REG"));
  if (week == null) throw new Error(`No scheduled NFL week in canonical ${season} schedule`);
  const captures = pages.map((entry) => entry.fetchedAt).sort();
  const sourceCapturedAt = captures[0];
  const joined = joinDraftKingsGames(pages.map((entry) => entry.parsed), teams, schedule, { season, intendedWeek: week, sourceCapturedAt });
  const issues = joined.diagnostics;
  const artifact = {
    schemaVersion: DK_SPLITS_SCHEMA_VERSION,
    _meta: {
      generatedAt,
      sourceCapturedAt,
      captureEndAt: captures.at(-1),
      season,
      week,
      source: "DraftKings Network / DraftKings Sportsbook",
      sourceUrls: { spread: marketUrl("Spread"), moneyline: marketUrl("Moneyline"), total: marketUrl("Total") },
      diagnostics: {
        pagesFetched: pages.length,
        rowsSeen: pages.reduce((n, entry) => n + entry.parsed.blocksSeen, 0),
        sidesSeen: pages.reduce((n, entry) => n + entry.parsed.sidesSeen, 0),
        matchedGames: joined.games.length,
        adjacentWeekGames: new Set(joined.adjacent.map((row) => row.gameId)).size,
        selectedWeekGamesSeen: joined.games.length + new Set(joined.started.map((row) => row.gameId)).size,
        unmatchedRows: issues.filter((issue) => ["unresolved_team", "matchup_not_found", "reversed_orientation", "duplicate_canonical_candidate", "kickoff_mismatch"].includes(issue.code)).length,
        duplicateRows: issues.filter((issue) => issue.code === "duplicate_source_matchup").length,
        missingMarkets: issues.filter((issue) => issue.code === "missing_market").length,
        adjacentWeekRows: joined.adjacent.length,
        malformedRows: issues.filter((issue) => ["malformed_matchup", "malformed_side", "incomplete_market", "percentage_structure"].includes(issue.code)).length,
        issues,
      },
    },
    games: joined.games,
  };
  const coverage = currentSlateCoverage(artifact, schedule);
  Object.assign(artifact._meta.diagnostics, coverage, { missingEligibleGames: coverage.missingEligibleGameIds.length });
  return artifact;
}

export function publishArtifact(path, artifact, teams, schedule) {
  const issues = publicationIssues(artifact, teams, schedule);
  if (issues.length) throw new Error(`Publication blocked: ${issues.join("; ")}`);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.captureManifest || args.inputDir ? "offline-test" : args.dryRun ? "live-dry-run" : "production";
  const manifest = args.captureManifest ? { ...JSON.parse(readFileSync(args.captureManifest, "utf8")), path: args.captureManifest } : null;
  if (manifest && !Array.isArray(manifest.requests)) throw new Error("Invalid capture manifest");
  const teams = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf8")).teams;
  const schedule = JSON.parse(readFileSync(join(ROOT, `public/data/nfl/${args.season}/games.json`), "utf8")).games;
  const selectedWeek = resolveCurrentWeek(schedule.filter((game) => game.season === args.season && game.seasonType === "REG"));
  if (selectedWeek == null) {
    console.log(JSON.stringify({ mode, season: args.season, status: "no scheduled regular-season slate", publication: "skipped" }));
    return;
  }
  console.log(JSON.stringify({ event: "fetch_start", mode, season: args.season, selectedWeek, at: new Date().toISOString() }));
  const pages = [];
  const loadPage = manifest ? (market, page) => readCapturePage(market, page, manifest)
    : args.inputDir ? (market, page) => readInputDirPage(market, page, args.inputDir) : fetchPage;
  for (const market of DK_MARKETS) pages.push(...await fetchMarket(market, loadPage));
  const artifact = makeArtifact(pages, teams, schedule, args.season);
  const artifactValidationIssues = validateDraftKingsSplitsArtifact(artifact, teams, schedule);
  const issues = publicationIssues(artifact, teams, schedule);
  for (const market of DK_MARKETS) {
    const subset = pages.filter((entry) => entry.parsed.market === market.toLowerCase());
    console.log(`${market}: pages=${subset.length} matchups=${subset.reduce((n, entry) => n + entry.parsed.blocksSeen, 0)} sides=${subset.reduce((n, entry) => n + entry.parsed.sidesSeen, 0)}`);
  }
  console.log(JSON.stringify({ mode, sourceCapturedAt: artifact._meta.sourceCapturedAt, captureEndAt: artifact._meta.captureEndAt, generatedAt: artifact._meta.generatedAt, week: artifact._meta.week, games: artifact.games.length, diagnostics: artifact._meta.diagnostics, artifactValidation: artifactValidationIssues.length ? artifactValidationIssues : "passed", publicationIssues: issues }, null, 2));
  if (issues.length) throw new Error(`Validation failed; current.json preserved (${issues.length} issues)`);
  if (args.dryRun) { console.log("Dry run: no artifact written; publication skipped"); return; }
  publishArtifact(OUT, artifact, teams, schedule);
  console.log(JSON.stringify({ publication: "published", path: OUT, sourceCapturedAt: artifact._meta.sourceCapturedAt, generatedAt: artifact._meta.generatedAt }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[nfl:betting-splits] ${error.message}; publication did not occur, current.json preserved`); process.exitCode = 1; });
}

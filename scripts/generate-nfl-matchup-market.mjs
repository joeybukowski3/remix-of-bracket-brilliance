/**
 * Generate public/data/nfl/matchup-market.json — descriptive NFL market data.
 *
 * Source: nflverse nfldata games.csv, the same URL the schedules/results
 * pipeline already uses. The CSV is fetched once and both the current market
 * and the historical profiles are built from it; no second copy of the upstream
 * file is cached, and the source URL and CSV parser are imported from
 * nfl-schedules-results-core.mjs rather than restated.
 *
 * Independent of the Phase 2 conventional generator and the Phase 3A, 3B and 4
 * generators: a failure here can never block any of them, and a missing market
 * artifact only leaves the market rows at N/A.
 *
 * Everything produced is descriptive. No projected spread, fair spread, model
 * edge, win probability, pick, confidence, EV or stake sizing is calculated.
 *
 * Usage:
 *   node scripts/generate-nfl-matchup-market.mjs
 *   node scripts/generate-nfl-matchup-market.mjs --dry-run
 *   node scripts/generate-nfl-matchup-market.mjs --input=path/to/games.csv
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NFL_GAMES_SOURCE_URL,
  buildNflverseTeamMap,
  parseCsv,
} from "./lib/nfl-schedules-results-core.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import {
  NFL_MARKET_ATTRIBUTION,
  NFL_MARKET_SOURCE_LABEL,
  buildTeamGameLog,
  currentMarketFor,
  lastNGames,
  parseMarketRow,
  rankHigherIsBetter,
  summarizeGames,
} from "./lib/nfl-market-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const OUT_FILE = join(DATA_DIR, "matchup-market.json");

export const MARKET_SCHEMA_VERSION = "nfl-matchup-market-v1";

const CURRENT_SEASON = 2026;
const PRIOR_SEASON = 2025;

/** Periods the artifact precomputes. Which two are shown is a display decision. */
const PERIOD_SPECS = [
  { key: "2025-season", season: PRIOR_SEASON, lastN: null },
  { key: "2025-last8", season: PRIOR_SEASON, lastN: 8 },
  { key: "2026-season", season: CURRENT_SEASON, lastN: null },
  { key: "2026-last5", season: CURRENT_SEASON, lastN: 5 },
];

const GITHUB_COMMITS_API =
  "https://api.github.com/repos/nflverse/nfldata/commits?path=data/games.csv&per_page=1";

function parseArgs(argv) {
  const args = { dryRun: false, input: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--input=")) args.input = resolve(raw.slice("--input=".length));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function loadCsvText(input) {
  if (input) {
    console.log(`[nfl:market] reading local input ${input}`);
    return readFileSync(input, "utf-8");
  }
  console.log(`[nfl:market] fetching ${NFL_GAMES_SOURCE_URL}`);
  const response = await fetch(NFL_GAMES_SOURCE_URL, {
    headers: { "User-Agent": "JoeKnowsBall-nfl-matchup-analyzer/1.0" },
  });
  if (!response.ok) throw new Error(`Failed to fetch games.csv: HTTP ${response.status}`);
  return response.text();
}

/**
 * The upstream commit that last touched games.csv.
 *
 * games.csv carries no per-row timestamp, so a line-specific update time cannot
 * be known and is never fabricated. The commit is the most precise upstream
 * marker available; a lookup failure is non-fatal.
 */
async function fetchUpstreamCommit() {
  try {
    const response = await fetch(GITHUB_COMMITS_API, {
      headers: { "User-Agent": "JoeKnowsBall-nfl-matchup-analyzer/1.0", Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const [commit] = await response.json();
    if (!commit?.sha) return null;
    return { sha: commit.sha, committedAt: commit.commit?.author?.date ?? null };
  } catch {
    return null;
  }
}

function main(csvText, upstreamCommit, args) {
  const teamsJson = JSON.parse(readFileSync(join(DATA_DIR, "teams.json"), "utf-8"));
  const teamMap = buildNflverseTeamMap(teamsJson);
  const abbrs = teamsJson.teams.map((team) => team.abbr).sort();

  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error("games.csv parsed to zero rows — refusing to continue");

  const games = rows
    .filter((row) => {
      const season = Number(row.season);
      return season === CURRENT_SEASON || season === PRIOR_SEASON;
    })
    .map((row) => parseMarketRow(row, teamMap));

  if (games.length === 0) {
    throw new Error("no games parsed for the target seasons — refusing to overwrite a known-good artifact");
  }

  // ---- historical profiles -------------------------------------------------
  const periods = {};
  const completedGames = {};

  for (const season of [PRIOR_SEASON, CURRENT_SEASON]) {
    completedGames[String(season)] = Object.fromEntries(
      abbrs.map((abbr) => [abbr, buildTeamGameLog(games, abbr, season).length])
    );
  }

  for (const spec of PERIOD_SPECS) {
    const teams = {};
    for (const abbr of abbrs) {
      const log = buildTeamGameLog(games, abbr, spec.season);
      if (log.length === 0) continue;
      const windowed = spec.lastN == null ? log : lastNGames(log, spec.lastN);
      teams[abbr] = summarizeGames(windowed, abbr);
    }
    if (Object.keys(teams).length === 0) {
      periods[spec.key] = { season: spec.season, lastN: spec.lastN, teams: {} };
      continue;
    }
    // Ranks only where ranking is meaningful. Raw ATS/O-U records, spreads,
    // moneylines and totals are deliberately unranked and uncoloured.
    const atsDiffRanks = rankHigherIsBetter(
      Object.fromEntries(Object.entries(teams).map(([abbr, p]) => [abbr, p.atsDifferential]))
    );
    const pointDiffRanks = rankHigherIsBetter(
      Object.fromEntries(Object.entries(teams).map(([abbr, p]) => [abbr, p.pointDifferential]))
    );
    for (const [abbr, profile] of Object.entries(teams)) {
      profile.ranks = {
        atsDifferential: atsDiffRanks[abbr] ?? null,
        pointDifferential: pointDiffRanks[abbr] ?? null,
      };
    }
    periods[spec.key] = { season: spec.season, lastN: spec.lastN, teams };
  }

  // ---- current market ------------------------------------------------------
  // A scheduled game with no line yet is normal, not a failure: every market
  // field is simply null and the UI renders N/A.
  const currentMarket = {};
  let withSpread = 0;
  let withTotal = 0;
  let withMoneyline = 0;
  for (const game of games) {
    if (game.season !== CURRENT_SEASON) continue;
    const market = currentMarketFor(game);
    currentMarket[game.gameId] = market;
    if (market.spread.home != null) withSpread += 1;
    if (market.total != null) withTotal += 1;
    if (market.moneyline.home != null && market.moneyline.away != null) withMoneyline += 1;
  }

  if (Object.keys(currentMarket).length === 0) {
    throw new Error(`no ${CURRENT_SEASON} games found — refusing to publish an empty market artifact`);
  }
  if (Object.keys(periods["2025-season"].teams).length !== 32) {
    throw new Error(
      `expected 32 teams in the ${PRIOR_SEASON} profile, got ${Object.keys(periods["2025-season"].teams).length}`
    );
  }

  const retrievedAt = new Date().toISOString();

  const artifact = {
    _meta: buildNflMeta({
      source: NFL_MARKET_SOURCE_LABEL,
      season: CURRENT_SEASON,
      week: null,
      notes: [
        "Descriptive market data only. No projected spread, fair spread, model edge, win probability, pick, confidence, expected value or stake sizing is produced.",
        "nfldata publishes a single market line per game. The underlying sportsbook composition is not disclosed, so no book is named and no multi-book consensus is claimed.",
        "spread_line is home-relative and positive when the home team is favoured; conventional notation inverts it (home = -spread_line).",
        "Completed-game lines are the source's settled historical market line, not an independently verified sportsbook closing line.",
        "No opening line and no line-movement history exist in this source.",
        "games.csv carries no per-row timestamp; only the upstream commit time is recorded.",
        "Neutral-site games are excluded from home and away splits but still count in overall ATS, over/under and window records.",
        "Pick'em games are excluded from favourite and underdog splits but still count in overall ATS.",
        "Postseason is excluded from every regular-season profile.",
        "Pushes are preserved as W-L-P and O-U-P and are never folded into wins or losses.",
      ],
    }),
    schemaVersion: MARKET_SCHEMA_VERSION,
    attribution: NFL_MARKET_ATTRIBUTION,
    currentSeason: CURRENT_SEASON,
    priorSeason: PRIOR_SEASON,

    completedGames,
    periods,
    currentMarket,

    provenance: {
      retrievedAt,
      sourceUrl: NFL_GAMES_SOURCE_URL,
      sourceLabel: NFL_MARKET_SOURCE_LABEL,
      upstreamCommitSha: upstreamCommit?.sha ?? null,
      upstreamCommitAt: upstreamCommit?.committedAt ?? null,
      perRowTimestampAvailable: false,
      seasonsParsed: [PRIOR_SEASON, CURRENT_SEASON],
      gamesParsed: games.length,
      currentSeasonGames: Object.keys(currentMarket).length,
      currentSeasonWithSpread: withSpread,
      currentSeasonWithTotal: withTotal,
      currentSeasonWithMoneyline: withMoneyline,
      spreadConvention:
        "spread_line > 0 means the home team is favoured by that many points; homeTeamSpread = -spread_line, awayTeamSpread = +spread_line",
    },
  };

  console.log(
    `[nfl:market] games=${games.length} periods=${Object.keys(periods).join(",")} ` +
      `${CURRENT_SEASON}: ${Object.keys(currentMarket).length} games, ${withSpread} with a spread, ` +
      `${withTotal} with a total, ${withMoneyline} with moneylines`
  );
  if (upstreamCommit) {
    console.log(`[nfl:market] upstream commit ${upstreamCommit.sha.slice(0, 8)} @ ${upstreamCommit.committedAt}`);
  } else {
    console.log("[nfl:market] upstream commit lookup unavailable; provenance records null");
  }

  if (args.dryRun) {
    console.log("[nfl:market] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
  console.log(`[nfl:market] wrote ${OUT_FILE}`);
}

const args = parseArgs(process.argv);
const csvText = await loadCsvText(args.input);
const upstreamCommit = args.input ? null : await fetchUpstreamCommit();
try {
  main(csvText, upstreamCommit, args);
} catch (err) {
  console.error(`[nfl:market] FAILED: ${err.message}`);
  console.error("[nfl:market] existing artifact left untouched");
  process.exit(1);
}

/**
 * Phase 3 game-environment feature source: a leakage-safe historical
 * spread/total/implied-team-total artifact, keyed by season|week|team.
 *
 * Source: nflverse nfldata `games.csv` -- the SAME file the existing
 * schedules pipeline (PR-2, `nfl-schedules-results-core.mjs`) and the
 * Phase 5 matchup-market pipeline (`nfl-market-core.mjs`) already read.
 * `parseMarketRow` is reused verbatim, not reimplemented. This script adds
 * no second copy of the URL, CSV parser, or market-row parsing logic.
 *
 * Leakage note: a market line for a game cannot exist after that game's
 * kickoff (lines stop updating at kickoff), so the settled historical
 * market line recorded for a COMPLETED game is safe to use as a pregame
 * feature for that same game. No per-row timestamp exists in the source
 * (documented in nfl-market-core.mjs / the redesign spec), so this is "the
 * published line associated with the game," not a verified pre-kickoff
 * snapshot at a specific minute -- consistent with how the existing Phase 5
 * matchup-market pipeline already describes this source.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NFL_GAMES_SOURCE_URL, buildNflverseTeamMap, parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { awayTeamSpread, homeTeamSpread, parseMarketRow } from "./lib/nfl-market-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");
const USER_AGENT = "JoeKnowsBall-nfl-yardage-props/1.0 (+https://www.joeknowsball.com)";

function parseArgs(argv) {
  const args = { seasons: null, output: null, generatedAt: new Date().toISOString(), dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) args.seasons = raw.slice(10).split(",").map(Number).filter(Number.isInteger);
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf-8");
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) { try { unlinkSync(tmp); } catch { /* best effort */ } }
    throw err;
  }
}

function impliedTeamTotals(spreadLine, totalLine) {
  if (spreadLine == null || totalLine == null) return { home: null, away: null };
  const home = (totalLine - spreadLine) / 2;
  const away = (totalLine + spreadLine) / 2;
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) return { home: null, away: null };
  return { home, away };
}

async function main() {
  const args = parseArgs(process.argv);
  const teamsJson = JSON.parse(readFileSync(join(DATA_DIR, "teams.json"), "utf-8"));
  const teamMap = buildNflverseTeamMap(teamsJson);

  const response = await fetch(NFL_GAMES_SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${NFL_GAMES_SOURCE_URL}`);
  const csvText = await response.text();
  const dataRows = parseCsv(csvText); // already header-mapped: array of { column: value } records
  const targetSeasons = args.seasons ?? [2022, 2023, 2024, 2025];

  // Filter by season BEFORE parsing: pre-2020 rows use retired team codes
  // (e.g. OAK) that intentionally do not resolve against teams.json, and
  // parseMarketRow throws rather than guessing — consistent with the
  // repository-wide "ingest must fail on any team code it cannot resolve"
  // mandate. Filtering first keeps that behavior for in-scope rows.
  const games = dataRows
    .filter((row) => targetSeasons.includes(Number(row.season)))
    .map((row) => parseMarketRow(row, teamMap))
    .filter((g) => g.seasonType === "REG");

  const rowsOut = [];
  for (const game of games) {
    if (!game.final) continue; // no historical line context for an unplayed game
    const totals = impliedTeamTotals(game.spreadLine, game.totalLine);
    rowsOut.push({
      season: game.season, week: game.week, gameId: game.gameId,
      team: game.homeAbbr, opponent: game.awayAbbr, homeAway: "home",
      spread: homeTeamSpread(game.spreadLine), total: game.totalLine, impliedTeamTotal: totals.home,
      neutralSite: game.neutralSite,
    });
    rowsOut.push({
      season: game.season, week: game.week, gameId: game.gameId,
      team: game.awayAbbr, opponent: game.homeAbbr, homeAway: "away",
      spread: awayTeamSpread(game.spreadLine), total: game.totalLine, impliedTeamTotal: totals.away,
      neutralSite: game.neutralSite,
    });
  }
  rowsOut.sort((a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team));

  const seasonsCovered = [...new Set(rowsOut.map((r) => r.season))].sort((a, b) => a - b);
  const withLine = rowsOut.filter((r) => r.spread != null && r.total != null).length;

  const artifact = {
    _meta: {
      schemaVersion: "nfl-historical-market-context-v1",
      generatedAt: args.generatedAt,
      source: "nflverse nfldata games.csv (settled historical market line; no per-row timestamp)",
      attribution: "Market data: nflverse / nfldata",
      sourceUrl: NFL_GAMES_SOURCE_URL,
      seasons: seasonsCovered,
      rowCount: rowsOut.length,
      rowsWithLine: withLine,
      rowsWithoutLine: rowsOut.length - withLine,
    },
    rows: rowsOut,
  };

  const output = args.output ?? join(DEFAULT_OUTPUT_DIR, `historical-market-context-${seasonsCovered[0]}-${seasonsCovered.at(-1)}.json`);
  if (!args.dryRun) writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`[nfl:historical-market-context] ${rowsOut.length} rows (${withLine} with a line) -> ${output}${args.dryRun ? " (dry run)" : ""}`);
}

main().catch((err) => {
  console.error(`[nfl:historical-market-context] FAILED: ${err.message}`);
  process.exit(1);
});

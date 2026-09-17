/**
 * RESEARCH ONLY — post-game grading for the prospective 2026 JKB TD Score
 * forward validation.
 *
 * Reads the append-only forward archive
 * (`data/nfl/research/td-calibration/forward-archive/nfl-td-forward-archive-2026.jsonl`)
 * and the nflverse player-week stats cache
 * (`data/nfl/nflverse/player-week-stats/stats_player_week_2026.csv`), then
 * writes ONE append-only grade record per (playerId, gameId) to
 * `.../forward-archive/nfl-td-forward-grades-2026.jsonl`:
 *
 *   actualTd = 1 if rushing_tds + receiving_tds >= 1, else 0
 *
 * Passing TDs, defensive TDs, special-teams TDs and two-point conversions are
 * excluded by construction. Pregame feature values in the archive are NEVER
 * mutated — grading is a separate append-only file (safe enrichment), matching
 * the repo's other research-archive grading conventions.
 *
 * Usage: node scripts/research/grade-nfl-td-forward-validation.mjs [--dry-run]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseCsv } from "../lib/nfl-schedules-results-core.mjs";
import { gradeActualTd, parseJsonl, toJsonl } from "./lib/nfl-td-forward-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SEASON = 2026;
const DIR = path.join(ROOT, "data/nfl/research/td-calibration/forward-archive");
const ARCHIVE = path.join(DIR, `nfl-td-forward-archive-${SEASON}.jsonl`);
const GRADES = path.join(DIR, `nfl-td-forward-grades-${SEASON}.jsonl`);
const STATS_CSV = path.join(ROOT, "data/nfl/nflverse/player-week-stats", `stats_player_week_${SEASON}.csv`);

const DRY_RUN = process.argv.includes("--dry-run");
const normId = (id) => (String(id).startsWith("gsis:") ? String(id) : `gsis:${id}`);
const numOr0 = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);

function loadStats() {
  const rows = parseCsv(readFileSync(STATS_CSV, "utf8"));
  const byPlayerGame = new Map();
  const byPlayerWeek = new Map();
  for (const r of rows) {
    if (String(r.season_type) !== "REG") continue;
    const playerId = normId(r.player_id);
    const gameId = r.game_id;
    const week = Number(r.week);
    const rec = {
      playerId,
      gameId,
      week,
      rushingTds: numOr0(r.rushing_tds),
      receivingTds: numOr0(r.receiving_tds),
    };
    if (gameId) byPlayerGame.set(`${playerId}|${gameId}`, rec);
    byPlayerWeek.set(`${playerId}|${week}`, rec);
  }
  return { byPlayerGame, byPlayerWeek };
}

function main() {
  if (!existsSync(ARCHIVE)) {
    console.error(`[td-forward-grade] no archive at ${path.relative(ROOT, ARCHIVE)} — nothing to grade`);
    process.exit(0);
  }
  if (!existsSync(STATS_CSV)) {
    console.error(`[td-forward-grade] no 2026 player-week stats cache yet — exiting 0 without writing`);
    process.exit(0);
  }

  const archiveRows = parseJsonl(readFileSync(ARCHIVE, "utf8"));
  const existingGrades = existsSync(GRADES) ? parseJsonl(readFileSync(GRADES, "utf8")) : [];
  const alreadyGraded = new Set(existingGrades.map((g) => `${g.playerId}|${g.gameId}`));

  const { byPlayerGame, byPlayerWeek } = loadStats();
  const gradedAt = new Date().toISOString();

  // one candidate grade per (playerId, gameId) — the archive holds many
  // observations per player-game (successive observedAt); grading collapses them.
  const playerGames = new Map();
  for (const row of archiveRows) {
    const key = `${row.playerId}|${row.gameId}`;
    if (!playerGames.has(key)) {
      playerGames.set(key, { playerId: row.playerId, gameId: row.gameId, week: Number(row.week) });
    }
  }

  const newGrades = [];
  let missing = 0;
  for (const [key, pg] of playerGames) {
    if (alreadyGraded.has(key)) continue;
    const stat = byPlayerGame.get(key) ?? byPlayerWeek.get(`${pg.playerId}|${pg.week}`) ?? null;
    if (!stat) {
      missing += 1;
      continue; // game not final / player did not appear in the stat cache yet
    }
    const actualTd = gradeActualTd(stat);
    if (actualTd == null) {
      missing += 1;
      continue;
    }
    newGrades.push({
      schemaVersion: "nfl-td-forward-grade-v1",
      playerId: pg.playerId,
      gameId: pg.gameId,
      week: pg.week,
      actualTd,
      rushingTds: stat.rushingTds,
      receivingTds: stat.receivingTds,
      matchedBy: byPlayerGame.has(key) ? "playerGame" : "playerWeek",
      source: `nflverse:stats_player_week_${SEASON}`,
      gradedAt,
    });
  }

  console.log(
    `[td-forward-grade] player-games in archive=${playerGames.size}, already graded=${alreadyGraded.size}, ` +
      `new grades=${newGrades.length}, unresolved (not final / not in cache)=${missing}`,
  );

  if (DRY_RUN) {
    console.log("[td-forward-grade] --dry-run sample grade:");
    console.log(JSON.stringify(newGrades[0] ?? null, null, 2));
    return;
  }
  if (!newGrades.length) {
    console.error("[td-forward-grade] nothing new to append");
    return;
  }
  mkdirSync(DIR, { recursive: true });
  appendFileSync(GRADES, toJsonl(newGrades) + "\n", "utf8");
  console.log(`[td-forward-grade] appended ${newGrades.length} grades -> ${path.relative(ROOT, GRADES)}`);
}

main();

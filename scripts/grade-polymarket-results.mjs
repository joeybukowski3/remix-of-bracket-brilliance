/**
 * grade-polymarket-results.mjs
 *
 * Runs at 3am ET. Grades yesterday's Polymarket snapshots:
 *  - Determines winner from Polymarket resolved prices (primary)
 *  - Falls back to MLB Stats API final scores
 *  - Calculates price movement, qualifies for 5¢ / 10¢ thresholds
 *  - Determines if movement predicted the correct winner
 *  - Appends graded games to public/data/polymarket/history.json
 *
 * Always exits 0.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/data/polymarket");
const HISTORY_FILE = path.join(OUT_DIR, "history.json");
const TIMEOUT = 12000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getYesterdayEt() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Winner resolution
// ---------------------------------------------------------------------------

/**
 * Try Polymarket resolved event to determine winner.
 * Returns "home" | "away" | null
 */
async function resolveFromPolymarket(eventId, awayAbbr, homeAbbr) {
  if (!eventId) return null;
  try {
    const data = await fetchJson(`https://gamma-api.polymarket.com/events/${eventId}`);
    const markets = data?.markets || [];
    for (const m of markets) {
      if (!m.resolved) continue;
      // resolvedOutcome is the winning outcome string
      const resolved = m.resolvedOutcome || m.resolution;
      if (!resolved) continue;
      const r = String(resolved).toLowerCase();
      if (r === "yes") {
        // "Yes" = home team wins (how we structured the market)
        return "home";
      } else if (r === "no") {
        return "away";
      }
    }
  } catch (err) {
    console.warn(`Polymarket resolve failed for event ${eventId}:`, err.message);
  }
  return null;
}

/**
 * Fall back to MLB Stats API to get the winner from the final score.
 * Returns "home" | "away" | null
 */
async function resolveFromMlbApi(gameId, date) {
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gamePk=${gameId}`;
    const data = await fetchJson(url);
    const game = data?.dates?.[0]?.games?.[0];
    if (!game) return null;
    if (game.status?.abstractGameState !== "Final") return null;
    const homeScore = game.teams?.home?.score ?? 0;
    const awayScore = game.teams?.away?.score ?? 0;
    if (homeScore === awayScore) return null; // tie (rare in MLB)
    return homeScore > awayScore ? "home" : "away";
  } catch (err) {
    console.warn(`MLB API resolve failed for game ${gameId}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Movement calculation
// ---------------------------------------------------------------------------

/**
 * Compute the price movement signal for a game.
 *
 * We look at home team price movement from open to close (last snapshot
 * before game start). Positive delta = market moved toward home team.
 *
 * Returns:
 *   {
 *     openHomePrice, closeHomePrice, delta,
 *     movedToward: "home" | "away" | "none",
 *     qualifies5c, qualifies10c,
 *     lateMoveDelta: delta of last 2hr before game (if enough snapshots),
 *     maxSingleHourMove: largest single-hour swing,
 *     closeVolume24hr, closeLiquidity,
 *   }
 */
function computeMovement(game) {
  const snaps = game.snapshots || [];
  if (snaps.length < 2) return null;

  const open = game.openPrice;
  if (!open?.home) return null;

  // "Close" = last snapshot before game start (or last snapshot overall)
  const gameStartMs = game.gameTime ? new Date(game.gameTime).getTime() : Infinity;
  const preGameSnaps = snaps.filter(s => new Date(s.time).getTime() < gameStartMs);
  const closeSnap = preGameSnaps.at(-1) || snaps.at(-1);

  const openHomePrice = open.home;
  const closeHomePrice = closeSnap.homePrice;
  const delta = Math.round((closeHomePrice - openHomePrice) * 1000) / 1000;

  const movedToward = Math.abs(delta) < 0.005 ? "none"
    : delta > 0 ? "home" : "away";

  const absDelta = Math.abs(delta);
  const qualifies5c = absDelta >= 0.05;
  const qualifies10c = absDelta >= 0.10;

  // Late movement: last 2 hours before game
  const twoHrBeforeMs = gameStartMs - 2 * 60 * 60 * 1000;
  const lateSnaps = preGameSnaps.filter(s => new Date(s.time).getTime() >= twoHrBeforeMs);
  let lateMoveDelta = null;
  if (lateSnaps.length >= 2) {
    lateMoveDelta = Math.round((lateSnaps.at(-1).homePrice - lateSnaps[0].homePrice) * 1000) / 1000;
  }

  // Max single-hour swing
  let maxSingleHourMove = 0;
  for (let i = 1; i < snaps.length; i++) {
    const move = Math.abs(snaps[i].homePrice - snaps[i - 1].homePrice);
    if (move > maxSingleHourMove) maxSingleHourMove = move;
  }
  maxSingleHourMove = Math.round(maxSingleHourMove * 1000) / 1000;

  return {
    openHomePrice,
    openAwayPrice: open.away,
    closeHomePrice,
    closeAwayPrice: Math.round((1 - closeHomePrice) * 1000) / 1000,
    delta,
    movedToward,
    qualifies5c,
    qualifies10c,
    lateMoveDelta,
    maxSingleHourMove,
    closeVolume24hr: closeSnap.volume24hr || 0,
    closeLiquidity: closeSnap.liquidity || 0,
    snapshotCount: snaps.length,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const date = getYesterdayEt();
  const snapshotFile = path.join(OUT_DIR, `snapshots-${date}.json`);

  if (!existsSync(snapshotFile)) {
    console.log(`No snapshot file for ${date}, nothing to grade.`);
    return;
  }

  let snapshotData;
  try {
    snapshotData = JSON.parse(readFileSync(snapshotFile, "utf8"));
  } catch (err) {
    console.error("Failed to parse snapshot file:", err.message);
    return;
  }

  const games = snapshotData.games || [];
  console.log(`Grading ${games.length} games from ${date}...`);

  const gradedGames = [];

  for (const game of games) {
    if (game.graded) {
      console.log(`  ${game.awayAbbr} @ ${game.homeAbbr}: already graded, skipping`);
      gradedGames.push(game);
      continue;
    }

    const movement = computeMovement(game);
    if (!movement) {
      console.log(`  ${game.awayAbbr} @ ${game.homeAbbr}: insufficient snapshots`);
      gradedGames.push({ ...game, movement: null, graded: false });
      continue;
    }

    // Resolve winner
    let winner = await resolveFromPolymarket(game.eventId, game.awayAbbr, game.homeAbbr);
    let resultSource = "polymarket";
    if (!winner) {
      winner = await resolveFromMlbApi(game.gameId, date);
      resultSource = "mlb-api";
    }

    if (!winner) {
      console.log(`  ${game.awayAbbr} @ ${game.homeAbbr}: could not resolve winner`);
      gradedGames.push({ ...game, movement, graded: false, result: null });
      continue;
    }

    // Grade: was the movement correct?
    const movementCorrect = movement.movedToward === "none" ? null
      : movement.movedToward === winner;

    const graded = {
      ...game,
      movement,
      result: {
        winner,
        resultSource,
        movementCorrect,
        // Per threshold: did the move qualify AND was it correct?
        result5c: movement.qualifies5c ? movementCorrect : null,
        result10c: movement.qualifies10c ? movementCorrect : null,
      },
      graded: true,
      gradedAt: new Date().toISOString(),
    };

    console.log(`  ${game.awayAbbr} @ ${game.homeAbbr}: winner=${winner}, delta=${movement.delta > 0 ? "+" : ""}${movement.delta}, correct=${movementCorrect}`);
    gradedGames.push(graded);
  }

  // Write graded data back to snapshot file
  writeFileSync(snapshotFile, JSON.stringify({ ...snapshotData, games: gradedGames }, null, 2) + "\n");

  // Append to history.json
  mkdirSync(OUT_DIR, { recursive: true });
  let history = { version: 1, updatedAt: null, games: [] };
  if (existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
    } catch { /* start fresh */ }
  }

  // Remove any existing entries for this date then re-add
  history.games = history.games.filter(g => g.date !== date);
  for (const g of gradedGames) {
    if (g.graded && g.result) {
      history.games.push({
        date,
        gameId: g.gameId,
        awayAbbr: g.awayAbbr,
        homeAbbr: g.homeAbbr,
        gameTime: g.gameTime,
        movement: g.movement,
        result: g.result,
      });
    }
  }
  history.updatedAt = new Date().toISOString();

  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n");
  console.log(`✓ Grading complete. History now has ${history.games.length} total graded games.`);
}

main().catch(err => {
  console.error("Fatal error in grade-polymarket-results:", err.message);
  process.exitCode = 0;
});

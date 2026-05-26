/**
 * fetch-pga-field.mjs
 *
 * Fetches the current PGA Tour tournament field and saves it as a field JSON
 * file that the model pipeline uses to filter players.
 *
 * Source priority:
 *   1. DataGolf field-updates API  (DATAGOLF_API_KEY env var, recommended)
 *   2. ESPN PGA scoreboard/competitor API (no key required, fallback)
 *
 * Usage:
 *   node scripts/fetch-pga-field.mjs --slug charles-schwab-challenge-2026-picks
 *   node scripts/fetch-pga-field.mjs --slug charles-schwab-challenge-2026-picks --force
 *
 * Called automatically from generate-pga-tournament-package.mjs each Monday.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fieldsDir = path.join(repoRoot, "src", "data", "pga", "fields");

// ─── DataGolf ────────────────────────────────────────────────────────────────

async function fetchFromDataGolf(apiKey) {
  const url = `https://feeds.datagolf.com/field-updates?tour=pga&file_format=json${apiKey ? `&key=${apiKey}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`DataGolf HTTP ${res.status}`);
  const data = await res.json();

  // DataGolf returns an array of player objects or an object with a "field" key
  const players = Array.isArray(data)
    ? data
    : Array.isArray(data?.field)
    ? data.field
    : null;

  if (!players?.length) throw new Error("DataGolf returned empty field");

  return {
    source: "DataGolf",
    sourceUrl: "https://feeds.datagolf.com/field-updates",
    players: players.map((p) => p.player_name ?? p.name ?? String(p)).filter(Boolean),
  };
}

// ─── ESPN fallback ────────────────────────────────────────────────────────────

async function fetchFromESPN() {
  // ESPN scoreboard has the current/upcoming tournament competitors
  const url = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const data = await res.json();

  // Extract competitors from the first event
  const events = data?.events ?? [];
  if (!events.length) throw new Error("ESPN returned no events");

  const event = events[0];
  const competitors =
    event?.competitions?.[0]?.competitors ??
    event?.competitors ??
    [];

  if (!competitors.length) throw new Error("ESPN event has no competitors");

  const players = competitors
    .map((c) => {
      const athlete = c.athlete ?? c;
      return (
        athlete.displayName ??
        athlete.shortName ??
        `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim()
      );
    })
    .filter(Boolean);

  if (!players.length) throw new Error("ESPN: could not extract player names");

  return {
    source: "ESPN",
    sourceUrl: url,
    eventName: event.name ?? event.shortName ?? "Unknown",
    players,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function fetchField(slug, { force = false } = {}) {
  const outputPath = path.join(fieldsDir, `${slug}.json`);

  // Skip if file already exists and is recent (< 24 hours) unless forced
  if (!force && fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs < 24 * 60 * 60 * 1000) {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      console.log(`[fetch-pga-field] Using cached field for ${slug} (${existing.players?.length ?? 0} players, source: ${existing.source})`);
      return outputPath;
    }
  }

  const apiKey = process.env.DATAGOLF_API_KEY ?? "";
  let result = null;

  // Try DataGolf first
  try {
    result = await fetchFromDataGolf(apiKey);
    console.log(`[fetch-pga-field] DataGolf: ${result.players.length} players`);
  } catch (err) {
    console.warn(`[fetch-pga-field] DataGolf failed: ${err.message} — trying ESPN fallback`);
  }

  // ESPN fallback
  if (!result) {
    try {
      result = await fetchFromESPN();
      console.log(`[fetch-pga-field] ESPN: ${result.players.length} players (${result.eventName})`);
    } catch (err) {
      console.warn(`[fetch-pga-field] ESPN failed: ${err.message}`);
    }
  }

  if (!result || !result.players?.length) {
    console.warn(`[fetch-pga-field] Could not fetch field for ${slug} — model will use full workbook without field filtering.`);
    return null;
  }

  const payload = {
    slug,
    source: result.source,
    sourceUrl: result.sourceUrl,
    updatedAt: new Date().toISOString(),
    playerCount: result.players.length,
    players: result.players.sort(),
  };

  fs.mkdirSync(fieldsDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[fetch-pga-field] Saved ${result.players.length} players → ${path.relative(repoRoot, outputPath)}`);
  return outputPath;
}

// CLI entry
if (process.argv[1] === __filename) {
  const argv = process.argv.slice(2);
  const slugIdx = argv.indexOf("--slug");
  const slug = slugIdx !== -1 ? argv[slugIdx + 1] : null;
  const force = argv.includes("--force");

  if (!slug) {
    console.error("Usage: node scripts/fetch-pga-field.mjs --slug <tournament-slug> [--force]");
    process.exit(1);
  }

  fetchField(slug, { force }).then((outPath) => {
    if (!outPath) process.exit(1);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { fetchField };

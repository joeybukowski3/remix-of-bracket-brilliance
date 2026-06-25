/**
 * inject-batter-handedness.mjs
 *
 * Reads public/data/mlb/player-identity-cache.json (built by update-player-identity-cache.mjs)
 * and stamps `bats` (L / R / S) onto each batter row in hr-props-raw.json.
 *
 * This is a pure data-enrichment step — it does not touch any scoring, ranking,
 * or other workflow outputs. It runs after generate-mlb-hr-props.mjs so it never
 * interferes with HR prop generation.
 *
 * Safe to run with || true in the workflow — if the cache is missing or a player
 * cannot be matched, their bats field is set to null and the rest of the data
 * is left untouched.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const RAW_PATH   = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const CACHE_PATH = path.join(ROOT, "public/data/mlb/player-identity-cache.json");

// ── load files ────────────────────────────────────────────────────────────────

if (!existsSync(RAW_PATH)) {
  console.warn(`[handedness] hr-props-raw.json not found at ${RAW_PATH} — skipping.`);
  process.exit(0);
}
if (!existsSync(CACHE_PATH)) {
  console.warn(`[handedness] player-identity-cache.json not found at ${CACHE_PATH} — skipping.`);
  process.exit(0);
}

const rawData   = JSON.parse(readFileSync(RAW_PATH,   "utf8"));
const cacheRaw  = JSON.parse(readFileSync(CACHE_PATH, "utf8"));

// ── build lookup map ──────────────────────────────────────────────────────────
// Cache is keyed by "FullName|TEAM" — build two indexes: by that key and by
// normalizedName so we can fall back on name-only when team doesn't match.

function normalizeName(name) {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// The cache is an object keyed by "FullName|TEAM" (as written by update-player-identity-cache.mjs)
const byNameAndTeam = new Map();  // "normalizedName|TEAM" → entry
const byName        = new Map();  // "normalizedName" → entry (first found, last-write wins for dupes)

for (const entry of Object.values(cacheRaw)) {
  if (!entry?.fullName) continue;
  const norm = normalizeName(entry.fullName);
  const team = (entry.team ?? "").toUpperCase();
  byNameAndTeam.set(`${norm}|${team}`, entry);
  byName.set(norm, entry);
}

// ── inject ────────────────────────────────────────────────────────────────────

let matched = 0;
let unmatched = 0;

const updatedBatters = (rawData.batters ?? []).map((batter) => {
  const norm = normalizeName(batter.player);
  const team = (batter.team ?? "").toUpperCase();

  const entry =
    byNameAndTeam.get(`${norm}|${team}`) ??
    byName.get(norm) ??
    null;

  const bats = entry?.bats ?? null;   // "L", "R", "S", or null

  if (bats) {
    matched++;
  } else {
    unmatched++;
    if (unmatched <= 10) {
      console.warn(`[handedness] No bats data for: ${batter.player} (${batter.team})`);
    }
  }

  return { ...batter, bats };
});

// ── write ─────────────────────────────────────────────────────────────────────

const updatedData = { ...rawData, batters: updatedBatters };
writeFileSync(RAW_PATH, JSON.stringify(updatedData, null, 2) + "\n", "utf8");

console.log(`[handedness] ✅ ${matched} batters matched  |  ${unmatched} unmatched (set to null)`);
console.log(`[handedness] ✅ Saved to ${RAW_PATH}`);

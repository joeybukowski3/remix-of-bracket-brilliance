/**
 * Coaching Rating v1 — publish the current-coach ratings artifact.
 *
 * Writes public/data/nfl/coaching-ratings.json. Consumes ONLY completed games
 * (leakage-safe) and the frozen Coaching Rating v1 parameters. NO historical
 * evaluation row is written or modified here.
 *
 * Usage:
 *   node scripts/generate-nfl-coaching-ratings.mjs [--input=path/to/games.csv] [--dry-run]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NFL_GAMES_SOURCE_URL, parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { buildCoachingRatings } from "./lib/nfl-coach-rating-build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COACHING_DIR = join(ROOT, "data", "nfl", "coaching");
const OUT = join(ROOT, "public", "data", "nfl", "coaching-ratings.json");
const SOURCE_LABEL = "nflverse (nfldata games.csv)";

async function loadCsv(input) {
  if (input) return readFileSync(input, "utf-8");
  const res = await fetch(NFL_GAMES_SOURCE_URL);
  if (!res.ok) throw new Error(`fetch games.csv HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const args = { input: null, dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--input=")) args.input = a.slice(8);
    else throw new Error(`Unknown arg ${a}`);
  }

  const overrides = JSON.parse(readFileSync(join(COACHING_DIR, "coach-name-overrides.json"), "utf-8"));
  const rows = parseCsv(await loadCsv(args.input)).filter((r) => {
    const s = Number(r.season);
    return Number.isInteger(s) && s >= 1999 && s <= 2026;
  });

  const payload = buildCoachingRatings(rows, {
    aliases: overrides.aliases ?? {},
    interim: overrides.interim ?? [],
    sourceTimestamp: new Date().toISOString(),
  });

  const out = {
    _meta: buildNflMeta({
      source: SOURCE_LABEL,
      season: 2026,
      modelVersion: payload.ratingVersion,
      notes: [
        "Coaching Rating v1 — ANALYSIS CONTEXT ONLY, not an input to Sides/Totals model math.",
        "Composite of shrunk win-over-market-expectation (primary) + shrunk career win% (secondary).",
        "ATS records are displayed as context and are NOT weighted (research: coach ATS skill did not persist).",
        "First-year head coaches carry the league-average prior (rating 50).",
        "Built only from completed prior games; deliberately low dynamic range (forward r ≈ 0.19).",
      ],
    }),
    ...payload,
  };

  if (args.dryRun) {
    printTable(payload);
    console.log("[nfl:coaching-ratings] dry-run: not written");
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, toNflJsonFileString(out));
  printTable(payload);
  console.log(`[nfl:coaching-ratings] wrote coaching-ratings.json (${payload.coaches.length} coaches, v${payload.ratingVersion})`);
}

function printTable(p) {
  console.log("");
  console.log(`=== COACHING RATING v1 (${p.ratingVersion}) — ${p.coaches.length} current coaches ===`);
  console.log("rk team coach                 rtg  band                     careerW-L  careerATS  g    ty  flags");
  for (const c of p.coaches) {
    console.log(
      String(c.rating_rank).padStart(2) + "  " +
      c.team.padEnd(4) +
      c.coach.padEnd(22) +
      String(c.coaching_rating).padStart(3) + "  " +
      c.rating_band.padEnd(24) + " " +
      c.career_wl.padStart(9) + "  " +
      c.career_ats.padStart(9) + "  " +
      String(c.career_games).padEnd(4) +
      String(c.tenure_year).padEnd(3) +
      (c.first_year ? " FIRST_YEAR" : c.small_sample ? " small_sample" : "")
    );
  }
  const d = p.distributionSummary;
  console.log("");
  console.log(`distribution: min ${d.min}  p25 ${d.p25}  median ${d.median}  mean ${d.mean}  p75 ${d.p75}  max ${d.max}  (spread ${d.spread})`);
  console.log(`first-year: ${d.first_year_count}   small-sample: ${d.small_sample_count}   EVEN threshold: ${p.evenThreshold}`);
}

main().catch((e) => { console.error(`[nfl:coaching-ratings] FAILED: ${e.stack || e.message}`); process.exit(1); });

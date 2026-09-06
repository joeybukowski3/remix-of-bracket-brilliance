/**
 * Coaching Rating v1 — historical point-in-time rating snapshots generator.
 *
 * Writes data/nfl/coaching/rating-snapshots/<season>/<week>.json, one file per
 * scheduled (season, week), each containing every active head coach entering
 * that week rated by the FROZEN Coaching Rating v1 composite.
 *
 * Leakage-safe by construction (see scripts/lib/nfl-coach-rating-snapshot.mjs):
 * a snapshot only ingests games with kickoff earlier than the week's first
 * kickoff, so week-N results never rate week N.
 *
 * Usage:
 *   node scripts/generate-nfl-coaching-snapshots.mjs
 *   node scripts/generate-nfl-coaching-snapshots.mjs --input=path/to/games.csv
 *   node scripts/generate-nfl-coaching-snapshots.mjs --start-season=2016 --end-season=2025
 *   node scripts/generate-nfl-coaching-snapshots.mjs --dry-run
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NFL_GAMES_SOURCE_URL, parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { buildRatingSnapshots } from "./lib/nfl-coach-rating-snapshot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COACHING_DIR = join(ROOT, "data", "nfl", "coaching");
const OUT_DIR = join(COACHING_DIR, "rating-snapshots");
const SOURCE_LABEL = "nflverse (nfldata games.csv) home_coach/away_coach";

// Historical evaluation rows the performance dashboards grade start in 2016
// (matches coach-game-context emit start). Identity is always derived from all
// completed history regardless of this window.
const DEFAULT_START = 2016;
const DEFAULT_END = 2025;

function parseArgs(argv) {
  const args = { dryRun: false, input: null, start: DEFAULT_START, end: DEFAULT_END };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--input=")) args.input = a.slice(8);
    else if (a.startsWith("--start-season=")) args.start = Number(a.slice(15));
    else if (a.startsWith("--end-season=")) args.end = Number(a.slice(13));
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!(args.start >= 1999 && args.end >= args.start && args.end <= 2100)) {
    throw new Error(`Bad season range ${args.start}..${args.end}`);
  }
  return args;
}

async function loadCsv(input) {
  if (input) return readFileSync(input, "utf-8");
  const res = await fetch(NFL_GAMES_SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch games.csv: HTTP ${res.status}`);
  return res.text();
}

async function sourceTimestamp(input) {
  if (input) return `local fixture ${input} (no upstream timestamp)`;
  try {
    const res = await fetch(
      "https://api.github.com/repos/nflverse/nfldata/commits?path=data/games.csv&per_page=1",
      { headers: { "User-Agent": "joeknowsball-nfl-coaching/1.0" } }
    );
    if (res.ok) {
      const [commit] = await res.json();
      if (commit?.commit?.committer?.date) return commit.commit.committer.date;
    }
  } catch {
    /* best effort */
  }
  return new Date().toISOString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const overrides = JSON.parse(readFileSync(join(COACHING_DIR, "coach-name-overrides.json"), "utf-8"));
  const aliases = overrides.aliases ?? {};
  const interim = overrides.interim ?? [];

  const rows = parseCsv(await loadCsv(args.input)).filter((r) => {
    const s = Number(r.season);
    return Number.isInteger(s) && s >= 1999 && s <= 2100;
  });
  if (rows.length === 0) throw new Error("no games.csv rows");

  const seasons = [];
  for (let y = args.start; y <= args.end; y += 1) seasons.push(y);
  const stamp = await sourceTimestamp(args.input);

  const { snapshots, warnings } = buildRatingSnapshots(rows, { aliases, interim, seasons, sourceTimestamp: stamp });

  const bySeason = new Map();
  for (const [key, snap] of snapshots) {
    if (!bySeason.has(snap.season)) bySeason.set(snap.season, []);
    bySeason.get(snap.season).push(snap);
  }

  let fileCount = 0;
  for (const [season, list] of [...bySeason].sort((a, b) => a[0] - b[0])) {
    fileCount += list.length;
    if (args.dryRun) continue;
    const seasonDir = join(OUT_DIR, String(season));
    mkdirSync(seasonDir, { recursive: true });
    for (const snap of list.sort((a, b) => a.week - b.week)) {
      writeFileSync(join(seasonDir, `${snap.week}.json`), toNflJsonFileString(snap));
    }
  }

  const latestSeason = Math.max(...bySeason.keys());
  const latestWeek = Math.max(...bySeason.get(latestSeason).map((s) => s.week));
  console.log(
    `[nfl:coaching-snapshots] ${args.dryRun ? "dry-run: " : "wrote "}${fileCount} snapshot files across ${bySeason.size} seasons ` +
      `(latest ${latestSeason} wk ${latestWeek}); ${warnings.length} warning(s)`
  );
  if (warnings.length) console.log(warnings.slice(0, 10).map((w) => `  - ${w}`).join("\n"));
}

main().catch((err) => {
  console.error(`[nfl:coaching-snapshots] FAILED: ${err.stack || err.message}`);
  process.exit(1);
});

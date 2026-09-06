/**
 * Coaching Ratings v1 -- data foundation generator.
 *
 * Produces (NO rating, NO weights, NO coaching-ratings.json):
 *   data/nfl/coaching/coach-history.json              canonical tenure segments
 *   data/nfl/coaching/coach-game-context/<season>.jsonl  leakage-safe pregame context
 *
 * Source: nflverse nfldata games.csv -- the SAME file scripts/generate-nfl-
 * schedules-results.mjs already fetches. This script reuses that URL + CSV
 * parser and adds no second download path.
 *
 * Usage:
 *   node scripts/generate-nfl-coaching-foundation.mjs
 *   node scripts/generate-nfl-coaching-foundation.mjs --input=path/to/games.csv
 *   node scripts/generate-nfl-coaching-foundation.mjs --start-season=1999 --end-season=2025
 *   node scripts/generate-nfl-coaching-foundation.mjs --dry-run
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NFL_GAMES_SOURCE_URL, parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { buildCoachAppearances, buildCoachHistory, deriveCoachSegments } from "./lib/nfl-coach-core.mjs";
import { buildCoachGameContext } from "./lib/nfl-coach-context-build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COACHING_DIR = join(ROOT, "data", "nfl", "coaching");
const SOURCE_LABEL = "nflverse (nfldata games.csv) home_coach/away_coach";

// Coach identity is derived only from COMPLETED seasons. games.csv rows for the
// not-yet-played season carry unreliable/placeholder coach strings, so the
// current-season coach identity is owned elsewhere (src/data/nflOffseason2026).
const DEFAULT_START = 1999;
const DEFAULT_END = 2025;
// Identity + segments span all of history cheaply. The per-game context JSONL
// is bulky and only its recent slice is ever joined by the live product or a
// rating build, so it is emitted from CONTEXT_EMIT_START by default. Pass
// --context-start-season=1999 to materialize the full research depth.
const CONTEXT_EMIT_START = 2016;

function parseArgs(argv) {
  const args = { dryRun: false, input: null, start: DEFAULT_START, end: DEFAULT_END, contextStart: CONTEXT_EMIT_START };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--input=")) args.input = arg.slice(8);
    else if (arg.startsWith("--start-season=")) args.start = Number(arg.slice(15));
    else if (arg.startsWith("--end-season=")) args.end = Number(arg.slice(13));
    else if (arg.startsWith("--context-start-season=")) args.contextStart = Number(arg.slice(23));
    else throw new Error(`Unknown argument: ${arg}`);
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
  } catch { /* best effort */ }
  return new Date().toISOString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const overrides = JSON.parse(readFileSync(join(COACHING_DIR, "coach-name-overrides.json"), "utf-8"));
  const aliases = overrides.aliases ?? {};
  const interim = overrides.interim ?? [];

  const csvText = await loadCsv(args.input);
  const allRows = parseCsv(csvText);
  const seasons = [];
  for (let y = Math.max(args.start, args.contextStart); y <= args.end; y += 1) seasons.push(y);
  const rows = allRows.filter((r) => {
    const s = Number(r.season);
    return Number.isInteger(s) && s >= args.start && s <= args.end;
  });
  if (rows.length === 0) throw new Error("no games.csv rows in requested season range");

  const stamp = await sourceTimestamp(args.input);

  // ---- coach-history.json ----
  const { appearances, warnings: apWarnings } = buildCoachAppearances(rows, { aliases });
  const segments = deriveCoachSegments(appearances, { interim });
  const history = buildCoachHistory(segments, { source: SOURCE_LABEL, sourceTimestamp: stamp });

  const historyPayload = {
    _meta: buildNflMeta({
      source: SOURCE_LABEL,
      notes: [
        `Canonical HEAD_COACH tenure segments derived from per-game coach strings, seasons ${args.start}-${args.end}.`,
        "A segment is a maximal unbroken run of one franchise's games under one coach, kickoff-ordered. Midseason changes create separate segments; one coach is never assumed to hold an entire season.",
        "interim_flag comes from data/nfl/coaching/coach-name-overrides.json (games.csv does not mark interim HCs).",
        "Relocated franchises (STL/SD/OAK) fold onto the current abbr (lar/lac/lv).",
        "Current-season (not-yet-played) coach identity is intentionally NOT here -- games.csv future rows are unreliable.",
        `${apWarnings.length} appearance warning(s) during build.`,
      ],
    }),
    schemaVersion: "nfl-coach-history-v1",
    coachCount: new Set(history.map((h) => h.coach_id)).size,
    segmentCount: history.length,
    warnings: apWarnings,
    segments: history,
  };

  // ---- coach-game-context/<season>.jsonl ----
  const { rowsBySeason, warnings: ctxWarnings } = buildCoachGameContext(rows, {
    aliases,
    interim,
    seasons,
    source: SOURCE_LABEL,
    sourceTimestamp: stamp,
  });

  let contextRowCount = 0;
  for (const [, list] of rowsBySeason) contextRowCount += list.length;

  if (args.dryRun) {
    console.log(`[nfl:coaching] dry-run: ${history.length} segments, ${new Set(history.map((h) => h.coach_id)).size} coaches`);
    console.log(`[nfl:coaching] dry-run: ${contextRowCount} coach-game-context rows across ${rowsBySeason.size} seasons`);
    console.log(`[nfl:coaching] warnings: appearances=${apWarnings.length} context=${ctxWarnings.length}`);
    return;
  }

  mkdirSync(COACHING_DIR, { recursive: true });
  writeFileSync(join(COACHING_DIR, "coach-history.json"), toNflJsonFileString(historyPayload));

  const ctxDir = join(COACHING_DIR, "coach-game-context");
  mkdirSync(ctxDir, { recursive: true });
  for (const [season, list] of [...rowsBySeason].sort((a, b) => a[0] - b[0])) {
    const header = {
      _meta: {
        schemaVersion: "nfl-coach-game-context-v1",
        season,
        source: SOURCE_LABEL,
        source_timestamp: stamp,
        generatedAt: new Date().toISOString(),
        cutoff_rule: "each row uses only that coach's games with a strictly earlier kickoff; target game excluded",
        note: "Context artifact only. No coaching rating, no component weights, no coaching-advantage designation.",
      },
    };
    const lines = [JSON.stringify(header), ...list.map((r) => JSON.stringify(r))];
    writeFileSync(join(ctxDir, `${season}.jsonl`), lines.join("\n") + "\n");
  }

  console.log(`[nfl:coaching] wrote coach-history.json: ${history.length} segments, ${historyPayload.coachCount} coaches`);
  console.log(`[nfl:coaching] wrote coach-game-context: ${contextRowCount} rows across ${rowsBySeason.size} seasons`);
  if (ctxWarnings.length) console.log(`[nfl:coaching] ${ctxWarnings.length} context warning(s)`);
}

main().catch((err) => {
  console.error(`[nfl:coaching] FAILED: ${err.stack || err.message}`);
  process.exit(1);
});

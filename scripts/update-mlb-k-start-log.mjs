/**
 * update-mlb-k-start-log.mjs
 *
 * Maintains `public/data/mlb/k-start-log.json`: the rolling league-wide log of
 * COMPLETED starts that K Projection V4 uses to build opposing-starter
 * baselines.
 *
 * WHY A COMMITTED ROLLING ARTIFACT
 * --------------------------------
 * V4's opponent factors need a denominator -- what each opposing starter
 * NORMALLY does. The research version of this log was reconstructed by
 * scanning ~180 git revisions of strikeout-prop-details.json, which is far too
 * slow and too fragile to run inside the daily workflow, and gets slower every
 * day. This script instead does the cheap incremental thing: every day's
 * details artifact already carries `pitcherLast10Starts` for every listed
 * pitcher, and a completed start is an immutable fact, so the union of those
 * windows across days IS the start log.
 *
 * Reads one already-generated local artifact. No API call, no git history.
 *
 * IDEMPOTENT AND DETERMINISTIC. Starts are keyed by gamePk + pitcherId, merged
 * as a union, and written in a stable sort order, so re-running on the same
 * inputs rewrites the identical bytes.
 *
 * NO MARKET INPUT: this file records innings and strikeouts only.
 *
 * Usage:
 *   node scripts/update-mlb-k-start-log.mjs
 *   node scripts/update-mlb-k-start-log.mjs --details=path --out=path --dry-run
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
export const DEFAULT_DETAILS = "public/data/mlb/strikeout-prop-details.json";
export const DEFAULT_OUTPUT = "public/data/mlb/k-start-log.json";
export const START_LOG_SCHEMA_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** "5.1" -> 16 outs. Baseball fractional innings are thirds, not decimals. */
export function inningsTextToOuts(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (!text.includes(".")) {
    const whole = Number(text);
    return Number.isFinite(whole) ? Math.round(whole * 3) : null;
  }
  const [whole, frac] = text.split(".");
  const w = Number(whole);
  const f = Number(frac);
  if (!Number.isFinite(w) || !Number.isFinite(f)) return null;
  return w * 3 + f;
}

/** Stable identity for one completed start. */
export function startKey(start) {
  return `${start.gamePk}|${start.pitcherId}`;
}

/**
 * Extracts every completed start visible in a details artifact.
 * A row with unreadable innings is DROPPED, never defaulted -- a start with
 * unknown innings is not a zero-inning start.
 */
export function extractStarts(details) {
  const rows = Array.isArray(details?.details) ? details.details : [];
  const out = [];
  for (const row of rows) {
    const pitcherId = finite(row?.pitcherId);
    const window = Array.isArray(row?.pitcherLast10Starts) && row.pitcherLast10Starts.length
      ? row.pitcherLast10Starts
      : (Array.isArray(row?.pitcherLastFiveStarts) ? row.pitcherLastFiveStarts : []);
    for (const start of window) {
      const gamePk = finite(start?.gamePk);
      const outs = finite(start?.outsRecorded) ?? inningsTextToOuts(start?.inningsPitched);
      const strikeouts = finite(start?.strikeouts);
      const date = start?.date ? String(start.date) : null;
      if (gamePk === null || pitcherId === null || outs === null || outs < 0 || strikeouts === null || !date) continue;
      out.push({
        gamePk,
        pitcherId,
        pitcher: String(row?.pitcher ?? "").trim(),
        date,
        opponent: String(start?.opponentAbbr ?? start?.opponent ?? "").trim().toUpperCase() || null,
        isHome: typeof start?.isHome === "boolean" ? start.isHome : null,
        outs,
        strikeouts,
        bf: finite(start?.battersFaced),
        pitches: finite(start?.pitchCount),
      });
    }
  }
  return out;
}

/** Union-merges new starts into an existing log, newest-last, deterministic. */
export function mergeStarts(existing = [], incoming = []) {
  const byKey = new Map();
  for (const start of existing) byKey.set(startKey(start), start);
  let added = 0;
  for (const start of incoming) {
    const key = startKey(start);
    if (byKey.has(key)) continue;
    byKey.set(key, start);
    added += 1;
  }
  const merged = [...byKey.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.gamePk - b.gamePk || a.pitcherId - b.pitcherId,
  );
  return { starts: merged, added };
}

export function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const dryRun = argv.includes("--dry-run");
  const detailsPath = path.resolve(ROOT, value("--details=") ?? DEFAULT_DETAILS);
  const outputPath = path.resolve(ROOT, value("--out=") ?? DEFAULT_OUTPUT);

  if (!existsSync(detailsPath)) {
    console.warn(`[k-start-log] details artifact missing at ${detailsPath}; nothing to merge.`);
    return { status: "skipped", added: 0, total: 0 };
  }

  const details = JSON.parse(readFileSync(detailsPath, "utf8"));
  const incoming = extractStarts(details);

  const existing = existsSync(outputPath)
    ? (JSON.parse(readFileSync(outputPath, "utf8")).starts ?? [])
    : [];
  const { starts, added } = mergeStarts(existing, incoming);

  const dates = starts.map((start) => start.date);
  const payload = {
    schemaVersion: START_LOG_SCHEMA_VERSION,
    source: DEFAULT_DETAILS,
    slateDate: details?.date ?? null,
    distinctStarts: starts.length,
    distinctPitchers: new Set(starts.map((start) => start.pitcherId)).size,
    dateRange: { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null },
    starts,
  };

  if (!dryRun) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  console.log(
    `[k-start-log] slate=${payload.slateDate} seen=${incoming.length} added=${added} total=${starts.length} range=${payload.dateRange.first}..${payload.dateRange.last}${dryRun ? " (dry run)" : ""}`,
  );
  return { status: "ok", added, total: starts.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

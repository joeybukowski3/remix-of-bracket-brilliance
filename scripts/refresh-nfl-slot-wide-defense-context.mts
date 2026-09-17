/**
 * Refreshes the shared Razzball defensive slot-vs-wide PPG-allowed artifact.
 *
 * Source: https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/
 * (verified 2026-09-11: server-delivered HTML, no auth, no JS-only render,
 * Cloudflare-fronted but returns plain 200 content -- not a bot challenge.
 * robots.txt permits this path with `Crawl-delay: 10`; a once-daily refresh
 * is trivially compliant.)
 *
 * Fail-closed: any fetch/parse/validation failure exits non-zero WITHOUT
 * touching the previously committed artifact -- the atomic rename below only
 * ever replaces it with a fully validated 32-team payload.
 *
 * Runs under `tsx` (not plain `node`) so it can import the canonical
 * `normalizeNflTeamAbbr` from `src/lib/nfl/identity/identity.ts` directly --
 * the same pattern `scripts/market/refresh-betting-lines.ts` already uses --
 * rather than duplicating a Razzball-local alias table.
 *
 * Usage:
 *   npm run nfl:slot-wide-defense-context
 *   tsx scripts/refresh-nfl-slot-wide-defense-context.mts --season=2026
 *   tsx scripts/refresh-nfl-slot-wide-defense-context.mts --dry-run
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSlotWideDefenseArtifact, normalizeSlotWideDefenseRows, parseSlotWideDefenseTable } from "./lib/nfl-slot-wide-defense-context-core.mjs";
import { normalizeNflTeamAbbr } from "../src/lib/nfl/identity/identity.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_URL = "https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/";
const USER_AGENT = "JoeKnowsBall-nfl-matchup-analyzer/1.0 (+https://www.joeknowsball.com; low-frequency, once-daily research fetch)";
const REQUEST_TIMEOUT_MS = 20000;

function parseArgs(argv) {
  const args = { season: new Date().getUTCFullYear(), dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season)) throw new Error("Invalid --season");
  return args;
}

async function fetchRazzballHtml() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${SOURCE_URL}`);
    const html = await response.text();
    if (!html.trim()) throw new Error("Empty response body");
    return html;
  } finally {
    clearTimeout(timer);
  }
}

function writeArtifactAtomically(path, artifact) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(artifact, null, 2)}\n`);
  renameSync(tempPath, path); // atomic on POSIX and NTFS -- a crash mid-write never corrupts the last-known-good file.
}

async function main() {
  const args = parseArgs(process.argv);
  const outputPath = join(ROOT, "public", "data", "nfl", String(args.season), "slot-wide-defense-context.json");

  const html = await fetchRazzballHtml();
  const parsed = parseSlotWideDefenseTable(html);
  if (!parsed.ok) {
    console.error(`ERROR: ${parsed.error}`);
    console.error(existsSync(outputPath) ? "Last-known-good artifact left untouched." : "No prior artifact existed.");
    process.exitCode = 1;
    return;
  }

  const normalized = normalizeSlotWideDefenseRows(parsed.rows, normalizeNflTeamAbbr);
  if (!normalized.ok) {
    console.error(`ERROR: ${normalized.error}`);
    console.error(existsSync(outputPath) ? "Last-known-good artifact left untouched." : "No prior artifact existed.");
    process.exitCode = 1;
    return;
  }

  const artifact = buildSlotWideDefenseArtifact({ season: args.season, generatedAt: new Date().toISOString(), teams: normalized.teams });

  if (args.dryRun) {
    console.log(JSON.stringify(artifact, null, 2));
    return;
  }

  writeArtifactAtomically(outputPath, artifact);
  console.log(`Wrote ${normalized.teams.length} teams to ${outputPath}`);
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

/**
 * Fetch + trim nflverse play-by-play for the Performance Rating backtest
 * (2023-2025). Analysis-only script — separate from the production
 * scripts/refresh-nfl-epa-source-cache.mjs pipeline. Raw play-by-play is
 * streamed and gunzipped in memory, trimmed to BACKTEST_PBP_COLUMNS, and
 * written to a gitignored local cache (data/nfl/backtest-2026/raw/). Full
 * upstream play-by-play is never committed.
 *
 * Usage: node scripts/analysis/nfl-performance-backtest/fetch-pbp.mjs [--seasons=2023,2024,2025]
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKTEST_PBP_COLUMNS } from "./lib/columns.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "nfl", "backtest-2026", "raw");
const USER_AGENT = "JoeKnowsBall-nfl-performance-backtest/1.0 (+https://www.joeknowsball.com)";

function nflversePbpUrl(season) {
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
}

function splitCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function fetchWithRedirect(url, headers) {
  let response = await fetch(url, { headers, redirect: "follow" });
  return response;
}

async function streamSeason(season) {
  const url = nflversePbpUrl(season);
  const response = await fetchWithRedirect(url, { "User-Agent": USER_AGENT, Accept: "application/octet-stream" });
  if (response.status === 404) return { notPublished: true };
  if (!response.ok) throw new Error(`${season}: HTTP ${response.status} fetching play-by-play`);

  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.byteLength === 0) throw new Error(`${season}: empty play-by-play response`);

  const lines = createInterface({
    input: Readable.from(compressed).pipe(createGunzip()),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let header = null;
  let indices = null;
  let sourceRows = 0;
  let keptRows = 0;
  const outLines = [BACKTEST_PBP_COLUMNS.join(",")];

  for await (const line of lines) {
    if (line === "") continue;
    if (header === null) {
      header = splitCsvLine(line);
      const missing = BACKTEST_PBP_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) {
        throw new Error(`${season}: play-by-play missing columns ${missing.join(", ")}`);
      }
      indices = Object.fromEntries(BACKTEST_PBP_COLUMNS.map((c) => [c, header.indexOf(c)]));
      continue;
    }
    sourceRows += 1;
    const cells = splitCsvLine(line);
    if (cells[indices.season_type] !== "REG") continue;
    const outRow = BACKTEST_PBP_COLUMNS.map((c) => csvEscape(cells[indices[c]] ?? ""));
    outLines.push(outRow.join(","));
    keptRows += 1;
  }

  return {
    notPublished: false,
    text: outLines.join("\n") + "\n",
    sourceRows,
    keptRows,
    compressedBytes: compressed.byteLength,
  };
}

async function main() {
  const seasonsArg = process.argv.find((a) => a.startsWith("--seasons="));
  const seasons = seasonsArg
    ? seasonsArg.slice("--seasons=".length).split(",").map((s) => Number(s.trim()))
    : [2023, 2024, 2025];

  mkdirSync(OUT_DIR, { recursive: true });

  const summary = [];
  for (const season of seasons) {
    process.stdout.write(`[fetch] ${season}: downloading...\n`);
    const result = await streamSeason(season);
    if (result.notPublished) {
      console.log(`[fetch] ${season}: not published upstream`);
      summary.push({ season, notPublished: true });
      continue;
    }
    const outPath = join(OUT_DIR, `pbp_${season}_reg_trimmed.csv`);
    writeFileSync(outPath, result.text, "utf-8");
    console.log(
      `[fetch] ${season}: ${result.sourceRows} source rows -> ${result.keptRows} REG rows kept, ` +
        `${(result.compressedBytes / 1024 / 1024).toFixed(1)} MiB gz -> ${outPath}`
    );
    summary.push({ season, sourceRows: result.sourceRows, keptRows: result.keptRows });
  }

  writeFileSync(join(OUT_DIR, "fetch-summary.json"), JSON.stringify(summary, null, 2), "utf-8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

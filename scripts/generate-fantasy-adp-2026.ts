/**
 * Generates the committed FantasyPros Real-Time ADP artifact from the raw
 * export in data/fantasy/2026-fantasypros-adp.csv. React never parses the
 * CSV directly — this script is the only place that reads it.
 *
 * The artifact carries FantasyPros' own identity (name/team/position) as
 * parsed. Joining those rows to JKB board rows happens at read time in
 * src/lib/fantasy/adpPlayerIdentity.ts, the same split used for the existing
 * PAR consensus source (see rosPlayerIdentity.ts) — no join is baked into
 * this artifact, so a resolution fix never requires regenerating it.
 */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFantasyProsAdpCsv } from "../src/lib/fantasy/fantasyProsAdpParser.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_FILENAME = "2026-fantasypros-adp.csv";
const SOURCE_PATH = join(ROOT, "data", "fantasy", SOURCE_FILENAME);
const OUTPUT_PATH = join(ROOT, "data", "fantasy", "2026-fantasypros-adp.json");
const AS_OF_DATE = "2026-08-25";

const csvText = readFileSync(SOURCE_PATH, "utf8");
const parsedRows = parseFantasyProsAdpCsv(csvText);
if (parsedRows.length === 0) throw new Error(`No eligible rows parsed from ${SOURCE_FILENAME}.`);

const seenKeys = new Set<string>();
for (const row of parsedRows) {
  const key = `${row.position}:${row.player.toLowerCase()}`;
  if (seenKeys.has(key)) throw new Error(`Duplicate FantasyPros row for ${row.player} (${row.position}).`);
  seenKeys.add(key);
  if (!Number.isFinite(row.adp) || row.adp <= 0) throw new Error(`Non-positive ADP for ${row.player}.`);
}

const artifact = {
  _meta: {
    schemaVersion: "fantasy-fantasypros-adp-v1",
    season: 2026,
    source: "FantasyPros",
    sourceType: "Real-Time ADP",
    format: "Redraft PPR",
    leagueSize: 12,
    asOfDate: AS_OF_DATE,
    sourceFile: SOURCE_FILENAME,
    eligiblePositions: ["QB", "RB", "WR", "TE"],
    rowCount: parsedRows.length,
  },
  rows: parsedRows,
};

const temporaryPath = `${OUTPUT_PATH}.tmp`;
try {
  writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, OUTPUT_PATH);
} catch (error) {
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  throw error;
}
console.log(`Wrote ${parsedRows.length} FantasyPros ADP rows to ${OUTPUT_PATH}`);

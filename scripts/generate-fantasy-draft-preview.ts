/**
 * Generates the deterministic Draft Preview artifact from the supplied
 * Sleeper draft-board CSV. Run with `npm run fantasy:draft-preview`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSleeperDraftBoardCsv } from "../src/lib/fantasy/draftPreview/sleeperCsv.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = join(ROOT, "data", "fantasy", "source", "PixBook-Sleeper-DraftBoard-2026.csv");
const OUTPUT_PATH = join(ROOT, "data", "fantasy", "draft-preview", "2026-sleeper-draft-board.json");
const EXPECTED_ROW_COUNT = 267;

const raw = readFileSync(SOURCE_PATH, "utf8");
const rows = parseSleeperDraftBoardCsv(raw);

if (rows.length !== EXPECTED_ROW_COUNT) {
  throw new Error(`Expected ${EXPECTED_ROW_COUNT} Sleeper draft board rows; parsed ${rows.length}.`);
}

const sleeperRanks = rows.map((row) => row.sleeperRank);
if (new Set(sleeperRanks).size !== rows.length) {
  throw new Error("Sleeper draft board RK column has duplicate values.");
}

const artifact = {
  _meta: {
    schemaVersion: "fantasy-draft-preview-sleeper-board-v1",
    source: "data/fantasy/source/PixBook-Sleeper-DraftBoard-2026.csv",
    sourceSha256: createHash("sha256").update(raw).digest("hex"),
    generatedBy: "scripts/generate-fantasy-draft-preview.ts",
    rowCount: rows.length,
  },
  rows,
};

const temporaryPath = `${OUTPUT_PATH}.tmp`;
try {
  writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, OUTPUT_PATH);
} catch (error) {
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  throw error;
}

console.log(`Wrote ${rows.length} Sleeper draft board rows to ${OUTPUT_PATH}`);

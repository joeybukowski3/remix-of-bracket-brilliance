/**
 * generate-mlb-k-probability-shadow.mjs
 *
 * SHADOW / INFORMATIONAL producer (STEP 8). Reads the already-published
 * hr-props-raw.json (projectedKs, kLine, kOddsOver/Under -- never writes to
 * it) and k-props-v2-shadow.json (V4 recent-form diagnostics), computes the
 * probability/value layer, and writes a SEPARATE additive artifact:
 *
 *   public/data/mlb/k-probability-shadow.json
 *
 * This script does not modify any existing artifact and is not wired into
 * any workflow yet -- run manually with:
 *   node scripts/generate-mlb-k-probability-shadow.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildKProbabilityShadowArtifact } from "./lib/mlb-k-probability-shadow-core.mjs";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const V2_SHADOW_PATH = path.join(ROOT, "public/data/mlb/k-props-v2-shadow.json");
const OUT_PATH = path.join(ROOT, "public/data/mlb/k-probability-shadow.json");

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const rawPayload = readJsonIfExists(RAW_PATH);
if (!rawPayload) {
  console.error(`[k-probability-shadow] could not read ${RAW_PATH}; nothing to do.`);
  process.exit(1);
}

const shadowArtifact = readJsonIfExists(V2_SHADOW_PATH);
if (!shadowArtifact) {
  console.warn(`[k-probability-shadow] ${V2_SHADOW_PATH} unavailable -- falling back to per-row workload/rate inputs for every pitcher.`);
}

const artifact = buildKProbabilityShadowArtifact(rawPayload, shadowArtifact);

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

const d = artifact.diagnostics;
console.log(`[k-probability-shadow] slateDate=${artifact.slateDate} totalRows=${d.totalRows} computed=${d.computedRows} noMarket=${d.noMarketRows} oneSided=${d.oneSidedMarketRows} insufficient=${d.insufficientDataRows}`);
console.log(`[k-probability-shadow] saved=${OUT_PATH}`);

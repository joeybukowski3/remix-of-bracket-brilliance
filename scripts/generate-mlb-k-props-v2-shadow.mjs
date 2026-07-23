import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import { buildKPropsShadowArtifact } from "./lib/mlb-k-props-v2-shadow-core.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const WORKLOAD_PATH = path.join(DATA_DIR, "k-workload-shadow.json");
const DETAILS_PATH = path.join(DATA_DIR, "strikeout-prop-details.json");
const OUTPUT_PATH = path.join(DATA_DIR, "k-props-v2-shadow.json");
const V2_SOURCE_PATH = path.join(ROOT, "src", "lib", "mlb", "kProjectionV2.ts");

function readJson(filePath, required = true) {
  if (!existsSync(filePath)) {
    if (required) throw new Error(`Missing required file: ${filePath}`);
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    renameSync(temporary, filePath);
  } catch {
    if (existsSync(filePath)) rmSync(filePath);
    renameSync(temporary, filePath);
  }
}

async function loadProjectStrikeoutsV2() {
  const source = readFileSync(V2_SOURCE_PATH, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
    fileName: V2_SOURCE_PATH,
  });
  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  const mod = await import(`data:text/javascript;base64,${encoded}`);
  if (typeof mod.projectStrikeoutsV2 !== "function") {
    throw new Error("Unable to load projectStrikeoutsV2 from src/lib/mlb/kProjectionV2.ts");
  }
  return mod.projectStrikeoutsV2;
}

export async function generateKPropsV2ShadowArtifact({
  rawPath = RAW_PATH,
  workloadPath = WORKLOAD_PATH,
  detailsPath = DETAILS_PATH,
  outputPath = OUTPUT_PATH,
  write = true,
} = {}) {
  const rawPayload = readJson(rawPath, true);
  const workloadPayload = readJson(workloadPath, false);
  const detailsPayload = readJson(detailsPath, false);
  const projectStrikeoutsV2 = await loadProjectStrikeoutsV2();
  const artifact = buildKPropsShadowArtifact({
    rawPayload,
    workloadPayload,
    detailsPayload,
    projectStrikeoutsV2,
  });

  if (write) {
    writeJsonAtomic(outputPath, artifact);
    console.log(`[k-props-v2-shadow] wrote ${outputPath} (${artifact.rows.length} rows)`);
  }

  return artifact;
}

export async function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const outputPath = value("--output=") ?? OUTPUT_PATH;
  const artifact = await generateKPropsV2ShadowArtifact({
    outputPath,
    write: !argv.includes("--dry-run"),
  });

  if (argv.includes("--dry-run")) {
    console.log(JSON.stringify(artifact, null, 2));
  }

  return artifact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[k-props-v2-shadow] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

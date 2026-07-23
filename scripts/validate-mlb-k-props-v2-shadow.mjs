import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { validateKPropsV2ShadowArtifact } from "./lib/mlb-k-props-v2-shadow-validator.mjs";

const ROOT = process.cwd();
const DEFAULT_ARTIFACT_PATH = path.join(ROOT, "public", "data", "mlb", "k-props-v2-shadow.json");

export function validateKPropsV2ShadowArtifactFile(filePath = DEFAULT_ARTIFACT_PATH) {
  const payload = JSON.parse(readFileSync(filePath, "utf8"));
  const result = validateKPropsV2ShadowArtifact(payload);

  if (!result.ok) {
    console.error(`[k-props-v2-shadow-validation] invalid ${filePath}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return result;
  }

  console.log(`[k-props-v2-shadow-validation] ok ${filePath} (${payload.rows.length} rows)`);
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const artifactPath = argv.find((entry) => !entry.startsWith("--")) ?? DEFAULT_ARTIFACT_PATH;
  return validateKPropsV2ShadowArtifactFile(artifactPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[k-props-v2-shadow-validation] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

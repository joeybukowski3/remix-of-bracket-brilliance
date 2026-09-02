/**
 * mlb-k-backtest-v2-loader.mjs
 *
 * Loads the REAL production V2 model (`projectStrikeoutsV2`) from
 * src/lib/mlb/kProjectionV2.ts by transpiling it in-memory - the same technique
 * scripts/generate-mlb-k-props-v2-shadow.mjs uses. The backtest must score the
 * exact function production runs, not a copy.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const V2_SOURCE_PATH = path.join(process.cwd(), "src", "lib", "mlb", "kProjectionV2.ts");

export async function loadProjectStrikeoutsV2(sourcePath = V2_SOURCE_PATH) {
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
    fileName: sourcePath,
  });
  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  const mod = await import(`data:text/javascript;base64,${encoded}`);
  if (typeof mod.projectStrikeoutsV2 !== "function") {
    throw new Error(`Unable to load projectStrikeoutsV2 from ${sourcePath}`);
  }
  return mod.projectStrikeoutsV2;
}

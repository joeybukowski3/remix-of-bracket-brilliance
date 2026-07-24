/**
 * resolve-mlb-k-production-projection.mjs
 *
 * Serializes THE production strikeout projection into the public payload.
 *
 * Runs after the V2 artifact has been generated and schema-validated, and
 * before the site build / X edition planning. Every downstream consumer --
 * the website table, sorting, best-bet cards, the social graphic's data
 * attributes, the X scrape, the frozen edition plan, the renderer and the
 * caption -- reads the single `projectedKs` this step writes. There is
 * deliberately no second place where a production projection is chosen.
 *
 * A missing, stale or schema-invalid V2 artifact is not an error: every row
 * falls back to its stored legacy projection and the step still succeeds, so
 * a broken V2 generation degrades to legacy instead of publishing mixed or
 * stale projections. It exits nonzero only on a structurally broken public
 * payload, which is not something to publish around.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { resolveKProjectionsForPayload } from "./lib/mlb-k-production-projection.mjs";
import { validateKPropsV2ShadowArtifact } from "./lib/mlb-k-props-v2-shadow-validator.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const V2_PATH = path.join(DATA_DIR, "k-props-v2-shadow.json");

export const K_PRODUCTION_PROJECTION_MODEL = "mlb-k-production-projection-v1";

/**
 * Loads the V2 artifact and reports whether it may be used. Any failure mode
 * (absent file, unreadable JSON, schema rejection) resolves to
 * `artifactValid: false`, which the resolver turns into a clean legacy
 * fallback for every row.
 */
export function loadV2Artifact(v2Path = V2_PATH) {
  if (!existsSync(v2Path)) {
    return { artifact: null, artifactValid: false, note: "V2 artifact file is missing." };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(v2Path, "utf8"));
  } catch (error) {
    return {
      artifact: null,
      artifactValid: false,
      note: `V2 artifact is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const validation = validateKPropsV2ShadowArtifact(parsed);
  if (!validation.ok) {
    return {
      artifact: null,
      artifactValid: false,
      note: `V2 artifact failed schema validation: ${validation.errors.slice(0, 3).join("; ")}`,
    };
  }
  return { artifact: parsed, artifactValid: true, note: null };
}

export function resolveProductionProjection({ rawPath = RAW_PATH, v2Path = V2_PATH, write = true } = {}) {
  if (!existsSync(rawPath)) throw new Error(`Missing public payload: ${rawPath}`);
  const payload = JSON.parse(readFileSync(rawPath, "utf8"));
  if (!Array.isArray(payload?.pitchers)) throw new Error(`${rawPath} has no pitchers array`);

  const { artifact, artifactValid, note } = loadV2Artifact(v2Path);
  const { pitchers, diagnostics } = resolveKProjectionsForPayload({
    pitchers: payload.pitchers,
    artifact,
    publicSlateDate: payload.date ?? null,
    artifactValid,
  });

  const updated = {
    ...payload,
    pitchers,
    kProductionProjection: {
      model: K_PRODUCTION_PROJECTION_MODEL,
      v2ModelVersion: artifact?.modelVersion ?? null,
      v2SlateDate: artifact?.slateDate ?? null,
      v2GeneratedAt: artifact?.generatedAt ?? null,
      v2ArtifactUsable: artifactValid,
      note,
      ...diagnostics,
    },
  };

  if (write) writeFileSync(rawPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

export function main() {
  const updated = resolveProductionProjection();
  const d = updated.kProductionProjection;
  if (d.note) console.warn(`[k-production] ${d.note} Falling back to legacy for every row.`);
  console.log(
    `[k-production] slate=${updated.date} rows=${d.totalRows} v2=${d.v2Rows} legacyFallback=${d.legacyFallbackRows} unavailable=${d.unavailableRows}`,
  );
  const reasons = Object.entries(d.fallbackReasons ?? {});
  if (reasons.length) {
    console.log(`[k-production] fallback reasons: ${reasons.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  return updated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[k-production] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDetailedTournamentData, validateDetailedTournamentData } from "./lib/pga-detailed-model.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function generateDetailedModelArtifact({ slug, output, generatedAt = new Date().toISOString() }) {
  const schedule = readJson(path.join(repoRoot, "src/data/pga/schedule.json"));
  const config = schedule.find((entry) => entry.slug === slug);
  if (!config?.detailedModel) throw new Error(`No detailed-model source mapping is registered for ${slug}.`);

  const mapping = config.detailedModel;
  const inputs = {
    field: readJson(resolve(mapping.fieldFile)),
    stats: readJson(resolve(mapping.statsFile)),
    statsMeta: readJson(resolve(mapping.statsMetaFile)),
    trend: readJson(resolve(mapping.trendFile)),
    history: readJson(resolve(mapping.historyFile)),
    config: { ...mapping, slug },
    generatedAt,
  };
  const result = buildDetailedTournamentData(inputs);
  const outputPath = resolve(output || `public/data/pga/${config.dataFile}`);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(result.rows, null, 2)}\n`, "utf8");
    const parsed = readJson(temporaryPath);
    validateDetailedTournamentData(parsed, { field: inputs.field, config: { ...mapping, slug }, generatedAt });
    fs.copyFileSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }

  console.log(`[pga-detailed] ${slug}: ${result.rows.length} rows, ${result.eligible} pass evidence gate, ${result.ineligible} fail`);
  console.log(`[pga-detailed] coverage: ${JSON.stringify(result.coverage)}`);
  console.log(`[pga-detailed] wrote ${outputPath}`);
  return { ...result, outputPath };
}

function resolve(value) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function parseArgs(argv) {
  const result = { slug: "", output: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--slug") result.slug = argv[++index] ?? "";
    if (argv[index] === "--output") result.output = argv[++index] ?? "";
  }
  if (!result.slug) throw new Error("Pass --slug for the registered detailed tournament.");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateDetailedModelArtifact(parseArgs(process.argv.slice(2)));
}

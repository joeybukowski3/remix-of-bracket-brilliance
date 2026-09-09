import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractTouchdownContextFromGzip, nflverseTouchdownPbpUrl, serializeTouchdownContext, TOUCHDOWN_CONTEXT_COLUMNS, TOUCHDOWN_CONTEXT_SCHEMA_VERSION, TOUCHDOWN_PBP_COLUMNS } from "./lib/nfl-touchdown-context-core.mjs";

const seasonsArg = process.argv.find((arg) => arg.startsWith("--seasons="));
const seasons = (seasonsArg?.split("=")[1] ?? "2025,2026").split(",").map(Number).filter(Number.isInteger);
if (!seasons.length) throw new Error("Provide at least one integer season with --seasons=2025,2026");

const root = process.cwd();
const outputDir = path.join(root, "data", "nfl", "nflverse", "touchdown-context");
await mkdir(outputDir, { recursive: true });

for (const season of seasons) {
  const sourceUrl = nflverseTouchdownPbpUrl(season);
  const extracted = await extractTouchdownContextFromGzip(await fetch(sourceUrl));
  const csv = serializeTouchdownContext(extracted.rows);
  const filename = `touchdown_context_${season}.csv`;
  const outputPath = path.join(outputDir, filename);
  await writeFile(outputPath, csv, "utf8");
  const manifest = {
    schemaVersion: TOUCHDOWN_CONTEXT_SCHEMA_VERSION,
    season,
    source: "nflverse play-by-play",
    sourceUrl,
    sourceRows: extracted.sourceRows,
    compactRows: extracted.rows.length,
    sourceColumns: TOUCHDOWN_PBP_COLUMNS,
    compactColumns: TOUCHDOWN_CONTEXT_COLUMNS,
    sha256: createHash("sha256").update(csv).digest("hex"),
    notes: [
      "Raw compressed play-by-play is streamed and discarded.",
      "Rows contain only eligible scorer carries and targets; passing, special-teams, two-point, kneel, spike, and no-play records are excluded.",
    ],
  };
  await writeFile(path.join(outputDir, `touchdown_context_${season}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`${season}: ${extracted.rows.length} compact touchdown opportunities from ${extracted.sourceRows} PBP rows`);
}

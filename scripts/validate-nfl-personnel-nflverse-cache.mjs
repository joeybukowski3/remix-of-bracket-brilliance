import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateNflverseManifest } from "./lib/nfl-personnel/providers/nflverse/audit.mjs";

function parseArgs(argv) {
  const args = {
    manifest: null,
    baseDir: ".",
  };
  for (const arg of argv) {
    if (arg.startsWith("--manifest=")) args.manifest = resolve(arg.slice("--manifest=".length));
    else if (arg.startsWith("--base-dir=")) args.baseDir = resolve(arg.slice("--base-dir=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.manifest) throw new Error("--manifest is required");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
  const validation = validateNflverseManifest(manifest, { baseDir: args.baseDir });

  console.log(
    JSON.stringify(
      {
        valid: validation.valid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        errors: validation.errors,
        warnings: validation.warnings,
      },
      null,
      2,
    ),
  );

  if (!validation.valid) process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1]).replace(/\\/g, "/")}`).href) {
  try {
    main();
  } catch (error) {
    console.error(`[nfl:personnel:nflverse:validate-cache] FAILED: ${error.message}`);
    process.exit(1);
  }
}

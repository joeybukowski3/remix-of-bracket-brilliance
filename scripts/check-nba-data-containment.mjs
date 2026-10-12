#!/usr/bin/env node
/**
 * Fail if restricted NBA data or model artifacts could enter Git or a
 * deployable directory, or if NBA source code stopped being committable.
 *
 *   node scripts/check-nba-data-containment.mjs                 git + public/ + dist/ (if built)
 *   node scripts/check-nba-data-containment.mjs --staged        only staged files (pre-commit use)
 *   node scripts/check-nba-data-containment.mjs --no-git --deployable=dist   build-time (no .git needed)
 *
 * Git scope = tracked files plus untracked, non-ignored files (what `git add -A`
 * would stage). Output names paths and rule ids only, never file contents.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  findMissingSource,
  findViolations,
  vercelIgnoreProtects,
} from "./lib/nba-data-containment.mjs";

const MAX_SCAN_BYTES = 64 * 1024 * 1024;
const DEFAULT_DEPLOYABLE = ["public", "dist"];

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => !a.includes("=")));
  const deployableArg = argv.find((a) => a.startsWith("--deployable="));
  return {
    git: !flags.has("--no-git"),
    staged: flags.has("--staged"),
    deployable: deployableArg ? deployableArg.split("=")[1].split(",").filter(Boolean) : DEFAULT_DEPLOYABLE,
  };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

const splitNul = (out) => out.split("\0").filter(Boolean);

function gitCandidatePaths(staged) {
  if (staged) return splitNul(git(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]));
  return [...new Set([...splitNul(git(["ls-files", "-z"])), ...splitNul(git(["ls-files", "-z", "--others", "--exclude-standard"]))])];
}

function isGitIgnored(file) {
  try {
    git(["check-ignore", "-q", "--no-index", file]);
    return true;
  } catch {
    return false;
  }
}

function readTextSafe(file) {
  try {
    const stats = statSync(file);
    if (!stats.isFile() || stats.size > MAX_SCAN_BYTES) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function report(label, findings) {
  if (findings.length === 0) {
    console.log(`ok    ${label}`);
    return 0;
  }
  console.error(`FAIL  ${label}: ${findings.length} file(s)`);
  for (const finding of findings.slice(0, 50)) console.error(`      ${finding.path}  [${finding.rules.join(", ")}]`);
  if (findings.length > 50) console.error(`      … ${findings.length - 50} more`);
  return 1;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let failures = 0;

  if (options.git) {
    const paths = gitCandidatePaths(options.staged);
    failures += report(`git ${options.staged ? "staged" : "tracked + committable"} (${paths.length} files)`, findViolations({ paths, readText: readTextSafe, scope: "git" }));
    const missing = findMissingSource({ exists: existsSync, isIgnored: isGitIgnored });
    failures += report("NBA source remains committable", missing.map((m) => ({ path: m.path, rules: [m.problem] })));
  }

  for (const dir of options.deployable) {
    if (!existsSync(dir)) {
      console.log(`skip  deployable ${dir}/ (not present)`);
      continue;
    }
    const paths = walk(dir).map((file) => file.split(path.sep).join("/"));
    failures += report(`deployable ${dir}/ (${paths.length} files)`, findViolations({ paths, readText: readTextSafe, scope: "deployable" }));
  }

  const vercelIgnore = existsSync(".vercelignore") ? readFileSync(".vercelignore", "utf8") : null;
  failures += report(".vercelignore excludes data/nba/", vercelIgnoreProtects(vercelIgnore) ? [] : [{ path: ".vercelignore", rules: ["missing-data-nba-exclusion"] }]);

  if (failures > 0) {
    console.error("\nRestricted NBA data must stay under the gitignored data/nba/ directory. See docs/nba-player-props-phase-2b-plan.md.");
    process.exitCode = 1;
  }
}

main();

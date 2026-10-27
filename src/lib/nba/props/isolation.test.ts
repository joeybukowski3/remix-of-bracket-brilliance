/**
 * Isolation guard: minutes-v1 is an unpromoted candidate and NBA code is not
 * part of the application, except the unlisted /nba/props page (route, page and
 * components), which may import only the browser-safe board and DvP modules.
 * These checks read import statements only.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
/** The one application surface allowed to import NBA code: the unlisted, noindex /nba/props page. */
const NBA_PROPS_PAGE_FILES = /^(src\/AppRoutes\.tsx|src\/pages\/NbaPlayerProps\.tsx|src\/components\/nba\/[^/]+\.tsx?)$/;
const SOURCE_EXT =/\.(ts|tsx|mts|mjs|js)$/;
/** Walking src/, scripts/ and api/ can exceed the 5 s default under a parallel run. */
const WALK_TIMEOUT_MS = 60_000;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : SOURCE_EXT.test(entry.name) ? [path.relative(repoRoot, full).split(path.sep).join("/")] : [];
  });
}

const files = [...walk(path.join(repoRoot, "src")), ...walk(path.join(repoRoot, "scripts")), ...walk(path.join(repoRoot, "api"))];
const importsOf = (file: string) =>
  [...readFileSync(path.join(repoRoot, file), "utf8").matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)].map((m) => m[1]);

describe("NBA code isolation", () => {
  it("keeps minutes-v1 out of baseline v0 and every non-candidate module", () => {
    const allowed = new Set([
      "src/lib/nba/props/minutesV1.ts",
      "src/lib/nba/props/minutesV1Backtest.ts",
      "src/lib/nba/props/minutesV1.test.ts",
      // Phase 4A: the one evaluation-side re-export of the candidate; all other evaluation modules import it from here.
      "src/lib/nba/props/evaluation/minutesV1Candidate.ts",
      "scripts/nba-minutes-synthetic-harness.ts",
    ]);
    const importers = files.filter((file) => importsOf(file).some((spec) => /(^|\/)(minutesV1|minutesV1Backtest|minutesFeatures)$/.test(spec)));
    expect(importers.filter((file) => !allowed.has(file))).toEqual([]);
  }, WALK_TIMEOUT_MS);

  it("keeps NBA code out of the application and other sports", () => {
    const importers = files.filter((file) => importsOf(file).some((spec) => /lib\/nba\/|\/nba\/props\//.test(spec)));
    const outside = importers.filter((file) => !file.startsWith("src/lib/nba/") && !/^scripts\/(nba-|lib\/nba-)/.test(file) && !NBA_PROPS_PAGE_FILES.test(file));
    expect(outside).toEqual([]);
  }, WALK_TIMEOUT_MS);

  it("limits the /nba/props page to the browser-safe board and DvP modules", () => {
    const pageFiles = files.filter((file) => NBA_PROPS_PAGE_FILES.test(file) && file !== "src/AppRoutes.tsx");
    const nbaImports = pageFiles.flatMap((file) => importsOf(file).filter((spec) => /lib\/nba\//.test(spec)).map((spec) => `${file} -> ${spec}`));
    const disallowed = nbaImports.filter((entry) => !/-> @\/lib\/nba\/props\/(propsBoard|dvp|dvpPositions|canonical|seasonStats|minutesOverride|boardColumns|__fixtures__\/boardDemo)$/.test(entry));
    expect(disallowed).toEqual([]);
    expect(importsOf("src/AppRoutes.tsx").filter((spec) => /nba/i.test(spec))).toEqual(["./pages/NbaPlayerProps"]);
  }, WALK_TIMEOUT_MS);
});

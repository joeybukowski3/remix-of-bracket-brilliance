import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    if (entry.name.endsWith(".ts")) return [full];
    return [];
  });
}

const RESEARCH_ROOT = resolve(__dirname, "..");

describe("Phase 0-7 never import Phase 8", () => {
  const earlierPhaseDirs = ["derived", "phase2", "phase3", "phase4", "phase5", "phase6", "phase7"];
  for (const dirName of earlierPhaseDirs) {
    const dir = resolve(RESEARCH_ROOT, dirName);
    let files: string[] = [];
    try {
      files = listTsFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      it(`${dirName}/${file.slice(dir.length + 1)} does not import phase8`, () => {
        const content = readFileSync(file, "utf8");
        const importLines = content.match(/^import\s.+$/gm) ?? [];
        for (const line of importLines) {
          expect(line).not.toMatch(/phase8/i);
        }
      });
    }
  }
});

describe("Phase 8 modules never import CFB_V1_CONFIG / production pipeline / MIC", () => {
  const files = listTsFiles(resolve(RESEARCH_ROOT, "phase8")).filter((f) => !f.endsWith(".test.ts"));
  it.each(files)("%s imports no production config", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/CFB_V1_CONFIG|CFB_PIPELINE_CONFIG|CFB_MODEL_CONFIG|marketAnchor|\bmic\b/i);
    }
  });
});

describe("Section 1/24 — market data enters Phase 8 ONLY through marketGapDiagnostic.ts", () => {
  const files = listTsFiles(resolve(RESEARCH_ROOT, "phase8")).filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith("marketGapDiagnostic.ts"),
  );
  it.each(files)("%s does not reference market lines / CfbResearchMarketLine", (file) => {
    const content = readFileSync(file, "utf8");
    expect(content).not.toMatch(/CfbResearchMarketLine|market-lines\.json|spreadOpen|spreadLatestObserved/i);
  });
});

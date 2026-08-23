import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 10 §15/§16/§21 — production V2 code must never import research
 * modules or market/MIC code at runtime. Mirrors the pattern already
 * established in src/lib/cfb/research/phase8/architectureGuard.test.ts and
 * src/lib/cfb/research/phase9/architectureGuard.test.ts.
 *
 * This test file itself (and connectivity.test.ts / config.test.ts) is
 * exempt by design — TEST-ONLY parity comparisons against research are the
 * one allowed exception (WU1 §15: "Research may be manually inspected for
 * parity while implementing, but no production runtime import may remain").
 */

const V2_ROOT = resolve(__dirname);

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    if (entry.name.endsWith(".ts")) return [full];
    return [];
  });
}

const runtimeFiles = listTsFiles(V2_ROOT).filter((f) => !f.endsWith(".test.ts"));

describe("Production V2 modules never import research at runtime (§15/§21)", () => {
  it.each(runtimeFiles)("%s does not import src/lib/cfb/research/**", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/research/i);
    }
  });
});

describe("Production V2 modules never import market/MIC data (§16)", () => {
  it.each(runtimeFiles)("%s does not import marketAnchor / CFB_V1_CONFIG / MIC", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/marketAnchor|CFB_V1_CONFIG|CFB_MARKET_FADE_BANDS|\bmic\b/i);
    }
  });
});

describe("Production V2 modules never reference a bare/ambiguous powerRating field (§6/§12)", () => {
  it.each(runtimeFiles)("%s does not declare a bare `powerRating` field", (file) => {
    const content = readFileSync(file, "utf8");
    expect(content).not.toMatch(/\bpowerRating\s*[:?]/);
  });
});

describe("Production V2 modules never declare a betting-edge field (§27)", () => {
  it.each(runtimeFiles)("%s does not declare a recommendedSide/confidenceBet/units field", (file) => {
    const content = readFileSync(file, "utf8");
    expect(content).not.toMatch(/\b(recommendedSide|confidenceBet)\s*[:?]/);
  });
});

describe("V1 production code never imports production/v2 (WU2 §29 — one-directional guard)", () => {
  const PRODUCTION_ROOT = resolve(V2_ROOT, "..");
  const CFB_ROOT = resolve(PRODUCTION_ROOT, "..");
  const V1_DIRS = [PRODUCTION_ROOT, resolve(CFB_ROOT, "pipeline"), resolve(CFB_ROOT, "model"), resolve(CFB_ROOT, "calibration")];
  const v1Files = [...new Set(V1_DIRS.flatMap((dir) => listTsFiles(dir)))].filter(
    (f) => !f.startsWith(V2_ROOT) && !f.endsWith(".test.ts"),
  );

  it.each(v1Files)("%s does not import production/v2", (file) => {
    const content = readFileSync(file, "utf8");
    const importLines = content.match(/^import\s.+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).not.toMatch(/production\/v2|production\\v2/);
    }
  });
});

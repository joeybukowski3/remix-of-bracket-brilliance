// WU7A §18 — bundle-safety guard for the Stage-2 app-side V2 consumer.
// Proves this module (and its one direct value-import from production/v2)
// never pulls Node-only code into the client bundle, and proves it is NOT
// yet wired into any page/component (the Stage-3 rollout gate).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CFB_V2_ROLLOUT_STATE } from "./shadowProjections";

const FILES_TO_CHECK = [
  "src/data/cfb/v2/shadowProjections.ts",
  "src/hooks/useCfbV2ShadowProjections.ts",
  "src/lib/cfb/production/v2/legacyCompat.ts",
];

function importLines(filePath: string): string[] {
  const text = readFileSync(resolve(process.cwd(), filePath), "utf8");
  return text.split("\n").filter((line) => /^\s*import\b/.test(line));
}

describe("CFB V2 Stage-2 app consumer — bundle safety (WU7A §18)", () => {
  it.each(FILES_TO_CHECK)("%s imports no Node-only modules", (filePath) => {
    for (const line of importLines(filePath)) {
      expect(line).not.toMatch(/\bnode:fs\b|\bnode:path\b|\bnode:crypto\b|\bnode:child_process\b|\bnode:os\b/);
      expect(line).not.toMatch(/from ["']fs["']|from ["']path["']|from ["']crypto["']/);
    }
  });

  it("shadowProjections.ts never imports the production/v2 barrel (index.ts) — only specific pure files", () => {
    for (const line of importLines("src/data/cfb/v2/shadowProjections.ts")) {
      expect(line).not.toMatch(/production\/v2["']$/); // bare "production/v2" resolves to its index.ts barrel
      expect(line).not.toMatch(/production\/v2\/index["']/);
    }
  });

  it("shadowProjections.ts and the hook never import research/marketAnchor/MIC code", () => {
    for (const filePath of ["src/data/cfb/v2/shadowProjections.ts", "src/hooks/useCfbV2ShadowProjections.ts"]) {
      for (const line of importLines(filePath)) {
        expect(line).not.toMatch(/research|marketAnchor|CFB_V1_CONFIG|\bmic\b/i);
      }
    }
  });

  it("legacyCompat.ts (the one production/v2 value-import this module relies on) is itself Node-free and self-contained", () => {
    for (const line of importLines("src/lib/cfb/production/v2/legacyCompat.ts")) {
      // Its only imports should be pure type-only imports of CfbGameModelProjections and CfbV2GameProjection.
      expect(line).toMatch(/^\s*import type\b/);
    }
  });

  it("rollout state is precisely 'stage-2-infrastructure-ready', not 'stage-2-active' — code exists and is tested, but the running app never calls it (WU7A checkpoint §2)", () => {
    expect(CFB_V2_ROLLOUT_STATE).toBe("stage-2-infrastructure-ready");
  });

  it("Stage-3 rollout gate: no .tsx page or component imports the Stage-2 V2 consumer yet", () => {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    // `git grep -l` exits 1 (throws) when there are NO matches -- that is
    // the PASSING state for this gate. If it exits 0 (does not throw),
    // matches were found, which is the gate violation and must fail loudly.
    let matches: string;
    try {
      matches = execSync('git grep -l "data/cfb/v2/shadowProjections\\|useCfbV2ShadowProjections" -- "*.tsx"', {
        cwd: process.cwd(),
        encoding: "utf8",
      }).toString().trim();
    } catch {
      matches = ""; // no matches -- gate holds
    }
    expect(matches).toBe("");
  });
});

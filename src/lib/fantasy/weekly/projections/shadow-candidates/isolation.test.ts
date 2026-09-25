import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CANDIDATE_A_SPEC, CANDIDATE_B_SNAP_SPEC, SHADOW_CANDIDATE_A_VERSION, SHADOW_CANDIDATE_B_VERSION } from "./spec";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name).replace(/\\/g, "/");
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

describe("shadow isolation from public projection consumers", () => {
  it("no app source, hook, page, component or production module imports shadow-candidates or the snap module", () => {
    const offenders = walk("src").filter((file) => {
      if (file.includes("/shadow-candidates/") || file.includes("/weekly/snap/")) return false;
      return /shadow-candidates|pointInTimeSnap/.test(read(file));
    });
    expect(offenders).toEqual([]);
  }, 60_000);
  it("the production generator and its library never reference the shadow layer or write shadow paths", () => {
    for (const file of ["scripts/generate-fantasy-weekly-projections.ts", "scripts/lib/fantasy-team-history.ts"]) {
      expect(read(file)).not.toMatch(/shadow-candidates|fantasy-shadow|pointInTimeSnap|data\/fantasy\/shadow/);
    }
  });
  it("shadow writers only target data/fantasy/**, never public/", () => {
    for (const file of ["scripts/generate-fantasy-shadow-candidates.ts", "scripts/archive-fantasy-shadow-projections.ts", "scripts/append-fantasy-shadow-outcomes.ts", "scripts/lib/fantasy-shadow-archive.ts"]) {
      const source = read(file);
      const writes = source.match(/(?:writeFileSync|appendFileSync|renameSync)\([^;]*/g) ?? [];
      for (const call of writes) expect(call).not.toMatch(/public/);
    }
    expect(read("scripts/generate-fantasy-shadow-candidates.ts")).toMatch(/"data", "fantasy", "shadow"/);
    expect(read("scripts/lib/fantasy-shadow-archive.ts")).toContain("data/fantasy/shadow-archive/");
  });
});

describe("workflow: production stays authoritative; shadow/archive is best-effort and last", () => {
  const workflow = read(".github/workflows/generate-fantasy-weekly-projections.yml").replace(/\r\n/g, "\n");
  const steps = workflow.split("\n      - name: ").slice(1);
  const index = (fragment: string) => steps.findIndex((step) => step.startsWith(fragment));

  it("orders generation -> validation -> public commit -> shadow/archive -> shadow commit", () => {
    const order = ["Generate production weekly fantasy projections", "Validate generated projection artifact", "Commit and push updated weekly projections", "Shadow candidates and prospective archive", "Commit shadow archive"].map(index);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("every shadow/archive step is continue-on-error and none touches public/ or the public artifacts", () => {
    for (const fragment of ["Shadow candidates and prospective archive", "Commit shadow archive"]) {
      const step = steps[index(fragment)];
      expect(step).toContain("continue-on-error: true");
      expect(step).not.toMatch(/git add[^\n]*public\//);
      expect(step).not.toMatch(/--out-root=[^\n]*public/);
    }
    expect(steps[index("Commit and push updated weekly projections")]).not.toContain("continue-on-error");
    expect(steps[index("Generate production weekly fantasy projections")]).not.toContain("continue-on-error");
  });
  it("runs the production archive and shadow generation only after public publishing, and never passes a real-clock override", () => {
    const shadow = steps[index("Shadow candidates and prospective archive")];
    expect(shadow.indexOf("generate-fantasy-shadow-candidates.ts")).toBeLessThan(shadow.indexOf("archive-fantasy-shadow-projections.ts"));
    expect(shadow).toContain("archive-fantasy-weekly-projections.ts");
    expect(shadow).not.toContain("--captured-at");
  });
});

describe("frozen candidate identities and coefficients", () => {
  it("keeps the approved version strings and values", () => {
    expect(SHADOW_CANDIDATE_A_VERSION).toBe("weekly-fantasy-shadow-candidate-a-v1");
    expect(SHADOW_CANDIDATE_B_VERSION).toBe("weekly-fantasy-shadow-candidate-b-v1");
    expect(CANDIDATE_A_SPEC.QB.fpa).toEqual({ weight: 0.23, cap: 2.0 });
    expect(CANDIDATE_A_SPEC.RB.fpa).toEqual({ weight: 0.17, cap: 1.5 });
    expect(CANDIDATE_A_SPEC.WR.env).toEqual({ coefficient: 0.08, cap: 0.6 });
    expect(CANDIDATE_B_SNAP_SPEC.WR).toMatchObject({ perSd: 0.55, cap: 2.0 });
    expect(CANDIDATE_B_SNAP_SPEC.TE).toMatchObject({ perSd: 0.62, cap: 2.0 });
    expect(CANDIDATE_B_SNAP_SPEC.QB).toBeUndefined();
    expect(CANDIDATE_B_SNAP_SPEC.RB).toBeUndefined();
    expect(relative(root, root)).toBe("");
  });
});

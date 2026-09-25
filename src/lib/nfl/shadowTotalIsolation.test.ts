/**
 * The shadow total calibration candidate must never reach the public site or any production consumer. These are structural
 * guards: nothing under src/ or public/ may reference the shadow model, its archive, or its scripts; the Weekly Game Board's
 * JKB total keeps coming from the production team-totals view of the unchanged v1.0.0 archive.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const SHADOW_TOKENS = ["shadow-predictions", "nfl-total-calibration", "jkb-nfl-total-calibration-shadow", "nfl-total-shadow", "NFL_TOTAL_SHADOW", "nfl:total-shadow", "computeShadowTotal", "priorSeasonLeagueMean"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name === "node_modules") continue; walk(p, out); } else out.push(p);
  }
  return out;
}

describe("shadow total isolation", () => {
  it("no source file under src/ references the shadow model, archive or scripts", { timeout: 30_000 }, () => {
    const offenders: string[] = [];
    for (const file of walk(join(REPO, "src"))) {
      if (!/\.(ts|tsx|js|jsx|mjs|json|css)$/.test(file) || file.endsWith("shadowTotalIsolation.test.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const token of SHADOW_TOKENS) if (text.includes(token)) offenders.push(`${relative(REPO, file)}: ${token}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no public artifact contains a shadow total or references the shadow model", () => {
    const offenders: string[] = [];
    const publicNfl = join(REPO, "public", "data", "nfl");
    for (const file of walk(publicNfl)) {
      if (!file.endsWith(".json")) continue;
      const text = readFileSync(file, "utf8");
      for (const token of ["calibration-shadow", "shadow-predictions", "shadowTotal", "shadow_total"]) if (text.includes(token)) offenders.push(`${relative(REPO, file)}: ${token}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the Weekly Game Board reads the production team-totals artifact (jkb-nfl-total-ridge-v1.0.0), not the shadow archive", () => {
    const artifact = JSON.parse(readFileSync(join(REPO, "public", "data", "nfl", "team-totals.json"), "utf8")) as { modelVersion: string; projections: Record<string, { modelVersion: string }> };
    expect(artifact.modelVersion).toBe("jkb-nfl-total-ridge-v1.0.0");
    for (const p of Object.values(artifact.projections)) expect(p.modelVersion).toBe("jkb-nfl-total-ridge-v1.0.0");
    const board = readFileSync(join(REPO, "src", "lib", "nfl", "weeklyDashboard.ts"), "utf8");
    expect(board).toContain("totalsProjectionData");
    const totalsData = readFileSync(join(REPO, "src", "lib", "nfl", "totalsProjectionData.ts"), "utf8");
    expect(totalsData).toContain("team-totals.json");
  });

  it("the production team-totals view reads only the production prediction archive, never the shadow root", () => {
    const view = readFileSync(join(REPO, "scripts", "generate-nfl-team-totals-view.mts"), "utf8");
    expect(view).toContain('join(ROOT, "data", "nfl", "predictions")');
    for (const token of ["shadow", "calibration-k08"]) expect(view.toLowerCase()).not.toContain(token);
  });

  it("the shadow archive lives outside public/ and outside data/nfl/predictions", () => {
    const shadowRoot = join("data", "nfl", "shadow-predictions", "nfl-total-calibration-k08");
    expect(shadowRoot.startsWith("public")).toBe(false);
    expect(shadowRoot.startsWith(join("data", "nfl", "predictions"))).toBe(false);
    // the production archive partition directory must not contain a shadow file
    const predictions = join(REPO, "data", "nfl", "predictions");
    if (existsSync(predictions)) for (const f of walk(predictions)) expect(f.toLowerCase()).not.toContain("shadow");
  });

  it("the production generator's shadow hook takes no k option and cannot change production output", () => {
    const gen = readFileSync(join(REPO, "scripts", "generate-nfl-totals.ts"), "utf8");
    expect(gen).not.toMatch(/--shadow-k|shadowK|shadow_k/i);
    // production math path is unchanged: the prediction is produced by generateNflTotalPrediction before any shadow code runs
    expect(gen.indexOf("generateNflTotalPrediction(model")).toBeLessThan(gen.indexOf("shadowStep(args, slate"));
  });
});

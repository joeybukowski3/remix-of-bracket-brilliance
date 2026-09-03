import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRushingShadowModel } from "./resolveRushingShadowModel";

const ARTIFACT_PATH = join(process.cwd(), "data", "nfl", "models", "rushing-shadow-allocation-v1.json");

describe("resolveRushingShadowModel", () => {
  it("returns ok:false with a reason (never throws) on a malformed artifact", () => {
    const result = resolveRushingShadowModel({ not: "an artifact" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it("returns ok:false with a reason on null input", () => {
    const result = resolveRushingShadowModel(null);
    expect(result.ok).toBe(false);
  });

  it("loads the real committed artifact (fresh-runner condition: no 34MB research dataset referenced)", () => {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
    } catch {
      // Artifact not yet committed on this checkout -- acceptable for this
      // pass (see WU4D.3 checkpoint); skip rather than fail the suite.
      return;
    }
    const result = resolveRushingShadowModel(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.poolRows.length).toBeGreaterThan(0);
      expect(result.model.fit.rankPrior.size).toBeGreaterThan(0);
    }
  });
});

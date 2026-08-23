import { describe, expect, it } from "vitest";
import {
  CFB_V2_CALIBRATION_VERSION,
  CFB_V2_IPR_MODEL_VERSION,
  CFB_V2_MODEL_VERSION,
  CFB_V2_PROBABILITY_VERSION,
  CFB_V2_SCORING_VERSION,
  CFB_V2_VERSIONS,
  computeCfbV2ConfigHash,
} from "./versions";

describe("CFB V2 version identifiers", () => {
  it("are explicit v2 ids, never ambiguous v1/v1.1 identifiers", () => {
    expect(CFB_V2_IPR_MODEL_VERSION).toBe("cfb-ipr-v2.0");
    expect(CFB_V2_SCORING_VERSION).toBe("cfb-scoring-v2.0");
    expect(CFB_V2_CALIBRATION_VERSION).toBe("cfb-calibration-v2.0");
    expect(CFB_V2_PROBABILITY_VERSION).toBe("cfb-probability-v2.0");
    for (const version of [CFB_V2_IPR_MODEL_VERSION, CFB_V2_SCORING_VERSION, CFB_V2_CALIBRATION_VERSION, CFB_V2_PROBABILITY_VERSION, CFB_V2_MODEL_VERSION]) {
      expect(version).not.toMatch(/^v1(\.\d+)?$/);
      expect(version).toMatch(/v2/);
    }
  });

  it("CFB_V2_VERSIONS bundles all four and is frozen", () => {
    expect(CFB_V2_VERSIONS).toEqual({
      ipr: CFB_V2_IPR_MODEL_VERSION,
      scoring: CFB_V2_SCORING_VERSION,
      calibration: CFB_V2_CALIBRATION_VERSION,
      probability: CFB_V2_PROBABILITY_VERSION,
    });
    expect(Object.isFrozen(CFB_V2_VERSIONS)).toBe(true);
  });
});

describe("computeCfbV2ConfigHash", () => {
  it("is deterministic for the same input", () => {
    const snapshot = { a: 1, b: [1, 2, 3] };
    expect(computeCfbV2ConfigHash(snapshot)).toBe(computeCfbV2ConfigHash(snapshot));
  });

  it("changes when the input changes (drift detection)", () => {
    expect(computeCfbV2ConfigHash({ a: 1 })).not.toBe(computeCfbV2ConfigHash({ a: 2 }));
  });

  it("has the expected stable format", () => {
    expect(computeCfbV2ConfigHash({ x: true })).toMatch(/^cfb-v2-config-[0-9a-f]{8}$/);
  });
});

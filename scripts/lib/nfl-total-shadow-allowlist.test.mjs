import { describe, expect, it } from "vitest";
import { isAllowedPredictionArchivePath, isAllowedShadowTotalPath } from "./nfl-prediction-archive-allowlist.mjs";

const ROOT = "data/nfl/shadow-predictions/nfl-total-calibration-k08";

describe("shadow total calibration commit-path allowlist", () => {
  it("accepts the shadow partitions, frozen-config manifest and report", () => {
    for (const leaf of ["predictions", "retrospective", "outcomes"]) expect(isAllowedShadowTotalPath(`${ROOT}/2026/03/${leaf}.jsonl`, 2026)).toBe(true);
    expect(isAllowedShadowTotalPath(`${ROOT}/manifest.json`, 2026)).toBe(true);
    expect(isAllowedShadowTotalPath(`${ROOT}/report/latest.json`, 2026)).toBe(true);
    expect(isAllowedShadowTotalPath(`${ROOT}/report/latest.md`, 2026)).toBe(true);
  });

  it("rejects a wrong season, non-padded week, wrong extension, traversal, and any production path", () => {
    expect(isAllowedShadowTotalPath(`${ROOT}/2025/03/predictions.jsonl`, 2026)).toBe(false);
    expect(isAllowedShadowTotalPath(`${ROOT}/2026/3/predictions.jsonl`, 2026)).toBe(false);
    expect(isAllowedShadowTotalPath(`${ROOT}/2026/03/predictionsXjsonl`, 2026)).toBe(false);
    expect(isAllowedShadowTotalPath(`${ROOT}/2026/03/other.jsonl`, 2026)).toBe(false);
    expect(isAllowedShadowTotalPath(`${ROOT}/2026/03/../../../../predictions/2026/03/nfl-total-ridge.jsonl`, 2026)).toBe(false);
    expect(isAllowedShadowTotalPath("data/nfl/predictions/2026/03/nfl-total-ridge.jsonl", 2026)).toBe(false);
    expect(isAllowedShadowTotalPath("public/data/nfl/team-totals.json", 2026)).toBe(false);
  });

  it("does not widen the production prediction-archive allowlist: a shadow file is not a production partition", () => {
    expect(isAllowedPredictionArchivePath("data/nfl/predictions/2026/03/nfl-total-calibration-shadow.jsonl", 2026)).toBe(false);
    expect(isAllowedPredictionArchivePath(`${ROOT}/2026/03/predictions.jsonl`, 2026)).toBe(false);
  });
});

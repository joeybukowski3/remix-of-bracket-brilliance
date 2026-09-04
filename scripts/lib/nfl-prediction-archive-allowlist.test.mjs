import { describe, expect, it } from "vitest";
import {
  isAllowedEvaluationPath,
  isAllowedOutcomePath,
  isAllowedPredictionArchivePath,
} from "./nfl-prediction-archive-allowlist.mjs";

describe("prediction archive commit-path allowlist (WU4C.1 Part 6)", () => {
  it("accepts every WU1 partition the production pipeline can legitimately emit, including WU4A", () => {
    for (const model of ["passing-direct-ridge", "rushing-carries-x-shrunk-ypc", "receiving-targets-x-shrunk-ypt", "team-opportunity"]) {
      expect(isAllowedPredictionArchivePath(`data/nfl/predictions/2026/01/nfl-${model}.jsonl`, 2026)).toBe(true);
    }
    expect(isAllowedPredictionArchivePath(`data/nfl/predictions/manifests/sources/${"a".repeat(64)}.json`, 2026)).toBe(true);
    expect(isAllowedPredictionArchivePath(`data/nfl/predictions/manifests/fitted-models/${"b".repeat(64)}.json`, 2026)).toBe(true);
  });

  it("rejects an unrecognized partition, a wrong season, and a path-traversal attempt", () => {
    expect(isAllowedPredictionArchivePath("data/nfl/predictions/2026/01/nfl-total-points.jsonl", 2026)).toBe(false);
    expect(isAllowedPredictionArchivePath("data/nfl/predictions/2025/01/nfl-team-opportunity.jsonl", 2026)).toBe(false);
    expect(isAllowedPredictionArchivePath("data/nfl/predictions/2026/01/../../secrets.jsonl", 2026)).toBe(false);
    expect(isAllowedPredictionArchivePath("data/nfl/predictions/manifests/sources/not-a-hash.json", 2026)).toBe(false);
  });

  it("accepts every WU2 outcome partition, including team_opportunity, and rejects an unlisted type", () => {
    for (const type of ["spread", "passing", "rushing", "receiving", "team_opportunity"]) {
      expect(isAllowedOutcomePath(`data/nfl/prediction-outcomes/2026/01/${type}.jsonl`, 2026)).toBe(true);
    }
    expect(isAllowedOutcomePath("data/nfl/prediction-outcomes/2026/01/total_points.jsonl", 2026)).toBe(false);
    expect(isAllowedOutcomePath("data/nfl/prediction-outcomes/2025/01/spread.jsonl", 2026)).toBe(false);
  });

  it("accepts every WU3 derived evaluation path and rejects a source/outcome path masquerading as derived", () => {
    for (const type of ["spread", "passing", "rushing", "receiving", "team_opportunity"]) {
      expect(isAllowedEvaluationPath(`data/nfl/prediction-evaluations/jkb-football-evaluation-v1/${type}/2026.jsonl`)).toBe(true);
    }
    expect(isAllowedEvaluationPath("data/nfl/prediction-evaluations/jkb-football-evaluation-v1/resolution-status/2026.jsonl")).toBe(true);
    expect(isAllowedEvaluationPath("data/nfl/prediction-evaluations/jkb-football-evaluation-v1/summary/2026.json")).toBe(true);
    expect(isAllowedEvaluationPath("data/nfl/predictions/2026/01/nfl-team-opportunity.jsonl")).toBe(false);
    expect(isAllowedEvaluationPath("data/nfl/prediction-outcomes/2026/01/spread.jsonl")).toBe(false);
  });

  it("accepts every WU4G forward-evaluation path and rejects an unversioned or mistyped variant", () => {
    for (const type of ["rushing", "receiving"]) {
      expect(isAllowedEvaluationPath(`data/nfl/prediction-evaluations/jkb-football-evaluation-v1/forward-${type}/2026.jsonl`)).toBe(true);
      expect(isAllowedEvaluationPath(`data/nfl/prediction-evaluations/jkb-football-evaluation-v1/forward-${type}-summary/2026.json`)).toBe(true);
    }
    expect(isAllowedEvaluationPath("data/nfl/prediction-evaluations/jkb-football-evaluation-v1/forward-spread/2026.jsonl")).toBe(false);
    expect(isAllowedEvaluationPath("data/nfl/prediction-evaluations/jkb-football-evaluation-v1/forward-rushing-summary/2026.jsonl")).toBe(false);
    expect(isAllowedEvaluationPath("data/nfl/prediction-evaluations/jkb-football-evaluation-v1/forward-rushing/2026.json")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  calculateDraftKingsClassicPassingPoints,
  calculateDraftKingsClassicReceivingPoints,
  calculateDraftKingsClassicRushingPoints,
} from "./nflClassicScoring";

describe("calculateDraftKingsClassicPassingPoints", () => {
  it("scores yards, TDs and INTs with the 300-yard bonus applied", () => {
    // 320 yd * 0.04 + 3 TD * 4 + 1 INT * -1 + 3 bonus = 12.8 + 12 - 1 + 3 = 26.8
    expect(calculateDraftKingsClassicPassingPoints({ passingYards: 320, passingTds: 3, interceptions: 1 })).toBeCloseTo(26.8, 5);
  });
  it("does not apply the 300-yard bonus below the threshold", () => {
    // 299 * 0.04 + 2 * 4 = 11.96 + 8 = 19.96
    expect(calculateDraftKingsClassicPassingPoints({ passingYards: 299, passingTds: 2, interceptions: 0 })).toBeCloseTo(19.96, 5);
  });
});

describe("calculateDraftKingsClassicRushingPoints", () => {
  it("scores yards and TDs with the 100-yard bonus applied", () => {
    // 110 * 0.1 + 1 * 6 + 3 = 11 + 6 + 3 = 20
    expect(calculateDraftKingsClassicRushingPoints({ rushingYards: 110, rushingTds: 1 })).toBeCloseTo(20, 5);
  });
  it("does not apply the bonus below the threshold", () => {
    expect(calculateDraftKingsClassicRushingPoints({ rushingYards: 80, rushingTds: 0 })).toBeCloseTo(8, 5);
  });
});

describe("calculateDraftKingsClassicReceivingPoints", () => {
  it("scores yards, receptions (PPR) and TDs with the 100-yard bonus applied", () => {
    // 120 * 0.1 + 6 * 1 + 1 * 6 + 3 = 12 + 6 + 6 + 3 = 27
    expect(calculateDraftKingsClassicReceivingPoints({ receivingYards: 120, receivingTds: 1, receptions: 6 })).toBeCloseTo(27, 5);
  });
});

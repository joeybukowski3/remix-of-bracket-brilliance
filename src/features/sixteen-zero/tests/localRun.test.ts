import { describe, expect, it } from "vitest";
import { createLocalSimulationRun, generateRandomDraftSlot } from "../engine/createLocalRun";

describe("16-0 local run creation", () => {
  it("creates a genuinely new secure local run on replay", () => {
    const first = createLocalSimulationRun();
    const second = createLocalSimulationRun();
    expect(first.simulationId).not.toBe(second.simulationId);
    expect(first.seed).not.toBe(second.seed);
    expect(first.draftSlot).toBeGreaterThanOrEqual(1);
    expect(first.draftSlot).toBeLessThanOrEqual(12);
    expect(second.draftSlot).toBeGreaterThanOrEqual(1);
    expect(second.draftSlot).toBeLessThanOrEqual(12);
  });

  it("honors an explicitly chosen draft slot from 1-12", () => {
    for (let slot = 1; slot <= 12; slot += 1) {
      const run = createLocalSimulationRun(slot);
      expect(run.draftSlot).toBe(slot);
    }
  });

  it("falls back to a secure random slot when the chosen slot is out of range", () => {
    const run = createLocalSimulationRun(13);
    expect(run.draftSlot).toBeGreaterThanOrEqual(1);
    expect(run.draftSlot).toBeLessThanOrEqual(12);
  });

  it("generates a random draft slot within 1-12", () => {
    for (let index = 0; index < 50; index += 1) {
      const slot = generateRandomDraftSlot();
      expect(slot).toBeGreaterThanOrEqual(1);
      expect(slot).toBeLessThanOrEqual(12);
    }
  });
});


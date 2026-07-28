import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * tournaments.ts resolves its exports at module-evaluation time from the PGA
 * schedule, so each scenario needs a fresh module registry with the schedule
 * date stubbed before import.
 */
async function loadTournaments(dateOverride: string) {
  vi.resetModules();
  window.localStorage.setItem("pga:date-override", dateOverride);
  return import("@/lib/pga/tournaments");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  window.localStorage.removeItem("pga:date-override");
  vi.resetModules();
});

describe("ACTIVE_PGA_MODEL_TOURNAMENT", () => {
  it("is null when the current schedule event has no generated model room", async () => {
    // Rocket Classic week. The generated registry has no rocket-classic entry,
    // so the legacy fallback chain used to serve RBC Heritage 2026 here while
    // Best Bets linked to it labeled "View Rocket Classic model rankings".
    const mod = await loadTournaments("2026-07-28");

    expect(mod.CURRENT_SCHEDULE_TOURNAMENT_SLUG).toBe("rocket-classic-2026-picks");
    expect(mod.ACTIVE_PGA_MODEL_TOURNAMENT).toBeNull();
  });

  it("never silently resolves to an unrelated archived tournament", async () => {
    const mod = await loadTournaments("2026-07-28");

    // The legacy fallback still exists for the board export, and this is
    // precisely the substitution the model-room export must not make.
    expect(mod.ACTIVE_PGA_BOARD_TOURNAMENT.slug).not.toBe(mod.CURRENT_SCHEDULE_TOURNAMENT_SLUG);
    expect(mod.ACTIVE_PGA_MODEL_TOURNAMENT).toBeNull();
  });

  it("resolves to the current event when a matching registry entry exists", async () => {
    // The Open week: the-open-2026-picks IS in the generated registry.
    const mod = await loadTournaments("2026-07-14");

    expect(mod.ACTIVE_PGA_MODEL_TOURNAMENT).not.toBeNull();
    expect(mod.ACTIVE_PGA_MODEL_TOURNAMENT?.slug).toBe(mod.CURRENT_SCHEDULE_TOURNAMENT_SLUG);
  });
});

describe("isCurrentModelTournament", () => {
  it("is false for every tournament when no current model room exists", async () => {
    const mod = await loadTournaments("2026-07-28");

    expect(mod.isCurrentModelTournament("rbc-heritage-2026-picks")).toBe(false);
    expect(mod.isCurrentModelTournament("the-open-2026-picks")).toBe(false);
    expect(mod.isCurrentModelTournament(mod.ACTIVE_PGA_BOARD_TOURNAMENT.slug)).toBe(false);
  });

  it("is true only for the current event's slug", async () => {
    const mod = await loadTournaments("2026-07-14");
    const current = mod.ACTIVE_PGA_MODEL_TOURNAMENT?.slug;

    expect(mod.isCurrentModelTournament(current)).toBe(true);
    expect(mod.isCurrentModelTournament("rbc-heritage-2026-picks")).toBe(false);
  });

  it("is false for nullish input", async () => {
    const mod = await loadTournaments("2026-07-14");

    expect(mod.isCurrentModelTournament(null)).toBe(false);
    expect(mod.isCurrentModelTournament(undefined)).toBe(false);
  });
});

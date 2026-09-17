import { describe, expect, it } from "vitest";
import { buildSlotWideDefenseIndex, type SlotWideDefenseContextArtifact } from "@/lib/nfl/slotWideDefenseContext";

function artifact(teams: SlotWideDefenseContextArtifact["teams"]): SlotWideDefenseContextArtifact {
  return { schemaVersion: "nfl-slot-wide-defense-context-v1", source: "Razzball", sourceUrl: "https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/", season: 2026, generatedAt: "2026-09-11T00:00:00.000Z", teams };
}

describe("buildSlotWideDefenseIndex", () => {
  it("returns an empty map when the artifact has not loaded", () => {
    expect(buildSlotWideDefenseIndex(null).size).toBe(0);
    expect(buildSlotWideDefenseIndex(undefined).size).toBe(0);
  });

  it("keys by normalized team abbreviation, including Razzball's broadcast-style codes", () => {
    const index = buildSlotWideDefenseIndex(artifact([
      { team: "ari", totalPpgAllowed: 25.4, slotPpgAllowed: 10.3, widePpgAllowed: 15.2, slotPct: 0.35, widePct: 0.65, nextOpponent: "cin" },
    ]));
    expect(index.get("ari")).toMatchObject({ slotPpgAllowed: 10.3, widePpgAllowed: 15.2 });
  });
});

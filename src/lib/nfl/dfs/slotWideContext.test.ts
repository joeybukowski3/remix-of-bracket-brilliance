import { describe, expect, it } from "vitest";
import type { SlotWideDefenseContextArtifact } from "@/lib/nfl/slotWideDefenseContext";
import { buildDfsSlotWideContext, resolveDfsOppSlotWideContext } from "@/lib/nfl/dfs/slotWideContext";

function artifact(teams: SlotWideDefenseContextArtifact["teams"]): SlotWideDefenseContextArtifact {
  return { schemaVersion: "nfl-slot-wide-defense-context-v1", source: "Razzball", sourceUrl: "https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/", season: 2026, generatedAt: "2026-09-11T00:00:00.000Z", teams };
}

describe("buildDfsSlotWideContext", () => {
  it("returns an empty map when the artifact has not loaded", () => {
    expect(buildDfsSlotWideContext(null).size).toBe(0);
  });

  it("ranks slot/wide PPG allowed league-wide, 1 = most allowed = most favorable", () => {
    const context = buildDfsSlotWideContext(artifact([
      { team: "det", totalPpgAllowed: 41.2, slotPpgAllowed: 11.9, widePpgAllowed: 29.3, slotPct: 0.29, widePct: 0.71, nextOpponent: "min" },
      { team: "ari", totalPpgAllowed: 25.4, slotPpgAllowed: 10.3, widePpgAllowed: 15.2, slotPct: 0.35, widePct: 0.65, nextOpponent: "cin" },
    ]));
    expect(context.get("det")).toMatchObject({ slotPpgAllowedRank: 1, widePpgAllowedRank: 1, poolSize: 2 });
    expect(context.get("ari")).toMatchObject({ slotPpgAllowedRank: 2, widePpgAllowedRank: 2, poolSize: 2 });
  });
});

describe("resolveDfsOppSlotWideContext", () => {
  const context = buildDfsSlotWideContext(artifact([
    { team: "det", totalPpgAllowed: 41.2, slotPpgAllowed: 11.9, widePpgAllowed: 29.3, slotPct: 0.29, widePct: 0.71, nextOpponent: "min" },
  ]));

  it("resolves the opposing defense's slot/wide context by normalized opponent (broadcast-style codes included)", () => {
    expect(resolveDfsOppSlotWideContext(context, "DET")).toMatchObject({ slotPpgAllowed: 11.9, widePpgAllowed: 29.3, slotPct: 0.29, widePct: 0.71 });
  });

  it("returns null for a missing opponent or an unresolved team", () => {
    expect(resolveDfsOppSlotWideContext(context, null)).toBeNull();
    expect(resolveDfsOppSlotWideContext(context, "XYZ")).toBeNull();
  });
});

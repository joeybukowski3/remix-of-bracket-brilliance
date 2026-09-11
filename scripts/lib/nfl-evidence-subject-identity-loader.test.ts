import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSubjectIdentitySource } from "./nfl-evidence-subject-identity-loader";
import { validateSubjectIdentities } from "./nfl-evidence-subject-identity";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GAME_FACTS = { gameId: "2026_01_BAL_IND", season: 2026, week: 1, homeTeam: "ind", awayTeam: "bal" } as const;

describe("loadSubjectIdentitySource (WU2.2 production loader, real repo data)", () => {
  it("resolves a non-trivial number of IND and BAL players/coaches for the target game", () => {
    const source = loadSubjectIdentitySource(ROOT, GAME_FACTS);

    expect(source.meta?.season).toBe(2026);
    expect(source.meta?.requestedWeek).toBe(1);
    expect(["available", "partial", "stale"]).toContain(source.meta?.status);

    const indPlayers = source.players.filter((p) => p.team === "ind");
    const balPlayers = source.players.filter((p) => p.team === "bal");
    expect(indPlayers.length).toBeGreaterThan(20);
    expect(balPlayers.length).toBeGreaterThan(20);

    const indCoaches = source.coaches.filter((c) => c.team === "ind");
    const balCoaches = source.coaches.filter((c) => c.team === "bal");
    expect(indCoaches).toHaveLength(1);
    expect(balCoaches).toHaveLength(1);
    expect(indCoaches[0].role).toBe("head_coach");
  });

  it("14. real player and coach names from the loader validate against the same names as evidence subjects", () => {
    const source = loadSubjectIdentitySource(ROOT, GAME_FACTS);
    const samplePlayer = source.players.find((p) => p.team === "ind");
    const sampleCoach = source.coaches.find((c) => c.team === "bal");
    expect(samplePlayer).toBeTruthy();
    expect(sampleCoach).toBeTruthy();
    if (!samplePlayer || !sampleCoach) return;

    const validation = validateSubjectIdentities(
      { players: [samplePlayer.canonicalName], coaches: [sampleCoach.canonicalName] },
      { homeTeam: "ind", awayTeam: "bal" },
      source
    );
    expect(validation.players[0].status).toBe("confirmed");
    expect(validation.coaches[0].status).toBe("confirmed");
  });
});

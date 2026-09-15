/**
 * WU7.1 -- regression coverage for validateGameIdentity's team-code comparison.
 * Root cause fixed here: the gameId parser compared its raw <AWAY>/<HOME>
 * tokens against identity.awayTeam/homeTeam as plain lowercased strings, so a
 * gameId spelled with a different (but equally valid) alias of the same
 * franchise -- e.g. "WAS" vs. the canonical "wsh", "LA" vs. the canonical
 * "lar" -- was rejected as blocked, even though nothing was actually wrong.
 * The fix reuses this NFL stack's existing canonical team-code resolver
 * (normalizeNflTeamAbbr, src/lib/nfl/identity/identity.ts -- already used by
 * nfl-fantasy-projection-archive.ts) so both sides of the comparison collapse
 * to the same canonical code before comparing. A genuinely different team
 * must still fail -- this is a narrowing of what counts as "the same value",
 * never a general relaxation of identity validation.
 */
import { describe, expect, it } from "vitest";
import { validateGameIdentity } from "./nfl-game-context-validators";
import type { NflGameContextPacket } from "./nfl-full-game-context";

function packetWithIdentity(overrides: Partial<NflGameContextPacket["identity"]>): NflGameContextPacket {
  return {
    identity: {
      gameId: "2026_02_DET_BUF",
      season: 2026,
      week: 2,
      seasonType: "REG",
      homeTeam: "buf",
      awayTeam: "det",
      homeTeamFull: "Buffalo Bills",
      awayTeamFull: "Detroit Lions",
      ...overrides,
    },
  } as unknown as NflGameContextPacket;
}

describe("validateGameIdentity -- team-code alias normalization", () => {
  it("accepts a gameId spelled WAS when identity.awayTeam is the canonical wsh", () => {
    const packet = packetWithIdentity({ gameId: "2026_02_WAS_DAL", awayTeam: "wsh", homeTeam: "dal" });
    expect(validateGameIdentity(packet)).toEqual([]);
  });

  it("accepts a gameId spelled LA when identity.homeTeam is the canonical lar", () => {
    const packet = packetWithIdentity({ gameId: "2026_02_NYG_LA", awayTeam: "nyg", homeTeam: "lar" });
    expect(validateGameIdentity(packet)).toEqual([]);
  });

  it("accepts canonically identical codes with no aliasing involved", () => {
    const packet = packetWithIdentity({ gameId: "2026_02_DET_BUF", awayTeam: "det", homeTeam: "buf" });
    expect(validateGameIdentity(packet)).toEqual([]);
  });

  it("still rejects a genuine team mismatch on the away side", () => {
    const packet = packetWithIdentity({ gameId: "2026_02_DET_BUF", awayTeam: "kc", homeTeam: "buf" });
    const issues = validateGameIdentity(packet);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("identity.gameId.away");
  });

  it("still rejects a genuine team mismatch on the home side", () => {
    const packet = packetWithIdentity({ gameId: "2026_02_DET_BUF", awayTeam: "det", homeTeam: "kc" });
    const issues = validateGameIdentity(packet);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("identity.gameId.home");
  });

  it("does not let alias normalization mask an unrelated season/week mismatch", () => {
    const packet = packetWithIdentity({ gameId: "2026_02_WAS_DAL", season: 2025, awayTeam: "wsh", homeTeam: "dal" });
    const issues = validateGameIdentity(packet);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("identity.gameId.season");
  });
});

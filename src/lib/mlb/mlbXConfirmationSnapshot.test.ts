import { describe, expect, it } from "vitest";
import {
  buildConfirmationSnapshot,
  findGameForTeam,
  resolveHrRowFacts,
  resolveKRowFacts,
  resolveNumerologyFacts,
} from "../../../scripts/lib/mlb-x-confirmation-snapshot.mjs";

function confirmedLineup(ids: number[]) {
  return { confirmed: ids.length >= 9, batters: ids.map((id, i) => ({ id, name: `Player ${id}`, battingOrder: i + 1 })) };
}

function snapshot() {
  return {
    ok: true,
    games: [
      {
        gamePk: 1,
        started: false,
        awayAbbr: "PHI",
        homeAbbr: "DET",
        awayStarter: { id: 111, name: "Zack Wheeler" },
        homeStarter: { id: 222, name: "Tarik Skubal" },
        awayLineup: confirmedLineup([10, 11, 12, 13, 14, 15, 16, 17, 18]),
        homeLineup: { confirmed: false, batters: [] },
      },
    ],
  };
}

describe("findGameForTeam", () => {
  it("locates the game and side for a team abbreviation (with alias tolerance)", () => {
    expect(findGameForTeam(snapshot(), "PHI")?.side).toBe("away");
    expect(findGameForTeam(snapshot(), "DET")?.side).toBe("home");
    expect(findGameForTeam(snapshot(), "NYY")).toBeNull();
  });
});

describe("resolveHrRowFacts", () => {
  it("confirms a hitter present in the live confirmed lineup", () => {
    const facts = resolveHrRowFacts(snapshot(), { team: "PHI", playerId: 12, player: "Player 12" });
    expect(facts.gameStarted).toBe(false);
    expect(facts.liveConfirmed).toBe(true);
  });

  it("fails closed (liveConfirmed=false) for a hitter missing from a confirmed lineup", () => {
    const facts = resolveHrRowFacts(snapshot(), { team: "PHI", playerId: 999, player: "Nobody" });
    expect(facts.liveConfirmed).toBe(false);
  });

  it("defers (liveConfirmed=null) when the side's lineup is not yet confirmed", () => {
    const facts = resolveHrRowFacts(snapshot(), { team: "DET", playerId: 50, player: "Player 50" });
    expect(facts.liveConfirmed).toBeNull();
  });
});

describe("resolveKRowFacts", () => {
  it("confirms the current starter and reads opposing-lineup confirmation", () => {
    // PHI pitcher Wheeler; opponent DET lineup NOT confirmed.
    const facts = resolveKRowFacts(snapshot(), { team: "PHI", opponent: "DET", pitcher: "Zack Wheeler", pitcherId: 111 });
    expect(facts.isCurrentStarter).toBe(true);
    expect(facts.opposingLineupConfirmed).toBe(false);
  });

  it("DET pitcher's opposing lineup (PHI) is confirmed", () => {
    const facts = resolveKRowFacts(snapshot(), { team: "DET", opponent: "PHI", pitcher: "Tarik Skubal", pitcherId: 222 });
    expect(facts.isCurrentStarter).toBe(true);
    expect(facts.opposingLineupConfirmed).toBe(true);
  });

  it("flags a replaced starter as not current", () => {
    const facts = resolveKRowFacts(snapshot(), { team: "PHI", opponent: "DET", pitcher: "Somebody Else", pitcherId: 777 });
    expect(facts.isCurrentStarter).toBe(false);
  });
});

describe("resolveNumerologyFacts", () => {
  it("resolves hitter confirmation and starter status by team", () => {
    const hitter = resolveNumerologyFacts(snapshot(), { team: "PHI", playerId: 12, playerName: "Player 12" });
    expect(hitter.hitterLiveConfirmed).toBe(true);
    const pitcher = resolveNumerologyFacts(snapshot(), { team: "PHI", playerId: 111, playerName: "Zack Wheeler" });
    expect(pitcher.isCurrentStarter).toBe(true);
  });
});

describe("buildConfirmationSnapshot", () => {
  const now = new Date("2026-07-15T15:00:00Z");

  function makeFetch() {
    return async (url: string) => {
      if (url.includes("/schedule")) {
        return {
          ok: true,
          json: async () => ({
            dates: [
              {
                games: [
                  {
                    gamePk: 1,
                    gameDate: new Date(now.getTime() + 75 * 60_000).toISOString(),
                    status: { detailedState: "Scheduled", abstractGameState: "Preview" },
                    teams: {
                      away: { team: { abbreviation: "PHI" }, probablePitcher: { id: 111, fullName: "Zack Wheeler" } },
                      home: { team: { abbreviation: "DET" }, probablePitcher: { id: 222, fullName: "Tarik Skubal" } },
                    },
                  },
                ],
              },
            ],
          }),
        } as unknown as Response;
      }
      // boxscore
      return {
        ok: true,
        json: async () => ({
          teams: {
            away: {
              battingOrder: [10, 11, 12, 13, 14, 15, 16, 17, 18],
              players: Object.fromEntries([10, 11, 12, 13, 14, 15, 16, 17, 18].map((id) => [`ID${id}`, { person: { fullName: `Player ${id}` } }])),
            },
            home: { battingOrder: [], players: {} },
          },
        }),
      } as unknown as Response;
    };
  }

  it("composes schedule + boxscores into a live snapshot", async () => {
    const snap = await buildConfirmationSnapshot({ date: "2026-07-15", now, fetchImpl: makeFetch() });
    expect(snap.ok).toBe(true);
    expect(snap.timing.phase).toBe("PREFERRED");
    expect(snap.games).toHaveLength(1);
    expect(snap.games[0].awayLineup.confirmed).toBe(true);
    expect(snap.games[0].homeLineup.confirmed).toBe(false);
    expect(snap.games[0].awayStarter.name).toBe("Zack Wheeler");
    // end-to-end resolver against the live snapshot
    expect(resolveKRowFacts(snap, { team: "PHI", opponent: "DET", pitcher: "Zack Wheeler", pitcherId: 111 }).isCurrentStarter).toBe(true);
  });

  it("fails closed on a schedule fetch error", async () => {
    const failing = async () => {
      throw new Error("network down");
    };
    const snap = await buildConfirmationSnapshot({ date: "2026-07-15", now, fetchImpl: failing });
    expect(snap.ok).toBe(false);
    expect(snap.error).toBe("network down");
    expect(snap.games).toHaveLength(0);
  });
});

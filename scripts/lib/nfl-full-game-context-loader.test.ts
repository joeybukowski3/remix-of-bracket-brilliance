import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadFreshGameContextPacket } from "./nfl-full-game-context-loader";

let root: string;

const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;

const GAMES_ARTIFACT = {
  games: [
    {
      gameId: GAME_ID,
      season: SEASON,
      week: WEEK,
      seasonType: "REG",
      dateUtc: "2026-09-13T17:00:00.000Z",
      homeTeam: "Indianapolis Colts",
      awayTeam: "Baltimore Ravens",
      homeAbbr: "ind",
      awayAbbr: "bal",
      status: "scheduled",
      stadium: "Lucas Oil Stadium",
      isDome: false,
      neutralSite: false,
    },
  ],
};

const TEAMS_ARTIFACT = {
  teams: [
    { id: "nfl-ind", slug: "indianapolis-colts", abbr: "ind", nflverseAbbr: "IND", name: "Indianapolis Colts", fullName: "Indianapolis Colts", shortName: "Colts", conference: "AFC", division: "AFC South", primaryColor: "#002c5f", logoUrl: "", isDome: false, latitude: 39.76, longitude: -86.16 },
    { id: "nfl-bal", slug: "baltimore-ravens", abbr: "bal", nflverseAbbr: "BAL", name: "Baltimore Ravens", fullName: "Baltimore Ravens", shortName: "Ravens", conference: "AFC", division: "AFC North", primaryColor: "#241773", logoUrl: "", isDome: false, latitude: 39.28, longitude: -76.62 },
  ],
};

function bettingLinesCurrentArtifact(homeLine: number, generatedAt: string) {
  return {
    schemaVersion: "jkb-betting-lines-current-v1",
    generatedAt,
    games: [
      {
        league: "nfl",
        season: SEASON,
        week: WEEK,
        jkbGameId: GAME_ID,
        awayTeamId: "bal",
        homeTeamId: "ind",
        kickoffUtc: "2026-09-13T17:00:00.000Z",
        books: [
          {
            provider: "the-odds-api",
            providerEventId: "fixture-event-1",
            sportsbook: "draftkings",
            capturedAt: generatedAt,
            providerUpdatedAt: generatedAt,
            firstObservedAt: generatedAt,
            lastObservedAt: generatedAt,
            contentHash: "fixturehash",
            spread: { homeLine, awayLine: -homeLine, homePrice: -110, awayPrice: -110 },
            total: { line: 47.5, overPrice: -110, underPrice: -110 },
            moneyline: { homePrice: 140, awayPrice: -160 },
          },
        ],
      },
    ],
  };
}

function writeArtifacts(homeLine: number, generatedAt: string): void {
  mkdirSync(join(root, "public", "data", "nfl", String(SEASON)), { recursive: true });
  mkdirSync(join(root, "public", "data", "market"), { recursive: true });
  writeFileSync(join(root, "public", "data", "nfl", String(SEASON), "games.json"), JSON.stringify(GAMES_ARTIFACT));
  writeFileSync(join(root, "public", "data", "nfl", "teams.json"), JSON.stringify(TEAMS_ARTIFACT));
  writeFileSync(join(root, "public", "data", "market", "betting-lines-current.json"), JSON.stringify(bettingLinesCurrentArtifact(homeLine, generatedAt)));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nfl-context-loader-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("loadFreshGameContextPacket (WU3.3.1)", () => {
  it("6. builds a fresh packet by reading current repo artifacts off disk, not a stale fixture", () => {
    writeArtifacts(3.5, "2026-09-11T14:00:00.000Z");
    const first = loadFreshGameContextPacket({ root, gameId: GAME_ID, season: SEASON, week: WEEK, now: () => new Date("2026-09-11T15:00:00.000Z") });
    expect(first.result.status).toBe("ok");
    if (first.result.status !== "ok") return;
    expect(first.result.packet.market.spread.homeLine).toBe(3.5);
    expect(first.result.packet.generatedAt).toBe("2026-09-11T15:00:00.000Z");

    // Change the underlying upstream artifact on disk, then load again -- the loader must reflect
    // the NEW value, proving it re-reads from disk every call rather than returning a cached/stale packet.
    writeArtifacts(2.5, "2026-09-12T14:00:00.000Z");
    const second = loadFreshGameContextPacket({ root, gameId: GAME_ID, season: SEASON, week: WEEK, now: () => new Date("2026-09-12T15:00:00.000Z") });
    expect(second.result.status).toBe("ok");
    if (second.result.status !== "ok") return;
    expect(second.result.packet.market.spread.homeLine).toBe(2.5);
    expect(second.result.packet.generatedAt).toBe("2026-09-12T15:00:00.000Z");
  });

  it("stamps generatedAt/provenance.builtAt with the call-time timestamp, never a cached value", () => {
    writeArtifacts(3, "2026-09-11T14:00:00.000Z");
    const { result } = loadFreshGameContextPacket({ root, gameId: GAME_ID, season: SEASON, week: WEEK, now: () => new Date("2026-09-11T18:30:00.000Z") });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.packet.generatedAt).toBe("2026-09-11T18:30:00.000Z");
    expect(result.packet.provenance.builtAt).toBe("2026-09-11T18:30:00.000Z");
  });

  it("degrades gracefully (market unavailable) when the upstream betting-lines file is absent, without throwing", () => {
    mkdirSync(join(root, "public", "data", "nfl", String(SEASON)), { recursive: true });
    writeFileSync(join(root, "public", "data", "nfl", String(SEASON), "games.json"), JSON.stringify(GAMES_ARTIFACT));
    writeFileSync(join(root, "public", "data", "nfl", "teams.json"), JSON.stringify(TEAMS_ARTIFACT));
    const { result } = loadFreshGameContextPacket({ root, gameId: GAME_ID, season: SEASON, week: WEEK });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.packet.market.provenance_status).toBe("unavailable");
  });

  it("returns an error status for an unknown gameId rather than fabricating identity", () => {
    writeArtifacts(3, "2026-09-11T14:00:00.000Z");
    const { result } = loadFreshGameContextPacket({ root, gameId: "2026_99_XXX_YYY", season: SEASON, week: WEEK });
    expect(result.status).toBe("error");
  });
});

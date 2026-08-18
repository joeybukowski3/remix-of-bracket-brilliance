/**
 * mlb-x-confirmation.test.mjs
 * Run via: node --test scripts/lib/mlb-x-confirmation.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchScheduleWithStarters, isDoubleheaderCode } from "./mlb-x-confirmation.mjs";

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => value };
}

function fetchImplFor(schedule) {
  return async () => jsonResponse(schedule);
}

describe("isDoubleheaderCode", () => {
  it("is true for Y and S", () => {
    assert.equal(isDoubleheaderCode("Y"), true);
    assert.equal(isDoubleheaderCode("S"), true);
  });

  it("is false for N and unknown/missing values", () => {
    assert.equal(isDoubleheaderCode("N"), false);
    assert.equal(isDoubleheaderCode(null), false);
    assert.equal(isDoubleheaderCode(undefined), false);
    assert.equal(isDoubleheaderCode(""), false);
  });
});

describe("fetchScheduleWithStarters normalization", () => {
  it("normalizes a normal single game with gameNumber 1 and doubleHeader N", async () => {
    const schedule = {
      dates: [
        {
          games: [
            {
              gamePk: 100,
              gameDate: "2026-08-18T23:05:00Z",
              gameNumber: 1,
              doubleHeader: "N",
              status: { abstractGameState: "Preview", detailedState: "Scheduled" },
              teams: {
                away: { team: { abbreviation: "NYY" }, probablePitcher: { id: 11, fullName: "Away Starter" } },
                home: { team: { abbreviation: "BOS" }, probablePitcher: { id: 22, fullName: "Home Starter" } },
              },
            },
          ],
        },
      ],
    };

    const games = await fetchScheduleWithStarters({ date: "2026-08-18", fetchImpl: fetchImplFor(schedule) });
    assert.equal(games.length, 1);
    assert.equal(games[0].gamePk, 100);
    assert.equal(games[0].gameDate, "2026-08-18T23:05:00Z");
    assert.equal(games[0].gameNumber, 1);
    assert.equal(games[0].doubleHeader, "N");
    assert.equal(isDoubleheaderCode(games[0].doubleHeader), false);
  });

  it("normalizes a doubleheader into two distinct games with matching teams but different gamePk/gameNumber", async () => {
    const schedule = {
      dates: [
        {
          games: [
            {
              gamePk: 201,
              gameDate: "2026-08-18T17:05:00Z",
              gameNumber: 1,
              doubleHeader: "Y",
              status: { abstractGameState: "Preview", detailedState: "Scheduled" },
              teams: {
                away: { team: { abbreviation: "NYY" }, probablePitcher: { id: 11, fullName: "Away Starter G1" } },
                home: { team: { abbreviation: "BOS" }, probablePitcher: { id: 22, fullName: "Home Starter G1" } },
              },
            },
            {
              gamePk: 202,
              gameDate: "2026-08-18T21:05:00Z",
              gameNumber: 2,
              doubleHeader: "Y",
              status: { abstractGameState: "Preview", detailedState: "Scheduled" },
              teams: {
                away: { team: { abbreviation: "NYY" }, probablePitcher: { id: 33, fullName: "Away Starter G2" } },
                home: { team: { abbreviation: "BOS" }, probablePitcher: { id: 44, fullName: "Home Starter G2" } },
              },
            },
          ],
        },
      ],
    };

    const games = await fetchScheduleWithStarters({ date: "2026-08-18", fetchImpl: fetchImplFor(schedule) });
    assert.equal(games.length, 2);
    assert.equal(games[0].gamePk, 201);
    assert.equal(games[0].gameNumber, 1);
    assert.equal(games[0].doubleHeader, "Y");
    assert.equal(games[1].gamePk, 202);
    assert.equal(games[1].gameNumber, 2);
    assert.equal(games[1].doubleHeader, "Y");
    assert.equal(isDoubleheaderCode(games[0].doubleHeader), true);
    assert.equal(isDoubleheaderCode(games[1].doubleHeader), true);
    assert.notEqual(games[0].gamePk, games[1].gamePk);
  });

  it("normalizes a missing/non-integer gameNumber to null rather than fabricating one", async () => {
    const schedule = {
      dates: [
        {
          games: [
            {
              gamePk: 300,
              gameDate: "2026-08-18T23:05:00Z",
              gameNumber: null,
              doubleHeader: undefined,
              status: { abstractGameState: "Preview", detailedState: "Scheduled" },
              teams: {
                away: { team: { abbreviation: "TEX" }, probablePitcher: {} },
                home: { team: { abbreviation: "HOU" }, probablePitcher: {} },
              },
            },
          ],
        },
      ],
    };

    const games = await fetchScheduleWithStarters({ date: "2026-08-18", fetchImpl: fetchImplFor(schedule) });
    assert.equal(games[0].gameNumber, null);
    assert.equal(games[0].doubleHeader, null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PHASE2C_TREND_IDS,
  PHASE2C_WEEK1_TREND_IDS,
  PHASE2C_WEEK2_TREND_IDS,
  currentRoleVariantId,
  currentVenueVariantId,
  isWeek1FavoriteAtsLoss,
  isWeek1FavoriteLostOutright,
  isWeek1UnderdogWonOutright,
  marginAtLeast,
  priorSeasonPlayoffStatus,
  priorSeasonRecordRole,
  week1StartRecord,
} from "./nfl-situational-trends-phase2c-core.mjs";

describe("NFL situational trends Phase 2C trend inventory", () => {
  it("declares exactly the predeclared Week 1 and Week 2 trend families with no duplicates", () => {
    assert.equal(PHASE2C_WEEK1_TREND_IDS.length, 13);
    assert.equal(PHASE2C_WEEK2_TREND_IDS.length, 18);
    assert.equal(PHASE2C_TREND_IDS.length, 31);
    assert.equal(new Set(PHASE2C_TREND_IDS).size, 31);
  });
});

describe("NFL situational trends Phase 2C current-game role and venue variants", () => {
  it("classifies current market role, excluding pick'em and unavailable spreads", () => {
    assert.equal(currentRoleVariantId(-3), "current-favorite");
    assert.equal(currentRoleVariantId(3), "current-underdog");
    assert.equal(currentRoleVariantId(0), null);
    assert.equal(currentRoleVariantId(null), null);
  });

  it("classifies current venue", () => {
    assert.equal(currentVenueVariantId("home"), "current-home");
    assert.equal(currentVenueVariantId("away"), "current-road");
    assert.equal(currentVenueVariantId("neutral"), null);
  });
});

describe("NFL situational trends Phase 2C prior-season record and playoff status", () => {
  it("classifies a deterministic winning or losing prior-season record and excludes exact .500 or unknown records", () => {
    assert.equal(priorSeasonRecordRole({ wins: 10, losses: 7 }), "winning");
    assert.equal(priorSeasonRecordRole({ wins: 7, losses: 10 }), "losing");
    assert.equal(priorSeasonRecordRole({ wins: 8, losses: 8 }), null);
    assert.equal(priorSeasonRecordRole(null), null);
    assert.equal(priorSeasonRecordRole({ wins: null, losses: 4 }), null);
  });

  it("classifies prior-season playoff participation only from a known boolean", () => {
    assert.equal(priorSeasonPlayoffStatus(true), "playoff");
    assert.equal(priorSeasonPlayoffStatus(false), "non-playoff");
    assert.equal(priorSeasonPlayoffStatus(null), null);
    assert.equal(priorSeasonPlayoffStatus(undefined), null);
  });
});

describe("NFL situational trends Phase 2C Week 1 -> Week 2 bounce-back classifications", () => {
  it("derives the Week 2 start-of-season record label from the Week 1 SU result", () => {
    assert.equal(week1StartRecord("W"), "1-0");
    assert.equal(week1StartRecord("L"), "0-1");
    assert.equal(week1StartRecord("T"), null);
    assert.equal(week1StartRecord(null), null);
  });

  it("requires at least the fixed magnitude for win/loss margin bands", () => {
    assert.equal(marginAtLeast(10, 10), true);
    assert.equal(marginAtLeast(-10, 10), true);
    assert.equal(marginAtLeast(9, 10), false);
    assert.equal(marginAtLeast(null, 10), false);
  });

  it("identifies a Week 1 favorite that failed to cover", () => {
    assert.equal(isWeek1FavoriteAtsLoss({ previousTeamSpread: -3, previousAtsResult: "L" }), true);
    assert.equal(isWeek1FavoriteAtsLoss({ previousTeamSpread: -3, previousAtsResult: "W" }), false);
    assert.equal(isWeek1FavoriteAtsLoss({ previousTeamSpread: 3, previousAtsResult: "L" }), false);
  });

  it("identifies a Week 1 favorite that lost outright and an underdog that won outright", () => {
    assert.equal(isWeek1FavoriteLostOutright({ previousTeamSpread: -3, previousPointMargin: -1 }), true);
    assert.equal(isWeek1FavoriteLostOutright({ previousTeamSpread: -3, previousPointMargin: 1 }), false);
    assert.equal(isWeek1FavoriteLostOutright({ previousTeamSpread: 3, previousPointMargin: -1 }), false);
    assert.equal(isWeek1UnderdogWonOutright({ previousTeamSpread: 3, previousPointMargin: 1 }), true);
    assert.equal(isWeek1UnderdogWonOutright({ previousTeamSpread: 3, previousPointMargin: -1 }), false);
    assert.equal(isWeek1UnderdogWonOutright({ previousTeamSpread: -3, previousPointMargin: 1 }), false);
  });
});

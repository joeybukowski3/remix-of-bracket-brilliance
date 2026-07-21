/**
 * pga-post-open-angles.test.mjs
 * Run via: node --test scripts/lib/pga-post-open-angles.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPostOpenAngles,
  classifyFedExCupStatus,
  FedExCupStatus,
  isPostOpenWindow,
  OpenResultTier,
  ScottishOpenParticipation,
} from "./pga-post-open-angles.mjs";

function round(player, eventName, { round: roundNum, finishPosition = null, status = "finished", eventDate = "2026-07-19" } = {}) {
  return { player, eventName, eventDate, round: roundNum, finishPosition, status };
}

function fourFinishedRounds(player, eventName, finishPosition, eventDate) {
  return [1, 2, 3, 4].map((r) => round(player, eventName, { round: r, finishPosition, status: "finished", eventDate }));
}

function twoMissedCutRounds(player, eventName, eventDate) {
  return [1, 2].map((r) => round(player, eventName, { round: r, finishPosition: null, status: "missed_cut", eventDate }));
}

describe("buildPostOpenAngles: Open Championship result tiers", () => {
  const cases = [
    [3, OpenResultTier.TOP_5],
    [5, OpenResultTier.TOP_5],
    [8, OpenResultTier.TOP_10],
    [10, OpenResultTier.TOP_10],
    [15, OpenResultTier.T11_20],
    [20, OpenResultTier.T11_20],
    [30, OpenResultTier.T21_40],
    [40, OpenResultTier.T21_40],
    [55, OpenResultTier.T41_PLUS],
  ];
  for (const [position, expected] of cases) {
    it(`finish position ${position} classifies as ${expected}`, () => {
      const rounds = fourFinishedRounds("Test Player", "The Open Championship", position);
      const angles = buildPostOpenAngles("Test Player", { rounds });
      assert.equal(angles.openResult, expected);
    });
  }

  it("classifies a missed cut", () => {
    const rounds = twoMissedCutRounds("Test Player", "The Open Championship");
    const angles = buildPostOpenAngles("Test Player", { rounds });
    assert.equal(angles.openResult, OpenResultTier.MISSED_CUT);
  });

  it("classifies did-not-play when the player has zero Open Championship rounds", () => {
    const angles = buildPostOpenAngles("Never Played", { rounds: [] });
    assert.equal(angles.openResult, OpenResultTier.DID_NOT_PLAY);
  });

  it("never fabricates a finish for a withdrawal (round exists, no finishPosition, not missed_cut)", () => {
    const rounds = [round("WD Player", "The Open Championship", { round: 1, status: "withdrawn", finishPosition: null })];
    const angles = buildPostOpenAngles("WD Player", { rounds });
    assert.equal(angles.openResult, OpenResultTier.DID_NOT_PLAY);
  });

  it("ignores a historical namesake event before sinceDate", () => {
    const rounds = fourFinishedRounds("Test Player", "The Open Championship", 2, "2019-07-20");
    const angles = buildPostOpenAngles("Test Player", { rounds, sinceDate: "2026-01-01" });
    assert.equal(angles.openResult, OpenResultTier.DID_NOT_PLAY);
  });
});

describe("buildPostOpenAngles: Scottish Open participation", () => {
  it("played and made the cut", () => {
    const rounds = fourFinishedRounds("Test Player", "Genesis Scottish Open", 12);
    const angles = buildPostOpenAngles("Test Player", { rounds });
    assert.equal(angles.scottishOpen, ScottishOpenParticipation.PLAYED_MADE_CUT);
  });

  it("played and missed the cut", () => {
    const rounds = twoMissedCutRounds("Test Player", "Genesis Scottish Open");
    const angles = buildPostOpenAngles("Test Player", { rounds });
    assert.equal(angles.scottishOpen, ScottishOpenParticipation.PLAYED_MISSED_CUT);
  });

  it("skipped entirely", () => {
    const angles = buildPostOpenAngles("Test Player", { rounds: [] });
    assert.equal(angles.scottishOpen, ScottishOpenParticipation.SKIPPED);
  });

  it("matches a differently-sponsored Scottish Open name (sponsor changes year to year)", () => {
    const rounds = fourFinishedRounds("Test Player", "Aberdeen Standard Investments Scottish Open", 20);
    const angles = buildPostOpenAngles("Test Player", { rounds });
    assert.equal(angles.scottishOpen, ScottishOpenParticipation.PLAYED_MADE_CUT);
  });
});

describe("buildPostOpenAngles: two-week workload", () => {
  it("sums rounds across both events (4 + 4 = 8)", () => {
    const rounds = [
      ...fourFinishedRounds("Test Player", "The Open Championship", 10),
      ...fourFinishedRounds("Test Player", "Genesis Scottish Open", 20),
    ];
    const angles = buildPostOpenAngles("Test Player", { rounds });
    assert.equal(angles.workloadRoundCount, 8);
  });

  it("counts only the Open when Scottish Open was skipped (4)", () => {
    const rounds = fourFinishedRounds("Test Player", "The Open Championship", 10);
    const angles = buildPostOpenAngles("Test Player", { rounds });
    assert.equal(angles.workloadRoundCount, 4);
  });

  it("counts a missed cut as 2 rounds", () => {
    const rounds = twoMissedCutRounds("Test Player", "The Open Championship");
    const angles = buildPostOpenAngles("Test Player", { rounds });
    assert.equal(angles.workloadRoundCount, 2);
  });

  it("is zero when the player played neither event", () => {
    const angles = buildPostOpenAngles("Test Player", { rounds: [] });
    assert.equal(angles.workloadRoundCount, 0);
  });
});

describe("classifyFedExCupStatus", () => {
  const standings = [
    { player: "Leader Player", rank: 1 },
    { player: "Safe Player", rank: 50 },
    { player: "Bubble Low", rank: 51 },
    { player: "Bubble High", rank: 80 },
    { player: "Chasing Player", rank: 81 },
  ];

  it("classifies rank 1-50 as safe", () => {
    assert.equal(classifyFedExCupStatus(standings, "Safe Player").status, FedExCupStatus.SAFE);
  });

  it("classifies rank 51-80 as bubble", () => {
    assert.equal(classifyFedExCupStatus(standings, "Bubble Low").status, FedExCupStatus.BUBBLE);
    assert.equal(classifyFedExCupStatus(standings, "Bubble High").status, FedExCupStatus.BUBBLE);
  });

  it("classifies rank 81+ as chasing", () => {
    assert.equal(classifyFedExCupStatus(standings, "Chasing Player").status, FedExCupStatus.CHASING);
  });

  it("never invents a rank for a player absent from standings -- unranked, not a guess", () => {
    const result = classifyFedExCupStatus(standings, "Not In Standings At All");
    assert.equal(result.status, FedExCupStatus.UNRANKED);
    assert.equal(result.rank, null);
  });

  it("is unranked (not a fabricated rank) when the standings source itself is unavailable", () => {
    const result = classifyFedExCupStatus([], "Safe Player");
    assert.equal(result.status, FedExCupStatus.UNRANKED);
  });

  it("uses the exact provided rank, never a recomputed or estimated one", () => {
    const result = classifyFedExCupStatus(standings, "Leader Player");
    assert.equal(result.rank, 1);
  });
});

describe("isPostOpenWindow", () => {
  const openRounds = fourFinishedRounds("Someone", "The Open Championship", 10, "2026-07-19");

  it("is true for the 3M Open, the week immediately after the Open Championship", () => {
    assert.equal(isPostOpenWindow(openRounds, "2026-07-23"), true);
  });

  it("is false for a tournament several weeks later (outside the window)", () => {
    assert.equal(isPostOpenWindow(openRounds, "2026-09-15"), false);
  });

  it("is false when no Open Championship rounds exist in the data at all", () => {
    assert.equal(isPostOpenWindow([], "2026-07-23"), false);
  });

  it("is false when the current tournament's start date is missing", () => {
    assert.equal(isPostOpenWindow(openRounds, null), false);
  });

  it("is false for a tournament that starts before the Open (not 'after' it)", () => {
    assert.equal(isPostOpenWindow(openRounds, "2026-07-10"), false);
  });
});

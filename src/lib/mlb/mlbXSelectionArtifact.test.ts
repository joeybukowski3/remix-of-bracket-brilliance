import { describe, expect, it } from "vitest";
import {
  ARTIFACT_MISMATCH_STATUS,
  assertArtifactConsistency,
  buildHrArtifact,
  buildKArtifact,
  decodeArtifact,
  encodeArtifact,
  getRowIdentity,
  validateArtifact,
} from "../../../scripts/lib/mlb-x-selection-artifact.mjs";

const snapshot = {
  ok: true,
  asOf: "2026-07-12T15:00:00.000Z",
  timing: { earliestGameTime: "2026-07-12T17:00:00.000Z", minutesUntilFirstPitch: 75, phase: "PREFERRED" },
};

function hrArtifact() {
  return buildHrArtifact({
    slateDate: "2026-07-12",
    snapshot,
    selectionStatus: "READY_CONFIRMED_SELECTIONS",
    selectedRows: [
      { player: "Aaron Judge", team: "nyy", opponent: "bos", battingOrder: 2, hrScore: 41.3, hrOddsYes: "+280", playerId: 592450, gameId: 745001 },
      { player: "Kyle Schwarber", team: "phi", opponent: "det", battingOrder: 1, hrScore: 38.9, hrOddsYes: "+320", playerId: 656941, gameId: 745002 },
    ],
  });
}

function kArtifact() {
  return buildKArtifact({
    slateDate: "2026-07-12",
    snapshot,
    selectionStatus: "READY_CONFIRMED_SELECTIONS",
    selectedRows: [
      { pitcher: "Tarik Skubal", team: "det", opponent: "phi", direction: "over", kLine: 7.5, oddsOver: "-120", oddsUnder: "+100", projectedKs: 9.3, projectionEdge: 1.8, pitcherId: 669373, gameId: 745002 },
    ],
  });
}

describe("encode/decode round trip", () => {
  it("survives a round trip including unicode names", () => {
    const artifact = buildHrArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [{ player: "José Ramírez", team: "cle", opponent: "min", battingOrder: 3, hrScore: 33.1, hrOddsYes: "+400", playerId: 608070, gameId: 745003 }],
    });
    const decoded = decodeArtifact(encodeArtifact(artifact));
    expect(decoded.rows[0].player).toBe("José Ramírez");
    expect(decoded.rows[0].playerId).toBe(608070);
  });

  it("rejects a malformed encoded payload", () => {
    expect(() => decodeArtifact("not-base64!!")).toThrow();
  });
});

describe("getRowIdentity", () => {
  it("stringifies numeric ids so artifact and scraped-DOM identities match", () => {
    expect(getRowIdentity("hr", { playerId: 592450, gameId: 745001 })).toBe("592450|745001");
    expect(getRowIdentity("hr", { playerId: "592450", gameId: "745001" })).toBe("592450|745001");
    expect(getRowIdentity("k", { pitcherId: 669373, gameId: 745002, side: "over" })).toBe("669373|745002|OVER");
  });
});

describe("validateArtifact fails closed", () => {
  it("passes a fresh, well-formed artifact", () => {
    expect(validateArtifact(hrArtifact(), { slateDate: "2026-07-12", now: new Date("2026-07-12T15:05:00Z") })).toBe("");
  });

  it("rejects a wrong slate date", () => {
    expect(validateArtifact(hrArtifact(), { slateDate: "2026-07-13", now: new Date("2026-07-12T15:05:00Z") })).toMatch(/slate date/i);
  });

  it("rejects a stale confirmation timestamp", () => {
    const stale = validateArtifact(hrArtifact(), { slateDate: "2026-07-12", now: new Date("2026-07-12T16:00:00Z"), maxAgeMinutes: 20 });
    expect(stale).toMatch(/stale/i);
  });

  it("rejects duplicate row identities", () => {
    const artifact = hrArtifact();
    artifact.rows.push({ ...artifact.rows[0] });
    expect(validateArtifact(artifact, { slateDate: "2026-07-12", now: new Date("2026-07-12T15:05:00Z") })).toMatch(/duplicate/i);
  });

  it("rejects a missing confirmation timestamp", () => {
    const artifact = hrArtifact();
    artifact.confirmationAsOf = null;
    expect(validateArtifact(artifact, { slateDate: "2026-07-12", now: new Date("2026-07-12T15:05:00Z") })).toMatch(/confirmationAsOf/i);
  });
});

describe("assertArtifactConsistency", () => {
  it("passes when rendered + caption exactly match the artifact", () => {
    const artifact = hrArtifact();
    const rendered = artifact.rows.map((r) => ({ playerId: String(r.playerId), gameId: String(r.gameId) }));
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: artifact.rows })).toBe("");
  });

  it("fails when the rendered row count differs", () => {
    const artifact = hrArtifact();
    const rendered = [{ playerId: "592450", gameId: "745001" }];
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: artifact.rows })).toMatch(/count/i);
  });

  it("fails when the caption row count differs", () => {
    const artifact = hrArtifact();
    const rendered = artifact.rows.map((r) => ({ playerId: String(r.playerId), gameId: String(r.gameId) }));
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: [artifact.rows[0]] })).toMatch(/count/i);
  });

  it("fails when a rendered player is different (no extra players)", () => {
    const artifact = hrArtifact();
    const rendered = artifact.rows.map((r) => ({ playerId: String(r.playerId), gameId: String(r.gameId) }));
    rendered[1] = { playerId: "999999", gameId: "745002" };
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: artifact.rows })).toMatch(/mismatch/i);
  });

  it("fails when order differs", () => {
    const artifact = hrArtifact();
    const rendered = [...artifact.rows].reverse().map((r) => ({ playerId: String(r.playerId), gameId: String(r.gameId) }));
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: artifact.rows })).toMatch(/mismatch/i);
  });

  it("K: fails when rendered side differs from the selected side", () => {
    const artifact = kArtifact();
    const rendered = [{ pitcherId: "669373", gameId: "745002", side: "UNDER", odds: "-120" }];
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: artifact.rows })).toMatch(/side|mismatch/i);
  });

  it("K: fails when rendered odds differ from the selected side odds", () => {
    const artifact = kArtifact();
    const rendered = [{ pitcherId: "669373", gameId: "745002", side: "OVER", odds: "-999" }];
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: artifact.rows })).toMatch(/odds/i);
  });

  it("K: passes with correct side + odds", () => {
    const artifact = kArtifact();
    const rendered = [{ pitcherId: "669373", gameId: "745002", side: "OVER", odds: "-120" }];
    expect(assertArtifactConsistency({ artifact, renderedRows: rendered, captionRows: artifact.rows })).toBe("");
  });
});

describe("artifact builders", () => {
  it("HR artifact freezes rank, ids, and confirmation metadata", () => {
    const artifact = hrArtifact();
    expect(artifact.contentType).toBe("hr");
    expect(artifact.confirmationAsOf).toBe(snapshot.asOf);
    expect(artifact.earliestFirstPitch).toBe(snapshot.timing.earliestGameTime);
    expect(artifact.rows[0].rank).toBe(1);
    expect(artifact.rows[1].rank).toBe(2);
    expect(artifact.rows[0].team).toBe("NYY");
  });

  it("K artifact stores the favored side and its side-correct odds", () => {
    const artifact = kArtifact();
    expect(artifact.rows[0].side).toBe("OVER");
    expect(artifact.rows[0].odds).toBe("-120");
  });

  it("K artifact carries projectedIP through for the renderer's compact supporting field", () => {
    const artifact = buildKArtifact({
      slateDate: "2026-07-12",
      snapshot,
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
      selectedRows: [{ pitcher: "Tarik Skubal", team: "det", opponent: "phi", kLine: 7.5, oddsOver: "-120", projectedKs: 9.3, projectedIP: 6.4, pitcherId: 669373, gameId: 745002 }],
    });
    expect(artifact.rows[0].projectedIP).toBe(6.4);
  });

  it("mismatch status constant is exported for the poster", () => {
    expect(ARTIFACT_MISMATCH_STATUS).toBe("FAILED_ARTIFACT_SELECTION_MISMATCH");
  });
});

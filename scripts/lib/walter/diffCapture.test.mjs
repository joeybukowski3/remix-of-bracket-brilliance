import { describe, expect, it } from "vitest";
import { diffCapture, previousCaptureType } from "./diffCapture.mjs";

function fixtureCapture(overrides = {}) {
  return {
    captureType: "wednesday",
    game: { away: { name: "New England Patriots" }, home: { name: "Seattle Seahawks" } },
    snapshot: { thesis: "Seahawks are the better team." },
    teamBreakdowns: { away: ["Patriots offense text"], home: ["Seahawks offense text"] },
    uncommonAngles: ["Jim Harbaugh is 6-0 ATS in Week 1."],
    injuries: [{ team: "away", sourceLabel: "NEW ENGLAND OFFENSE", sentence: "Campbell was injured earlier." }],
    betting: { pick: { spread: "Seahawks -3.5", units: 2 }, total: "Under 44.5" },
    ...overrides,
  };
}

describe("previousCaptureType", () => {
  it("returns null for wednesday (no predecessor)", () => {
    expect(previousCaptureType("wednesday")).toBeNull();
  });
  it("walks the sequence forward for the rest", () => {
    expect(previousCaptureType("thursday")).toBe("wednesday");
    expect(previousCaptureType("saturday")).toBe("thursday");
    expect(previousCaptureType("sunday")).toBe("saturday");
  });
});

describe("diffCapture", () => {
  it("returns an empty delta with comparedTo null when there is no previous capture", () => {
    const delta = diffCapture(null, fixtureCapture());
    expect(delta).toEqual({ comparedTo: null, new: [], changed: [], removed: [], newInjuries: [], pickChanges: [] });
  });

  it("reports no changes when nothing differs between captures", () => {
    const prev = fixtureCapture();
    const curr = fixtureCapture();
    const delta = diffCapture(prev, curr);
    expect(delta.new).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.newInjuries).toEqual([]);
    expect(delta.pickChanges).toEqual([]);
  });

  it("surfaces a newly added uncommon angle", () => {
    const prev = fixtureCapture();
    const curr = fixtureCapture({ uncommonAngles: [...prev.uncommonAngles, "Weather looks brutal Sunday."] });
    const delta = diffCapture(prev, curr);
    expect(delta.new).toEqual(["Weather looks brutal Sunday."]);
  });

  it("surfaces a removed uncommon angle", () => {
    const prev = fixtureCapture();
    const curr = fixtureCapture({ uncommonAngles: [] });
    const delta = diffCapture(prev, curr);
    expect(delta.removed).toEqual(["Jim Harbaugh is 6-0 ATS in Week 1."]);
  });

  it("surfaces a new injury mention by name", () => {
    const prev = fixtureCapture();
    const curr = fixtureCapture({
      injuries: [...prev.injuries, { team: "home", sourceLabel: "SEATTLE OFFENSE", sentence: "Walker is questionable." }],
    });
    const delta = diffCapture(prev, curr);
    expect(delta.newInjuries).toEqual(["Seattle Seahawks: Walker is questionable."]);
  });

  it("surfaces a pick change (spread, units, and total)", () => {
    const prev = fixtureCapture();
    const curr = fixtureCapture({ betting: { pick: { spread: "Patriots +3.5", units: 1 }, total: "Over 44.5" } });
    const delta = diffCapture(prev, curr);
    expect(delta.pickChanges).toEqual([
      "Pick changed: Seahawks -3.5 -> Patriots +3.5",
      "Confidence changed: 2 units -> 1 units",
      "Total lean changed: Under 44.5 -> Over 44.5",
    ]);
  });

  it("flags an updated snapshot thesis and team-breakdown text", () => {
    const prev = fixtureCapture();
    const curr = fixtureCapture({
      snapshot: { thesis: "New thesis after Thursday update." },
      teamBreakdowns: { away: ["Updated Patriots offense text"], home: ["Seahawks offense text"] },
    });
    const delta = diffCapture(prev, curr);
    expect(delta.changed).toEqual(["Snapshot thesis updated", "Team breakdown analysis updated"]);
  });
});

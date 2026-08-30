import { describe, expect, it } from "vitest";
import {
  buildLast8FormRatings,
  buildOverallRatings,
  buildSosBoard,
  type Last8FormInputs,
} from "@/lib/nfl/powerRatingsEfficiency";

describe("buildOverallRatings", () => {
  it("blends offense and inverted defense 50/50 and ranks by the unrounded blend", () => {
    // Team A: great offense, great (low) defense allowed -> best.
    // Team C: worst on both.
    const off = new Map<string, number>([["a", 0.3], ["b", 0.0], ["c", -0.3]]);
    const defAllowed = new Map<string, number>([["a", -0.2], ["b", 0.0], ["c", 0.2]]);

    const ratings = buildOverallRatings(off, defAllowed, { defenseLowerIsBetter: true });

    expect(ratings.get("a")?.rank).toBe(1);
    expect(ratings.get("c")?.rank).toBe(3);
    expect(ratings.get("b")?.value).toBeCloseTo(50, 5);
    expect(ratings.get("a")!.value).toBeGreaterThan(ratings.get("b")!.value);
    expect(ratings.get("c")!.value).toBeLessThan(ratings.get("b")!.value);
    // Clamped to the public scale.
    for (const rating of ratings.values()) {
      expect(rating!.value).toBeGreaterThanOrEqual(1);
      expect(rating!.value).toBeLessThanOrEqual(99);
    }
  });

  it("returns null (never zero) when a team is missing either side", () => {
    const off = new Map<string, number | null>([["a", 0.1], ["b", 0.2], ["c", null]]);
    const defAllowed = new Map<string, number | null>([["a", 0.1], ["b", null], ["c", 0.1]]);
    const ratings = buildOverallRatings(off, defAllowed, { defenseLowerIsBetter: true });
    expect(ratings.get("a")).not.toBeNull();
    expect(ratings.get("b")).toBeNull();
    expect(ratings.get("c")).toBeNull();
  });

  it("is deterministic under ties (broken by abbreviation)", () => {
    const off = new Map<string, number>([["z", 0.1], ["a", 0.1]]);
    const defAllowed = new Map<string, number>([["z", 0.1], ["a", 0.1]]);
    const ratings = buildOverallRatings(off, defAllowed, { defenseLowerIsBetter: true });
    expect(ratings.get("a")?.rank).toBe(1);
    expect(ratings.get("z")?.rank).toBe(2);
  });
});

describe("buildSosBoard", () => {
  it("averages period opponent EPA Overall ranks per game and ranks lowest-average hardest", () => {
    const epaRank = new Map<string, number>([
      ["opp1", 2], ["opp2", 8], ["opp3", 30], ["easy", 31],
    ]);
    const opponents = new Map<string, string[]>([
      ["hard", ["opp1", "opp2", "opp1"]], // faced opp1 twice -> counts twice: (2+8+2)/3 = 4
      ["soft", ["opp3", "easy"]], // (30+31)/2 = 30.5
    ]);
    const sos = buildSosBoard(epaRank, opponents);
    expect(sos.get("hard")?.avgOpponentRank).toBeCloseTo(4, 5);
    expect(sos.get("soft")?.avgOpponentRank).toBeCloseTo(30.5, 5);
    expect(sos.get("hard")?.rank).toBe(1);
    expect(sos.get("soft")?.rank).toBe(2);
  });

  it("excludes unresolvable opponents rather than zero-filling, and yields null with no rated games", () => {
    const epaRank = new Map<string, number>([["known", 5]]);
    const opponents = new Map<string, string[]>([
      ["partial", ["known", "unknown"]],
      ["blank", ["unknown", "unknown"]],
    ]);
    const sos = buildSosBoard(epaRank, opponents);
    expect(sos.get("partial")?.avgOpponentRank).toBe(5);
    expect(sos.get("partial")?.ratedGames).toBe(1);
    expect(sos.get("blank")).toBeNull();
  });
});

describe("buildLast8FormRatings", () => {
  const m = (entries: Record<string, number | null>) =>
    new Map<string, number | null>(Object.entries(entries));

  // A two-team league puts every component z at exactly ±1 (population stdev =
  // |x - y| / 2), so each component rating is exactly 65 (better) or 35 (worse)
  // and the composite arithmetic is checkable by hand.
  const NEUTRAL = { a: 1, b: 1 };

  function inputs(partial: Partial<Record<keyof Last8FormInputs, Map<string, number | null>>>): Last8FormInputs {
    return {
      offEpaPerPlay: partial.offEpaPerPlay ?? m(NEUTRAL),
      defEpaPerPlayAllowed: partial.defEpaPerPlayAllowed ?? m(NEUTRAL),
      offYardsPerPlay: partial.offYardsPerPlay ?? m(NEUTRAL),
      defYardsPerPlayAllowed: partial.defYardsPerPlayAllowed ?? m(NEUTRAL),
      offSuccessRate: partial.offSuccessRate ?? m(NEUTRAL),
      defSuccessRateAllowed: partial.defSuccessRateAllowed ?? m(NEUTRAL),
    };
  }

  it("weights OFF Form EPA .40 / YPP .30 / Success .30 exactly", () => {
    const form = buildLast8FormRatings(
      inputs({
        offEpaPerPlay: m({ a: 0.2, b: 0.1 }), // a better -> 65 / 35
        offYardsPerPlay: m({ a: 5.0, b: 5.2 }), // b better -> 35 / 65
        offSuccessRate: m({ a: 0.4, b: 0.44 }), // b better -> 35 / 65
      }),
      { successAvailable: true }
    );
    // a = .40*65 + .30*35 + .30*35 = 47 ; b = .40*35 + .30*65 + .30*65 = 53
    expect(form.get("a")?.off?.rating).toBeCloseTo(47, 6);
    expect(form.get("b")?.off?.rating).toBeCloseTo(53, 6);
    expect(form.get("b")?.off?.rank).toBe(1);
    expect(form.get("a")?.off?.rank).toBe(2);
  });

  it("weights DEF Form EPA .40 / YPP .30 / Success .30 with defensive direction inverted", () => {
    const form = buildLast8FormRatings(
      inputs({
        defEpaPerPlayAllowed: m({ a: 0.1, b: 0.2 }), // a allows less -> better -> 65 / 35
        defYardsPerPlayAllowed: m({ a: 5.4, b: 5.0 }), // a allows more -> worse -> 35 / 65
        defSuccessRateAllowed: m({ a: 0.46, b: 0.42 }), // a allows more -> worse -> 35 / 65
      }),
      { successAvailable: true }
    );
    // a = .40*65 + .30*35 + .30*35 = 47 ; b = 53
    expect(form.get("a")?.def?.rating).toBeCloseTo(47, 6);
    expect(form.get("b")?.def?.rating).toBeCloseTo(53, 6);
    expect(form.get("b")?.def?.rank).toBe(1);
  });

  it("blends OVR Form 50% OFF / 50% DEF", () => {
    const form = buildLast8FormRatings(
      inputs({
        // OFF: a dominates -> a 65 / b 35
        offEpaPerPlay: m({ a: 0.2, b: 0.1 }),
        offYardsPerPlay: m({ a: 5.2, b: 5.0 }),
        offSuccessRate: m({ a: 0.44, b: 0.4 }),
        // DEF: b dominates -> a 35 / b 65
        defEpaPerPlayAllowed: m({ a: 0.2, b: 0.1 }),
        defYardsPerPlayAllowed: m({ a: 5.2, b: 5.0 }),
        defSuccessRateAllowed: m({ a: 0.44, b: 0.4 }),
      }),
      { successAvailable: true }
    );
    const a = form.get("a")!;
    expect(a.off?.rating).toBeCloseTo(65, 6);
    expect(a.def?.rating).toBeCloseTo(35, 6);
    expect(a.ovr?.rating).toBeCloseTo(50, 6);
    expect(a.ovr?.rating).toBeCloseTo((a.off!.rating + a.def!.rating) / 2, 6);
  });

  it("ranks higher composite as the better league rank", () => {
    const form = buildLast8FormRatings(
      inputs({
        offEpaPerPlay: m({ a: 0.3, b: 0.1, c: -0.1 }),
        offYardsPerPlay: m({ a: 6, b: 5, c: 4 }),
        offSuccessRate: m({ a: 0.5, b: 0.45, c: 0.4 }),
        defEpaPerPlayAllowed: m({ a: 0.1, b: 0.1, c: 0.1 }),
        defYardsPerPlayAllowed: m({ a: 5, b: 5, c: 5 }),
        defSuccessRateAllowed: m({ a: 0.4, b: 0.4, c: 0.4 }),
      }),
      { successAvailable: true }
    );
    expect(form.get("a")?.ovr?.rank).toBe(1);
    expect(form.get("c")?.ovr?.rank).toBe(3);
    expect(form.get("a")!.ovr!.rating).toBeGreaterThan(form.get("c")!.ovr!.rating);
  });

  it("never fills a missing raw component with zero — the side and OVR go null", () => {
    const form = buildLast8FormRatings(
      inputs({
        offEpaPerPlay: m({ a: 0.2, b: 0.1, c: 0.0 }),
        offYardsPerPlay: m({ a: 5.2, b: 5.0, c: null }), // c missing YPP
        offSuccessRate: m({ a: 0.44, b: 0.4, c: 0.42 }),
      }),
      { successAvailable: true }
    );
    expect(form.get("c")?.off).toBeNull();
    expect(form.get("c")?.ovr).toBeNull();
    expect(form.get("a")?.off).not.toBeNull();
  });

  it("uses exactly EPA .60 / YPP .40 and reports method when Success is unavailable", () => {
    const form = buildLast8FormRatings(
      inputs({
        offEpaPerPlay: m({ a: 0.2, b: 0.1 }), // a better -> 65 / 35
        offYardsPerPlay: m({ a: 5.0, b: 5.2 }), // b better -> 35 / 65
        offSuccessRate: m({ a: 999, b: -999 }), // must be ignored
      }),
      { successAvailable: false }
    );
    // a = .60*65 + .40*35 = 53 ; b = .60*35 + .40*65 = 47
    expect(form.get("a")?.off?.rating).toBeCloseTo(53, 6);
    expect(form.get("b")?.off?.rating).toBeCloseTo(47, 6);
    expect(form.get("a")?.method).toBe("epa-ypp");
  });

  it("reports the full-form method when Success is available", () => {
    const form = buildLast8FormRatings(inputs({}), { successAvailable: true });
    expect([...form.values()][0]?.method).toBe("epa-ypp-success");
  });
});

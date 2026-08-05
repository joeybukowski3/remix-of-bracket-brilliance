import { describe, expect, it } from "vitest";
import {
  checkHomeRunOdds,
  checkInjectedModelRows,
  checkStrikeoutOdds,
  modalValue,
  summarizeViolations,
} from "./mlb-prop-odds-integrity.mjs";

describe("modalValue", () => {
  it("returns the most common value", () => {
    expect(modalValue([0.5, 0.5, 0.5, 1, 2])).toBe(0.5);
  });

  it("breaks ties toward the lower value so the result is deterministic", () => {
    expect(modalValue([2, 1])).toBe(1);
    expect(modalValue([1, 2])).toBe(1);
  });

  it("returns null for an empty list", () => {
    expect(modalValue([])).toBeNull();
  });
});

describe("checkStrikeoutOdds", () => {
  it("accepts a two-sided posted line", () => {
    const { violations } = checkStrikeoutOdds({
      "bryan woo": { line: 5.5, over: "-120", under: "-110", isAlternate: false },
    });
    expect(violations).toEqual([]);
  });

  it("flags a one-sided strikeout market as a ladder rung", () => {
    const { violations } = checkStrikeoutOdds({
      "bryan woo": { line: 11, over: "+1540", under: null, isAlternate: false },
    });
    expect(violations.map((item) => item.code)).toContain("one_sided_strikeout_primary");
  });

  it("flags an explicitly alternate market published as primary", () => {
    const { violations } = checkStrikeoutOdds({
      "paul skenes": { line: 6.5, over: "-120", under: "-110", isAlternate: true },
    });
    expect(violations.map((item) => item.code)).toContain("alternate_market_published");
  });

  it("warns on integer thresholds without failing the run", () => {
    const { violations, warnings } = checkStrikeoutOdds({
      "casey mize": { line: 7, over: "-120", under: "-110", isAlternate: false },
    });
    expect(violations).toEqual([]);
    expect(warnings.map((item) => item.code)).toContain("integer_strikeout_threshold");
  });
});

describe("checkHomeRunOdds", () => {
  it("accepts a one-sided HR market, which is normal for this prop", () => {
    const { violations, canonicalLine } = checkHomeRunOdds({
      "aaron judge": { line: 0.5, yes: "+260", no: null },
      "shohei ohtani": { line: 0.5, yes: "+310", no: null },
    });
    expect(violations).toEqual([]);
    expect(canonicalLine).toBe(0.5);
  });

  it("flags a batter sitting above the slate's canonical HR threshold", () => {
    const { violations } = checkHomeRunOdds({
      "aaron judge": { line: 0.5, yes: "+260" },
      "mookie betts": { line: 0.5, yes: "+330" },
      "shohei ohtani": { line: 2, yes: "+2100" },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ code: "non_canonical_hr_threshold", line: 2, canonicalLine: 0.5 });
  });
});

describe("checkInjectedModelRows", () => {
  it("flags injected pitcher rows that lost their Under price", () => {
    const { violations } = checkInjectedModelRows({
      pitchers: [
        { pitcher: "Bryan Woo", kLine: 11, kOddsOver: "+1540", kOddsUnder: null },
        { pitcher: "Reid Detmers", kLine: 7.5, kOddsOver: "+109", kOddsUnder: "-139" },
      ],
      batters: [],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ code: "one_sided_strikeout_primary", player: "Bryan Woo" });
  });

  it("flags injected batter rows on a ladder threshold", () => {
    const { violations, canonicalHrLine } = checkInjectedModelRows({
      pitchers: [],
      batters: [
        { player: "Aaron Judge", hrLine: 0.5, hrOddsYes: "+260" },
        { player: "Mookie Betts", hrLine: 0.5, hrOddsYes: "+330" },
        { player: "Yordan Alvarez", hrLine: 2, hrOddsYes: "+2700" },
      ],
    });
    expect(canonicalHrLine).toBe(0.5);
    expect(violations.map((item) => item.player)).toEqual(["Yordan Alvarez"]);
  });

  it("passes clean injected data", () => {
    const { violations } = checkInjectedModelRows({
      pitchers: [{ pitcher: "Reid Detmers", kLine: 7.5, kOddsOver: "+109", kOddsUnder: "-139" }],
      batters: [{ player: "Aaron Judge", hrLine: 0.5, hrOddsYes: "+260" }],
    });
    expect(violations).toEqual([]);
  });
});

describe("summarizeViolations", () => {
  it("counts violations by code, most frequent first", () => {
    const summary = summarizeViolations([
      { code: "one_sided_strikeout_primary" },
      { code: "non_canonical_hr_threshold" },
      { code: "non_canonical_hr_threshold" },
    ]);
    expect(summary).toEqual(["non_canonical_hr_threshold=2", "one_sided_strikeout_primary=1"]);
  });
});

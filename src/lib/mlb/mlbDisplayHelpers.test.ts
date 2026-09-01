/**
 * mlbDisplayHelpers.test.ts
 * Guards the two conceptually separate MLB tone palettes:
 *  - getStatToneClasses / getStatToneStyle — sanctioned hot/cold view
 *    (positive = red, negative = blue), unchanged.
 *  - getGoodnessToneStyle — a thin semantic adapter that must derive its
 *    colors from the shared JKB Heat scale (KS-010), never a local palette.
 */
import { describe, it, expect } from "vitest";
import {
  getGoodnessToneStyle,
  getStatToneClasses,
  getStatToneStyle,
} from "./mlbDisplayHelpers";
import { jkbHeatStyle } from "@/lib/shared/jkbHeat";

describe("getGoodnessToneStyle — derives from shared JKB Heat", () => {
  it("favorable is exactly the shared JKB Heat above-average (green) band", () => {
    expect(getGoodnessToneStyle("favorable")).toEqual(jkbHeatStyle("light-green"));
  });

  it("unfavorable is exactly the shared JKB Heat below-average (red) band", () => {
    expect(getGoodnessToneStyle("unfavorable")).toEqual(jkbHeatStyle("light-red"));
  });

  it("neutral is exactly the shared JKB Heat average (slate) band", () => {
    expect(getGoodnessToneStyle("neutral")).toEqual(jkbHeatStyle("neutral"));
  });

  it("favorable is green-not-red and is not the hot-tone (KS-010 direction)", () => {
    const favorable = getGoodnessToneStyle("favorable");
    // JKB Heat above-average fill is green (34,197,94); below-average is rose.
    expect(favorable.backgroundColor).toMatch(/34,\s*197,\s*94/);
    expect(favorable).not.toEqual(getGoodnessToneStyle("unfavorable"));
    expect(favorable).not.toEqual(getStatToneStyle("positive"));
  });
});

describe("sanctioned hot/cold palette unchanged", () => {
  it("getStatToneClasses keeps positive = red (hot), negative = sky (cold)", () => {
    expect(getStatToneClasses("positive")).toMatch(/red/);
    expect(getStatToneClasses("negative")).toMatch(/sky/);
  });

  it("getStatToneStyle keeps its own hot/cold hexes", () => {
    expect(getStatToneStyle("positive")).toEqual({
      backgroundColor: "#fef2f2",
      color: "#991b1b",
      borderColor: "#fecaca",
    });
    expect(getStatToneStyle("negative").backgroundColor).toBe("#f0f9ff");
  });
});

import { describe, expect, it } from "vitest";
import { isDateInWindow, windowRange } from "./performancePreviewWindows";

const TODAY = "2026-08-12";

describe("windowRange", () => {
  it("yesterday is exactly one day before today", () => {
    expect(windowRange("yesterday", TODAY)).toEqual({ start: "2026-08-11", end: "2026-08-11" });
  });

  it("last7 spans the 7 days before today, ending yesterday", () => {
    expect(windowRange("last7", TODAY)).toEqual({ start: "2026-08-05", end: "2026-08-11" });
  });

  it("last30 spans the 30 days before today, ending yesterday", () => {
    expect(windowRange("last30", TODAY)).toEqual({ start: "2026-07-13", end: "2026-08-11" });
  });
});

describe("isDateInWindow", () => {
  it("includes the exact boundary dates", () => {
    expect(isDateInWindow("2026-08-11", "yesterday", TODAY)).toBe(true);
    expect(isDateInWindow("2026-08-05", "last7", TODAY)).toBe(true);
    expect(isDateInWindow("2026-07-13", "last30", TODAY)).toBe(true);
  });

  it("excludes today itself and dates before the window", () => {
    expect(isDateInWindow(TODAY, "last7", TODAY)).toBe(false);
    expect(isDateInWindow("2026-08-04", "last7", TODAY)).toBe(false);
    expect(isDateInWindow("2026-07-12", "last30", TODAY)).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EasternTimeConversionError,
  easternLocalToUtcIso,
} from "./easternToUtc";

describe("easternLocalToUtcIso", () => {
  it("converts a September kickoff under EDT (UTC-4)", () => {
    expect(easternLocalToUtcIso("2026-09-13T20:25:00")).toBe(
      "2026-09-14T00:25:00.000Z",
    );
  });

  it("converts a December kickoff under EST (UTC-5)", () => {
    expect(easternLocalToUtcIso("2026-12-14T13:00:00")).toBe(
      "2026-12-14T18:00:00.000Z",
    );
  });

  it("converts an early-November game the day before the fall-back as EDT", () => {
    // 2026 fall-back is 2026-11-01T02:00 local; the 31st is still EDT.
    expect(easternLocalToUtcIso("2026-10-31T19:30:00")).toBe(
      "2026-10-31T23:30:00.000Z",
    );
  });

  it("accepts a space separator and missing seconds", () => {
    expect(easternLocalToUtcIso("2026-11-27 12:30")).toBe(
      "2026-11-27T17:30:00.000Z",
    );
  });

  it("treats a date-only value as Eastern local midnight", () => {
    expect(easternLocalToUtcIso("2026-10-03")).toBe("2026-10-03T04:00:00.000Z");
  });

  it("rejects an unparseable string", () => {
    expect(() => easternLocalToUtcIso("not-a-timestamp")).toThrow(
      EasternTimeConversionError,
    );
  });

  it("rejects an impossible calendar date", () => {
    expect(() => easternLocalToUtcIso("2026-02-30T12:00:00")).toThrow(
      EasternTimeConversionError,
    );
  });

  it("rejects a wall time inside the spring-forward gap", () => {
    // 2026-03-08 02:30 Eastern never occurs (clocks jump 02:00 -> 03:00).
    expect(() => easternLocalToUtcIso("2026-03-08T02:30:00")).toThrow(
      /gap/i,
    );
  });

  it("rejects a wall time inside the fall-back overlap", () => {
    // 2026-11-01 01:30 Eastern occurs twice (EDT then EST).
    expect(() => easternLocalToUtcIso("2026-11-01T01:30:00")).toThrow(
      /ambiguous/i,
    );
  });

  it("rejects a non-string input", () => {
    expect(() => easternLocalToUtcIso(undefined as unknown as string)).toThrow(
      EasternTimeConversionError,
    );
  });

  describe("independent of the machine local timezone", () => {
    const originalTz = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14, deliberately extreme
    });

    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it("still resolves the Eastern offset regardless of process.env.TZ", () => {
      // Intl uses the IANA database, not process.env.TZ, so the result must not move.
      expect(easternLocalToUtcIso("2026-09-13T20:25:00")).toBe(
        "2026-09-14T00:25:00.000Z",
      );
      expect(easternLocalToUtcIso("2026-12-14T13:00:00")).toBe(
        "2026-12-14T18:00:00.000Z",
      );
    });
  });
});

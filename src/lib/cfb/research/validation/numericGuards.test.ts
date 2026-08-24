import { describe, expect, it } from "vitest";
import { assertFiniteValues } from "./numericGuards";

describe("assertFiniteValues", () => {
  it("passes finite values and nulls", () => {
    expect(() => assertFiniteValues("test", [1, 2.5, null, -3])).not.toThrow();
  });

  it("throws on NaN", () => {
    expect(() => assertFiniteValues("test", [1, Number.NaN])).toThrow(/non-finite/);
  });

  it("throws on Infinity", () => {
    expect(() => assertFiniteValues("test", [Number.POSITIVE_INFINITY])).toThrow(/non-finite/);
  });
});

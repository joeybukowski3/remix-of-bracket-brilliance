import { describe, expect, it } from "vitest";
import { computeRating } from "./rating";

describe("computeRating", () => {
  it("returns null when the edge is missing", () => {
    expect(computeRating(null)).toBeNull();
  });

  it("bands the very-strong tier at edge >= 12", () => {
    expect(computeRating(12)).toBe("very-strong");
    expect(computeRating(31)).toBe("very-strong");
  });

  it("bands the strong tier at 4 <= edge < 12", () => {
    expect(computeRating(4)).toBe("strong");
    expect(computeRating(11)).toBe("strong");
  });

  it("bands the neutral tier at -4 < edge < 4", () => {
    expect(computeRating(0)).toBe("neutral");
    expect(computeRating(3)).toBe("neutral");
    expect(computeRating(-3)).toBe("neutral");
  });

  it("bands the weak tier at -12 < edge <= -4", () => {
    expect(computeRating(-4)).toBe("weak");
    expect(computeRating(-11)).toBe("weak");
  });

  it("bands the very-weak tier at edge <= -12", () => {
    expect(computeRating(-12)).toBe("very-weak");
    expect(computeRating(-31)).toBe("very-weak");
  });

  it("is symmetric: rating(edge) mirrors rating(-edge) around neutral", () => {
    expect(computeRating(20)).toBe("very-strong");
    expect(computeRating(-20)).toBe("very-weak");
    expect(computeRating(8)).toBe("strong");
    expect(computeRating(-8)).toBe("weak");
  });
});

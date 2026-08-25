import { describe, expect, it } from "vitest";
import { formatAdp } from "@/lib/fantasy/formatBoardValue";

describe("formatAdp", () => {
  it("formats raw average draft position to one decimal", () => {
    expect(formatAdp(13.74)).toBe("13.7");
    expect(formatAdp(24.16)).toBe("24.2");
  });

  it("renders missing ADP as N/A rather than deriving round and pick", () => {
    expect(formatAdp(undefined)).toBe("N/A");
  });
});


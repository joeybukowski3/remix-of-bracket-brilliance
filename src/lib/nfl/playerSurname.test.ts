import { describe, expect, it } from "vitest";
import { playerSurname } from "@/lib/nfl/playerSurname";

describe("playerSurname", () => {
  it("returns the surname for a simple two-part name", () => {
    expect(playerSurname("Justin Herbert")).toBe("Herbert");
    expect(playerSurname("Mark Andrews")).toBe("Andrews");
  });

  it("strips a Jr./Sr. suffix and returns the real surname", () => {
    expect(playerSurname("Marvin Harrison Jr.")).toBe("Harrison");
    expect(playerSurname("Brian Thomas Jr.")).toBe("Thomas");
    expect(playerSurname("Odell Beckham Jr.")).toBe("Beckham");
    expect(playerSurname("Brian Robinson Jr.")).toBe("Robinson");
    expect(playerSurname("Michael Carter Sr")).toBe("Carter");
  });

  it("strips Roman-numeral suffixes", () => {
    expect(playerSurname("Robert Griffin III")).toBe("Griffin");
    expect(playerSurname("Cam Akers II")).toBe("Akers");
    expect(playerSurname("Player Name IV")).toBe("Name");
    expect(playerSurname("Some Guy V")).toBe("Guy");
  });

  it("preserves hyphenated surnames", () => {
    expect(playerSurname("Michael Pittman-Jones")).toBe("Pittman-Jones");
    expect(playerSurname("Scotty Miller-Smith Jr.")).toBe("Miller-Smith");
  });

  it("preserves apostrophe surnames", () => {
    expect(playerSurname("Ka'imi O'Brien")).toBe("O'Brien");
    expect(playerSurname("De'Von Achane")).toBe("Achane");
  });

  it("does not simply take the final token", () => {
    // Naive split-and-take-last would return "III" / "Jr." here.
    expect(playerSurname("Robert Griffin III")).not.toBe("III");
    expect(playerSurname("Marvin Harrison Jr.")).not.toBe("Jr.");
  });

  it("is safe on degenerate input", () => {
    expect(playerSurname("")).toBe("");
    expect(playerSurname("   ")).toBe("");
    expect(playerSurname("Cher")).toBe("Cher");
  });
});

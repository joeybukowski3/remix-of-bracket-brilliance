import { describe, expect, it, vi } from "vitest";
import { parseCompactHistoryJson } from "./usePgaPlayerHistory";

describe("parseCompactHistoryJson", () => {
  it("parses valid compact history JSON", () => {
    const payload = parseCompactHistoryJson(JSON.stringify({
      v: 1,
      source: "test",
      event: "travelers-championship",
      years: [2025],
      players: [["Test Player", [1, 2, 3], ["T5"], ["T10"]]],
    }));

    expect(payload.players[0][0]).toBe("Test Player");
  });

  it("repairs a missing comma between player array entries", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const malformed = '{"v":1,"source":"test","event":"travelers-championship","years":[2025],"players":[["Player One",[1],["T5"],["T10"]]["Player Two",[2],["MC"],["T20"]]]}';

    const payload = parseCompactHistoryJson(malformed);

    expect(payload.players).toHaveLength(2);
    expect(payload.players[1][0]).toBe("Player Two");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("repairs the missing final players-array bracket in the Travelers seed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const truncated = '{"v":1,"source":"test","event":"travelers-championship","years":[2025],"players":[["Player One",[1],["T5"],["T10"]]}';

    const payload = parseCompactHistoryJson(truncated);

    expect(payload.players).toHaveLength(1);
    expect(payload.players[0][0]).toBe("Player One");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

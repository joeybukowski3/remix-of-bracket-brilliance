import { describe, expect, it } from "vitest";
import {
  buildStrikeoutPropDetailsByKey,
  keyForStrikeoutPropRow,
  stableKeyForStrikeoutPropRow,
  type StrikeoutPropDetail,
} from "@/hooks/useMlbStrikeoutPropDetails";

function detail(overrides: Partial<StrikeoutPropDetail> = {}): StrikeoutPropDetail {
  return {
    key: "shane-bieber|tor|tb|2026-07-23",
    legacyKey: "shane-bieber|tor|tb|2026-07-23",
    stableKey: "2026-07-23|822785|669456",
    stableKeys: [
      "2026-07-23|822785|669456",
      "2026-07-23|669456|141|139",
    ],
    slateDate: "2026-07-23",
    gamePk: 822785,
    pitcherId: 669456,
    teamId: 141,
    opponentId: 139,
    pitcher: "Shane Bieber",
    team: "TOR",
    opponent: "TB",
    gameDate: "2026-07-23",
    pitcherLastFiveStarts: [],
    opponentLastFiveGames: [],
    generatedAt: "2026-07-23T12:00:00.000Z",
    source: "test",
    ...overrides,
  };
}

describe("strikeout detail stable matching", () => {
  it("prefers slateDate + gamePk + pitcherId for table rows", () => {
    expect(keyForStrikeoutPropRow({
      gameId: 822785,
      pitcherId: 669456,
      pitcher: "Shane Bieber",
      team: "TOR",
      opponent: "TB",
    }, "2026-07-23")).toBe("2026-07-23|822785|669456");
  });

  it("falls back to slateDate + pitcherId + teamId + opponentId", () => {
    expect(stableKeyForStrikeoutPropRow({
      pitcherId: 669456,
      teamId: 141,
      opponentId: 139,
    }, "2026-07-23")).toBe("2026-07-23|669456|141|139");
  });

  it("indexes both stable identities for the same detail", () => {
    const row = detail();
    const index = buildStrikeoutPropDetailsByKey([row]);
    expect(index.get("2026-07-23|822785|669456")).toBe(row);
    expect(index.get("2026-07-23|669456|141|139")).toBe(row);
  });

  it("uses a legacy key only when it is unambiguous", () => {
    const legacyKey = "shane-bieber|tor|tb|2026-07-23";
    const first = detail();
    const second = detail({
      stableKey: "2026-07-23|822786|669456",
      stableKeys: ["2026-07-23|822786|669456"],
      gamePk: 822786,
    });
    expect(buildStrikeoutPropDetailsByKey([first]).get(legacyKey)).toBe(first);
    expect(buildStrikeoutPropDetailsByKey([first, second]).has(legacyKey)).toBe(false);
    expect(buildStrikeoutPropDetailsByKey([first, second]).get("2026-07-23|822785|669456")).toBe(first);
    expect(buildStrikeoutPropDetailsByKey([first, second]).get("2026-07-23|822786|669456")).toBe(second);
  });
});

import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildHistoricalRankingUniverse, type HistoricalRosterWeek } from "./universe";

const roster = (overrides: Partial<HistoricalRosterWeek> = {}): HistoricalRosterWeek => ({
  season: 2024, week: 3, team: "DET", gsisId: "p1", pfrId: null, espnId: null,
  playerName: "Player One", position: "RB", rosterStatus: "ACT", ...overrides,
});
const schedule = [{ season: 2024, week: 3, team: "DET", opponent: "GB" }];

describe("pregame historical ranking universe", () => {
  it("creates a zero outcome from roster eligibility, never target-week participation", () => {
    const result = buildHistoricalRankingUniverse({ outcomes: [], rosters: [roster()], injuries: [], schedule });
    expect(result.rows[0]).toMatchObject({ playerId: "gsis:p1", actualFantasyPoints: 0, team: "det", opponent: "gb" });
    expect(result.rows[0].usage.snapShare).toBeNull();
    expect(result.audit).toMatchObject({ eligibleZeroRows: 1, notOnInjuryReport: 1 });
  });

  it("excludes bye, out, reserve, inactive and unresolved identities before outcomes are joined", () => {
    const rosters = [
      roster({ gsisId: "out" }),
      roster({ gsisId: "reserve", rosterStatus: "RES" }),
      roster({ gsisId: "inactive", rosterStatus: "INA" }),
      roster({ gsisId: null }),
      roster({ gsisId: "bye", team: "KC" }),
    ];
    const result = buildHistoricalRankingUniverse({
      outcomes: [], rosters, schedule,
      injuries: [{ season: 2024, week: 3, gsisId: "out", reportStatus: "Out", practiceStatus: null }],
    });
    expect(result.rows).toHaveLength(0);
    expect(result.audit).toMatchObject({
      excludedOut: 1, excludedReserve: 1, excludedInactiveRoster: 1,
      unresolvedIdentity: 1, excludedByeOrMissingSchedule: 1,
    });
  });

  it("joins a recorded outcome by GSIS identity and retains exact-week traded team", () => {
    const zero = buildHistoricalRankingUniverse({ outcomes: [], rosters: [roster({ team: "BUF" })], injuries: [], schedule: [{ season: 2024, week: 3, team: "BUF", opponent: "MIA" }] }).rows[0];
    const outcome: HistoricalPlayerWeek = {
      ...zero,
      actualFantasyPoints: 18,
      provenance: { ...zero.provenance, source: "nflverse stats_player weekly" },
    };
    const result = buildHistoricalRankingUniverse({
      outcomes: [outcome], rosters: [roster({ team: "BUF" })], injuries: [],
      schedule: [{ season: 2024, week: 3, team: "BUF", opponent: "MIA" }],
    });
    expect(result.rows[0]).toMatchObject({ team: "buf", opponent: "mia", actualFantasyPoints: 18 });
    expect(result.audit.statOutcomeRows).toBe(1);
  });
});

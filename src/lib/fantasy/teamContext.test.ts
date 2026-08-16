import { describe, expect, it } from "vitest";
import { buildTeamContextIndex, resolveTeamContext } from "@/lib/fantasy/teamContext";
import { FANTASY_RANKINGS, type FantasyRankingRow } from "@/lib/fantasy/rankings";
import { getTieredRows } from "@/lib/fantasy/positionBoardModel";
import { PAR_POSITIONS } from "@/lib/fantasy/parRankings";

const index = buildTeamContextIndex(FANTASY_RANKINGS.rows);

function row(overrides: Partial<FantasyRankingRow>): FantasyRankingRow {
  return { overallRank: 1, player: "Test Player", position: "WR", ...overrides };
}

describe("workbook field scopes", () => {
  const byTeam = new Map<string, FantasyRankingRow[]>();
  for (const r of FANTASY_RANKINGS.rows) {
    if (!r.team) continue;
    byTeam.set(r.team, [...(byTeam.get(r.team) ?? []), r]);
  }

  it("keeps o-line and playoff opponents constant across a whole team", () => {
    for (const rows of byTeam.values()) {
      for (const field of [
        "offensiveLineRank",
        "playoffWeek15Opponent",
        "playoffWeek16Opponent",
        "playoffWeek17Opponent",
      ] as const) {
        const values = new Set(rows.map((r) => r[field]).filter((v) => v !== undefined));
        expect(values.size).toBeLessThanOrEqual(1);
      }
    }
  });

  it("varies strength of schedule by position, constant only within (team, position)", () => {
    let teamsThatVary = 0;
    for (const rows of byTeam.values()) {
      if (new Set(rows.map((r) => r.strengthOfSchedule)).size > 1) teamsThatVary += 1;
      const byPosition = new Map<string, number[]>();
      for (const r of rows) {
        if (r.strengthOfSchedule === undefined) continue;
        byPosition.set(r.position, [...(byPosition.get(r.position) ?? []), r.strengthOfSchedule]);
      }
      for (const values of byPosition.values()) {
        expect(new Set(values).size).toBe(1);
      }
    }
    // SOS is positional, so most teams disagree across positions.
    expect(teamsThatVary).toBeGreaterThan(20);
  });
});

describe("resolveTeamContext", () => {
  it("returns a matched row's own values and borrows nothing", () => {
    const jkb = row({
      team: "atl",
      strengthOfSchedule: 6,
      offensiveLineRank: 10,
      playoffWeek15Opponent: "@WAS",
    });
    const context = resolveTeamContext(jkb, "atl", "WR", index);
    expect(context.strengthOfSchedule).toBe(6);
    expect(context.offensiveLineRank).toBe(10);
    expect(context.playoffWeek15Opponent).toBe("@WAS");
    expect(context.borrowedFrom).toBeUndefined();
  });

  it("does not fabricate values for a matched row that simply lacks them", () => {
    const context = resolveTeamContext(row({ team: "atl" }), "atl", "WR", index);
    expect(context.strengthOfSchedule).toBeUndefined();
    expect(context.offensiveLineRank).toBeUndefined();
    expect(context.borrowedFrom).toBeUndefined();
  });

  it("borrows team-level fields from a teammate when unmatched", () => {
    const context = resolveTeamContext(undefined, "ne", "WR", index);
    expect(context.offensiveLineRank).toBe(15);
    expect(context.playoffWeek15Opponent).toBe("@KC");
    expect(context.borrowedFrom).toBe("A.J. Brown");
  });

  it("borrows positional SOS only from a same-position teammate", () => {
    const asWr = resolveTeamContext(undefined, "atl", "WR", index);
    const asRb = resolveTeamContext(undefined, "atl", "RB", index);
    // Same team, same o-line, but different positional schedules.
    expect(asWr.offensiveLineRank).toBe(asRb.offensiveLineRank);
    expect(asWr.strengthOfSchedule).toBe(6);
    expect(asRb.strengthOfSchedule).toBe(11);
  });

  it("leaves SOS undefined when the team has no teammate at that position", () => {
    const sparse = buildTeamContextIndex([
      row({ team: "zzz", position: "QB", strengthOfSchedule: 4, offensiveLineRank: 9 }),
    ]);
    const context = resolveTeamContext(undefined, "zzz", "TE", sparse);
    expect(context.offensiveLineRank).toBe(9);
    expect(context.strengthOfSchedule).toBeUndefined();
  });

  it("accepts an uppercase team code from the PAR source", () => {
    expect(resolveTeamContext(undefined, "NE", "WR", index).borrowedFrom).toBe("A.J. Brown");
  });

  it("returns nothing for a free agent or unknown team", () => {
    expect(resolveTeamContext(undefined, undefined, "WR", index)).toEqual({});
    expect(resolveTeamContext(undefined, "zzz", "WR", index)).toEqual({});
  });
});

describe("board-wide fallback behaviour", () => {
  const tiered = PAR_POSITIONS.flatMap((position) => getTieredRows(position));

  it("fires only for rows that failed name and alias matching", () => {
    for (const entry of tiered) {
      expect(Boolean(entry.teamContext.borrowedFrom)).toBe(!entry.row.jkb);
    }
  });

  it("borrows for exactly the two genuinely absent players", () => {
    const borrowed = tiered.filter((entry) => entry.teamContext.borrowedFrom);
    expect(borrowed.map((entry) => entry.row.player).sort()).toEqual([
      "Kayshon Boutte",
      "Tyquan Thornton",
    ]);
  });

  it("never borrows player-level evidence metrics", () => {
    for (const entry of tiered.filter((e) => e.teamContext.borrowedFrom)) {
      expect(entry.metrics).toEqual([undefined, undefined, undefined]);
    }
  });

  it("resolves Kyle Pitts through the alias list, not the fallback", () => {
    const pitts = getTieredRows("TE").find((entry) => entry.row.player.includes("Pitts"));
    expect(pitts?.row.jkb).toBeDefined();
    expect(pitts?.teamContext.borrowedFrom).toBeUndefined();
    expect(pitts?.teamContext.strengthOfSchedule).toBe(6);
    expect(pitts?.metrics).toEqual([3, 14, 10]);
  });
});

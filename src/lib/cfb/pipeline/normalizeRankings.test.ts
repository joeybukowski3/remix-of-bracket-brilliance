import { describe, expect, it } from "vitest";
import { CFB_TEAM_METADATA, getTeamMetadataById } from "../../../data/cfb/teamMetadata";
import {
  matchesPollKind,
  normalizeOfficialPoll,
  selectLatestPoll,
  toRankMap,
  validateOfficialPollEntries,
  type CfbdRankingWeekRaw,
  type CfbOfficialRankEntry,
} from "./normalizeRankings";

/**
 * FIXTURE DATA ONLY — the 25 schools below are an arbitrary slice of the real
 * FBS team table used to exercise shape/validation. They are NOT a real AP poll
 * and must never be treated as one or copied into a production artifact.
 */
const FIXTURE_SCHOOLS = CFB_TEAM_METADATA.slice(0, 25).map((team) => team.name);
const FIXTURE_TEAM_IDS = CFB_TEAM_METADATA.slice(0, 25).map((team) => team.id);

function fixtureRanks(schools: readonly string[] = FIXTURE_SCHOOLS) {
  return schools.map((school, index) => ({
    rank: index + 1,
    school,
    conference: null,
    firstPlaceVotes: index === 0 ? 51 : 0,
    points: 1550 - index * 40,
  }));
}

function apWeek(week: number, seasonType = "regular", schools = FIXTURE_SCHOOLS): CfbdRankingWeekRaw {
  return {
    season: 2026,
    seasonType,
    week,
    polls: [
      { poll: "Coaches Poll", ranks: fixtureRanks(schools) },
      { poll: "AP Top 25", ranks: fixtureRanks(schools) },
    ],
  };
}

function entries(count = 25): CfbOfficialRankEntry[] {
  return FIXTURE_TEAM_IDS.slice(0, count).map((teamId, index) => ({
    teamId,
    rank: index + 1,
    sourceName: FIXTURE_SCHOOLS[index],
    firstPlaceVotes: null,
    points: null,
  }));
}

describe("official poll name matching", () => {
  it("recognizes the AP poll and never confuses it with the coaches poll", () => {
    expect(matchesPollKind("AP Top 25", "ap")).toBe(true);
    expect(matchesPollKind("ap top 25", "ap")).toBe(true);
    expect(matchesPollKind("Coaches Poll", "ap")).toBe(false);
    expect(matchesPollKind("AFCA Coaches Poll", "ap")).toBe(false);
  });

  it("recognizes the CFP committee poll under its published and common names", () => {
    expect(matchesPollKind("Playoff Committee Rankings", "cfp")).toBe(true);
    expect(matchesPollKind("CFP Rankings", "cfp")).toBe(true);
    expect(matchesPollKind("AP Top 25", "cfp")).toBe(false);
  });
});

describe("active poll selection", () => {
  it("selects the preseason AP poll when it is the only one published", () => {
    const result = normalizeOfficialPoll([apWeek(1, "preseason")], "ap");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.pollName).toBe("AP Top 25");
    expect(result.selection.seasonType).toBe("preseason");
    expect(result.selection.week).toBe(1);
  });

  it("rolls forward to the latest weekly AP poll once weekly polls begin", () => {
    const weeks = [apWeek(1, "preseason"), apWeek(2), apWeek(5), apWeek(3)];
    const found = selectLatestPoll(weeks, "ap");
    expect(found?.week.week).toBe(5);
    expect(found?.week.seasonType).toBe("regular");
  });

  it("ranks postseason above regular above preseason regardless of week number", () => {
    const weeks = [apWeek(15), apWeek(1, "postseason")];
    expect(selectLatestPoll(weeks, "ap")?.week.seasonType).toBe("postseason");
  });

  it("reports a legitimately absent CFP poll as 'absent', not as an error", () => {
    const result = normalizeOfficialPoll([apWeek(1, "preseason"), apWeek(4)], "cfp");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("absent");
  });

  it("selects the CFP poll once the committee publishes it", () => {
    const cfpWeek: CfbdRankingWeekRaw = {
      season: 2026,
      seasonType: "regular",
      week: 10,
      polls: [{ poll: "Playoff Committee Rankings", ranks: fixtureRanks() }],
    };
    const result = normalizeOfficialPoll([apWeek(10), cfpWeek], "cfp");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.kind).toBe("cfp");
    expect(result.selection.week).toBe(10);
  });
});

describe("official poll validation", () => {
  it("accepts exactly 25 teams ranked 1-25", () => {
    expect(validateOfficialPollEntries(entries(25))).toEqual([]);
  });

  it("rejects a poll that is not exactly 25 teams", () => {
    expect(validateOfficialPollEntries(entries(24)).join(" ")).toContain("expected exactly 25");
    const extra = [
      ...entries(25),
      { teamId: CFB_TEAM_METADATA[30].id, rank: 26, sourceName: "x", firstPlaceVotes: null, points: null },
    ];
    expect(validateOfficialPollEntries(extra).join(" ")).toContain("expected exactly 25");
  });

  it("rejects a shared rank that does not follow real tie semantics", () => {
    // Two teams at #3, but the poll still continues at #4 — a tie must consume
    // the slot it occupies, so #4 should have been skipped.
    const rows = entries(25);
    const mutated = rows.map((row, index) => (index === 4 ? { ...row, rank: 3 } : row));
    expect(validateOfficialPollEntries(mutated).join(" ")).toContain("breaks the poll sequence");
  });

  it("accepts a legitimate tie: shared rank, equal points, next slot skipped", () => {
    // Mirrors the real 2026 preseason AP poll (USC and BYU both #14, no #15).
    const tied = entries(25).map((row) =>
      row.rank === 15 ? { ...row, rank: 14, points: 839 } : row.rank === 14 ? { ...row, points: 839 } : row,
    );
    expect(validateOfficialPollEntries(tied)).toEqual([]);
  });

  it("rejects a shared rank whose teams have differing poll points (not a real tie)", () => {
    const mismatched = entries(25).map((row) =>
      row.rank === 15 ? { ...row, rank: 14, points: 812 } : row.rank === 14 ? { ...row, points: 839 } : row,
    );
    expect(validateOfficialPollEntries(mismatched).join(" ")).toContain("not a legitimate tie");
  });

  it("rejects an unexplained gap — a skipped rank with no tie to justify it", () => {
    const gapped = entries(25).map((row) => (row.rank >= 15 ? { ...row, rank: row.rank + 1 } : row));
    expect(validateOfficialPollEntries(gapped).join(" ")).toMatch(
      /breaks the poll sequence|ranks outside 1-25/,
    );
  });

  it("rejects duplicate teams", () => {
    const rows = entries(25);
    const mutated = rows.map((row, index) => (index === 7 ? { ...row, teamId: rows[0].teamId } : row));
    expect(validateOfficialPollEntries(mutated).join(" ")).toContain("duplicate teams");
  });

  it("rejects ranks outside 1-25 — no 26+ ranks, ever", () => {
    const rows = entries(25);
    const mutated = rows.map((row, index) => (index === 24 ? { ...row, rank: 26 } : row));
    const errors = validateOfficialPollEntries(mutated).join(" ");
    expect(errors).toContain("ranks outside 1-25: 26");
  });

  it("rejects a team id absent from FBS production metadata (FCS or unmapped)", () => {
    const rows = entries(25);
    const mutated = rows.map((row, index) =>
      index === 12 ? { ...row, teamId: "north-dakota-state", sourceName: "North Dakota State" } : row,
    );
    expect(validateOfficialPollEntries(mutated).join(" ")).toContain("absent from production metadata");
  });
});

describe("team identity join", () => {
  it("maps every published school to a production FBS team id", () => {
    const result = normalizeOfficialPoll([apWeek(1, "preseason")], "ap");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const entry of result.selection.entries) {
      expect(getTeamMetadataById(entry.teamId)).toBeDefined();
    }
    expect(new Set(result.selection.entries.map((entry) => entry.teamId)).size).toBe(25);
  });

  it("resolves canonical aliases through the shared mapping table", () => {
    const aliased = [...FIXTURE_SCHOOLS];
    aliased[0] = "Ole Miss";
    const result = normalizeOfficialPoll([apWeek(1, "preseason", aliased)], "ap");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.entries[0].teamId).toBe("miss");
  });

  it("prefers a numeric external team id over name matching when the payload supplies one", () => {
    const week: CfbdRankingWeekRaw = {
      season: 2026,
      seasonType: "preseason",
      week: 1,
      polls: [
        {
          poll: "AP Top 25",
          ranks: fixtureRanks().map((row, index) => ({ ...row, teamId: 90000 + index })),
        },
      ],
    };
    const idMap = new Map(FIXTURE_TEAM_IDS.map((teamId, index) => [90000 + index, teamId]));
    const result = normalizeOfficialPoll([week], "ap", idMap);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.entries.map((entry) => entry.teamId)).toEqual(FIXTURE_TEAM_IDS);
  });

  it("fails loudly on an unrecognized school rather than fuzzy-matching it", () => {
    const unknown = [...FIXTURE_SCHOOLS];
    unknown[3] = "Definitely Not A Real School";
    const result = normalizeOfficialPoll([apWeek(1, "preseason", unknown)], "ap");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
    expect(result.errors.join(" ")).toContain("Definitely Not A Real School");
    expect(result.errors.join(" ")).toContain("no silent fuzzy match");
  });
});

describe("deterministic output", () => {
  it("produces identical, rank-ordered output across runs regardless of input order", () => {
    const forward = normalizeOfficialPoll([apWeek(1, "preseason")], "ap");
    const shuffledWeek = apWeek(1, "preseason");
    shuffledWeek.polls[1] = {
      poll: "AP Top 25",
      ranks: [...fixtureRanks()].reverse(),
    };
    const reversed = normalizeOfficialPoll([shuffledWeek], "ap");
    expect(forward.ok && reversed.ok).toBe(true);
    if (!forward.ok || !reversed.ok) return;
    expect(JSON.stringify(reversed.selection)).toBe(JSON.stringify(forward.selection));
    expect(forward.selection.entries.map((entry) => entry.rank)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
  });

  it("serializes the rank map in a stable team-id order", () => {
    const result = normalizeOfficialPoll([apWeek(1, "preseason")], "ap");
    if (!result.ok) throw new Error("fixture poll should normalize");
    const map = toRankMap(result.selection);
    expect(Object.keys(map)).toEqual([...Object.keys(map)].sort());
    expect(toRankMap(null)).toEqual({});
  });

  it("never emits a rank of 26 or higher, and omits unranked teams entirely", () => {
    const result = normalizeOfficialPoll([apWeek(1, "preseason")], "ap");
    if (!result.ok) throw new Error("fixture poll should normalize");
    const map = toRankMap(result.selection);
    expect(Object.keys(map)).toHaveLength(25);
    expect(Math.max(...Object.values(map))).toBe(25);
    const unrankedTeam = CFB_TEAM_METADATA.find((team) => !(team.id in map));
    expect(unrankedTeam).toBeDefined();
    expect(map[unrankedTeam?.id ?? ""]).toBeUndefined();
  });

  it("treats an empty or malformed payload as absent rather than publishing nothing valid", () => {
    expect(normalizeOfficialPoll([], "ap")).toMatchObject({ ok: false, reason: "absent" });
    const emptyPoll: CfbdRankingWeekRaw = {
      season: 2026,
      seasonType: "regular",
      week: 3,
      polls: [{ poll: "AP Top 25", ranks: [] }],
    };
    expect(normalizeOfficialPoll([emptyPoll], "ap")).toMatchObject({ ok: false, reason: "absent" });
  });
});

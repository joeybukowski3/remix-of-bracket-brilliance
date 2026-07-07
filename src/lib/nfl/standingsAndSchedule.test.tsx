import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { deriveStandings, sortStandings, formatStandingRecord, type CanonicalNflTeam, type NflResultRecord, type NflDataMeta } from "@/lib/nfl/standings";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning, { isMetaStale } from "@/components/nfl/StaleWarning";
import { weekLabel, kickoffLabel } from "@/pages/NFLSchedule";

const ROOT = resolve(__dirname, "../../..");
const TEAMS: CanonicalNflTeam[] = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")).teams;

function reg(partial: Partial<NflResultRecord> & Pick<NflResultRecord, "homeAbbr" | "awayAbbr" | "homeScore" | "awayScore">): NflResultRecord {
  const winner = partial.homeScore === partial.awayScore ? "TIE" : partial.homeScore > partial.awayScore ? partial.homeAbbr : partial.awayAbbr;
  return { gameId: `g-${Math.random()}`, season: 2026, week: 1, seasonType: "REG", final: true, winner, ...partial } as NflResultRecord;
}

const meta = (generatedAt: string): NflDataMeta => ({
  schemaVersion: "nfl-v0.1", generatedAt, source: "nflverse (nfldata games.csv)",
  season: 2026, week: null, modelVersion: null, notes: [],
});

describe("deriveStandings", () => {
  it("derives W/L/T, points and records from a small fixture", () => {
    // buf beats mia 30-20; buf ties nyj 17-17; mia beats ne (conf+div) 21-14; buf beats sf 28-10 (non-conference)
    const results = [
      reg({ homeAbbr: "buf", awayAbbr: "mia", homeScore: 30, awayScore: 20 }),
      reg({ homeAbbr: "nyj", awayAbbr: "buf", homeScore: 17, awayScore: 17 }),
      reg({ homeAbbr: "mia", awayAbbr: "ne", homeScore: 21, awayScore: 14 }),
      reg({ homeAbbr: "sf", awayAbbr: "buf", homeScore: 10, awayScore: 28 }),
    ];
    const rows = deriveStandings(results, TEAMS);
    const buf = rows.find((r) => r.abbr === "buf")!;
    expect(buf.wins).toBe(2);
    expect(buf.losses).toBe(0);
    expect(buf.ties).toBe(1);
    expect(buf.gamesPlayed).toBe(3);
    expect(formatStandingRecord(buf)).toBe("2-0-1");
    expect(buf.pointsFor).toBe(30 + 17 + 28);
    expect(buf.pointsAgainst).toBe(20 + 17 + 10);
    expect(buf.pointDiff).toBe(buf.pointsFor - buf.pointsAgainst);
    expect(buf.winPct).toBeCloseTo((2 + 0.5) / 3);
    expect(buf.divisionRecord).toBe("1-0-1"); // vs mia, vs nyj
    expect(buf.conferenceRecord).toBe("1-0-1"); // sf game excluded (NFC)
    const mia = rows.find((r) => r.abbr === "mia")!;
    expect(formatStandingRecord(mia)).toBe("1-1");
  });

  it("ignores playoff games for standings", () => {
    const playoff = { ...reg({ homeAbbr: "buf", awayAbbr: "mia", homeScore: 30, awayScore: 20 }), seasonType: "WC" };
    const rows = deriveStandings([playoff], TEAMS);
    expect(rows.find((r) => r.abbr === "buf")!.gamesPlayed).toBe(0);
  });

  it("empty results (2026 preseason) → no crash, all 32 teams at 0-0", () => {
    const rows = deriveStandings([], TEAMS);
    expect(rows).toHaveLength(32);
    for (const row of rows) {
      expect(formatStandingRecord(row)).toBe("0-0");
      expect(row.winPct).toBe(0);
      expect(row.pointDiff).toBe(0);
    }
  });

  it("2022 works without the cancelled BUF–CIN game (283 REG results is not an error)", () => {
    const results2022 = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2022/results.json"), "utf-8")).results as NflResultRecord[];
    const regCount = results2022.filter((r) => r.seasonType === "REG").length;
    expect(regCount).toBe(271); // 272 minus the cancelled game
    const rows = deriveStandings(results2022, TEAMS);
    const buf = rows.find((r) => r.abbr === "buf")!;
    const cin = rows.find((r) => r.abbr === "cin")!;
    expect(buf.gamesPlayed).toBe(16); // one fewer game, handled gracefully
    expect(cin.gamesPlayed).toBe(16);
  });

  it("derives correct 2025 division leader from real generated data", () => {
    const results2025 = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2025/results.json"), "utf-8")).results as NflResultRecord[];
    const rows = deriveStandings(results2025, TEAMS);
    for (const row of rows) expect(row.gamesPlayed).toBe(17);
  });
});

describe("sortStandings (documented MVP sort)", () => {
  it("sorts by win% → wins → point diff → points for", () => {
    const base = deriveStandings([], TEAMS);
    const a = { ...base[0], abbr: "a", name: "A", winPct: 0.6, wins: 6, pointDiff: 10, pointsFor: 100 };
    const b = { ...base[0], abbr: "b", name: "B", winPct: 0.6, wins: 6, pointDiff: 25, pointsFor: 90 };
    const c = { ...base[0], abbr: "c", name: "C", winPct: 0.7, wins: 7, pointDiff: -5, pointsFor: 80 };
    const d = { ...base[0], abbr: "d", name: "D", winPct: 0.6, wins: 6, pointDiff: 25, pointsFor: 120 };
    expect(sortStandings([a, b, c, d]).map((r) => r.abbr)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("LastUpdated", () => {
  it("renders source and generated date", () => {
    render(<LastUpdated meta={meta("2026-07-06T12:00:00.000Z")} />);
    const el = screen.getByTestId("nfl-last-updated");
    expect(el.textContent).toContain("nflverse");
    expect(el.textContent).toContain("Last updated");
    expect(el.textContent).toContain("Season 2026");
  });

  it("renders nothing when metadata missing", () => {
    const { container } = render(<LastUpdated meta={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("StaleWarning", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  it("appears when metadata is force-aged past the budget", () => {
    render(<StaleWarning meta={meta("2026-09-20T12:00:00.000Z")} maxAgeHours={72} now={now} />);
    expect(screen.getByTestId("nfl-stale-warning")).toBeTruthy();
  });
  it("hidden when fresh or disabled, fail-safe on missing meta", () => {
    const fresh = render(<StaleWarning meta={meta("2026-10-01T06:00:00.000Z")} maxAgeHours={72} now={now} />);
    expect(fresh.container.firstChild).toBeNull();
    const disabled = render(<StaleWarning meta={meta("2026-01-01T00:00:00.000Z")} maxAgeHours={72} enabled={false} now={now} />);
    expect(disabled.container.firstChild).toBeNull();
    expect(isMetaStale(null, 72, now)).toBe(true);
  });
});

describe("schedule helpers", () => {
  const games2026 = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2026/games.json"), "utf-8")).games;
  const games2025 = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2025/games.json"), "utf-8")).games;

  it("future 2026 games render as scheduled with week/kickoff labels", () => {
    const g = games2026[0];
    expect(g.status).toBe("scheduled");
    expect(weekLabel(g)).toBe("Week 1");
    expect(kickoffLabel(g.dateUtc)).toMatch(/Sep/);
    expect(kickoffLabel(null)).toBe("TBD");
  });

  it("historical 2025 playoff games label correctly and are final", () => {
    const sb = games2025.find((g: { seasonType: string }) => g.seasonType === "SB");
    expect(sb.status).toBe("final");
    expect(weekLabel(sb)).toBe("Super Bowl");
  });
});

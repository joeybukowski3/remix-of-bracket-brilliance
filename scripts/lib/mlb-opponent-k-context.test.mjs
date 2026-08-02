import { describe, expect, it, vi } from "vitest";
import { fetchTeamStrikeoutContext, fetchTeamXbaContext, parseCsv } from "./mlb-opponent-k-context.mjs";

function textResponse(text, status = 200) {
  return new Response(text, { status, headers: { "content-type": "text/plain" } });
}

describe("mlb opponent K context", () => {
  it("parses quoted Savant CSV safely", () => {
    const rows = parseCsv('game_date,events,des\n2026-07-01,single,"Ball, in play"\n');
    expect(rows).toEqual([{ game_date: "2026-07-01", events: "single", des: "Ball, in play" }]);
  });

  it("derives home, away, and last-10 strikeout tendencies from MLB game logs", async () => {
    const splits = [
      { date: "2026-07-12", isHome: true, stat: { strikeOuts: 11 } },
      { date: "2026-07-11", isHome: false, stat: { strikeOuts: 8 } },
      { date: "2026-07-10", isHome: true, stat: { strikeOuts: 9 } },
      { date: "2026-07-09", isHome: false, stat: { strikeOuts: 6 } },
      { date: "2026-07-08", isHome: true, stat: { strikeOuts: 10 } },
      { date: "2026-07-07", isHome: false, stat: { strikeOuts: 7 } },
      { date: "2026-07-06", isHome: true, stat: { strikeOuts: 12 } },
      { date: "2026-07-05", isHome: false, stat: { strikeOuts: 5 } },
      { date: "2026-07-04", isHome: true, stat: { strikeOuts: 8 } },
      { date: "2026-07-03", isHome: false, stat: { strikeOuts: 9 } },
      { date: "2026-07-02", isHome: true, stat: { strikeOuts: 20 } },
      { date: "2026-07-13", isHome: true, stat: { strikeOuts: 99 } },
    ];
    const fetchImpl = vi.fn(async () => textResponse(JSON.stringify({ stats: [{ splits }] })));
    const context = await fetchTeamStrikeoutContext(144, 2026, "2026-07-13", { fetchImpl });

    expect(context.homeKPerNine).toBeCloseTo((11 + 9 + 10 + 12 + 8 + 20) / 6, 6);
    expect(context.awayKPerNine).toBeCloseTo((8 + 6 + 7 + 5 + 9) / 5, 6);
    expect(context.last10KPerNine).toBeCloseTo((11 + 8 + 9 + 6 + 10 + 7 + 12 + 5 + 8 + 9) / 10, 6);
    expect(context.games.last10).toBe(10);
  });

  it("derives Savant xBA home/away and recent samples and uses the official team filter", async () => {
    const csv = [
      "game_pk,game_date,events,home_team,away_team,estimated_ba_using_speedangle",
      "1003,2026-07-12,single,ATL,NYM,0.800",
      "1003,2026-07-12,field_out,ATL,NYM,0.200",
      "1002,2026-07-11,strikeout,PHI,ATL,",
      "1002,2026-07-11,double,PHI,ATL,0.600",
      "1001,2026-07-10,field_out,ATL,MIA,0.100",
    ].join("\n");
    const fetchImpl = vi.fn(async (url) => {
      expect(String(url)).toContain("hfTeam=ATL%7C");
      expect(String(url)).toContain("player_type=batter");
      return textResponse(csv);
    });

    const context = await fetchTeamXbaContext("ATL", 2026, "2026-07-13", { fetchImpl });
    expect(context.homeXba).toBeCloseTo((0.8 + 0.2 + 0.1) / 3, 6);
    expect(context.awayXba).toBeCloseTo((0 + 0.6) / 2, 6);
    expect(context.last10Xba).toBeCloseTo((0.8 + 0.2 + 0 + 0.6 + 0.1) / 5, 6);
    expect(context.samples.last10Games).toBe(3);
  });

  it("counts a doubleheader as two separate games in the recent xBA sample", async () => {
    const rows = ["game_pk,game_date,events,home_team,away_team,estimated_ba_using_speedangle"];
    for (let i = 0; i < 9; i += 1) {
      rows.push(`${2000 + i},2026-07-${String(12 - i).padStart(2, "0")},field_out,ATL,NYM,0.100`);
    }
    rows.push("3002,2026-07-03,single,ATL,NYM,0.900");
    rows.push("3001,2026-07-03,single,ATL,NYM,0.800");
    const fetchImpl = vi.fn(async () => textResponse(rows.join("\n")));

    const context = await fetchTeamXbaContext("ATL", 2026, "2026-07-13", { fetchImpl });
    expect(context.samples.last10Games).toBe(10);
    expect(context.samples.last10AtBats).toBe(10);
  });
});

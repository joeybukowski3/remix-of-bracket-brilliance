import { describe, expect, it, vi } from "vitest";
import { fetchOpponentContext, fetchTeamStrikeoutContext, fetchTeamXbaContext, parseCsv } from "./mlb-opponent-k-context.mjs";

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

  it("uses only completed games before the slate date and counts doubleheaders separately", async () => {
    const splits = [
      { gamePk: 3011, date: "2026-07-13", isHome: true, game: { status: { abstractGameState: "Final" } }, stat: { strikeOuts: 99 } },
      { gamePk: 3010, date: "2026-07-12", isHome: true, game: { status: { abstractGameState: "Live" } }, stat: { strikeOuts: 88 } },
      { gamePk: 3009, date: "2026-07-11", isHome: true, game: { status: { abstractGameState: "Final" } }, stat: { strikeOuts: 9 } },
      { gamePk: 3008, date: "2026-07-10", isHome: false, game: { status: { detailedState: "Final" } }, stat: { strikeOuts: 8 } },
      { gamePk: 3007, date: "2026-07-09", isHome: true, game: { status: { codedGameState: "F" } }, stat: { strikeOuts: 7 } },
      { gamePk: 3006, date: "2026-07-08", isHome: false, stat: { strikeOuts: 6 } },
      { gamePk: 3005, date: "2026-07-07", isHome: true, stat: { strikeOuts: 5 } },
      { gamePk: 3004, date: "2026-07-06", isHome: false, stat: { strikeOuts: 4 } },
      { gamePk: 3003, date: "2026-07-05", isHome: true, stat: { strikeOuts: 3 } },
      { gamePk: 3002, date: "2026-07-04", isHome: false, stat: { strikeOuts: 2 } },
      { gamePk: 3001, date: "2026-07-04", isHome: true, stat: { strikeOuts: 1 } },
      { gamePk: 3000, date: "2026-07-03", isHome: false, stat: { strikeOuts: 20 } },
    ];
    const fetchImpl = vi.fn(async () => textResponse(JSON.stringify({ stats: [{ splits }] })));
    const context = await fetchTeamStrikeoutContext(144, 2026, "2026-07-13", { fetchImpl });

    expect(context.games.season).toBe(10);
    expect(context.games.home).toBe(5);
    expect(context.games.away).toBe(5);
    expect(context.last10KPerNine).toBeCloseTo(6.5, 6);
    expect(context.last10Games.map((game) => game.gamePk)).toContain(3002);
    expect(context.last10Games.map((game) => game.gamePk)).toContain(3001);
    expect(context.source).toBe("mlb_stats_api");
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

  it("excludes on/after-slate and non-completed game ids from xBA and never substitutes observed AVG", async () => {
    const csv = [
      "game_pk,game_date,events,home_team,away_team,estimated_ba_using_speedangle",
      "4001,2026-07-12,single,ATL,NYM,0.700",
      "4001,2026-07-12,double,ATL,NYM,",
      "4002,2026-07-12,field_out,PHI,ATL,0.100",
      "4999,2026-07-12,home_run,ATL,MIA,0.990",
      "5000,2026-07-13,single,ATL,NYM,0.990",
    ].join("\n");
    const fetchImpl = vi.fn(async () => textResponse(csv));
    const context = await fetchTeamXbaContext("ATL", 2026, "2026-07-13", {
      fetchImpl,
      completedGamePks: [4001, 4002],
      last10GamePks: [4002, 4001],
    });

    expect(context.homeXba).toBeCloseTo(0.7, 6);
    expect(context.awayXba).toBeCloseTo(0.1, 6);
    expect(context.last10Xba).toBeCloseTo(0.4, 6);
    expect(context.samples.homeAtBats).toBe(1);
    expect(context.samples.last10Games).toBe(2);
    expect(context.source).toBe("baseball_savant_statcast");
  });

  it("preserves K data, samples, source metadata, and a nonfatal warning when Savant fails", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("statsapi.mlb.com")) {
        return textResponse(JSON.stringify({ stats: [{ splits: [
          { gamePk: 6001, date: "2026-07-12", isHome: false, stat: { strikeOuts: 8 } },
        ] }] }));
      }
      return textResponse("unavailable", 503);
    });

    const context = await fetchOpponentContext(144, "ATL", 2026, "2026-07-13", { fetchImpl });
    expect(context.away.kPerNine).toBe(8);
    expect(context.last10.kPerNine).toBe(8);
    expect(context.home.xba).toBeNull();
    expect(context.last10.xba).toBeNull();
    expect(context.samples).toMatchObject({ season: 1, away: 1, last10: 1 });
    expect(context.sources).toEqual({ strikeouts: "mlb_stats_api", xba: "baseball_savant_statcast" });
    expect(context.warnings[0]).toMatch(/^OPPONENT_XBA_CONTEXT_FAILED:/);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildLeagueReferenceContext,
  fetchLeagueReferencePlateAppearances,
  fetchTeamReferencePlateAppearances,
} from "./mlb-strikeout-reference-context.mjs";

function paRow(team, date, gamePk, { strikeout = 0, woba = 0.320, hand = "R", site = "home" } = {}) {
  return {
    date,
    gamePk: String(gamePk),
    team,
    site,
    pitcherHand: hand,
    strikeout,
    wobaValue: woba,
    wobaDenom: 1,
    runsScored: null,
  };
}

/** N teams, each with a distinct season-long wOBA/K profile so ranks are total. */
function leagueRows(teamCount, { skipTeams = [] } = {}) {
  const rowsByTeam = new Map();
  for (let index = 0; index < teamCount; index += 1) {
    const team = `T${String(index).padStart(2, "0")}`;
    if (skipTeams.includes(team)) {
      rowsByTeam.set(team, []);
      continue;
    }
    const rows = [];
    for (let day = 1; day <= 12; day += 1) {
      rows.push(paRow(team, `2026-07-${String(day).padStart(2, "0")}`, `${index}${day}`, {
        strikeout: day <= index % 6 ? 1 : 0,
        woba: 0.280 + index * 0.004,
      }));
    }
    rowsByTeam.set(team, rows);
  }
  return rowsByTeam;
}

describe("buildLeagueReferenceContext rank resilience", () => {
  it("ranks every team 1..N when the whole league reported", () => {
    const context = buildLeagueReferenceContext(leagueRows(10), "2026-07-20", "R", { expectedTeamCount: 10 });
    const wrcRanks = [...context.values()].map((entry) => entry.opponentWrcPlusRankL30);
    expect(wrcRanks.filter((rank) => rank != null)).toHaveLength(10);
    expect(new Set(wrcRanks)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it("keeps ranking the reporting teams when one feed fails (no wholesale blanking)", () => {
    const context = buildLeagueReferenceContext(leagueRows(10, { skipTeams: ["T03"] }), "2026-07-20", "R", { expectedTeamCount: 10 });
    expect(context.get("T03").opponentWrcPlusRankL30).toBeNull();
    expect(context.get("T03").opponentKRateRankL30).toBeNull();
    const populated = [...context.values()].filter((entry) => entry.opponentWrcPlusRankL30 != null);
    expect(populated).toHaveLength(9);
    expect([...context.values()].map((entry) => entry.opponentWrcPlusRankL30).filter(Boolean).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("emits no ranks when a source outage drops most of the league", () => {
    const context = buildLeagueReferenceContext(
      leagueRows(10, { skipTeams: ["T02", "T03", "T04", "T05", "T06"] }),
      "2026-07-20",
      "R",
      { expectedTeamCount: 10 },
    );
    expect([...context.values()].every((entry) => entry.opponentWrcPlusRankL30 == null)).toBe(true);
  });
});

function textResponse(text, status = 200) {
  return new Response(text, { status, headers: { "content-type": "text/plain" } });
}

const CSV_HEADER = "game_pk,game_date,events,home_team,away_team,p_throws,woba_value,woba_denom,bat_score,post_bat_score";

describe("mlb strikeout reference context reliability", () => {
  it("retries a transient Savant abort and still returns rows", async () => {
    let calls = 0;
    const csv = [CSV_HEADER, "1,2026-07-01,strikeout,ATL,NYM,R,0,1,0,0"].join("\n");
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new DOMException("timed out", "AbortError");
      return textResponse(csv);
    });

    const rows = await fetchTeamReferencePlateAppearances("ATL", 2026, "2026-07-02", { fetchImpl });
    expect(calls).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it("retries a transient 503 before giving up", async () => {
    let calls = 0;
    const csv = [CSV_HEADER, "1,2026-07-01,strikeout,ATL,NYM,R,0,1,0,0"].join("\n");
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return textResponse("unavailable", 503);
      return textResponse(csv);
    });

    const rows = await fetchTeamReferencePlateAppearances("ATL", 2026, "2026-07-02", { fetchImpl });
    expect(calls).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it("records a per-team error and keeps other teams intact when one feed exhausts its retries", async () => {
    const csv = [CSV_HEADER, "1,2026-07-01,strikeout,NYM,ATL,R,0,1,0,0"].join("\n");
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("hfTeam=ATL")) return textResponse("down", 503);
      return textResponse(csv);
    });

    const teams = [{ abbreviation: "ATL" }, { abbreviation: "NYM" }];
    const { rowsByTeam, errors } = await fetchLeagueReferencePlateAppearances(teams, 2026, "2026-07-02", {
      fetchImpl,
      logProgress: false,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ATL:/);
    expect(rowsByTeam.get("ATL")).toEqual([]);
    expect(rowsByTeam.get("NYM")).toHaveLength(1);
  });

  it("logs incremental team progress instead of appearing frozen", async () => {
    const csv = [CSV_HEADER, "1,2026-07-01,strikeout,ATL,NYM,R,0,1,0,0"].join("\n");
    const fetchImpl = vi.fn(async () => textResponse(csv));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const teams = [{ abbreviation: "ATL" }, { abbreviation: "NYM" }, { abbreviation: "PHI" }];
    await fetchLeagueReferencePlateAppearances(teams, 2026, "2026-07-02", { fetchImpl });

    const progressLines = logSpy.mock.calls.map((call) => call[0]).filter((line) => String(line).includes("[reference-context]"));
    expect(progressLines).toHaveLength(3);
    expect(progressLines.at(-1)).toBe("[reference-context] fetched 3/3 teams");

    logSpy.mockRestore();
  });
});

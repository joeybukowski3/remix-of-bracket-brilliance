import { describe, expect, it, vi } from "vitest";
import { fetchLeagueReferencePlateAppearances, fetchTeamReferencePlateAppearances } from "./mlb-strikeout-reference-context.mjs";

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

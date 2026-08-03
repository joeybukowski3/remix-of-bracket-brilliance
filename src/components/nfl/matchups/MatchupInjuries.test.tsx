import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupInjuries from "@/components/nfl/matchups/MatchupInjuries";
import { unavailableInjuryResolver } from "@/lib/nfl/matchupMetrics";
import type {
  NflInjuryEntry,
  NflInjuryResolver,
  NflTeamInjuryProfile,
} from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "team-a",
    abbr: "taa",
    teamName: "Team A",
    division: "AFC East",
    conference: "AFC",
    color: "#000000",
    projectedWins: 8.5,
    marketWinTotal: 8.5,
    modelVsMarketGap: 0,
    recommendationLabel: "Pass",
    confidenceLabel: "Low",
    regressionGap: 0,
    regressionSignal: "Neutral",
    powerRank: 16,
    offenseRank: 16,
    defenseRank: 16,
    scheduleRank: 16,
    scheduleLabel: "Average",
    record2025: "8-9",
    overallPct: 0,
    offensePct: 0,
    defensePct: 0,
    headline: "",
    editorialSummary: "",
    strengths: [],
    concerns: [],
    keyQuestions: [],
    ...overrides,
  };
}

const AWAY = makeTeam({ slug: "new-england-patriots", abbr: "ne", teamName: "New England Patriots" });
const HOME = makeTeam({ slug: "seattle-seahawks", abbr: "sea", teamName: "Seattle Seahawks" });

const MATCHUP: NflMatchup = {
  gameId: "2026_01_NE_SEA",
  slug: "new-england-patriots-at-seattle-seahawks",
  week: 1,
  kickoff: "2026-09-13T17:00:00Z",
  away: AWAY,
  home: HOME,
} as unknown as NflMatchup;

function entry(overrides: Partial<NflInjuryEntry> = {}): NflInjuryEntry {
  return {
    playerId: "00-0034828",
    playerName: "Harold Landry III",
    position: "LB",
    depthChartPosition: "OLB",
    unit: "defense",
    gameStatus: "QUESTIONABLE",
    practiceStatus: "FULL",
    reserveStatus: null,
    injuryDescription: "Knee",
    lastGameSnapPct: 74,
    seasonSnapPct: 78.7,
    ...overrides,
  };
}

function resolverFor(entries: NflInjuryEntry[]): NflInjuryResolver {
  const profile: NflTeamInjuryProfile = {
    entries,
    summary: {
      out: entries.filter((row) => row.gameStatus === "OUT").length,
      doubtful: entries.filter((row) => row.gameStatus === "DOUBTFUL").length,
      questionable: entries.filter((row) => row.gameStatus === "QUESTIONABLE").length,
      reserve: entries.filter((row) => row.gameStatus == null && row.reserveStatus === "RESERVE").length,
    },
  };
  return (slug: string) => (slug === AWAY.slug ? profile : null);
}

function renderInjuries(resolver: NflInjuryResolver, props = {}) {
  return render(
    <MemoryRouter>
      <MatchupInjuries matchup={MATCHUP} resolver={resolver} {...props} />
    </MemoryRouter>
  );
}


describe("MatchupInjuries columns", () => {
  it("renders the five product columns", () => {
    renderInjuries(resolverFor([entry()]));
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Player", "Pos", "Status", "Last Gm", "Season"]);
  });

  it("shows player, position and both snap shares", () => {
    renderInjuries(resolverFor([entry()]));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Harold Landry III")).toBeTruthy();
    expect(within(table).getByText("LB")).toBeTruthy();
    expect(within(table).getByText("74%")).toBeTruthy();
    expect(within(table).getByText("79%")).toBeTruthy();
  });
});

describe("status rendering", () => {
  it("renders Out, Doubtful, Questionable and Reserve", () => {
    renderInjuries(
      resolverFor([
        entry({ playerId: "1", playerName: "A", gameStatus: "OUT" }),
        entry({ playerId: "2", playerName: "B", gameStatus: "DOUBTFUL" }),
        entry({ playerId: "3", playerName: "C", gameStatus: "QUESTIONABLE" }),
        entry({ playerId: "4", playerName: "D", gameStatus: null, reserveStatus: "RESERVE" }),
      ])
    );
    const table = screen.getByRole("table");
    for (const label of ["Out", "Doubtful", "Questionable", "Reserve"]) {
      expect(within(table).getByText(label), label).toBeTruthy();
    }
  });

  it("shows Reserve when the game status is null but reserve status is set", () => {
    renderInjuries(resolverFor([entry({ gameStatus: null, reserveStatus: "RESERVE" })]));
    expect(within(screen.getByRole("table")).getByText("Reserve")).toBeTruthy();
  });

  it("keeps the game designation when a player is both designated and on reserve", () => {
    renderInjuries(resolverFor([entry({ gameStatus: "OUT", reserveStatus: "RESERVE" })]));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Out")).toBeTruthy();
    expect(within(table).queryByText("Reserve")).toBeNull();
  });

  it("renders practice status as secondary context, never as the designation", () => {
    renderInjuries(
      resolverFor([
        entry({ playerId: "1", playerName: "A", practiceStatus: "DID_NOT_PARTICIPATE" }),
        entry({ playerId: "2", playerName: "B", practiceStatus: "LIMITED" }),
        entry({ playerId: "3", playerName: "C", practiceStatus: "FULL" }),
      ])
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("DNP")).toBeTruthy();
    expect(within(table).getByText("Limited")).toBeTruthy();
    expect(within(table).getByText("Full")).toBeTruthy();
    // Every row still carries its own game designation.
    expect(within(table).getAllByText("Questionable")).toHaveLength(3);
  });

  it("never labels reserve as IR, PUP or NFI", () => {
    renderInjuries(resolverFor([entry({ gameStatus: null, reserveStatus: "RESERVE" })]));
    expect(screen.queryByText(/\b(IR|PUP|NFI)\b/)).toBeNull();
  });
});

describe("snap value semantics", () => {
  it("renders a null snap share as N/A", () => {
    renderInjuries(resolverFor([entry({ lastGameSnapPct: null, seasonSnapPct: null })]));
    expect(within(screen.getByRole("table")).getAllByText("N/A")).toHaveLength(2);
  });

  it("renders a genuine zero as 0%, not N/A", () => {
    renderInjuries(resolverFor([entry({ lastGameSnapPct: 0, seasonSnapPct: 12 })]));
    const table = screen.getByRole("table");
    expect(within(table).getByText("0%")).toBeTruthy();
    expect(within(table).queryByText("N/A")).toBeNull();
  });

  it("distinguishes did-not-dress from played-zero-snaps in the same table", () => {
    renderInjuries(
      resolverFor([
        entry({ playerId: "1", playerName: "Dressed", lastGameSnapPct: 0, seasonSnapPct: 40 }),
        entry({ playerId: "2", playerName: "Inactive", lastGameSnapPct: null, seasonSnapPct: 40 }),
      ])
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("0%")).toBeTruthy();
    expect(within(table).getByText("N/A")).toBeTruthy();
  });
});

describe("team summary", () => {
  it("shows designation counts and no impact number", () => {
    renderInjuries(
      resolverFor([
        entry({ playerId: "1", playerName: "A", gameStatus: "OUT" }),
        entry({ playerId: "2", playerName: "B", gameStatus: "OUT" }),
        entry({ playerId: "3", playerName: "C", gameStatus: "QUESTIONABLE" }),
      ])
    );
    // The summary list is the only place counts appear; row badges are separate.
    const summary = document.querySelector("dl")!;
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain("2");
    expect(summary.textContent).toContain("Out");
    expect(summary.textContent).toContain("Qst");
    // Counts only — no derived number of any kind alongside them.
    expect(summary.textContent).not.toMatch(/impact|points|spread|prob/i);
  });
});

describe("unavailable state", () => {
  it("keeps the section visible with an explanation and no table", () => {
    renderInjuries(unavailableInjuryResolver, {
      unavailableMessage: "2026 injury and snap data has not been published yet.",
    });
    expect(screen.getAllByText(/has not been published yet/i)).toHaveLength(2);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the unavailable message for a team with no profile", () => {
    renderInjuries(resolverFor([entry()]), { unavailableMessage: "Injury report not connected." });
    // Away resolves; home does not.
    expect(screen.getAllByText(/injury report not connected/i)).toHaveLength(1);
  });
});

describe("section guarantees", () => {
  it("states that specialists are excluded", () => {
    renderInjuries(resolverFor([entry()]));
    expect(screen.getByText(/specialists are excluded/i)).toBeTruthy();
  });

  it("renders no special-teams column or value", () => {
    renderInjuries(resolverFor([entry()]));
    expect(screen.queryByText(/special teams|ST %|st_pct/i)).toBeNull();
  });

  it("shows no projected spread, model edge or win probability in the data region", () => {
    renderInjuries(resolverFor([entry({ gameStatus: "OUT" })]));
    // The section heading is excluded; only the rendered data is asserted on.
    const table = screen.getByRole("table");
    expect(table.textContent).not.toMatch(/spread|win prob|model edge|projected|impact/i);
    // And no numeric score is emitted beside the two snap percentages.
    const numbers = [...table.querySelectorAll("td")]
      .map((cell) => cell.textContent ?? "")
      .filter((text) => /^\d+%$/.test(text.trim()));
    expect(numbers).toHaveLength(2);
  });

  it("uses a fixed layout, wraps long names and truncates the injury note", () => {
    renderInjuries(
      resolverFor([entry({ playerName: "Christopher Bartholomew Featherstonehaugh Jr." })])
    );
    const table = screen.getByRole("table");
    expect(table.className).toContain("table-fixed");

    const [name, note] = table.querySelectorAll("tbody td span");
    // The name stays fully readable rather than being cut to an ellipsis.
    expect(name.textContent).toBe("Christopher Bartholomew Featherstonehaugh Jr.");
    expect(name.className).not.toContain("truncate");
    // The secondary injury note is the part allowed to truncate.
    expect(note.className).toContain("truncate");
  });
});

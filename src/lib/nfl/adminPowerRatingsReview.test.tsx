import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import AdminNflPowerRatings from "@/pages/AdminNflPowerRatings";
import { NFL_SECTION_NAV_ITEMS } from "@/lib/nfl/sectionNav";
import {
  computePlayoffTeams,
  computeRecordRanks,
  computeReviewFlags,
  type PowerRatingRow,
  type TeamStatsRow,
} from "@/lib/nfl/powerRatingsReview";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

const ROOT = resolve(__dirname, "../../..");

// Serve the real generated JSON from disk for the page's local fetches.
beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/^\/data\/nfl\/(\d{4})\/([a-z-]+\.json)$/);
    if (!match) throw new Error(`Unexpected fetch in test: ${url}`);
    const body = readFileSync(join(ROOT, `public/data/nfl/${match[1]}/${match[2]}`), "utf-8");
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/nfl/power-ratings"]}>
      <AdminNflPowerRatings />
    </MemoryRouter>
  );
}

describe("internal power ratings review page", () => {
  it("renders with model metadata for the default season (2025)", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText("nfl-power-v0.2").length).toBeGreaterThan(0));
    expect(screen.getByText("NFL Power Ratings Review")).toBeTruthy();
    expect(screen.getAllByText(/v0\.2-epa/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("experimental-note").textContent).toContain("not validated and not betting guidance");
  });

  it("season selector includes 2022-2026", () => {
    renderPage();
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      expect(screen.getByRole("button", { name: String(year) })).toBeTruthy();
    }
  });

  it("completed seasons show 32 rated rows with component breakdowns", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("component-pointDifferentialPerGame")).toHaveLength(32));
    const cell = screen.getAllByTestId("component-pointDifferentialPerGame")[0];
    expect(cell.textContent).toMatch(/→/); // raw → normalized
    expect(cell.textContent).toMatch(/×0\.35/); // weight
    expect(screen.getAllByTestId("component-offensiveEpaPerPlay").length).toBe(32);
    expect(screen.getAllByTestId("component-defensiveEpaPerPlay").length).toBe(32);
  });

  it("2026 shows the unrated/placeholder state", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    await waitFor(() => expect(screen.getByTestId("unrated-note")).toBeTruthy());
    expect(screen.getByTestId("unrated-note").textContent).toContain("Nothing is seeded or invented");
    expect(screen.queryAllByTestId("component-pointDifferentialPerGame")).toHaveLength(0);
  });

  it("switching seasons loads that season's data (2022)", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2022" }));
    await waitFor(() => expect(screen.getAllByText(/Buffalo Bills/).length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("component-pointDifferentialPerGame")).toHaveLength(32);
  });

  it("renders no betting/pick/odds language", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText("nfl-power-v0.2").length).toBeGreaterThan(0));
    const text = document.body.textContent ?? "";
    for (const banned of ["best bet", "wager", "lock", "cover", " pick", "parlay", "moneyline", "spread"]) {
      expect(text.toLowerCase(), banned).not.toContain(banned);
    }
    // "odds" must not appear as market language (page never uses it).
    expect(text.toLowerCase()).not.toContain("odds");
  });
});

describe("route hygiene", () => {
  it("the admin route is not in the public NFL section nav", () => {
    for (const item of NFL_SECTION_NAV_ITEMS) {
      expect(item.to.startsWith("/admin")).toBe(false);
    }
  });

  it("no public nav or sitemap references the admin route", () => {
    const navSource = readFileSync(join(ROOT, "src/lib/nfl/sectionNav.ts"), "utf-8");
    expect(navSource).not.toContain("/admin");
    const seoScript = readFileSync(join(ROOT, "scripts/generate-seo-files.mjs"), "utf-8");
    expect(seoScript).not.toContain("/admin");
  });

  it("no frontend code fetches nflverse/stats_team (generator only)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const source = readFileSync(join(ROOT, rel), "utf-8");
          if (/nflverse-data|stats_team|raw\.githubusercontent/.test(source)) offenders.push(rel);
        }
      }
    };
    for (const dir of ["src/pages", "src/hooks", "src/components", "src/lib"]) walk(dir);
    expect(offenders).toEqual([]);
  });
});

describe("review flags (fixtures)", () => {
  const baseRow: PowerRatingRow = {
    teamId: "nfl-buf",
    slug: "buffalo-bills",
    abbr: "buf",
    name: "Buffalo Bills",
    season: 2025,
    rating: 80,
    rank: 2,
    offenseRating: 90,
    defenseRating: 85,
    scheduleAdjustment: 50,
    components: {},
    modelVersion: "nfl-power-v0.2",
    notes: "",
  };
  const stats = (abbr: string, wins: number, losses: number, epa: number | null): TeamStatsRow => ({
    abbr,
    wins,
    losses,
    ties: 0,
    gamesPlayed: wins + losses,
    winPercentage: wins / (wins + losses),
    offensiveEpaPerPlay: epa,
    defensiveEpaPerPlay: epa,
    scheduleStrength: 0,
  });

  it("flags record disagreement in both directions", () => {
    const ranks = new Map([
      ["buf", 12],
      ["kc", 1],
    ]);
    const efficiencyOverRecord = computeReviewFlags({ ...baseRow, rank: 2 }, stats("buf", 8, 9, 0.1), ranks, new Set());
    expect(efficiencyOverRecord.some((f) => f.kind === "efficiency-over-record")).toBe(true);
    const recordOverEfficiency = computeReviewFlags(
      { ...baseRow, abbr: "kc", rank: 15 },
      stats("kc", 14, 3, 0.1),
      ranks,
      new Set()
    );
    expect(recordOverEfficiency.some((f) => f.kind === "record-over-efficiency")).toBe(true);
  });

  it("flags playoff/top-12 mismatches only when playoff data exists", () => {
    const playoff = new Set(["kc"]);
    const top12NonPlayoff = computeReviewFlags({ ...baseRow, rank: 5 }, stats("buf", 10, 7, 0.1), new Map(), playoff);
    expect(top12NonPlayoff.some((f) => f.kind === "top12-non-playoff")).toBe(true);
    const playoffOutside = computeReviewFlags(
      { ...baseRow, abbr: "kc", rank: 20 },
      stats("kc", 11, 6, 0.1),
      new Map(),
      playoff
    );
    expect(playoffOutside.some((f) => f.kind === "playoff-outside-top12")).toBe(true);
    const noPlayoffData = computeReviewFlags({ ...baseRow, rank: 5 }, stats("buf", 10, 7, 0.1), new Map(), new Set());
    expect(noPlayoffData.some((f) => f.kind === "top12-non-playoff")).toBe(false);
  });

  it("flags schedule context and missing efficiency data gracefully", () => {
    const hard = computeReviewFlags({ ...baseRow, scheduleAdjustment: 92 }, stats("buf", 9, 8, 0.1), new Map(), new Set());
    expect(hard.some((f) => f.label.includes("very hard"))).toBe(true);
    const missingEpa = computeReviewFlags(baseRow, stats("buf", 9, 8, null), new Map(), new Set());
    expect(missingEpa.some((f) => f.kind === "missing-efficiency-data")).toBe(true);
    const nullSchedule = computeReviewFlags({ ...baseRow, scheduleAdjustment: null }, stats("buf", 9, 8, 0.1), new Map(), new Set());
    expect(nullSchedule.some((f) => f.kind === "schedule-context")).toBe(false);
  });

  it("real 2022 data produces the known playoff/top-12 review flags", () => {
    const ratings = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2022/power-ratings.json"), "utf-8")).ratings;
    const teamStats = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2022/team-stats.json"), "utf-8")).teamStats;
    const results = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2022/results.json"), "utf-8")).results;
    const recordRanks = computeRecordRanks(teamStats);
    const playoffTeams = computePlayoffTeams(results);
    const statsByAbbr = new Map(teamStats.map((t: TeamStatsRow) => [t.abbr, t]));
    const nyj = ratings.find((r: PowerRatingRow) => r.abbr === "nyj")!;
    const nyjFlags = computeReviewFlags(nyj, statsByAbbr.get("nyj") as TeamStatsRow, recordRanks, playoffTeams);
    expect(nyjFlags.some((f) => f.kind === "efficiency-over-record")).toBe(true);
    expect(nyjFlags.some((f) => f.kind === "top12-non-playoff")).toBe(true);
  });
});

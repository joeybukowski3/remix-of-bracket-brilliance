import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import NFLStandings from "@/pages/NFLStandings";

const ROOT = resolve(__dirname, "../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function committedFetch(input: RequestInfo | URL): Promise<Response> {
  const requestPath = String(input);
  const relative = requestPath.replace(/^\/data\/nfl\//, "").replaceAll("/", "\\");
  const path = join(NFL_DATA, relative);
  if (!existsSync(path)) return new Response("not found", { status: 404 });
  return new Response(readFileSync(path, "utf8"), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function noResultFetch(input: RequestInfo | URL): Promise<Response> {
  if (String(input) === "/data/nfl/2026/results.json") {
    return jsonResponse({ _meta: { season: 2026, generatedAt: "2026-08-01T00:00:00.000Z" }, results: [] });
  }
  return committedFetch(input);
}

async function zeroGameFetch(input: RequestInfo | URL): Promise<Response> {
  if (String(input) === "/data/nfl/2026/team-performance-analytics.json") {
    const artifact = JSON.parse(readFileSync(join(NFL_DATA, "2026", "team-performance-analytics.json"), "utf8"));
    for (const row of artifact.teams) {
      row.gamesPlayed = 0;
      row.windows.fullSeason.sampleSize = 0;
      row.windows.last4.sampleSize = 0;
      row.windows.last8.sampleSize = 0;
      for (const field of Object.keys(row.performance)) row.performance[field] = null;
    }
    return jsonResponse(artifact);
  }
  return noResultFetch(input);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FORBIDDEN_TERMS = ["claude", "anthropic", "guide", "odds", "spread", "picks", "betting", "wager", "sportsbook"];

/**
 * The 2026 preseason division card renders a mobile card list AND a desktop
 * table simultaneously (Tailwind `sm:hidden` / `hidden sm:block` — jsdom does
 * not evaluate the media query, so both are present in the DOM). Every
 * division also repeats its own header row. So "one match" assertions are
 * wrong for anything that appears per-division or per-breakpoint; these
 * tests deliberately use getAllBy* and assert on count/scoped content
 * instead of a single unique node.
 */
function firstRamsCard() {
  const links = screen.getAllByRole("link", { name: /Open LA Rams team dashboard/i });
  return links.map((link) => (link.closest("li") ?? link.closest("tr")) as HTMLElement);
}

describe("NFLStandings — 2026 preseason projection view", () => {
  it("shows the new projection columns and not the legacy Pwr/Off/Def columns", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    expect((await screen.findAllByText("2025 Adj")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Δ26").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OVR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SOS").length).toBeGreaterThan(0);

    expect(screen.queryByText("Pwr")).not.toBeInTheDocument();
    expect(screen.queryByText("Off")).not.toBeInTheDocument();
    expect(screen.queryByText("Def")).not.toBeInTheDocument();

    expect(screen.getByText(/preseason view.*projected Power Rating/i)).toBeInTheDocument();
  });

  it("renders rating2026 to one decimal with NFL rank, and rating2025Adjusted, for the Rams", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    for (const card of firstRamsCard()) {
      const scoped = within(card);
      expect(scoped.getAllByText("82.8").length).toBeGreaterThan(0);
      expect(scoped.getAllByText(/#1 NFL/).length).toBeGreaterThan(0);
      expect(scoped.getAllByText("80.3").length).toBeGreaterThan(0);
    }
  });

  it("renders projectionAdjustment2026 with positive/negative/zero treatment", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    for (const card of firstRamsCard()) {
      expect(within(card).getAllByText("+2.5").length).toBeGreaterThan(0);
    }

    const seahawksLinks = screen.getAllByRole("link", { name: /Open Seattle Seahawks team dashboard/i });
    for (const link of seahawksLinks) {
      const card = within((link.closest("li") ?? link.closest("tr")) as HTMLElement);
      expect(card.getAllByText("-0.5").length).toBeGreaterThan(0);
    }

    // Zero-delta formatting is covered by divisionBoard2026's focused unit test.
  });

  it("renders the SOS rank and exposes the average opponent rating accessibly", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    let sawAccessibleAvg = false;
    for (const card of firstRamsCard()) {
      const sosBadges = within(card).getAllByText("#11");
      expect(sosBadges.length).toBeGreaterThan(0);
      const withTitle = sosBadges.find((el) => el.closest("[title]"));
      if (withTitle?.closest("[title]")?.getAttribute("title")?.match(/51\.4/)) sawAccessibleAvg = true;
    }
    expect(sawAccessibleAvg).toBe(true);
  });

  it("orders teams within a division by rating2026 descending", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    const headings = await screen.findAllByRole("heading", { name: "NFC West" });
    // Grab the desktop table body for a stable, single-column reading order.
    for (const heading of headings) {
      const cardEl = heading.closest("article")!;
      const table = cardEl.querySelector("table");
      if (!table) continue;
      const rowNames = within(table).getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
      const ramsIndex = rowNames.findIndex((n) => n.includes("Rams"));
      const seaIndex = rowNames.findIndex((n) => n.includes("Seahawks"));
      const sfIndex = rowNames.findIndex((n) => n.includes("49ers"));
      const ariIndex = rowNames.findIndex((n) => n.includes("Cardinals"));
      expect(ramsIndex).toBeLessThan(seaIndex);
      expect(seaIndex).toBeLessThan(sfIndex);
      expect(sfIndex).toBeLessThan(ariIndex);
    }
  });

  it("does not expose forbidden betting/vendor terminology anywhere on the page", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    const { container } = render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );
    await screen.findAllByText("OVR");
    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of FORBIDDEN_TERMS) {
      expect(text.includes(term), `found forbidden term "${term}"`).toBe(false);
    }
  });

  it("preserves working team dashboard links and logo rendering", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );
    const links = await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/nfl/teams/la-rams");
      const img = link.querySelector("img");
      expect(img?.getAttribute("src")).toMatch(/lar\.png/);
    }
  });

  it("fails gracefully when the v0.4 projection artifact is missing, without falling back to legacy ranks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("projected-power-ratings-v04.json")) {
          return new Response("not found", { status: 404 });
        }
        return noResultFetch(input);
      })
    );
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to load 2026 projected power ratings/i);
    // Headers still render (page doesn't crash); Rams cells fall back to an em dash, not a legacy value.
    expect((await screen.findAllByText("OVR")).length).toBeGreaterThan(0);
    const links = await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    for (const link of links) {
      const card = within((link.closest("li") ?? link.closest("tr")) as HTMLElement);
      expect(card.getAllByText("—").length).toBeGreaterThan(0);
    }
  });
});

/** Cardinals (rating2026 34.6, last place in NFC West) blow out the Rams (rating2026 82.8, first place). */
function oneResultFetch(input: RequestInfo | URL): Response | Promise<Response> {
  const path = String(input);
  if (path === "/data/nfl/2026/results.json") {
    return jsonResponse({
      _meta: { schemaVersion: "nfl-v0.1", generatedAt: new Date().toISOString(), source: "test", season: 2026, week: 1, modelVersion: null, notes: [] },
      results: [
        { gameId: "g1", season: 2026, week: 1, seasonType: "REG", homeAbbr: "ari", awayAbbr: "lar", homeScore: 45, awayScore: 3, winner: "ari", final: true },
      ],
    });
  }
  return committedFetch(input);
}

describe("NFLStandings — 2026 once results exist (auto mode)", () => {
  it("auto switches to the in-season board (Team/Record/OVR/SOS To Date/Future SOS), not the plain W-L/PF/PA/Diff board", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    expect((await screen.findAllByText("Record")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("OVR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SOS To Date").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Future SOS").length).toBeGreaterThan(0);

    expect(screen.queryByText("2025 Adj")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not use Power Rating as a standings tiebreaker: the Cardinals sort first on record alone", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    const heading = await screen.findByRole("heading", { name: "NFC West" });
    const card = heading.closest("article")!;
    const table = within(card).getByRole("table", { hidden: true }) ?? card.querySelector("table")!;
    const rows = within(table as HTMLElement).getAllByRole("row").slice(1); // drop header row
    // Cardinals won on the field and must sort first, despite the much lower Power Rating.
    expect(within(rows[0]).getByText(/Cardinals/)).toBeInTheDocument();
  });

  it("Rams' OVR cell shows a current rank/rating rather than the preseason projection", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    const links = await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    for (const link of links) {
      const card = (link.closest("li") ?? link.closest("tr")) as HTMLElement;
      const currentOvr = card.querySelector('[title^="OVR rank"]');
      expect(currentOvr).not.toBeNull();
      expect(currentOvr?.getAttribute("title")).not.toContain("rating 82.8");
    }
  });

  it("colors OVR/OFF/DEF with JKB Heat, renders one table per division, and uses abbreviations for mobile", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    const heading = await screen.findByRole("heading", { name: "NFC West" });
    const card = heading.closest("article")!;
    expect(card.querySelectorAll("table")).toHaveLength(1);
    // Column headings appear once per division, mobile + desktop variants of the same th.
    expect(within(card).getAllByRole("columnheader")).toHaveLength(7);

    const ramsRow = within(card).getByRole("link", { name: /Open LA Rams team dashboard/i }).closest("tr")!;
    expect(within(ramsRow).getByText("LAR")).toBeInTheDocument();
    for (const unit of ["OVR", "OFF", "DEF"]) {
      const cell = ramsRow.querySelector(`[title^="${unit} rank"]`) as HTMLElement | null;
      expect(cell, `${unit} cell`).not.toBeNull();
      expect(cell!.getAttribute("data-heat-tone")).not.toBe("missing");
    }
    // SOS cells keep their own positive/negative semantics, not JKB Heat.
    expect(ramsRow.querySelectorAll("[title*='remaining schedule'][data-heat-tone]")).toHaveLength(0);
  });

  it("SOS To Date is N/A for a team with zero completed games, even in in-season mode", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    // Seahawks have not played in this fixture (only ARI @ LAR is final).
    const links = await screen.findAllByRole("link", { name: /Open Seattle Seahawks team dashboard/i });
    for (const link of links) {
      const card = within((link.closest("li") ?? link.closest("tr")) as HTMLElement);
      expect(card.getAllByText("N/A").length).toBeGreaterThan(0);
    }
  });
});

describe("NFLStandings — view mode control", () => {
  it("labels the three choices and explains their rating sources", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(<MemoryRouter><NFLStandings /></MemoryRouter>);
    await screen.findAllByText("2025 Adj");
    const group = screen.getByRole("group", { name: "Division board view" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["Auto", "Preseason", "2026 Only"]);
    expect(within(group).getByRole("button", { name: "Auto" })).toHaveAttribute("title", expect.stringContaining("blend"));
    expect(within(group).getByRole("button", { name: "2026 Only" })).toHaveAttribute("title", expect.stringContaining("preseason ratings excluded"));
  });

  it("ranks preseason OFF and DEF independently of OVR", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(<MemoryRouter><NFLStandings /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Preseason" }));
    const neLinks = await screen.findAllByRole("link", { name: /Open New England Patriots team dashboard/i });
    const neDesktop = neLinks.map((link) => link.closest("tr")).find(Boolean)!;
    expect(neDesktop.querySelector('[title^="OFF rank"]')?.getAttribute("title")).toMatch(/OFF rank 3 of 32.*75\.5/);
    expect(neDesktop.querySelector('[title^="DEF rank"]')?.getAttribute("title")).toMatch(/DEF rank 13 of 32.*53\.0/);
    expect(within(neDesktop).getByText("#4 NFL")).toBeInTheDocument();
    const cleLinks = await screen.findAllByRole("link", { name: /Open Cleveland Browns team dashboard/i });
    const cleDesktop = cleLinks.map((link) => link.closest("tr")).find(Boolean)!;
    expect(cleDesktop.querySelector('[title^="OFF rank"]')?.getAttribute("title")).toMatch(/OFF rank 32 of 32.*1\.0/);
    expect(cleDesktop.querySelector('[title^="DEF rank"]')?.getAttribute("title")).toMatch(/DEF rank 4 of 32.*76\.4/);
    expect(within(cleDesktop).getByText("#25 NFL")).toBeInTheDocument();
  });

  it("2026 Only uses artifact live ratings and ranks, while Auto retains Current", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(<MemoryRouter><NFLStandings /></MemoryRouter>);
    const neLinks = await screen.findAllByRole("link", { name: /Open New England Patriots team dashboard/i });
    const neAuto = neLinks[0].closest("tr")!;
    const autoTitle = neAuto.querySelector('[title^="OVR rank"]')?.getAttribute("title");
    fireEvent.click(screen.getByRole("button", { name: "2026 Only" }));
    const artifact = JSON.parse(readFileSync(join(NFL_DATA, "2026", "team-performance-analytics.json"), "utf8"));
    const liveNe = artifact.teams.find((team: { team: string }) => team.team === "ne").performance;
    const neLive = (await screen.findAllByRole("link", { name: /Open New England Patriots team dashboard/i }))[0].closest("tr")!;
    expect(neLive.querySelector('[title^="OVR rank"]')?.getAttribute("title"))
      .toContain(`OVR rank ${liveNe.performanceRank} of 32 · rating ${liveNe.performanceRating.toFixed(1)}`);
    expect(neLive.querySelector('[title^="OFF rank"]')?.getAttribute("title"))
      .toContain(`OFF rank ${liveNe.offenseRank} of 32 · rating ${liveNe.offenseRating.toFixed(1)}`);
    expect(neLive.querySelector('[title^="DEF rank"]')?.getAttribute("title"))
      .toContain(`DEF rank ${liveNe.defenseRank} of 32 · rating ${liveNe.defenseRating.toFixed(1)}`);
    expect(neLive.querySelector('[title^="OVR rank"]')?.getAttribute("title")).not.toBe(autoTitle);
  });

  it("defaults to Auto, which shows the preseason board with zero completed games", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    expect((await screen.findAllByText("OVR")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("manual Preseason override always shows the preseason board, even once results exist", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );
    await screen.findAllByText("OVR"); // auto mode has already switched to in-season
    fireEvent.click(screen.getByRole("button", { name: "Preseason" }));

    expect((await screen.findAllByText("OVR")).length).toBeGreaterThan(0);
    expect(screen.queryByText("SOS To Date")).not.toBeInTheDocument();
  });

  it("manual 2026 Only override shows the in-season board before any 2026 game is final, with honest N/A and 0-0", async () => {
    vi.stubGlobal("fetch", vi.fn(zeroGameFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );
    await screen.findAllByText("OVR"); // auto mode starts in preseason
    fireEvent.click(screen.getByRole("button", { name: "2026 Only" }));

    expect((await screen.findAllByText("SOS To Date")).length).toBeGreaterThan(0);
    const links = await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    for (const link of links) {
      const row = (link.closest("li") ?? link.closest("tr")) as HTMLElement;
      const card = within(row);
      expect(card.getAllByText("0-0").length).toBeGreaterThan(0);
      // SOS To Date is N/A this early; Future SOS is already live from the schedule.
      expect(card.getAllByText("N/A").length).toBeGreaterThanOrEqual(4);
      for (const unit of ["OVR", "OFF", "DEF"]) {
        expect(row.querySelector(`[title^="${unit} rank"]`)).toBeNull();
      }
    }
    // Future SOS renders real rank badges from the schedule immediately, before Week 1.
    expect(document.querySelectorAll('[title*="remaining schedule"]').length).toBeGreaterThan(0);
  });
});

describe("NFLStandings — historical seasons", () => {
  it("still renders the actual-standings format for 2025, untouched by v0.4", async () => {
    vi.stubGlobal("fetch", vi.fn(noResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    await screen.findAllByText("OVR");
    const picker = screen.getByRole("button", { name: "2025" });
    fireEvent.click(picker);

    expect((await screen.findAllByText("W-L")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("PF").length).toBeGreaterThan(0);

    expect(screen.queryByText("2025 Adj")).not.toBeInTheDocument();
  });
});

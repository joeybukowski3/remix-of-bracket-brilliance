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
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    expect((await screen.findAllByText("2025 Adj")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Δ26").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026 PR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SOS").length).toBeGreaterThan(0);

    expect(screen.queryByText("Pwr")).not.toBeInTheDocument();
    expect(screen.queryByText("Off")).not.toBeInTheDocument();
    expect(screen.queryByText("Def")).not.toBeInTheDocument();

    expect(screen.getByText(/preseason view.*projected Power Rating/i)).toBeInTheDocument();
  });

  it("renders rating2026 to one decimal with NFL rank, and rating2025Adjusted, for the Rams", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
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
    vi.stubGlobal("fetch", vi.fn(committedFetch));
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

    const texansLinks = screen.getAllByRole("link", { name: /Open Houston Texans team dashboard/i });
    for (const link of texansLinks) {
      const card = within((link.closest("li") ?? link.closest("tr")) as HTMLElement);
      expect(card.getAllByText("0.0").length).toBeGreaterThan(0);
    }
  });

  it("renders the SOS rank and exposes the average opponent rating accessibly", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
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
    vi.stubGlobal("fetch", vi.fn(committedFetch));
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
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    const { container } = render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );
    await screen.findAllByText("2026 PR");
    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of FORBIDDEN_TERMS) {
      expect(text.includes(term), `found forbidden term "${term}"`).toBe(false);
    }
  });

  it("preserves working team dashboard links and logo rendering", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );
    const links = await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/nfl/guide/team/la-rams");
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
        return committedFetch(input);
      })
    );
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to load 2026 projected power ratings/i);
    // Headers still render (page doesn't crash); Rams cells fall back to an em dash, not a legacy value.
    expect((await screen.findAllByText("2026 PR")).length).toBeGreaterThan(0);
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
    expect(screen.queryByText("2026 PR")).not.toBeInTheDocument();
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

  it("Rams' OVR cell shows the universal current rank/rating, not the preseason rank once it has changed", async () => {
    vi.stubGlobal("fetch", vi.fn(oneResultFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    const links = await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    for (const link of links) {
      const card = within((link.closest("li") ?? link.closest("tr")) as HTMLElement);
      expect(card.getAllByText("#1").length).toBeGreaterThan(0);
      expect(card.getAllByText("82.8").length).toBeGreaterThan(0);
    }
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
  it("defaults to Auto, which shows the preseason board with zero completed games", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    expect((await screen.findAllByText("2026 PR")).length).toBeGreaterThan(0);
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

    expect((await screen.findAllByText("2026 PR")).length).toBeGreaterThan(0);
    expect(screen.queryByText("SOS To Date")).not.toBeInTheDocument();
  });

  it("manual In Season override shows the in-season board before any 2026 game is final, with honest N/A and 0-0", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );
    await screen.findAllByText("2026 PR"); // auto mode starts in preseason
    fireEvent.click(screen.getByRole("button", { name: "In Season" }));

    expect((await screen.findAllByText("SOS To Date")).length).toBeGreaterThan(0);
    const links = await screen.findAllByRole("link", { name: /Open LA Rams team dashboard/i });
    for (const link of links) {
      const card = within((link.closest("li") ?? link.closest("tr")) as HTMLElement);
      expect(card.getAllByText("0-0").length).toBeGreaterThan(0);
      // SOS To Date is N/A this early; Future SOS is already live from the schedule.
      expect(card.getAllByText("N/A").length).toBeGreaterThan(0);
    }
    // Future SOS renders real rank badges from the schedule immediately, before Week 1.
    expect(document.querySelectorAll('[title*="remaining schedule"]').length).toBeGreaterThan(0);
  });
});

describe("NFLStandings — historical seasons", () => {
  it("still renders the actual-standings format for 2025, untouched by v0.4", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFLStandings />
      </MemoryRouter>
    );

    await screen.findAllByText("2026 PR");
    const picker = screen.getByRole("button", { name: "2025" });
    fireEvent.click(picker);

    expect((await screen.findAllByText("W-L")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("PF").length).toBeGreaterThan(0);
    expect(screen.queryByText("2026 PR")).not.toBeInTheDocument();
    expect(screen.queryByText("2025 Adj")).not.toBeInTheDocument();
  });
});

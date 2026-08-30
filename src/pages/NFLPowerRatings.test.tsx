import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import NFLPowerRatings from "@/pages/NFLPowerRatings";

const ROOT = resolve(__dirname, "../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");

async function committedFetch(input: RequestInfo | URL): Promise<Response> {
  const requestPath = String(input);
  const relative = requestPath.replace(/^\/data\/nfl\//, "").replace(/^\//, "").replaceAll("/", "\\");
  const path = join(NFL_DATA, relative.replace(/^data\\nfl\\/, ""));
  if (!existsSync(path)) return new Response("not found", { status: 404 });
  return new Response(readFileSync(path, "utf8"), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// The board hook chains ~7 data hooks, each doing several synchronous file
// reads through the stubbed fetch; under full-suite load in jsdom that first
// render is slow, so this file runs with a generous timeout.
vi.setConfig({ testTimeout: 30000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FIND = { timeout: 15000 } as const;

async function renderPage() {
  vi.stubGlobal("fetch", vi.fn(committedFetch));
  render(
    <MemoryRouter>
      <NFLPowerRatings />
    </MemoryRouter>
  );
  await screen.findByRole("table", {}, { timeout: 20000 });
}

/** The <tr> for a team by its dashboard link label. */
function rowFor(teamName: string): HTMLElement {
  const link = screen.getAllByRole("link", { name: new RegExp(`Open ${teamName} team dashboard`, "i") })[0];
  return link.closest("tr") as HTMLElement;
}

function cellTexts(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "");
}

// Column order: TEAM(0) OVR(1) OFF(2) DEF(3) YPP(4) EPA(5) SUCCESS(6) SOS(7) RECORD(8)
const COL = {
  ovr: 1,
  off: 2,
  def: 3,
  ypp: 4,
  epa: 5,
  success: 6,
  sos: 7,
  record: 8,
} as const;

describe("NFLPowerRatings — table structure", () => {
  it("has no standalone Rank / Form Rank column and orders TEAM, OVR, OFF, DEF, …", async () => {
    await renderPage();

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.replace(/[↑↓\s]+/g, " ").trim());
    expect(headers).toEqual(["Team", "OVR", "OFF", "DEF", "YPP", "EPA", "Success", "SoS", "Record"]);

    // No rank/form-rank sort control anywhere on the page.
    expect(screen.queryByText("Form Rank")).toBeNull();
    expect(screen.queryByText(/^Rank$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Sort by .*(power|form) rank/i })).toBeNull();

    const row = rowFor("Buffalo Bills");
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(9);
    // First cell is team identity only (logo + name), not a rank.
    expect(cells[0].classList.contains("nfl-pr-team")).toBe(true);
    expect(cells[0].querySelector("img.nfl-pr-logo")).toBeTruthy();
    expect(cells[0].textContent).not.toMatch(/#\d/);
    // OVR is immediately after Team, OFF immediately after OVR.
    expect(cells[COL.ovr].classList.contains("nfl-pr-heat")).toBe(true);
  });

  it("keeps the sticky Team column classes and styles", async () => {
    await renderPage();
    const styleTag = document.querySelector("style")?.textContent ?? "";
    expect(styleTag).toMatch(/\.nfl-pr-th-team\{[^}]*position:sticky/);
    expect(styleTag).toMatch(/\.nfl-pr-team\{[^}]*position:sticky/);
    expect(styleTag).toMatch(/\.nfl-pr-team\{[^}]*left:0/);
    expect(styleTag).toMatch(/\.nfl-pr-th-team\{[^}]*border-right:2px/);
    // Mobile: team name hidden, logo still shown.
    expect(styleTag).toMatch(/@media\(max-width:640px\)\{[^@]*\.nfl-pr-name\{display:none\}/);
    expect(styleTag).not.toMatch(/\.nfl-pr-logo\{display:none\}/);
  });
});

describe("NFLPowerRatings — period selector", () => {
  it("defaults to 2026: OVR from the current board, efficiency + SoS unavailable, record 0-0", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");

    const row = rowFor("Buffalo Bills");
    const cells = cellTexts(row);
    expect(cells).toHaveLength(9);
    expect(cells[COL.record]).toBe("0-0");
    expect(cells[COL.ypp]).toBe("—");
    expect(cells[COL.epa]).toBe("—");
    expect(cells[COL.success]).toBe("—");
    expect(cells[COL.sos]).toBe("—");
    expect(cells[COL.ovr]).not.toBe("—");
    expect(screen.getByText(/no completed 2026 regular-season games yet/i)).toBeTruthy();
  });

  it("2025: OVR/OFF/DEF from v0.3.1 board, EPA/YPP/Success/SoS populated, full-season record", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    const row = rowFor("Buffalo Bills");
    const cells = cellTexts(row);
    expect(cells[COL.record]).toBe("12-5");
    for (const idx of [COL.ovr, COL.off, COL.def, COL.ypp, COL.epa, COL.success, COL.sos]) {
      expect(cells[idx], `column ${idx}`).not.toBe("—");
    }
  });

  it("Last 8: OFF/DEF/OVR from the Last-8 Form Rating, EPA/YPP/Success/SoS populated, 8-game record", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));
    await screen.findByText(/8 most recent completed regular-season games/i, {}, FIND);
    expect(document.querySelector(".nfl-pr-notes")?.textContent ?? "").toMatch(
      /Last 8 ratings combine recent EPA/i
    );

    const row = rowFor("Buffalo Bills");
    const cells = cellTexts(row);
    for (const idx of [COL.ovr, COL.off, COL.def, COL.ypp, COL.epa, COL.success, COL.sos]) {
      expect(cells[idx], `column ${idx}`).not.toBe("—");
    }

    // OVR cell carries the Last-8 Form rank as its primary line (rankings mode).
    const cellNodes = within(row).getAllByRole("cell");
    expect(cellNodes[COL.ovr].querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^#\d+$/);
    expect(cellNodes[COL.ovr].querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/^\d/);

    expect(cells[COL.record]).toMatch(/^\d-\d(-\d)?$/);
    const [w, l] = cells[COL.record].split("-").map(Number);
    expect(w + l).toBeLessThanOrEqual(8);
  });

  it("Last 8: Rankings/Ratings toggle swaps the Form OVR cell's primary line", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));
    await screen.findByText(/8 most recent completed regular-season games/i, {}, FIND);

    let ovr = within(rowFor("Buffalo Bills")).getAllByRole("cell")[COL.ovr];
    expect(ovr.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^#\d+$/);

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    ovr = within(rowFor("Buffalo Bills")).getAllByRole("cell")[COL.ovr];
    expect(ovr.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^\d/);
    expect(ovr.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/^#\d+$/);
  });
});

describe("NFLPowerRatings — Rankings/Ratings toggle", () => {
  it("swaps primary/secondary for every scored cell, OVR shows both in its own cell", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    const rankingsOvr = within(rowFor("Buffalo Bills")).getAllByRole("cell")[COL.ovr];
    expect(rankingsOvr.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^#\d+$/);
    expect(rankingsOvr.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/^\d/);

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    const ratingsOvr = within(rowFor("Buffalo Bills")).getAllByRole("cell")[COL.ovr];
    expect(ratingsOvr.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^\d/);
    expect(ratingsOvr.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/^#\d+$/);
  });

  it("SoS uses the '#rank / avg' and 'avg / #rank hardest' layouts", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    let sos = within(rowFor("Buffalo Bills")).getAllByRole("cell")[COL.sos];
    expect(sos.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^#\d+$/);
    expect(sos.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/avg$/);

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    sos = within(rowFor("Buffalo Bills")).getAllByRole("cell")[COL.sos];
    expect(sos.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^\d/);
    expect(sos.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/hardest$/);
  });

  it("period and display controls are independent", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));
    expect(screen.getByRole("button", { name: "Ratings" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 8" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("NFLPowerRatings — sortable columns", () => {
  const teamOrder = () =>
    [...document.querySelectorAll(".nfl-pr-table tbody tr .nfl-pr-name")].map(
      (n) => n.textContent ?? ""
    );
  // OVR is the second cell; in the default rankings display its primary line is "#rank".
  const ovrRankColumn = () =>
    [...document.querySelectorAll(".nfl-pr-table tbody tr td:nth-child(2) .nfl-pr-value-primary")].map(
      (n) => n.textContent?.trim() ?? ""
    );

  it("Team header sorts alphabetically by name and toggles direction", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    const teamButton = screen.getByRole("button", { name: /Sort by team name/i });
    const teamHeader = teamButton.closest("th") as HTMLElement;

    fireEvent.click(teamButton);
    expect(teamHeader).toHaveAttribute("aria-sort", "ascending");
    const asc = teamOrder();
    expect([...asc]).toEqual([...asc].sort((a, b) => a.localeCompare(b)));

    fireEvent.click(teamButton);
    expect(teamHeader).toHaveAttribute("aria-sort", "descending");
    expect(teamOrder()).toEqual([...asc].reverse());
  });

  it("OVR header sorts by rating, toggles direction, and exposes aria-sort", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    const ovrButton = screen.getByRole("button", { name: /Sort by overall rating/i });
    const ovrHeader = ovrButton.closest("th") as HTMLElement;

    fireEvent.click(ovrButton);
    expect(ovrHeader).toHaveAttribute("aria-sort", "descending");
    const desc = teamOrder();

    fireEvent.click(ovrButton);
    expect(ovrHeader).toHaveAttribute("aria-sort", "ascending");
    expect(teamOrder()).toEqual([...desc].reverse());
  });

  it("EPA header sorts by rating, toggles direction, and exposes aria-sort", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    const epaButton = screen.getByRole("button", { name: /Sort by EPA rating/i });
    const epaHeader = epaButton.closest("th") as HTMLElement;

    fireEvent.click(epaButton);
    expect(epaHeader).toHaveAttribute("aria-sort", "descending");
    const desc = teamOrder();

    fireEvent.click(epaButton);
    expect(epaHeader).toHaveAttribute("aria-sort", "ascending");
    expect(teamOrder()).toEqual([...desc].reverse());
  });

  it("Rankings ↔ Ratings does not change the sorted row order", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    fireEvent.click(screen.getByRole("button", { name: /Sort by EPA rating/i }));
    const before = teamOrder();

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    expect(teamOrder()).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Rankings" }));
    expect(teamOrder()).toEqual(before);
  });

  it("initial order is the period OVR rank #1 → #32, and changing period resets to it", async () => {
    await renderPage();
    // 2026 default.
    expect(ovrRankColumn().slice(0, 3)).toEqual(["#1", "#2", "#3"]);

    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);
    expect(ovrRankColumn().slice(0, 3)).toEqual(["#1", "#2", "#3"]);

    // Sort by Team, then switch period — the sort resets to the OVR rank order.
    fireEvent.click(screen.getByRole("button", { name: /Sort by team name/i }));
    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));
    await screen.findByText(/8 most recent completed regular-season games/i, {}, FIND);
    expect(ovrRankColumn().slice(0, 3)).toEqual(["#1", "#2", "#3"]);
    expect(
      screen.getByRole("button", { name: /Sort by team name/i }).closest("th")
    ).toHaveAttribute("aria-sort", "none");
  });

  it("Record header sorts by winning percentage", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    fireEvent.click(screen.getByRole("button", { name: /Sort by period record win percentage/i }));
    const records = [...document.querySelectorAll(".nfl-pr-table tbody tr .nfl-pr-rec")].map(
      (n) => n.textContent?.trim() ?? ""
    );
    const winPct = (r: string) => {
      const [w, l, t = 0] = r.split("-").map(Number);
      const g = w + l + t;
      return g > 0 ? (w + 0.5 * t) / g : -1;
    };
    const pcts = records.map(winPct);
    for (let i = 1; i < pcts.length; i += 1) {
      expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1]);
    }
  });
});

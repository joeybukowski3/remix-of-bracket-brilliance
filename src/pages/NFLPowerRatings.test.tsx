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

describe("NFLPowerRatings — period selector", () => {
  it("defaults to 2026: OVR/OFF/DEF from the current board, efficiency + SoS unavailable, record 0-0", async () => {
    await renderPage();
    // 2026 tab active by default.
    expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");

    const row = rowFor("Buffalo Bills");
    const cells = cellTexts(row);
    // Rank, Team, OFF, DEF, OVR, YPP, EPA, Success, SoS, Record
    expect(cells).toHaveLength(10);
    expect(cells[9]).toBe("0-0"); // record
    expect(cells[5]).toBe("—"); // YPP unavailable
    expect(cells[6]).toBe("—"); // EPA unavailable
    expect(cells[7]).toBe("—"); // Success unavailable
    expect(cells[8]).toBe("—"); // SoS unavailable
    // OVR present (preseason projection).
    expect(cells[4]).not.toBe("—");
    expect(screen.getByText(/no completed 2026 regular-season games yet/i)).toBeTruthy();
  });

  it("2025: OVR/OFF/DEF from v0.3.1 board, EPA/YPP/Success/SoS populated, full-season record", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    const row = rowFor("Buffalo Bills");
    const cells = cellTexts(row);
    expect(cells[9]).toBe("12-5"); // 2025 record
    for (const idx of [2, 3, 4, 5, 6, 7, 8]) {
      expect(cells[idx], `column ${idx}`).not.toBe("—");
    }
  });

  it("Last 8: OVR/OFF/DEF unavailable, EPA/YPP/Success/SoS populated, 8-game record", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));
    await screen.findByText(/last 8 completed regular-season games/i, {}, FIND);
    expect(document.querySelector(".nfl-pr-notes")?.textContent ?? "").toMatch(
      /Rolling 8-game JKB OVR/i
    );

    const row = rowFor("Buffalo Bills");
    const cells = cellTexts(row);
    expect(cells[2]).toBe("—"); // OFF
    expect(cells[3]).toBe("—"); // DEF
    expect(cells[4]).toBe("—"); // OVR
    for (const idx of [5, 6, 7, 8]) {
      expect(cells[idx], `column ${idx}`).not.toBe("—");
    }
    // Record across exactly the 8 games (BUF finished 2025 strong).
    expect(cells[9]).toMatch(/^\d-\d(-\d)?$/);
    const [w, l] = cells[9].split("-").map(Number);
    expect(w + l).toBeLessThanOrEqual(8);
  });
});

describe("NFLPowerRatings — Rankings/Ratings toggle", () => {
  it("swaps primary/secondary for every scored cell, OVR shows both in its own cell", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    const rankingsRow = rowFor("Buffalo Bills");
    const rankingsOvr = within(rankingsRow).getAllByRole("cell")[4];
    // Rankings: rank primary (#n), value secondary — both present in the OVR cell.
    expect(rankingsOvr.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^#\d+$/);
    expect(rankingsOvr.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/^\d/);

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    const ratingsRow = rowFor("Buffalo Bills");
    const ratingsOvr = within(ratingsRow).getAllByRole("cell")[4];
    expect(ratingsOvr.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^\d/);
    expect(ratingsOvr.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/^#\d+$/);
  });

  it("SoS uses the '#rank / avg' and 'avg / #rank hardest' layouts", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    await screen.findByText(/2025 full regular season/i, {}, FIND);

    let row = rowFor("Buffalo Bills");
    let sos = within(row).getAllByRole("cell")[8];
    expect(sos.querySelector(".nfl-pr-value-primary")?.textContent).toMatch(/^#\d+$/);
    expect(sos.querySelector(".nfl-pr-value-secondary")?.textContent).toMatch(/avg$/);

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    row = rowFor("Buffalo Bills");
    sos = within(row).getAllByRole("cell")[8];
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

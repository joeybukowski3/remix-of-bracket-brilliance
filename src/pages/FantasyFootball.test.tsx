import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import App from "@/App";
import FantasyFootball from "@/pages/FantasyFootball";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/usePageSeo")>("@/hooks/usePageSeo")),
  usePageSeo: vi.fn(),
}));
vi.mock("@/pages/FantasyWeeklyRankings", () => ({
  default: () => <h1>Weekly Fantasy Rankings</h1>,
}));

function renderPage(entry = "/fantasy-football?view=ros") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route path="/fantasy-football" element={<FantasyFootball />} /></Routes>
    </MemoryRouter>,
  );
}

// Every case here mounts the full 250-row Overall board, so the whole file runs
// well past vitest's 5s default. One file-level budget beats per-case timeouts
// drifting between runs. This file is a candidate for splitting.
vi.setConfig({ testTimeout: 60000 });

afterEach(() => window.history.pushState({}, "", "/"));

describe("/fantasy-football research board", () => {
  it("defaults the main Fantasy route to Weekly and keeps ROS directly accessible", () => {
    renderPage("/fantasy-football");
    expect(screen.getByRole("heading", { level: 1, name: "Weekly Fantasy Rankings" })).toBeTruthy();
  });

  it("uses the approved historical replacement labels", () => {
    renderPage();
    for (const [button, label] of [
      ["QB 31", "QB13"],
      ["RB 85", "RB25"],
      ["WR 100", "WR37"],
      ["TE 34", "TE13"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(screen.getByText(/PAR baseline:/i)).toHaveTextContent(label);
    }
  });

  it("renders the full JKB board and PAR methodology", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "2026 Rest-of-Season Rankings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Rest of Season" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Weekly Rankings" })).toHaveAttribute(
      "href",
      "/fantasy-football/weekly-rankings",
    );
    expect(screen.getByRole("region", { name: "Overall fantasy rankings" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /How this board is built/i })).toBeTruthy();
    expect(screen.queryByText(/Consensus position rank never assigns a tier/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /How this board is built/i }));
    expect(screen.getByText(/Consensus position rank never assigns a tier/i)).toBeTruthy();
  });

  it("preserves the compact 250-player overall board", () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: /Show details for/i })).toHaveLength(250);
    expect(screen.queryByText("Tier 1")).toBeNull();
  });

  it("uses the shared light shell and bordered Overall grid", () => {
    renderPage();
    const table = screen.getByRole("table");
    const board = screen.getByRole("region", { name: "2026 rest-of-season research board" });
    const headers = within(table).getAllByRole("columnheader");
    const firstRow = within(table).getAllByRole("row")[1];
    const cells = [...firstRow.querySelectorAll("td")];

    expect(board?.className).toContain("border-slate-200");
    expect(board?.className).toContain("bg-white");
    expect(headers.every((header) => header.className.includes("border-b"))).toBe(true);
    expect(headers.slice(0, -1).every((header) => header.className.includes("border-r"))).toBe(true);
    expect(cells.every((cell) => cell.className.includes("border-b"))).toBe(true);
    expect(cells.slice(0, -1).every((cell) => cell.className.includes("border-r"))).toBe(true);
  });

  it("labels filters with full JKB position-board sizes", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Position" });
    expect(within(group).getByRole("button", { name: "Overall 250" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["QB 31", "RB 85", "WR 100", "TE 34"]) {
      expect(within(group).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("shows inline QB tier chips followed by the untiered outside pool", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "QB 31" }));
    expect(screen.getByRole("heading", { level: 3, name: "Quarterbacks" })).toBeTruthy();
    expect(screen.queryByText("Tier 1")).toBeNull();
    expect(screen.getAllByText("T1")).toHaveLength(1);
    expect(screen.getAllByText("T6")).toHaveLength(2);
    expect(screen.getByText("Outside Draft Pool")).toBeTruthy();
    expect(screen.getByText(/18 tier eligible/i)).toBeTruthy();
    expect(screen.getByText(/QB13 = 17.57 PPG/i)).toBeTruthy();
  });

  it("sorts the QB board by PAR/G descending with QBn rank labels and no AVG Rk column", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "QB 31" }));
    const table = screen.getByRole("table");
    const rankCells = within(table)
      .getAllByText(/^QB\d+$/)
      .map((node) => Number(node.textContent!.slice(2)));
    expect(rankCells).toEqual([...rankCells].sort((a, b) => a - b));
    expect(rankCells[0]).toBe(1);
    expect(within(table).queryByText("AVG Rk")).toBeNull();
    for (const group of ["Season", "Position evidence", "Team context / playoffs"]) {
      expect(within(table).getByText(group)).toBeTruthy();
    }
  });

  it("searches players outside the PAR tier universe", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "RB 85" }));
    const search = screen.getByRole("searchbox", { name: "Search fantasy rankings" });
    fireEvent.change(search, { target: { value: "Devin Singletary" } });
    expect(screen.getByText("Devin Singletary")).toBeTruthy();
    expect(screen.getByText("Outside Draft Pool")).toBeTruthy();
    fireEvent.change(search, { target: { value: "zzz-no-player" } });
    expect(screen.getByText(/No players match/i)).toBeTruthy();
  });

  it("renders each position's own evidence columns on the PAR board", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "RB 85" }));
    expect(screen.getByText("Touches Rk")).toBeTruthy();
    expect(screen.getByText("Red Zone Touches Rk")).toBeTruthy();
    for (const week of ["W15", "W16", "W17"]) expect(screen.getByText(week)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "WR 100" }));
    expect(screen.getByText("Target % Rk")).toBeTruthy();
    expect(screen.queryByText("Touches Rk")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "TE 34" }));
    expect(screen.getByText("YPRR Rk")).toBeTruthy();
    // The PAR board drops the old model columns for every position.
    expect(screen.queryByText("Vegas Rk")).toBeNull();
    expect(screen.queryByText("AVG Rk")).toBeNull();
  });

  it("renders QB logos, a PAR/G headline cell, and expandable PAR details", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "QB 31" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search fantasy rankings" }), { target: { value: "Josh Allen" } });
    expect(screen.getByRole("img", { name: "BUF" })).toBeTruthy();
    // Josh Allen tops the QB PAR/G distribution, so the headline cell is the elite bucket.
    expect(container.querySelector(".bg-emerald-100")).toBeTruthy();
    expect(screen.getByText("23.27")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show details for Josh Allen" }));
    expect(screen.getByText("17.57")).toBeTruthy();
  });

  it("retires the mobile column-group toggle on the PAR board", () => {
    renderPage();
    for (const name of ["QB 31", "RB 85", "WR 100", "TE 34"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("button", { name: "PAR board" })).toHaveAttribute("aria-pressed", "true");
      for (const group of ["Metrics", "Model", "Context", "Playoffs"]) {
        expect(screen.queryByRole("button", { name: group })).toBeNull();
      }
    }
  });

  it("switches between the PAR board and the restored legacy board", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "TE 34" }));
    expect(screen.queryByText("Vegas Rk")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Legacy board" }));
    // Legacy-only columns and full-width tier header rows are back.
    expect(screen.getByText("AVG Rk")).toBeTruthy();
    expect(screen.getByText("Late / Last 8 Rk")).toBeTruthy();
    expect(screen.getByText("Tier 1")).toBeTruthy();
    expect(screen.queryByText("'26 proj")).toBeNull();
    expect(screen.queryByRole("button", { name: "Model" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "PAR board" }));
    expect(screen.getAllByText("'26 proj").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Model" })).toBeNull();
  });

  it("hides the board toggle on the Overall tab", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Legacy board" })).toBeNull();
  });

  it("merges Pos and Pos Rk into one position-coloured badge", () => {
    renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Pos Rk")).toBeTruthy();
    expect(within(table).queryByText("Pos", { exact: true })).toBeNull();

    const gibbs = within(table).getAllByRole("row").find((r) => within(r).queryByText("Jahmyr Gibbs"))!;
    const badge = within(gibbs).getByText("RB1");
    expect(badge.className).toContain("bg-emerald-100");

    const nacua = within(table).getAllByRole("row").find((r) => within(r).queryByText("Puka Nacua"))!;
    expect(within(nacua).getAllByText("WR1").every((badge) => badge.className.includes("bg-violet-100"))).toBe(true);
  });

  it("keeps position tinting separate from playoff matchup heat", () => {
    renderPage();
    const table = screen.getByRole("table");
    const gibbs = within(table).getAllByRole("row").find((r) => within(r).queryByText("Jahmyr Gibbs"))!;
    const cells = [...gibbs.querySelectorAll("td")];

    // PAR/G, Projection Rk, AVG Rk, SOS, both 2025 ranks, and L8 use position tint.
    for (const index of [4, 5, 6, 7, 8, 9, 10]) {
      expect(cells[index].className).toContain("bg-emerald-50");
      expect(cells[index].style.backgroundColor).toBe("");
    }
    for (const index of [11, 12, 13]) {
      expect(cells[index]).toHaveAttribute("data-heat-tone");
      expect(cells[index].style.backgroundColor).not.toBe("");
      expect(cells[index].getAttribute("title")).toContain("RB pts/gm");
    }
  });

  it("gives a different position a different flat tint on the same table", () => {
    renderPage();
    const table = screen.getByRole("table");
    const nacua = within(table).getAllByRole("row").find((r) => within(r).queryByText("Puka Nacua"))!;
    expect([...nacua.querySelectorAll("td")][10].className).toContain("bg-violet-50");
  });

  it("renders the requested Overall column set in order", () => {
    renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent?.trim())).toEqual([
      "Rank", "Player", "Pos Rk", "ADP", "PAR/G", "Projection Rk", "AVG Rk", "SOS",
      "2025 Pts Rk", "2025 PPG Rk", "L8 Pts Rk", "W15", "W16", "W17", "Details",
    ]);
    expect(within(table).queryByText("Rd / Pick")).toBeNull();
  });

  it("reads the new values from the existing sources", () => {
    renderPage();
    const table = screen.getByRole("table");
    const gibbs = within(table).getAllByRole("row").find((r) => within(r).queryByText("Jahmyr Gibbs"))!;
    const cells = [...gibbs.querySelectorAll("td")].map((c) => c.textContent!.trim());
    expect(cells[4]).toBe("+10.72"); // approved PAR/G, signed to 2dp
    expect(cells[7]).toBe("1"); // strengthOfSchedule
    expect(cells[3]).toBe("N/A"); // no trustworthy 2026 consensus ADP source
    expect(cells[8]).toBe("RB3"); // 2025 positional rank by total points
    expect(cells[9]).toBe("RB3"); // 2025 positional rank by PPG
    expect(cells[10]).toMatch(/^RB\d+$/); // L8 total-points positional rank
  });

  it("separates the two 2025 bases for a player who missed games", () => {
    renderPage();
    const table = screen.getByRole("table");
    const bowers = within(table).getAllByRole("row").find((r) => within(r).queryByText("Brock Bowers"))!;
    const cells = [...bowers.querySelectorAll("td")].map((c) => c.textContent!.trim());
    expect(cells[8]).toBe("TE11"); // 11th TE by total points
    expect(cells[9]).toBe("TE2"); // 2nd TE by PPG
  });

  it("keeps missing ADP and PAR explicit without suppressing available history", () => {
    renderPage();
    const table = screen.getByRole("table");
    const outside = within(table)
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Devin Singletary"))!;
    const cells = [...outside.querySelectorAll("td")].map((c) => c.textContent!.trim());
    expect(cells[3]).toBe("N/A");
    // No PAR row, so PAR/G stays unavailable, while source-backed history may render.
    expect(cells[4]).toBe("—");
    expect(cells[8]).toMatch(/^RB\d+$/);
    expect(cells[9]).toMatch(/^RB\d+$/);
    expect(cells[10]).toMatch(/^RB\d+$/);
  });

  it("renders L8 N/A when no eligible regular-season sample exists", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search fantasy rankings" }), { target: { value: "Jeremiyah Love" } });
    const table = screen.getByRole("table");
    const row = within(table).getAllByRole("row").find((candidate) => within(candidate).queryByText("Jeremiyah Love"))!;
    expect([...row.querySelectorAll("td")][10]).toHaveTextContent("N/A");
  });

  it("does not backfill a missing 2025 L8 sample from a prior season", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search fantasy rankings" }), { target: { value: "Jonathon Brooks" } });
    const row = within(screen.getByRole("table")).getAllByRole("row")
      .find((candidate) => within(candidate).queryByText("Jonathon Brooks"))!;
    expect([...row.querySelectorAll("td")][10]).toHaveTextContent("N/A");
  });

  it("provides a collapsed accessible glossary with definitions and separate legends", () => {
    renderPage();
    const glossary = screen.getByRole("region", { name: "Rest-of-season stats and rankings key" });
    const trigger = within(glossary).getByRole("button", { name: "Stats & Rankings Key" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(within(glossary).getByText(/Total full-PPR points across/i)).not.toBeVisible();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const term of ["RANK", "POS RK", "ADP", "PAR/G", "PROJECTION RK", "AVG RK", "SOS", "2025 PTS RK", "2025 PPG RK", "L8 PTS RK", "W15 / W16 / W17"]) {
      expect(within(glossary).getByText(term)).toBeTruthy();
    }
    expect(within(glossary).getByText("POSITIONAL NOTATION")).toBeTruthy();
    expect(within(glossary).getByText(/WR2 means 2nd among wide receivers.*RB4 means 4th among running backs/i)).toBeTruthy();
    expect(within(glossary).getByText(/no prior-season games are added/i)).toBeTruthy();
    for (const label of ["Gold = elite/easiest", "Dark Green = very favorable", "Green = favorable", "Light Green = above average", "Neutral = average", "Light Red = difficult", "Red = very difficult", "Strong Red = worst"]) {
      expect(within(glossary).getByText(label)).toBeTruthy();
    }
    expect(within(glossary).getByText(/Position color identifies/i)).toBeTruthy();
  });

  it("surfaces historical samples and ADP provenance only in expanded details", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" }));
    expect(screen.getByText(/2025 sample:/i)).toHaveTextContent(/17 games/i);
    expect(screen.getByText(/2025 sample:/i)).toHaveTextContent(/L8 sample: 8 games/i);
    expect(screen.getByText(/2025 sample:/i)).toHaveTextContent(/ADP source: not available in repository/i);
  });

  it("shows a position colour legend on Overall only", () => {
    renderPage();
    const legend = screen.getByLabelText("Position colour key");
    expect(within(legend).getByText("Position colours")).toBeTruthy();
    for (const [position, name] of [
      ["QB", "Sky"],
      ["RB", "Emerald"],
      ["WR", "Violet"],
      ["TE", "Orange"],
    ] as const) {
      expect(within(legend).getByText(position)).toBeTruthy();
      expect(within(legend).getByText(name)).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "RB 85" }));
    expect(screen.queryByLabelText("Position colour key")).toBeNull();
  });

  it("links to the 2025 points-allowed reference page", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /2025 Points Allowed by Position/i });
    expect(link).toHaveAttribute("href", "/fantasy-football/points-allowed");
  });

  it("puts every position board on PAR/G order with tier chips and stacked Season PAR", () => {
    renderPage();
    for (const [button, heading, abbr] of [
      ["RB 85", "Running backs", "RB"],
      ["WR 100", "Wide receivers", "WR"],
      ["TE 34", "Tight ends", "TE"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(screen.getByRole("heading", { level: 3, name: heading })).toBeTruthy();
      expect(screen.queryByText("Tier 1")).toBeNull();
      expect(screen.getAllByText("T1").length).toBeGreaterThan(0);
      expect(screen.getByText(`${abbr}1`)).toBeTruthy();
      expect(screen.getAllByText("'26 proj").length).toBeGreaterThan(0);
      expect(screen.getAllByText("'25 actual").length).toBeGreaterThan(0);
      expect(screen.getByText("Outside Draft Pool")).toBeTruthy();
    }
  });

  it("is reachable through the existing app route", async () => {
    window.history.pushState({}, "", "/fantasy-football");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Weekly Fantasy Rankings" })).toBeTruthy();
  });
});

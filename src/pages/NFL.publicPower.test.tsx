import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import NFL from "@/pages/NFLPowerRatings";

const ROOT = resolve(__dirname, "../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");

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

describe("public NFL power page: universal current OVR", () => {
  it("renders the universal 2026 board (v0.4 OVR/rank + v0.3.1 OFF/DEF) from committed artifacts", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFL />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading 2026 power ratings/)).toBeInTheDocument();
    expect(await screen.findByText("LA Rams")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "2026 NFL Power Rankings" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Joe Knows Ball projected team strength, updated as 2026 results are incorporated/)
    ).toBeInTheDocument();

    // Rankings tab is the default: rank is visible for the top team.
    expect(screen.getByRole("button", { name: "Rankings" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ratings" })).toHaveAttribute("aria-pressed", "false");

    const ramsRow = screen.getByText("LA Rams").closest("tr");
    expect(ramsRow).toBeTruthy();
    // Universal OVR: committed v0.4 rating2026 for LAR (rank 1, 82.8), not the
    // v0.3.1 board's own publicRating (80.9) -- confirms OVR sources from the
    // universal hook, not the legacy v0.3.1 overall value.
    expect(ramsRow?.textContent).toMatch(/#1/);
    expect(ramsRow?.textContent).toMatch(/82\.8/);
    expect(ramsRow?.textContent).not.toMatch(/80\.9/);
    // OFF/DEF still come from the v0.3.1 board (preseason, since no 2026
    // games are complete in the committed results.json).
    expect(ramsRow?.textContent).toMatch(/84\.9/);
    expect(ramsRow?.textContent).toMatch(/72\.4/);
    expect(ramsRow?.textContent).toMatch(/12-5/);

    // No completed 2026 games yet -> OFF/DEF are labeled as 2025 performance.
    expect(screen.getAllByText("2025 Performance").length).toBeGreaterThan(0);
    expect(screen.queryByText("2026 Performance")).not.toBeInTheDocument();

    expect(screen.queryByText(/'26 Win Total/)).not.toBeInTheDocument();
    expect(screen.queryByText(/current-season ratings are not available/i)).not.toBeInTheDocument();
  });

  it("switches which value (rank vs rating) is visually primary between Rankings and Ratings tabs, keeping both visible", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFL />
      </MemoryRouter>
    );
    await screen.findByText("LA Rams");

    const ramsRow = screen.getByText("LA Rams").closest("tr") as HTMLElement;
    // Rankings tab (default): rank cell carries the primary-value class.
    expect(ramsRow.querySelector(".nfl-pr-rank .nfl-pr-value-primary")).toBeTruthy();
    expect(ramsRow.querySelector(".nfl-pr-heat .nfl-pr-value-secondary")).toBeTruthy();
    expect(ramsRow.textContent).toMatch(/#1/);
    expect(ramsRow.textContent).toMatch(/82\.8/);

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));

    expect(screen.getByRole("button", { name: "Ratings" })).toHaveAttribute("aria-pressed", "true");
    const ramsRowAfter = screen.getByText("LA Rams").closest("tr") as HTMLElement;
    expect(ramsRowAfter.querySelector(".nfl-pr-heat .nfl-pr-value-primary")).toBeTruthy();
    expect(ramsRowAfter.querySelector(".nfl-pr-rank .nfl-pr-value-secondary")).toBeTruthy();
    // Both values remain in the DOM in both modes.
    expect(ramsRowAfter.textContent).toMatch(/#1/);
    expect(ramsRowAfter.textContent).toMatch(/82\.8/);
  });

  it("does not render the old Public Rating / vs Scale Center toggle", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFL />
      </MemoryRouter>
    );
    await screen.findByText("LA Rams");
    expect(screen.queryByRole("button", { name: "Public Rating" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "vs Scale Center" })).not.toBeInTheDocument();
    expect(screen.queryByText(/vs Scale Center/)).not.toBeInTheDocument();
  });

  it("orders rows by the universal board's rank/rating, descending", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFL />
      </MemoryRouter>
    );
    await screen.findByText("LA Rams");
    // Scope to the Rank column only -- OFF/DEF cells also render "#N" badges.
    const ranks = Array.from(document.querySelectorAll(".nfl-pr-rank")).map((node) =>
      Number(node.textContent?.replace("#", ""))
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks[0]).toBe(1);
    expect(ranks).toHaveLength(32);
  });

  it("shows a page-level error when the universal OVR board's required v0.3.1 preseason baseline is unavailable, never a silent v0.3.1-overall fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("preseason-power-ratings.json")) {
          return new Response("missing", { status: 404 });
        }
        return committedFetch(input);
      })
    );
    render(
      <MemoryRouter>
        <NFL />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/unable to load power ratings/i);
    });
    // No row rendered at all -- the page never falls back to a raw v0.3.1
    // overall value when the universal board can't be built.
    expect(screen.queryByText("LA Rams")).not.toBeInTheDocument();
  });
});

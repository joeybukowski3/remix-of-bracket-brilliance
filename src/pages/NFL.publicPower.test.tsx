import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import NFL from "@/pages/NFL";

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

describe("public NFL power page v0.3 integration", () => {
  it("renders the 2026 board from Stage-1 preseason artifacts", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFL />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading power ratings/)).toBeInTheDocument();
    expect(await screen.findByText("LA Rams")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "2026 NFL Preseason Power Ratings" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Based on 2025 regular-season performance/)).toBeInTheDocument();
    expect(screen.getByText(/Joe Knows Ball model v0\.3/)).toBeInTheDocument();
    expect(screen.getByText(/nfl-power-v0\.3\.0/)).toBeInTheDocument();
    expect(screen.getByText(/40% opponent-adjusted offensive EPA/)).toBeInTheDocument();
    expect(screen.getByText(/Window: preseason/)).toBeInTheDocument();

    const ramsRow = screen.getByText("LA Rams").closest("tr");
    expect(ramsRow).toBeTruthy();
    expect(ramsRow?.textContent).toMatch(/12-5/);
    expect(ramsRow?.textContent).toMatch(/75\.8/);

    expect(screen.queryByText(/'26 Win Total/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Composite weighting: EPA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/current-season ratings are not available/i)).not.toBeInTheDocument();
  });

  it("shows a file-specific error when the preseason artifact cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("preseason-power-ratings" + ".json")) {
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
      expect(screen.getByRole("alert").textContent).toMatch(/preseason-power-ratings\.json is missing/i);
    });
  });
});

import { cleanup, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import NFLSuperBowlOdds from "@/pages/NFLSuperBowlOdds";

const ROOT = resolve(__dirname, "../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

async function fetchStub(input: RequestInfo | URL): Promise<Response> {
  const path = String(input);
  if (path.includes("/api/nfl/super-bowl-odds")) {
    return jsonResponse({
      source: "polymarket",
      eventId: "e1",
      eventTitle: "Super Bowl LX",
      eventSlug: null,
      updatedAt: new Date().toISOString(),
      teams: [{ abbr: "lar", probability: 12.5, marketRank: 1 }],
    });
  }
  const relative = path.replace(/^\/data\/nfl\//, "").replaceAll("/", "\\");
  const filePath = join(NFL_DATA, relative);
  if (!existsSync(filePath)) return new Response("not found", { status: 404 });
  return new Response(readFileSync(filePath, "utf8"), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NFLSuperBowlOdds: universal current-rank sourcing", () => {
  it("shows the universal current rank in the Power rank column, not the legacy nflPreseason2026 static rank", async () => {
    vi.stubGlobal("fetch", vi.fn(fetchStub));
    render(
      <MemoryRouter>
        <NFLSuperBowlOdds />
      </MemoryRouter>
    );

    const link = await screen.findByRole("link", { name: /Open LA Rams team dashboard/i });
    const row = link.closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    // Column order: Odds rank, Team, Market probability, Power rank, Rank gap, Signal.
    // v0.4 committed artifact rank for LAR is 1; the legacy nflPreseason2026
    // static NFL_POWER_RATINGS rank for the Rams is 2 (not 1) -- confirms the
    // Power rank column reads the universal board, not the static file.
    expect(cells[3].textContent).toBe("1");
  });
});

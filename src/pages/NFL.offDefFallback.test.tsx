import { cleanup, render, screen } from "@testing-library/react";
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

// OVR, OFF, and DEF now all come from the single Current Power Board (Phase 9
// live integration) -- the v0.3.1 public power board is only read on this
// page for the W-L record column. This test exercises that record degrades
// independently without ever taking OVR/OFF/DEF down with it.
vi.mock("@/hooks/useNflV03PublicPowerRatings", () => ({
  useNflV03PublicPowerRatings: () => ({
    loading: false,
    error: "record board unavailable in this test",
    data: null,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public NFL power page: record degrades independently of universal OVR/OFF/DEF", () => {
  it("still renders universal OVR/OFF/DEF/rank when only the record (v0.3.1) board fails, showing '—' for record instead of failing the page", async () => {
    vi.stubGlobal("fetch", vi.fn(committedFetch));
    render(
      <MemoryRouter>
        <NFL />
      </MemoryRouter>
    );
    const ramsRow = await screen.findByText("LA Rams").then((el) => el.closest("tr") as HTMLElement);
    expect(ramsRow.textContent).toMatch(/#1/);
    expect(ramsRow.textContent).toMatch(/82\.8/);
    // OFF/DEF cells render real values from the Current Power Board -- no
    // longer "unavailable" just because the record-only board failed.
    expect(ramsRow.querySelectorAll(".nfl-pr-unavailable")).toHaveLength(0);
    // Record has no dedicated "unavailable" class; it just falls back to an em dash.
    const recordCell = ramsRow.querySelector(".nfl-pr-rec");
    expect(recordCell?.textContent).toBe("—");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

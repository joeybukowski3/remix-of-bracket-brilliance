import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PgaHistoryModelWithArticles from "./PgaHistoryModelWithArticles";

// PgaHistoryModel renders the full model page and its own data fetches --
// out of scope for this test, which only covers the dynamic "Latest PGA
// Articles" sidebar card this file portals in.
vi.mock("./PgaHistoryModel", () => ({
  default: () => (
    <aside>
      <div>Bet with our partners</div>
    </aside>
  ),
}));

function stubBestBetsFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })),
  );
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PgaHistoryModelWithArticles latest-articles card", () => {
  it("shows the current week's article as Latest, linking to /pga/best-bets, when best-bets.json has one", async () => {
    stubBestBetsFetch({
      tournament: "3M Open",
      generatedAt: "2026-07-23T12:00:00.000Z",
      article: { title: "3M Open Betting Preview", dek: "Post-Open angles and model picks." },
    });

    render(
      <MemoryRouter initialEntries={["/pga"]}>
        <PgaHistoryModelWithArticles />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    expect(screen.getByText("Post-Open angles and model picks.")).toBeInTheDocument();
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /3M Open Betting Preview/ })).toHaveAttribute("href", "/pga/best-bets");
  });

  it("falls back to the frozen Open Championship entry when best-bets.json has no article yet, without pointing it at the live route", async () => {
    stubBestBetsFetch({ tournament: "3M Open", generatedAt: "2026-07-23T12:00:00.000Z", article: null });

    render(
      <MemoryRouter initialEntries={["/pga"]}>
        <PgaHistoryModelWithArticles />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/2026 Open Championship Picks/)).toBeInTheDocument());
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2026 Open Championship Picks/ })).toHaveAttribute(
      "href",
      "/pga/the-open-2026-picks-best-bets-odds",
    );
  });

  it("falls back gracefully when the best-bets fetch fails entirely", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network error"))));

    render(
      <MemoryRouter initialEntries={["/pga"]}>
        <PgaHistoryModelWithArticles />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/2026 Open Championship Picks/)).toBeInTheDocument());
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PgaLatestArticlesCard from "./PgaLatestArticlesCard";

function stubBestBetsFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })),
  );
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/pga"]}>
      <PgaLatestArticlesCard />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PgaLatestArticlesCard", () => {
  it("renders the current week's article with its label, date and link", async () => {
    stubBestBetsFetch({
      tournament: "3M Open",
      generatedAt: "2026-07-23T12:00:00.000Z",
      article: { title: "3M Open Betting Preview", dek: "Post-Open angles and model picks." },
    });

    renderCard();

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    expect(screen.getByText("Post-Open angles and model picks.")).toBeInTheDocument();
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByText("July 23, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /3M Open Betting Preview/ })).toHaveAttribute("href", "/pga/best-bets");
  });

  it("keeps the frozen historical entry and its route", async () => {
    stubBestBetsFetch({ tournament: "3M Open", generatedAt: "2026-07-23T12:00:00.000Z", article: null });

    renderCard();

    await waitFor(() => expect(screen.getByText(/2026 Open Championship Picks/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /2026 Open Championship Picks/ })).toHaveAttribute(
      "href",
      "/pga/the-open-2026-picks-best-bets-odds",
    );
    expect(screen.getByText("July 15, 2026")).toBeInTheDocument();
  });

  it("still renders historical content when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network error"))));

    renderCard();

    await waitFor(() => expect(screen.getByText(/2026 Open Championship Picks/)).toBeInTheDocument());
  });

  it("exposes the card under an accessible Latest PGA Articles heading", async () => {
    stubBestBetsFetch({ tournament: "3M Open", generatedAt: "2026-07-23T12:00:00.000Z", article: null });

    renderCard();

    await waitFor(() => expect(screen.getByText(/2026 Open Championship Picks/)).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Latest PGA Articles" })).toBeInTheDocument();
    expect(screen.getByText("Blog")).toBeInTheDocument();
  });
});

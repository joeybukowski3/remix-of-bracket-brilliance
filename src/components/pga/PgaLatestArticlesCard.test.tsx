import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PgaLatestArticlesCard from "./PgaLatestArticlesCard";

// Pinned so schedule selection, freshness age and date formatting are all
// deterministic: 2026-07-23 is the 3M Open's start date.
const REFERENCE_DATE = "2026-07-23";
const UNAVAILABLE_MESSAGE = "Current PGA analysis is unavailable. Historical articles are shown below.";
const HISTORICAL_TITLE = /2026 Open Championship Picks/;

function buildBestBetsPayload(overrides: Record<string, unknown> = {}) {
  return {
    tournament: "3M Open",
    generatedAt: "2026-07-22T14:09:52.547Z",
    outrights: [{ player: "Sample Golfer", odds: "+2500" }],
    article: { title: "3M Open Betting Preview", dek: "Post-Open angles and model picks." },
    ...overrides,
  };
}

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

async function expectSuppressedGeneratedArticle() {
  await waitFor(() => expect(screen.getByText(UNAVAILABLE_MESSAGE)).toBeInTheDocument());
  expect(screen.getByText(HISTORICAL_TITLE)).toBeInTheDocument();
  expect(screen.queryByText("Latest")).not.toBeInTheDocument();
  expect(screen.queryByText("3M Open Betting Preview")).not.toBeInTheDocument();
}

beforeEach(() => {
  window.localStorage.setItem("pga:date-override", REFERENCE_DATE);
});

afterEach(() => {
  window.localStorage.removeItem("pga:date-override");
  vi.unstubAllGlobals();
});

describe("PgaLatestArticlesCard currentness", () => {
  it("gives Latest to a verified current article with its real generated date and link", async () => {
    stubBestBetsFetch(buildBestBetsPayload());

    renderCard();

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    expect(screen.getByText("Post-Open angles and model picks.")).toBeInTheDocument();
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByText("July 22, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /3M Open Betting Preview/ })).toHaveAttribute("href", "/pga/best-bets");
    expect(screen.queryByText(UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it("never gives Latest to the frozen historical fallback", async () => {
    stubBestBetsFetch(buildBestBetsPayload());

    renderCard();

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    const historicalLink = screen.getByRole("link", { name: HISTORICAL_TITLE });
    expect(historicalLink).toHaveTextContent("Historical");
    expect(historicalLink).not.toHaveTextContent("Latest");
    expect(historicalLink).toHaveTextContent("July 15, 2026");
  });

  it("does not give Latest to a stale payload", async () => {
    stubBestBetsFetch(buildBestBetsPayload({ generatedAt: "2026-07-01T12:00:00.000Z" }));

    renderCard();

    await expectSuppressedGeneratedArticle();
  });

  it("does not give Latest to a payload for a different tournament", async () => {
    stubBestBetsFetch(
      buildBestBetsPayload({
        tournament: "The Open",
        article: { title: "The Open Betting Preview", dek: "Royal Birkdale angles." },
      }),
    );

    renderCard();

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_MESSAGE)).toBeInTheDocument());
    expect(screen.queryByText("Latest")).not.toBeInTheDocument();
    expect(screen.queryByText("The Open Betting Preview")).not.toBeInTheDocument();
  });

  it.each([
    ["a missing generatedAt", buildBestBetsPayload({ generatedAt: undefined })],
    ["an invalid generatedAt", buildBestBetsPayload({ generatedAt: "not-a-real-date" })],
    ["no tournament identity", buildBestBetsPayload({ tournament: null })],
    ["no article content", buildBestBetsPayload({ article: null })],
    ["a non-object payload", "3M Open Betting Preview"],
  ])("does not infer currentness from %s", async (_label, payload) => {
    stubBestBetsFetch(payload);

    renderCard();

    await expectSuppressedGeneratedArticle();
  });

  it("does not infer currentness when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network error"))));

    renderCard();

    await expectSuppressedGeneratedArticle();
  });

  it("keeps article order, titles and links unchanged", async () => {
    stubBestBetsFetch(buildBestBetsPayload());

    renderCard();

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    const links = screen.getAllByRole("link");

    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/pga/best-bets");
    expect(links[0]).toHaveTextContent("3M Open Betting Preview");
    expect(links[1]).toHaveAttribute("href", "/pga/the-open-2026-picks-best-bets-odds");
    expect(links[1]).toHaveTextContent("2026 Open Championship Picks");
  });

  it("keeps the historical link and its route when no current article is verified", async () => {
    stubBestBetsFetch(buildBestBetsPayload({ article: null }));

    renderCard();

    await expectSuppressedGeneratedArticle();
    expect(screen.getByRole("link", { name: HISTORICAL_TITLE })).toHaveAttribute(
      "href",
      "/pga/the-open-2026-picks-best-bets-odds",
    );
  });

  it("still exposes the card heading and Blog label", async () => {
    stubBestBetsFetch(buildBestBetsPayload());

    renderCard();

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Latest PGA Articles" })).toBeInTheDocument();
    expect(screen.getByText("Blog")).toBeInTheDocument();
  });
});

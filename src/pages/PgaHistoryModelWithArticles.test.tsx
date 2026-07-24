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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pga"]}>
      <PgaHistoryModelWithArticles />
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
  vi.useRealTimers();
  window.localStorage.setItem("pga:date-override", REFERENCE_DATE);
});

afterEach(() => {
  window.localStorage.removeItem("pga:date-override");
  vi.unstubAllGlobals();
});

describe("PgaHistoryModelWithArticles latest-articles card", () => {
  it("shows the current week's article as Latest, linking to /pga/best-bets, when best-bets.json has one", async () => {
    stubBestBetsFetch(buildBestBetsPayload());

    renderPage();

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    expect(screen.getByText("Post-Open angles and model picks.")).toBeInTheDocument();
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByText("July 22, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /3M Open Betting Preview/ })).toHaveAttribute("href", "/pga/best-bets");
    expect(screen.queryByText(UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it("marks the frozen Open Championship entry Historical, never Latest, alongside a valid current article", async () => {
    stubBestBetsFetch(buildBestBetsPayload());

    renderPage();

    await waitFor(() => expect(screen.getByText("3M Open Betting Preview")).toBeInTheDocument());
    const historicalLink = screen.getByRole("link", { name: HISTORICAL_TITLE });
    expect(historicalLink).toHaveAttribute("href", "/pga/the-open-2026-picks-best-bets-odds");
    expect(historicalLink).toHaveTextContent("Historical");
    expect(historicalLink).not.toHaveTextContent("Latest");
    expect(historicalLink).toHaveTextContent("July 15, 2026");
  });

  it("suppresses the generated card when best-bets.json has no article yet", async () => {
    stubBestBetsFetch(buildBestBetsPayload({ article: null }));

    renderPage();

    await expectSuppressedGeneratedArticle();
    expect(screen.getByRole("link", { name: HISTORICAL_TITLE })).toHaveAttribute(
      "href",
      "/pga/the-open-2026-picks-best-bets-odds",
    );
  });

  it("suppresses the generated card when the best-bets fetch fails entirely", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network error"))));

    renderPage();

    await expectSuppressedGeneratedArticle();
  });

  it("suppresses the generated card when the response is not OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(buildBestBetsPayload()) })),
    );

    renderPage();

    await expectSuppressedGeneratedArticle();
  });

  it.each([
    ["null", null],
    ["an array", [buildBestBetsPayload()]],
    ["a string", "3M Open Betting Preview"],
    ["an object missing article data", { tournament: "3M Open", generatedAt: "2026-07-22T14:09:52.547Z" }],
    ["an object with an empty article title", buildBestBetsPayload({ article: { title: "   " } })],
    ["an object missing tournament identity", buildBestBetsPayload({ tournament: null })],
  ])("suppresses the generated card when the payload is %s", async (_label, payload) => {
    stubBestBetsFetch(payload);

    renderPage();

    await expectSuppressedGeneratedArticle();
  });

  it("suppresses the generated card when generatedAt is missing", async () => {
    stubBestBetsFetch(buildBestBetsPayload({ generatedAt: undefined }));

    renderPage();

    await expectSuppressedGeneratedArticle();
  });

  it("suppresses the generated card when generatedAt is not a valid date", async () => {
    stubBestBetsFetch(buildBestBetsPayload({ generatedAt: "not-a-real-date" }));

    renderPage();

    await expectSuppressedGeneratedArticle();
  });

  it("suppresses the generated card when the payload is for a different tournament", async () => {
    stubBestBetsFetch(
      buildBestBetsPayload({
        tournament: "The Open",
        article: { title: "The Open Betting Preview", dek: "Royal Birkdale angles." },
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_MESSAGE)).toBeInTheDocument());
    expect(screen.getByText(HISTORICAL_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("Latest")).not.toBeInTheDocument();
    expect(screen.queryByText("The Open Betting Preview")).not.toBeInTheDocument();
  });

  it("suppresses the generated card when the payload is older than the best-bets freshness threshold", async () => {
    stubBestBetsFetch(buildBestBetsPayload({ generatedAt: "2026-07-01T12:00:00.000Z" }));

    renderPage();

    await expectSuppressedGeneratedArticle();
  });
});

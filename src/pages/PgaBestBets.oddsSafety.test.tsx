import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PgaBestBets from "./PgaBestBets";

/**
 * A pick priced ONLY outright, entered in all four markets.
 *
 * The audited defect: the placement cards fell back to the outright price, so
 * a Top-20 card rendered "+4500" as though it were a Top-20 number.
 */
function pick(player: string, odds: Record<string, string | null> | null) {
  return {
    player,
    tournamentRank: 3,
    powerRank: 7,
    topStats: ["sgTotal=1.24"],
    bullets: ["Ranks 3rd in the model."],
    odds,
  };
}

function payloadWith(odds: Record<string, string | null> | null) {
  return {
    tournament: "Genesis Scottish Open",
    course: "The Renaissance Club",
    generatedAt: "2026-07-06T12:00:00.000Z",
    preview: null,
    valueBets: [],
    outrights: [pick("Alpha Outright", odds)],
    top5: [pick("Bravo Topfive", odds)],
    top10: [pick("Charlie Topten", odds)],
    top20: [pick("Delta Toptwenty", odds)],
  };
}

function renderPage(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })),
  );
  return render(
    <MemoryRouter initialEntries={["/pga/best-bets"]}>
      <PgaBestBets />
    </MemoryRouter>,
  );
}

/** The <article> card for a given player. */
function cardFor(player: string) {
  const heading = screen.getByText(player);
  const card = heading.closest("article");
  if (!card) throw new Error(`No card found for ${player}`);
  return card;
}

const PLACEMENT_PLAYERS = ["Bravo Topfive", "Charlie Topten", "Delta Toptwenty"];

beforeEach(() => {
  window.localStorage.setItem("pga:date-override", "2026-07-06");
});

afterEach(() => {
  window.localStorage.removeItem("pga:date-override");
  vi.unstubAllGlobals();
});

describe("placement markets never display an outright price", () => {
  it("outright-only pricing shows the price on outrights and 'Price unavailable' elsewhere", async () => {
    renderPage(payloadWith({ outright: "+4500", top5: null, top10: null, top20: null }));

    await waitFor(() => expect(screen.getByText("Alpha Outright")).toBeInTheDocument());

    expect(within(cardFor("Alpha Outright")).getByText("+4500")).toBeInTheDocument();

    for (const player of PLACEMENT_PLAYERS) {
      const card = within(cardFor(player));
      expect(card.getByText("Price unavailable")).toBeInTheDocument();
      expect(card.queryByText("+4500")).toBeNull();
    }
  });

  it("top-5-only pricing shows the price on top 5 and nowhere else", async () => {
    renderPage(payloadWith({ outright: null, top5: "+650", top10: null, top20: null }));

    await waitFor(() => expect(screen.getByText("Bravo Topfive")).toBeInTheDocument());

    expect(within(cardFor("Bravo Topfive")).getByText("+650")).toBeInTheDocument();

    for (const player of ["Alpha Outright", "Charlie Topten", "Delta Toptwenty"]) {
      const card = within(cardFor(player));
      expect(card.getByText("Price unavailable")).toBeInTheDocument();
      expect(card.queryByText("+650")).toBeNull();
    }
  });

  it("fully priced payloads show each market its own price", async () => {
    renderPage(payloadWith({ outright: "+4500", top5: "+650", top10: "+260", top20: "-140" }));

    await waitFor(() => expect(screen.getByText("Alpha Outright")).toBeInTheDocument());

    expect(within(cardFor("Alpha Outright")).getByText("+4500")).toBeInTheDocument();
    expect(within(cardFor("Bravo Topfive")).getByText("+650")).toBeInTheDocument();
    expect(within(cardFor("Charlie Topten")).getByText("+260")).toBeInTheDocument();
    expect(within(cardFor("Delta Toptwenty")).getByText("-140")).toBeInTheDocument();
    expect(screen.queryByText("Price unavailable")).toBeNull();
  });

  it("an entirely unpriced payload renders every card with 'Price unavailable'", async () => {
    renderPage(payloadWith(null));

    await waitFor(() => expect(screen.getByText("Alpha Outright")).toBeInTheDocument());

    expect(screen.getAllByText("Price unavailable")).toHaveLength(4);
  });

  it("renders every market normally when odds are missing entirely", async () => {
    renderPage(payloadWith(null));

    await waitFor(() => expect(screen.getByText("Alpha Outright")).toBeInTheDocument());
    for (const player of ["Alpha Outright", ...PLACEMENT_PLAYERS]) {
      expect(screen.getByText(player)).toBeInTheDocument();
    }
  });
});

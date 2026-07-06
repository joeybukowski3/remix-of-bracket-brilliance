import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PgaBestBets from "./PgaBestBets";

const currentPayload = {
  tournament: "Genesis Scottish Open",
  course: "The Renaissance Club",
  generatedAt: "2026-07-06T12:00:00.000Z",
  preview: {
    tournamentOverview: "Tournament overview",
    modelExplainer: "Model explainer",
    pickApproach: "Pick approach",
  },
  valueBets: [],
  outrights: [
    {
      player: "Scottie Scheffler",
      tournamentRank: 1,
      powerRank: 1,
      topStats: ["SG Total"],
      bullets: ["Elite baseline profile."],
      odds: { outright: "+450" },
    },
  ],
  top5: [],
  top10: [],
  top20: [],
};

function renderPage(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  })));

  return render(
    <MemoryRouter initialEntries={["/pga/best-bets"]}>
      <PgaBestBets />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.setItem("pga:date-override", "2026-07-06");
});

afterEach(() => {
  window.localStorage.removeItem("pga:date-override");
  vi.unstubAllGlobals();
});

describe("PgaBestBets freshness gating", () => {
  it("renders current best-bets cards with freshness context", async () => {
    renderPage(currentPayload);

    await waitFor(() => expect(screen.getByText("Scottie Scheffler")).toBeInTheDocument());
    expect(screen.getByText("Best bets card status")).toBeInTheDocument();
    expect(screen.getAllByText("Genesis Scottish Open").length).toBeGreaterThan(0);
    expect(screen.getByText(/\+450/)).toBeInTheDocument();
  });

  it("shows a stale warning and suppresses stale recommendations", async () => {
    renderPage({
      ...currentPayload,
      generatedAt: "2026-06-01T12:00:00.000Z",
    });

    await waitFor(() => expect(screen.getByText("Best bets card needs review")).toBeInTheDocument());
    expect(screen.getByText("No current card available")).toBeInTheDocument();
    expect(screen.getByText(/Payload is older than 7 days/)).toBeInTheDocument();
    expect(screen.queryByText("Scottie Scheffler")).not.toBeInTheDocument();
    expect(screen.queryByText("Outright Winners")).not.toBeInTheDocument();
  });

  it("shows tournament mismatch details and suppresses mismatched recommendations", async () => {
    renderPage({
      ...currentPayload,
      tournament: "Travelers Championship",
    });

    await waitFor(() => expect(screen.getByText("Best bets card needs review")).toBeInTheDocument());
    expect(screen.getByText(/Payload tournament does not match expected tournament/)).toBeInTheDocument();
    expect(screen.getByText("Travelers Championship")).toBeInTheDocument();
    expect(screen.getByText("No current card available")).toBeInTheDocument();
    expect(screen.queryByText("Scottie Scheffler")).not.toBeInTheDocument();
  });

  it("shows the empty-state message when best-bets arrays are empty", async () => {
    renderPage({
      ...currentPayload,
      valueBets: [],
      outrights: [],
      top5: [],
      top10: [],
      top20: [],
    });

    await waitFor(() => expect(screen.getByText("No current card available")).toBeInTheDocument());
    expect(screen.getByText(/This week's analysis generates every Monday/)).toBeInTheDocument();
    expect(screen.queryByText("Outright Winners")).not.toBeInTheDocument();
  });
});

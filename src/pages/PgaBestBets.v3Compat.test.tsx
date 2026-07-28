import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PgaBestBets from "./PgaBestBets";
import {
  buildModelLeans,
  buildRecommendationEntry,
  buildUnavailableArtifact,
  buildV3Artifact,
} from "../../scripts/lib/pga-best-bets-schema.mjs";
import { buildRecommendationCopy } from "../../scripts/lib/pga-best-bets-selection.mjs";

/**
 * PR A ships a new V3 artifact shape (schemaVersion 3, recommendations/
 * modelLeans/ladders alongside V2-compatible outrights/top5/top10/top20).
 * PR B owns the compact redesign; this file only proves the EXISTING page
 * does not crash on any of the three new artifact shapes it can now receive.
 */

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

const candidate = {
  playerKey: "scottie scheffler", playerName: "Scottie Scheffler", market: "outright",
  rank: 1, powerRank: 1, ladderId: null,
  price: { american: 450, decimal: 5.5, sportsbookName: "DraftKings", sportsbookKey: "draftkings", fetchedAt: "2026-07-06T09:00:00Z", eventId: "evt-1" },
  probability: { blended: 0.12, rawImplied: 0.1, noVig: 0.095, provisionalModelComponent: 0.18 },
  probabilityEdge: 0.025,
  expectedValue: 0.15,
};

describe("PgaBestBets renders V3 artifact shapes without crashing", () => {
  it("renders a V3 official-best-bets artifact", async () => {
    const recommendation = buildRecommendationEntry(candidate, buildRecommendationCopy(candidate));
    const artifact = buildV3Artifact({
      tournament: "Genesis Scottish Open",
      tournamentId: "R1",
      localScheduleId: "scottish-open-2026",
      course: "The Renaissance Club",
      generatedAt: "2026-07-06T12:00:00.000Z",
      status: "official-best-bets",
      sourceStatus: { model: "available", grok: "available", odds: "available", article: "unavailable" },
      oddsDiagnostics: { providerKey: "the-odds-api", errors: [] },
      recommendations: [recommendation],
      portfolioDiagnostics: {
        totalRecommendations: 1, uniqueGolfers: 1, duplicationRate: 0, maximumAppearances: 1, numberOfLadders: 0,
        oddsCoverage: 1, staleOddsCount: 0, candidatesCreated: 4, candidatesWithExactPrice: 1,
        rejectedByProbabilityFloor: 0, rejectedByProbabilityEdge: 0, rejectedByExpectedValue: 0,
        rejectedByFreshness: 0, rejectedByFieldMembership: 0, rejectedByMissingModelData: 0, rejectedByOverlapRules: 0,
      },
      fieldCoverage: null,
      methodologyNotes: [],
      dataLimitations: [],
    });

    renderPage(artifact);

    await waitFor(() => expect(screen.getAllByText("Scottie Scheffler").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/\+450/).length).toBeGreaterThan(0);
  });

  it("renders a V3 model-leans-only artifact (no crash, no price shown)", async () => {
    const leans = buildModelLeans([
      { player: "Scottie Scheffler", playerKey: "scottie scheffler", rank: 1, powerRank: 1, provisionalModelProbability: { outright: 0.1, top5: 0.3, top10: 0.5, top20: 0.7 } },
    ]);
    const artifact = buildV3Artifact({
      tournament: "Genesis Scottish Open",
      tournamentId: "R1",
      localScheduleId: "scottish-open-2026",
      course: "The Renaissance Club",
      generatedAt: "2026-07-06T12:00:00.000Z",
      status: "model-leans-only",
      reason: "No verified exact-market prices were available this week.",
      sourceStatus: { model: "available", grok: "available", odds: "unavailable", article: "unavailable" },
      oddsDiagnostics: { providerKey: "the-odds-api", errors: ["no event matched"] },
      recommendations: [],
      modelLeans: leans,
      portfolioDiagnostics: null,
      fieldCoverage: null,
      methodologyNotes: [],
      dataLimitations: [],
    });

    renderPage(artifact);

    await waitFor(() => expect(screen.getAllByText("Scottie Scheffler").length).toBeGreaterThan(0));
    expect(screen.queryByText(/\+450/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("odds-unavailable").length).toBeGreaterThan(0);
  });

  it("renders a V3 unavailable artifact (empty state, no crash)", async () => {
    const artifact = buildUnavailableArtifact({
      tournament: "Genesis Scottish Open",
      generatedAt: "2026-07-06T12:00:00.000Z",
      reason: "No verified odds provider match was found this week.",
    });

    renderPage(artifact);

    await waitFor(() => expect(screen.getByText("No current card available")).toBeInTheDocument());
  });
});

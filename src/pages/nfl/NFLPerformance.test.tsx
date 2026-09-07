/**
 * Route-level smoke test for /nfl/performance/:tab -- the page mounts, the
 * header renders, and the default tab resolves without throwing when the
 * artifacts fetch cleanly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NFLPerformance from "./NFLPerformance";

const OVERVIEW = {
  performanceMeta: { generatedAt: "2026-09-05T12:00:00.000Z", season: 2026 },
  totals: { status: "AVAILABLE", graded_games: 0, mae: null, bias: null, directional_hit_rate: null, latest_grade_timestamp: null },
  props: {
    status: "AVAILABLE",
    graded_props: 0,
    directional_hit_rate: null,
    mae: null,
    passing_n: 0,
    rushing_n: 0,
    receiving_n: 0,
    latest_grade_timestamp: null,
  },
  sides: {
    status: "AVAILABLE",
    graded_games: 0,
    spread_mae: null,
    market_direction_metric: { comparable_n: 0, jkb_mae: null, market_mae: null, jkb_minus_market_mae: null },
    winner_accuracy: null,
    latest_grade_timestamp: null,
  },
};
const SIDES = { performanceMeta: {}, summary: { graded_games: 0 }, buckets: {}, rows: [] };
const TOTALS = { performanceMeta: {}, summary: { graded_games: 0 }, buckets: {}, rows: [] };
const PROPS = { performanceMeta: {}, summary: { graded_starter_props: 0 }, coverage: { total_cohort_rows: 0, gradeable_rows: 0 }, rows: [] };
const HEALTH = { performanceMeta: {}, totals: {}, props: {}, sides: {}, workflow: { generated_at_by_artifact: {} } };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nfl/performance/:tab" element={<NFLPerformance />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NFLPerformance route", () => {
  it("renders the Overview tab with the zero-state when artifacts load clean", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("overview.json")) return Promise.resolve(jsonResponse(OVERVIEW));
      if (url.includes("sides.json")) return Promise.resolve(jsonResponse(SIDES));
      if (url.includes("totals.json")) return Promise.resolve(jsonResponse(TOTALS));
      if (url.includes("props.json")) return Promise.resolve(jsonResponse(PROPS));
      return Promise.resolve(jsonResponse(HEALTH));
    });

    renderAt("/nfl/performance/overview");

    expect(screen.getByRole("heading", { name: "NFL Performance" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("No graded results yet").length).toBeGreaterThan(0);
    });
  });

  it("renders the Game Log placeholder shell", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(jsonResponse(HEALTH)));
    renderAt("/nfl/performance/game-log");
    expect(screen.getByText(/Unified game log coming in the next performance work unit/i)).toBeInTheDocument();
  });
});

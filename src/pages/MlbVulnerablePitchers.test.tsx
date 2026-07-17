/**
 * MlbVulnerablePitchers.test.tsx
 * Focused tests for the dedicated Vulnerable Pitchers page: it must reuse
 * the existing usePitcherRegression hook and MlbPitcherRegressionTable
 * component unchanged (no new scoring/tiering logic lives on this page).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbVulnerablePitchers from "./MlbVulnerablePitchers";

type RegressionPitcherFixture = {
  pitcherId: number | null;
  name: string;
  team: string;
  era: number | null;
  xfip: number | null;
  xera: number | null;
  kbb: number | null;
  strandRate: number | null;
  hrfb: number | null;
  babip: number | null;
  regressionScore: number;
  regressionTier: "extreme_positive" | "strong_positive" | "slight_positive" | "neutral" | "slight_negative" | "strong_negative" | "extreme_negative";
  summary: string;
};

function makePitcher(overrides: Partial<RegressionPitcherFixture> = {}): RegressionPitcherFixture {
  return {
    pitcherId: 1,
    name: "Gavin Williams",
    team: "CLE",
    era: 4.8,
    xfip: 3.4,
    xera: 3.2,
    kbb: 18.5,
    strandRate: 65,
    hrfb: 15,
    babip: 0.34,
    regressionScore: 8.1,
    regressionTier: "extreme_negative",
    summary: "Gavin Williams is drastically underperforming — expect significant ERA improvement.",
    ...overrides,
  };
}

const FIXTURE = {
  generatedAt: "2026-07-17T09:00:00.000Z",
  date: "2026-07-17",
  pitchers: [
    makePitcher(),
    makePitcher({ pitcherId: 2, name: "Justin Steele", team: "CHC", regressionScore: -1.2, regressionTier: "slight_positive", summary: "Justin Steele has a small edge over expected — slight upside regression risk." }),
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/mlb/vulnerable-pitchers"]}>
      <MlbVulnerablePitchers />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("pitcher-regression.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(FIXTURE) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }),
  );
});

describe("MlbVulnerablePitchers", () => {
  it("renders every pitcher from the existing regression data source", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    expect(screen.getByText("Justin Steele")).toBeInTheDocument();
  });

  it("renders the shared MlbPitcherRegressionTable's own regression score and tier label, not a re-derived value", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    expect(screen.getByText("+8.1")).toBeInTheDocument();
    expect(screen.getByText("Strongly Improving")).toBeInTheDocument();
  });

  it("filters pitchers by search on pitcher or team name", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    const search = screen.getByPlaceholderText("Search pitcher or team");
    fireEvent.change(search, { target: { value: "Steele" } });
    await waitFor(() => {
      expect(screen.queryByText("Gavin Williams")).not.toBeInTheDocument();
      expect(screen.getByText("Justin Steele")).toBeInTheDocument();
    });
  });

  it("shows the existing table's own empty-state message when there is no data, rather than inventing new copy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ generatedAt: "", date: "", pitchers: [] }) } as Response)));
    renderPage();
    await waitFor(() => expect(screen.getByText(/No pitcher regression data available/)).toBeInTheDocument());
  });
});

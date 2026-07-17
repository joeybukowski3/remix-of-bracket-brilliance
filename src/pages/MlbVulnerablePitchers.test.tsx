/**
 * MlbVulnerablePitchers.test.tsx
 * Focused tests for the dedicated Vulnerable Pitchers page: it must reuse
 * the existing usePitcherRegression hook and MlbPitcherRegressionTable
 * component unchanged (no new scoring/tiering logic lives on this page),
 * present the established dark-navy model-page hero/header, and correctly
 * identify the most vulnerable pitcher as the one with the LOWEST (most
 * negative) regressionScore -- negative = overperforming = regression risk,
 * per mlbPitcherRegression.ts and MlbPitcherRegressionTable.tsx.
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
    era: 2.8,
    xfip: 4.4,
    xera: 4.2,
    kbb: 12.5,
    strandRate: 82,
    hrfb: 6,
    babip: 0.24,
    regressionScore: -8.1,
    regressionTier: "extreme_positive",
    summary: "Gavin Williams is massively overperforming — expect significant ERA regression downward.",
    ...overrides,
  };
}

// Gavin Williams: strongly NEGATIVE score -- overperforming, the genuinely
// vulnerable/regression-risk pitcher. Justin Steele: positive score --
// underperforming, the opposite of vulnerable (possible improvement).
const FIXTURE = {
  generatedAt: "2026-07-17T09:00:00.000Z",
  date: "2026-07-17",
  pitchers: [
    makePitcher(),
    makePitcher({ pitcherId: 2, name: "Justin Steele", team: "CHC", regressionScore: 3.4, regressionTier: "slight_negative", summary: "Justin Steele is slightly underperforming — modest upside potential." }),
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/mlb/vulnerable-pitchers"]}>
      <MlbVulnerablePitchers />
    </MemoryRouter>,
  );
}

function stubFetch(payload: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("pitcher-regression.json")) {
        return Promise.resolve({ ok, json: () => Promise.resolve(payload) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }),
  );
}

beforeEach(() => {
  stubFetch(FIXTURE);
});

describe("MlbVulnerablePitchers — hero/header structure", () => {
  it("renders the shared MlbNavHero", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Vulnerable Pitchers/ })).toBeInTheDocument();
  });

  it("renders the eyebrow", async () => {
    renderPage();
    expect(screen.getByText("Pitcher Vulnerability Model")).toBeInTheDocument();
  });

  it("renders the exact page title", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "MLB Vulnerable Pitchers" })).toBeInTheDocument();
  });

  it("renders the description", async () => {
    renderPage();
    expect(
      screen.getByText(/Identifies today's starting pitchers whose results may be vulnerable based on ERA, expected metrics, contact quality, and regression signals\./),
    ).toBeInTheDocument();
  });
});

describe("MlbVulnerablePitchers — reuses existing data/table unchanged", () => {
  it("renders every pitcher from the existing regression data source", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    expect(screen.getByText("Justin Steele")).toBeInTheDocument();
  });

  it("renders the shared MlbPitcherRegressionTable's own regression score and tier label, not a re-derived value", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    expect(screen.getByText("-8.1")).toBeInTheDocument();
    // "Strongly Regressing" also appears in the explanatory copy below, so
    // assert it appears at least once rather than requiring a single match.
    expect(screen.getAllByText("Strongly Regressing").length).toBeGreaterThan(0);
  });

  it("keeps the table's own row order (biggest |regressionScore| first), not a page-level re-sort", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    const rows = screen.getAllByRole("row").filter((row) => row.textContent?.includes("Gavin Williams") || row.textContent?.includes("Justin Steele"));
    // Gavin Williams (|−8.1| = 8.1) outranks Justin Steele (|3.4| = 3.4).
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Gavin Williams");
    expect(rows[1].textContent).toContain("Justin Steele");
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
});

describe("MlbVulnerablePitchers — summary row", () => {
  it("shows the correct pitcher count", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Pitchers analyzed")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("identifies the most vulnerable pitcher as the one with the LOWEST (most negative) score, not the highest raw value", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Highest regression risk")).toBeInTheDocument());
    // Gavin Williams (-8.1) is the regression-risk pitcher, not Justin Steele (+3.4).
    expect(screen.getByText(/Gavin Williams \(-8\.1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Justin Steele \(\+3\.4\)/)).not.toBeInTheDocument();
  });

  it("shows a real generated-at time sourced from the hook, not a fabricated value", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Last updated")).toBeInTheDocument());
    // formatModelTimestamp renders month/day/time -- assert it's not the raw
    // ISO string and not a placeholder, i.e. a real formatted date landed.
    expect(screen.queryByText("2026-07-17T09:00:00.000Z")).not.toBeInTheDocument();
    expect(screen.getByText(/Jul 17/)).toBeInTheDocument();
  });
});

describe("MlbVulnerablePitchers — accurate score-direction explanation", () => {
  it("renders the 'How to read this page' card", async () => {
    renderPage();
    expect(screen.getByText("How to read this page")).toBeInTheDocument();
  });

  it("states negative score = overperforming / regression risk, and positive = underperforming / possible improvement", async () => {
    renderPage();
    expect(screen.getByText(/overperforming their expected metrics/)).toBeInTheDocument();
    expect(screen.getByText(/underperforming their expected metrics/)).toBeInTheDocument();
    expect(screen.getByText(/Strongly Regressing/)).toBeInTheDocument();
  });

  it("does not claim the largest positive number is the most vulnerable", async () => {
    renderPage();
    const guide = screen.getByText("How to read this page").closest("section")!;
    expect(guide.textContent).not.toMatch(/positive.{0,40}most vulnerable/i);
  });
});

describe("MlbVulnerablePitchers — loading, empty data, and empty search states", () => {
  it("shows a loading state before data arrives", () => {
    stubFetch(FIXTURE);
    renderPage();
    expect(screen.getByText(/Loading pitcher regression data/)).toBeInTheDocument();
  });

  it("shows the existing table's own empty-state message when there is no data at all, rather than inventing new copy", async () => {
    stubFetch({ generatedAt: "", date: "", pitchers: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/No pitcher regression data available/)).toBeInTheDocument());
  });

  it("shows a distinct empty-search-result message when data loaded but no pitcher matches the filter", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Gavin Williams")).toBeInTheDocument());
    const search = screen.getByPlaceholderText("Search pitcher or team");
    fireEvent.change(search, { target: { value: "Nonexistent Pitcher Zzz" } });
    await waitFor(() => {
      expect(screen.getByText(/No pitchers match/)).toBeInTheDocument();
      expect(screen.queryByText(/No pitcher regression data available/)).not.toBeInTheDocument();
    });
  });
});

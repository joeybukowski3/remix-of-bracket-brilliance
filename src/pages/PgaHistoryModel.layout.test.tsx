import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PgaHistoryModelWithArticles from "./PgaHistoryModelWithArticles";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/pga/PgaHistoryModelTable", () => ({
  default: () => <div data-testid="model-table">model table</div>,
}));

vi.mock("@/hooks/usePgaPlayerHistory", () => ({
  usePgaPlayerHistory: () => ({
    playerHistoryMap: new Map(),
    majorHistoryMap: new Map(),
    loading: false,
    error: null,
    lastRefresh: null,
  }),
}));

const SCHEDULE = [
  { id: "3m", slug: "3m-open", name: "3M Open", shortName: "3M Open", startDate: "2999-01-01", endDate: "2999-01-04", dateLabel: "Week one", dataFile: "a.json", category: "standard", eventType: "standard", courseName: "TPC", location: "MN", status: "scheduled", winner: "", sourceTour: "pga", sourceCountry: "USA" },
  { id: "rocket", slug: "rocket-classic", name: "Rocket Classic", shortName: "Rocket Classic", startDate: "2999-01-08", endDate: "2999-01-11", dateLabel: "Week two", dataFile: "b.json", category: "standard", eventType: "standard", courseName: "DGC", location: "MI", status: "scheduled", winner: "", sourceTour: "pga", sourceCountry: "USA" },
  { id: "wyndham", slug: "wyndham", name: "Wyndham Championship", shortName: "Wyndham Championship", startDate: "2999-01-15", endDate: "2999-01-18", dateLabel: "Week three", dataFile: "c.json", category: "standard", eventType: "standard", courseName: "Sedgefield", location: "NC", status: "scheduled", winner: "", sourceTour: "pga", sourceCountry: "USA" },
];

vi.mock("@/components/pga/PgaHubShared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/pga/PgaHubShared")>();
  return {
    ...actual,
    usePgaHubData: () => ({ schedule: SCHEDULE, courseWeights: [], playerStats: [], loading: false }),
  };
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pga"]}>
      <PgaHistoryModelWithArticles />
    </MemoryRouter>,
  );
}

function sidebar() {
  return screen.getByRole("complementary", { name: /articles, schedule and partners/i });
}

describe("PGA model page layout", () => {
  it("renders exactly one sidebar -- the right sidebar container is gone", () => {
    renderPage();

    expect(screen.getAllByRole("complementary")).toHaveLength(1);
  });

  it("orders the left sidebar as articles, schedule, then partners", async () => {
    renderPage();

    // Section-level (h2) headings only -- article titles render as h3.
    const headings = within(sidebar())
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent?.trim());

    expect(headings).toEqual(["Latest PGA Articles", "2026 PGA Tour", "Bet with our partners"]);
  });

  it("places the latest articles card in the left sidebar", async () => {
    renderPage();

    expect(await within(sidebar()).findByText(/2026 Open Championship Picks/)).toBeInTheDocument();
    expect(within(sidebar()).getByRole("link", { name: /2026 Open Championship Picks/ })).toHaveAttribute(
      "href",
      "/pga/the-open-2026-picks-best-bets-odds",
    );
  });

  it("keeps every partner link and its tracking attributes below the schedule", () => {
    renderPage();

    const partners = within(sidebar()).getByRole("region", { name: "Bet with our partners" });
    const links = within(partners).getAllByRole("link");

    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
      expect(link.getAttribute("href")).toBeTruthy();
    });
  });

  it("collapses the schedule to the current and next tournaments by default", () => {
    renderPage();

    const scope = within(sidebar());
    expect(scope.getByText("3M Open")).toBeInTheDocument();
    expect(scope.getByText("Rocket Classic")).toBeInTheDocument();
    expect(scope.queryByText("Wyndham Championship")).not.toBeInTheDocument();
    expect(scope.getByRole("button", { name: "View full schedule" })).toHaveAttribute("aria-expanded", "false");
  });

  it("uses a stable two-column desktop grid with a min-width-0 main column", () => {
    const { container } = renderPage();

    const grid = container.querySelector(".lg\\:grid-cols-\\[minmax\\(220px\\,240px\\)_minmax\\(0\\,1fr\\)\\]");
    expect(grid).toBeTruthy();

    const main = container.querySelector("main");
    expect(main?.className).toContain("min-w-0");
  });

  it("stacks the model above the sidebar on mobile and reverses it on desktop", () => {
    const { container } = renderPage();

    expect(container.querySelector("main")?.className).toContain("order-1");
    expect(container.querySelector("main")?.className).toContain("lg:order-2");
    expect(sidebar().className).toContain("order-2");
    expect(sidebar().className).toContain("lg:order-1");
  });

  it("keeps the sidebar sections reachable on mobile without a hidden container", () => {
    renderPage();

    expect(sidebar().className).not.toContain("hidden");
    const scope = within(sidebar());
    expect(scope.getByRole("heading", { name: "2026 PGA Tour" })).toBeInTheDocument();
    expect(scope.getByRole("heading", { name: "Bet with our partners" })).toBeInTheDocument();
  });

  it("still renders the model table in the main column", () => {
    renderPage();

    expect(screen.getByTestId("model-table")).toBeInTheDocument();
  });

  it("keeps the search and field filter controls in the main column", () => {
    renderPage();

    expect(screen.getByPlaceholderText("Search player...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Percentile/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Raw/ })).toBeInTheDocument();
  });
});

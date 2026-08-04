import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import PgaDfsUpload from "./PgaDfsUpload";

const fixtures = vi.hoisted(() => {
  const finish = (finishText: string, sequence: number, eventName = `Recent ${sequence}`) => ({
    sequence,
    season: 2026,
    eventSlug: `recent-${sequence}`,
    eventName,
    finishText,
    finishPosition: Number(finishText.replace(/\D/g, "")) || null,
    madeCut: true,
    status: "finished" as const,
  });
  const recentResults = ["T2", "T8", "T12", "T20", "T25"].map((value, index) => finish(value, index + 1));
  const eventResult = finish("T10", 1, "Wyndham Championship");

  return {
    schedule: [{
      id: "wyndham-championship-2026",
      slug: "wyndham-championship-2026-picks",
      name: "Wyndham Championship",
      shortName: "Wyndham Championship",
      courseName: "Sedgefield Country Club",
      location: "Greensboro, NC",
      startDate: "2026-08-06",
      endDate: "2026-08-09",
      dateLabel: "Aug 6-9",
      eventType: "standard",
      category: "standard" as const,
      status: "upcoming",
      winner: "",
      dataFile: "",
      sourceTour: "PGA",
      sourceCountry: "US",
      yardage: 7_131,
    }],
    weights: [
      {
        tournament: "default",
        course: "default",
        weights: { sgTotal: 0, sgOTT: 0, sgApp: 0, sgAtG: 0, sgPutt: 1, trendRank: 0, drivingAccuracy: 0, bogeyAvoidance: 0, birdieBogeyRatio: 0 },
      },
      {
        tournament: "Wyndham Championship",
        course: "Sedgefield Country Club",
        weights: { sgTotal: 1, sgOTT: 0, sgApp: 0, sgAtG: 0, sgPutt: 0, trendRank: 0, drivingAccuracy: 0, bogeyAvoidance: 0, birdieBogeyRatio: 0 },
      },
    ],
    players: [
      { player: "Cameron Young", sgTotal: 2, sgOTT: 1, sgApp: 1, sgAtG: .5, sgPutt: -.5, trendRank: 1, drivingAccuracy: 70, bogeyAvoidance: .1, birdieBogeyRatio: 2 },
      { player: "Hideki Matsuyama", sgTotal: 1, sgOTT: .2, sgApp: .3, sgAtG: .2, sgPutt: 1, trendRank: 10, drivingAccuracy: 60, bogeyAvoidance: .2, birdieBogeyRatio: 1 },
    ],
    field: {
      tournament: "Wyndham Championship",
      tournamentSlug: "wyndham-championship-2026-picks",
      localScheduleId: "wyndham-championship-2026",
      source: "test",
      validated: true,
      players: ["Cameron Young", "Hideki Matsuyama"],
      playerDetails: [{ id: "57366", name: "Cameron Young" }, { id: "32839", name: "Hideki Matsuyama" }],
    },
    playerHistoryMap: new Map([[
      "cameronyoung",
      {
        player: "Cameron Young",
        recentResults,
        eventHistory: { "wyndham-championship-2026-picks": [eventResult] },
        stats: { drivingDistance: 315, drivingAccuracy: 70 },
      },
    ]]),
    trendMap: new Map([[
      "cameronyoung",
      { player: "Cameron Young", rank: 3, trendScore: 80, recent20: .5, baseline: .2, vsBaseline: .3, finishForm: 70, roundsUsed: 20, startsUsed: 5, latestRoundDate: "2026-08-01", confidence: "official" as const, sourceCounts: { PGA: 20 } },
    ]]),
  };
});

vi.mock("@/components/layout/SiteShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
vi.mock("@/hooks/usePgaCurrentField", () => ({ usePgaCurrentField: () => ({ field: fixtures.field, loaded: true }) }));
vi.mock("@/hooks/usePgaPlayerHistory", () => ({
  usePgaPlayerHistory: () => ({ playerHistoryMap: fixtures.playerHistoryMap, majorHistoryMap: new Map(), loading: false }),
}));
vi.mock("@/hooks/useJkbTrendRankings", () => ({
  useJkbTrendRankings: () => ({ rankingMap: fixtures.trendMap, loading: false }),
}));
vi.mock("@/components/pga/PgaHubShared", async () => {
  const actual = await vi.importActual<typeof import("@/components/pga/PgaHubShared")>("@/components/pga/PgaHubShared");
  return {
    ...actual,
    PgaScheduleRail: () => <aside>Schedule</aside>,
    usePgaHubData: () => ({ schedule: fixtures.schedule, courseWeights: fixtures.weights, playerStats: fixtures.players, loading: false }),
  };
});

function renderPage() {
  return render(<TooltipProvider><MemoryRouter><PgaDfsUpload /></MemoryRouter></TooltipProvider>);
}

async function uploadSalaryFile(container: HTMLElement) {
  const csv = [
    "Name,Salary",
    "Salary Only One,11000",
    "Salary Only Two,10500",
    "Salary Only Three,10200",
    "Cameron Young,10000",
    "Hideki Matsuyama,9000",
  ].join("\n");
  const file = new File([csv], "wyndham.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(csv) });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("File input not found");
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Cameron Young");
}

describe("PgaDfsUpload rendered controls", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps salary-only rows visible and wires search, sorting, and expandable details", async () => {
    const { container } = renderPage();
    await uploadSalaryFile(container);
    const table = screen.getByRole("table");

    expect(within(table).getByText("Salary Only One")).toBeInTheDocument();
    const salaryOnlyRow = within(table).getByText("Salary Only One").closest("tr");
    expect(salaryOnlyRow).not.toBeNull();
    expect(within(salaryOnlyRow!).getByText("$11,000")).toBeInTheDocument();
    expect(within(salaryOnlyRow!).getByText("1")).toBeInTheDocument();
    expect(within(salaryOnlyRow!).getAllByText("—").length).toBeGreaterThanOrEqual(5);

    const search = screen.getByPlaceholderText("Filter by player name");
    fireEvent.change(search, { target: { value: "hide" } });
    expect(within(table).getByText("Hideki Matsuyama")).toBeInTheDocument();
    expect(within(table).queryByText("Cameron Young")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    expect(within(table).getByText("Cameron Young")).toBeInTheDocument();

    const sortableHeaders = ["Salary Rank", "Player", "Salary", "Model Rank", "Tournament Rank", "Custom Rank", "Model Value", "Tournament Value"];
    sortableHeaders.forEach((label) => {
      const button = within(table).getByRole("button", { name: new RegExp(`^${label}\\s*[▲▼]?$`, "i") });
      fireEvent.click(button);
      const firstDirection = button.textContent?.includes("▲") ? "▲" : "▼";
      expect(button).toHaveTextContent(firstDirection);
      fireEvent.click(button);
      expect(button).toHaveTextContent(firstDirection === "▲" ? "▼" : "▲");
    });

    fireEvent.click(within(table).getByRole("button", { name: /Cameron Young.*View player details/i }));
    const details = await screen.findByText("Canonical Player");
    const detailsRow = details.closest("tr");
    expect(detailsRow).not.toBeNull();
    ["Salary rank", "Model rank", "Tournament rank", "Model value", "Tournament value", "Model score", "SG total", "JKB trend", "Recent Starts", "Tournament History"].forEach((label) => {
      expect(within(detailsRow!).getByText(label)).toBeInTheDocument();
    });
    expect(detailsRow!.querySelector("img")).not.toBeNull();
    expect(within(detailsRow!).getByText("T2")).toBeInTheDocument();
    expect(within(detailsRow!).getByText("T10")).toBeInTheDocument();
    expect(within(detailsRow!).queryByText("Hideki Matsuyama")).not.toBeInTheDocument();
  }, 30_000);

  it("wires salary bounds and selected-ranking Value Plays Only behavior", async () => {
    const { container } = renderPage();
    await uploadSalaryFile(container);
    const table = screen.getByRole("table");

    const sliders = screen.getAllByRole("slider");
    fireEvent.keyDown(sliders[0]!, { key: "ArrowRight" });
    await waitFor(() => expect(within(table).queryByText("Hideki Matsuyama")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Show Value Plays Only/ }));
    expect(within(table).queryByText("Salary Only One")).not.toBeInTheDocument();
    expect(within(table).getByText("Cameron Young")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Custom Rank" }));
    await waitFor(() => expect(within(table).queryByText("Cameron Young")).not.toBeInTheDocument());
  });
});

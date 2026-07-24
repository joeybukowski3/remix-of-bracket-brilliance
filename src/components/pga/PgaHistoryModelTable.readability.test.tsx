import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PgaHistoryModelTable from "./PgaHistoryModelTable";
import type { PgaHistoryResult, PgaTournamentModelRow } from "@/lib/pga/historyModel";
import { percentileHeatClass } from "@/lib/pga/pgaHeatColors";

vi.mock("@/hooks/useJkbTrendRankings", () => ({
  useJkbTrendRankings: () => ({ payload: null, rankingMap: new Map(), loading: false, error: null }),
}));

function finish(overrides: Partial<PgaHistoryResult> = {}): PgaHistoryResult {
  return {
    eventName: "Sample Event",
    season: 2026,
    finishText: "T12",
    finishPosition: 12,
    madeCut: true,
    status: "made_cut",
    ...overrides,
  } as PgaHistoryResult;
}

function row(overrides: Partial<PgaTournamentModelRow> = {}): PgaTournamentModelRow {
  return {
    player: "Sample Golfer",
    sgTotal: 1.42,
    sgOTT: 0.51,
    sgApp: 0.83,
    sgAtG: 0.22,
    sgPutt: -0.14,
    trendRank: 12,
    drivingAccuracy: 62.4,
    bogeyAvoidance: 12.1,
    birdieBogeyRatio: 1.8,
    baseScore: 70,
    modelScore: 82.4,
    modelRank: 1,
    recentResults: [finish(), finish({ finishText: "MC", finishPosition: null, madeCut: false, status: "missed_cut" })],
    eventResults: [finish({ finishText: "3", finishPosition: 3 })],
    specificMajorResults: [],
    allMajorResults: [],
    recentScore: 70,
    eventHistoryScore: 60,
    specificMajorScore: null,
    allMajorScore: null,
    courseFit: 34,
    trend: { score: 1, delta: 0.4, direction: "up", label: "Rising" },
    drivingDistance: 302.5,
    displayPercentiles: { sgTotal: 88, sgApp: 62, sgPutt: 18, sgAtG: 40, drivingAccuracy: 55, drivingDistance: 71 },
    ...overrides,
  } as PgaTournamentModelRow;
}

function renderTable(rows: PgaTournamentModelRow[] = [row()], isMajor = false) {
  return render(<PgaHistoryModelTable rows={rows} statView="percentile" isMajor={isMajor} eventLabel="3M Open" />);
}

function desktopTable(container: HTMLElement) {
  const table = container.querySelector("table");
  if (!table) throw new Error("desktop table not rendered");
  return table;
}

describe("PgaHistoryModelTable readability", () => {
  it("preserves every existing column header", () => {
    const { container } = renderTable();
    const headers = Array.from(desktopTable(container).querySelectorAll("thead th")).map((th) => th.textContent?.trim());

    ["#", "Player", "Score", "Player Stats", "Model", "Last 5 Starts", "3M Open History", "Fit", "JKB Trend"].forEach((label) => {
      expect(headers).toContain(label);
    });
    expect(headers.some((header) => header?.includes("Total"))).toBe(true);
    expect(headers.some((header) => header?.includes("Latest"))).toBe(true);
  });

  it("preserves the major-specific columns", () => {
    const { container } = renderTable([row()], true);
    const headers = Array.from(desktopTable(container).querySelectorAll("thead th")).map((th) => th.textContent?.trim());

    expect(headers).toContain("Specific Major");
    expect(headers).toContain("Last 8 Majors");
  });

  it("preserves rendered model values", () => {
    const { container } = renderTable();
    const table = within(desktopTable(container));

    expect(table.getByText("Sample Golfer")).toBeInTheDocument();
    expect(table.getByText("82.4")).toBeInTheDocument();
    expect(table.getByText("1")).toBeInTheDocument();
    expect(table.getByText("88")).toBeInTheDocument();
    expect(table.getByText("62")).toBeInTheDocument();
    expect(table.getByText("18")).toBeInTheDocument();
  });

  it("renders rows in the caller-supplied order so sorting stays owned by the page", () => {
    const { container } = renderTable([
      row({ player: "First Golfer", modelRank: 1 }),
      row({ player: "Second Golfer", modelRank: 2 }),
    ]);
    const names = Array.from(desktopTable(container).querySelectorAll("tbody tr td:nth-child(2)")).map((td) => td.textContent);

    expect(names).toEqual(["First Golfer", "Second Golfer"]);
  });

  it("renders exactly the filtered rows it is given", () => {
    const { container } = renderTable([row({ player: "Only Golfer" })]);

    expect(desktopTable(container).querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("uses larger bold player names and semibold tabular numerics", () => {
    const { container } = renderTable();
    const table = desktopTable(container);
    const playerCell = table.querySelector("tbody tr td:nth-child(2)");
    const rankCell = table.querySelector("tbody tr td:nth-child(1)");

    expect(playerCell?.className).toContain("text-[13px]");
    expect(playerCell?.className).toContain("font-black");
    expect(rankCell?.className).toContain("text-[11px]");
    expect(rankCell?.className).toContain("tabular-nums");
  });

  it("keeps column headers bold at a readable size", () => {
    const { container } = renderTable();
    const headerRows = desktopTable(container).querySelectorAll("thead tr");

    expect(headerRows[0].className).toContain("text-[11px]");
    expect(headerRows[0].className).toContain("font-black");
    expect(headerRows[1].className).toContain("text-[10px]");
    expect(headerRows[1].className).toContain("font-black");
  });

  it("adds vertical row padding without changing row content", () => {
    const { container } = renderTable();
    const firstCell = desktopTable(container).querySelector("tbody tr td:nth-child(1)");

    expect(firstCell?.className).toContain("py-2.5");
  });
});

describe("percentileHeatClass", () => {
  it("keeps the original classification thresholds", () => {
    expect(percentileHeatClass(90)).toContain("pga-heat-strong");
    expect(percentileHeatClass(75)).toContain("pga-heat-strong");
    expect(percentileHeatClass(60)).toContain("pga-heat-good");
    expect(percentileHeatClass(50)).toContain("pga-heat-good");
    expect(percentileHeatClass(40)).toContain("pga-heat-neutral");
    expect(percentileHeatClass(26)).toContain("pga-heat-neutral");
    expect(percentileHeatClass(25)).toContain("pga-heat-low");
    expect(percentileHeatClass(5)).toContain("pga-heat-low");
  });

  it("uses light emerald positives with dark emerald text", () => {
    expect(percentileHeatClass(90)).toBe("pga-heat-strong bg-emerald-300 text-emerald-950");
    expect(percentileHeatClass(60)).toBe("pga-heat-good bg-emerald-100 text-emerald-900");
  });

  it("uses light rose negatives with dark rose text", () => {
    expect(percentileHeatClass(10)).toBe("pga-heat-low bg-rose-100 text-rose-900");
  });

  it("keeps a visible neutral state", () => {
    expect(percentileHeatClass(40)).toBe("pga-heat-neutral bg-slate-100 text-slate-700");
  });

  it("never renders white-on-light or dark saturated fills", () => {
    [90, 60, 40, 10].forEach((value) => {
      const className = percentileHeatClass(value);
      expect(className).not.toContain("text-white");
      expect(className).not.toMatch(/bg-(emerald|rose|red|green)-(600|700|800|900|950)/);
    });
  });
});

describe("PgaHistoryModelTable heatmap cells", () => {
  it("applies the classification class and a semibold tabular numeral to every heat cell", () => {
    const { container } = renderTable();
    const heatCells = container.querySelectorAll("[class*='pga-heat-']");

    expect(heatCells.length).toBeGreaterThan(0);
    heatCells.forEach((cell) => {
      expect(cell.className).toMatch(/font-(semibold|bold|black)/);
      expect(cell.className).toContain("tabular-nums");
    });
  });

  it("renders positive and negative percentiles with their respective treatments", () => {
    const { container } = renderTable();

    expect(container.querySelector(".pga-heat-strong")).toBeTruthy();
    expect(container.querySelector(".pga-heat-good")).toBeTruthy();
    expect(container.querySelector(".pga-heat-low")).toBeTruthy();
  });

  it("keeps a mobile stacked card alongside the desktop table", () => {
    renderTable();

    expect(screen.getAllByText("Sample Golfer").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Tournament history")).toBeInTheDocument();
  });
});

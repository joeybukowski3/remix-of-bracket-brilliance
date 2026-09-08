import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NflDfsGeneratedLineups from "./NflDfsGeneratedLineups";
import { buildDstRow, buildOffensiveRow, type OffensiveFixture } from "@/lib/nfl/dfs/optimizer/__fixtures__/optimizerRowFactory";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";

const defaults = {
  salary: 5_000,
  gameKey: "g1",
  matchupScore: 20,
  airYardsPerGame: 55,
  targetShare: 0.2,
  targetsPerGame: 6,
  projectedTargets: 6,
  yardsPerCarry: 4.3,
  touchesTotal: 80,
  projectedCarries: 12,
  dkAvgPointsPerGame: 12,
} satisfies Partial<OffensiveFixture>;

function slate(): { rows: DfsEnrichedAnalyzerRow[] } {
  const offense: OffensiveFixture[] = [
    { ...defaults, dkId: "qb1", position: "QB", team: "aaa", projectedFantasyPoints: 22 },
    { ...defaults, dkId: "rb1", position: "RB", team: "aaa", projectedFantasyPoints: 18 },
    { ...defaults, dkId: "rb2", position: "RB", team: "bbb", gameKey: "g2", projectedFantasyPoints: 17 },
    { ...defaults, dkId: "wr1", position: "WR", team: "aaa", projectedFantasyPoints: 20 },
    { ...defaults, dkId: "wr2", position: "WR", team: "bbb", gameKey: "g2", projectedFantasyPoints: 19 },
    { ...defaults, dkId: "wr3", position: "WR", team: "ccc", projectedFantasyPoints: 18 },
    { ...defaults, dkId: "wr4", position: "WR", team: "ddd", gameKey: "g2", projectedFantasyPoints: 15 },
    { ...defaults, dkId: "te1", position: "TE", team: "aaa", projectedFantasyPoints: 14 },
  ];
  return {
    rows: [
      ...offense.map(buildOffensiveRow),
      buildDstRow({ dkId: "dst1", team: "zzz", gameKey: "g2", salary: 3_000, percentile: 95 }),
    ],
  };
}

function renderPanel(analysis: { rows: DfsEnrichedAnalyzerRow[] } | null) {
  return render(<NflDfsGeneratedLineups analysis={analysis} projectionRows={[]} asOf="2026-09-07T23:55:00Z" />);
}

async function generate() {
  fireEvent.click(screen.getByRole("button", { name: /generate lineups/i }));
  return screen.findByRole("tablist", { name: /lineup strategy/i });
}

/**
 * The methodology <details> always renders its children in jsdom, so lineup
 * assertions are scoped to the active strategy panel.
 */
function panel() {
  return screen.getByRole("tabpanel");
}

describe("NflDfsGeneratedLineups", () => {
  it("renders nothing until a valid slate has been analyzed", () => {
    const { container } = renderPanel(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows no roster before the user generates, then all three strategy tabs after", async () => {
    renderPanel(slate());
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("RB1")).not.toBeInTheDocument();

    const tablist = await generate();
    ["Highest Ceiling Lineup", "Highest Floor Lineup", "Balanced JKB Lineup"].forEach((label) => {
      expect(within(tablist).getByRole("tab", { name: label })).toBeInTheDocument();
    });
  });

  it("renders all nine roster slots with salaries for the selected strategy", async () => {
    renderPanel(slate());
    await generate();
    ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLEX", "DST"].forEach((slot) => {
      expect(within(panel()).getByText(slot)).toBeInTheDocument();
    });
    expect(within(panel()).getByText(/Salary used/i)).toBeInTheDocument();
    expect(within(panel()).getAllByText(/\$5,000/).length).toBeGreaterThan(0);
  });

  it("labels the JKB subtotal as offense-only and the DK number as a benchmark, not consensus", async () => {
    renderPanel(slate());
    await generate();
    expect(within(panel()).getByText(/JKB offense proj/i)).toBeInTheDocument();
    expect(within(panel()).getByText(/8 offensive slots; DST has no JKB projection/i)).toBeInTheDocument();
    expect(within(panel()).getByText(/DK Avg PPG benchmark/i)).toBeInTheDocument();
    expect(within(panel()).getByText(/DraftKings benchmark, not consensus/i)).toBeInTheDocument();
    // "Consensus" only ever appears as an explicit disclaimer.
    expect(screen.getAllByText(/NOT a consensus projection/i).length).toBeGreaterThan(0);
  });

  it("never shows a fabricated DST fantasy projection", async () => {
    renderPanel(slate());
    await generate();
    const dstRow = within(panel()).getByText("DST").closest("tr") as HTMLElement;
    expect(within(dstRow).getAllByText("—")).toHaveLength(2);
  });

  it("exposes the v1 weights from policy for every strategy in the methodology disclosure", async () => {
    renderPanel(slate());
    await generate();
    fireEvent.click(screen.getByText(/Generated-lineup methodology and limitations/i));
    ["Highest Ceiling Lineup v1 weights", "Highest Floor Lineup v1 weights", "Balanced JKB Lineup v1 weights"].forEach((heading) => {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/JKB projected fantasy points/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
    expect(screen.getByText(/transparent product heuristics/i)).toBeInTheDocument();
    expect(screen.getByText(/not calibrated DFS/i)).toBeInTheDocument();
    expect(screen.getByText(/\$50,000 salary cap/)).toBeInTheDocument();
  });

  it("opens per-player reasoning with normalized component scores and coverage", async () => {
    renderPanel(slate());
    await generate();
    fireEvent.click(screen.getByRole("button", { name: /Player wr1/i }));
    expect(screen.getByText(/Normalized strategy score/i)).toBeInTheDocument();
    expect(screen.getByText(/objective coverage/i)).toBeInTheDocument();
  });

  it("switches strategies without regenerating", async () => {
    renderPanel(slate());
    await generate();
    fireEvent.click(screen.getByRole("tab", { name: "Highest Floor Lineup" }));
    expect(screen.getByRole("tab", { name: "Highest Floor Lineup" })).toHaveAttribute("aria-selected", "true");
    expect(within(panel()).getByText(/Maximize stable workload and role certainty/i)).toBeInTheDocument();
  });

  it("explains an infeasible strategy instead of showing a partial roster", async () => {
    const rows = slate().rows.filter((row) => row.dkId !== "te1");
    renderPanel({ rows });
    fireEvent.click(screen.getByRole("button", { name: /generate lineups/i }));
    expect(await screen.findByText(/could not be built/i)).toBeInTheDocument();
    expect(screen.getByText(/eligible TE candidate/i)).toBeInTheDocument();
    expect(screen.queryByText("RB1")).not.toBeInTheDocument();
  });
});


afterEach(() => vi.useRealTimers());
describe("generated lineup snapshot lifecycle", () => {
  it("survives data arrival and the minute timer cycle, preserving generation values", async () => {
    vi.useFakeTimers();
    const original = slate();
    original.rows[0].jkbWeeklyPositionRank = 3;
    const { rerender } = render(<NflDfsGeneratedLineups analysis={original} projectionRows={[]} asOf="2026-09-07T23:55:00Z" slateKey="2026/1" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Lineups" }));
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(within(panel()).getByText("QB3")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(10_000));
    const refreshed = { rows: original.rows.map(row => row.kind === "offense" ? { ...row, jkbWeeklyPositionRank: 99, optimizerEligibility: "unknown" as const } : row) };
    rerender(<NflDfsGeneratedLineups analysis={refreshed} projectionRows={[]} asOf="2026-09-07T23:56:00Z" slateKey="2026/1" />);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(within(panel()).getByText("QB3")).toBeInTheDocument();
    expect(within(panel()).queryByText("QB99")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate Lineups" }));
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByText(/could not be built/i)).toBeInTheDocument();
  });

  it.each(["salary", "week", "removal"])("invalidates on %s change and does not resurrect an old result", async change => {
    vi.useFakeTimers();
    const original = slate();
    const props = { analysis: original, projectionRows: [], asOf: "2026-09-07T23:55:00Z", slateKey: "2026/1" };
    const { rerender } = render(<NflDfsGeneratedLineups {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Lineups" }));
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    const changed = change === "removal" ? original.rows.slice(1) : original.rows.map((row, i) => i === 0 && change === "salary" ? { ...row, salary: row.salary + 100 } : row);
    rerender(<NflDfsGeneratedLineups {...props} analysis={{ rows: changed }} slateKey={change === "week" ? "2026/2" : "2026/1"} />);
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    rerender(<NflDfsGeneratedLineups {...props} />);
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
  });

  it("keeps identical reuploads/reordering, renders canonical logos and sorts weekly ranks", async () => {
    const original = slate();
    original.rows[0].team = "nyg";
    original.rows[0].opponent = "dal";
    original.rows[0].jkbWeeklyPositionRank = 3;
    original.rows[1].jkbWeeklyPositionRank = 1;
    const props = { analysis: original, projectionRows: [], asOf: "2026-09-07T23:55:00Z" };
    const { rerender } = render(<NflDfsGeneratedLineups {...props} />);
    await generate();
    rerender(<NflDfsGeneratedLineups {...props} analysis={{ rows: [...original.rows].reverse() }} />);
    const roster = within(panel()).getByRole("table", { name: "Generated lineup roster" });
    const qb = within(roster).getByText("QB3").closest("tr")!;
    expect(qb.querySelector('[data-team-logo="NYG"] img')).toHaveAttribute("src", expect.stringContaining("NYG"));
    expect(qb.querySelector('[data-opponent-logo="DAL"] img')).toHaveAttribute("src", expect.stringContaining("dal"));
    fireEvent.click(within(roster).getByRole("button", { name: "JKB RK" }));
    expect(within(roster).getByRole("columnheader", { name: "JKB RK" })).toHaveAttribute("aria-sort", "ascending");
    expect(within(roster).getAllByRole("row")[1]).toHaveTextContent("RB1");
  });

  it("cancels pending generation on slate replacement and unmount", async () => {
    vi.useFakeTimers();
    const props = { analysis: slate(), projectionRows: [], asOf: "2026-09-07T23:55:00Z" };
    const { rerender, unmount } = render(<NflDfsGeneratedLineups {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Lineups" }));
    rerender(<NflDfsGeneratedLineups {...props} analysis={{ rows: [] }} />);
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Lineups" }));
    unmount();
    await act(async () => vi.advanceTimersByTime(1));
  });
});

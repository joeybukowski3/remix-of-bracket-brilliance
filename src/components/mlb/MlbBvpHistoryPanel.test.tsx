import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MlbBvpHistoryPanel, {
  AvgVsPitcherCell,
  MlbBvpHistoryPanelLoading,
  MlbBvpHistoryPanelNoHistory,
  MlbBvpHistoryPanelUnavailable,
} from "./MlbBvpHistoryPanel";
import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";

function makeEntry(overrides: Partial<BvpHistoryEntry> = {}): BvpHistoryEntry {
  return {
    key: "665742|605400",
    batterId: 665742,
    pitcherId: 605400,
    batter: "Juan Soto",
    pitcher: "Aaron Nola",
    career: { pa: 59, h: 11, avg: 0.262, hr: 5 },
    last5y: { pa: 27, h: 7, avg: 0.412, hr: 3 },
    ...overrides,
  };
}

describe("AvgVsPitcherCell", () => {
  it("shows the career AVG when present", () => {
    render(<AvgVsPitcherCell entry={makeEntry()} loading={false} />);
    expect(screen.getByText(".262")).toBeInTheDocument();
  });

  it("shows a dash when there is no entry", () => {
    render(<AvgVsPitcherCell entry={undefined} loading={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a dash while loading and no entry is available yet", () => {
    render(<AvgVsPitcherCell entry={undefined} loading />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a dash when the entry has no career split", () => {
    render(<AvgVsPitcherCell entry={makeEntry({ career: null })} loading={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("MlbBvpHistoryPanelLoading / Unavailable / NoHistory", () => {
  it("renders a loading message", () => {
    render(<MlbBvpHistoryPanelLoading />);
    expect(screen.getByText(/Loading batter-vs-pitcher history/)).toBeInTheDocument();
  });

  it("renders an unavailable message naming the batter", () => {
    render(<MlbBvpHistoryPanelUnavailable batter="Juan Soto" />);
    expect(screen.getByTestId("bvp-history-unavailable")).toHaveTextContent("Juan Soto");
  });

  it("renders the shared 'No prior matchups.' message, since a genuine no-history pair and an invariant-rejected pair are indistinguishable at render time", () => {
    render(<MlbBvpHistoryPanelNoHistory batter="Juan Soto" pitcher="Aaron Nola" />);
    const el = screen.getByTestId("bvp-history-none");
    expect(el).toHaveTextContent("No prior matchups.");
    expect(el).toHaveAttribute("aria-label", expect.stringContaining("Juan Soto"));
  });
});

describe("MlbBvpHistoryPanel", () => {
  it("shows career PA/H/AVG/HR by default", () => {
    render(<MlbBvpHistoryPanel entry={makeEntry()} batter="Juan Soto" pitcher="Aaron Nola" />);
    expect(screen.getByText("59")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText(".262")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("toggles to last-5Y stats and back on click", () => {
    render(<MlbBvpHistoryPanel entry={makeEntry()} batter="Juan Soto" pitcher="Aaron Nola" />);

    fireEvent.click(screen.getByRole("button", { name: "Last 5Y" }));
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(".412")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Career" }));
    expect(screen.getByText("59")).toBeInTheDocument();
  });

  it("exposes the active toggle state via aria-pressed", () => {
    render(<MlbBvpHistoryPanel entry={makeEntry()} batter="Juan Soto" pitcher="Aaron Nola" />);
    expect(screen.getByRole("button", { name: "Career" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 5Y" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Last 5Y" }));
    expect(screen.getByRole("button", { name: "Last 5Y" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the no-history state when both windows are null (never faced)", () => {
    render(<MlbBvpHistoryPanel entry={makeEntry({ career: null, last5y: null })} batter="Juan Soto" pitcher="Aaron Nola" />);
    expect(screen.getByTestId("bvp-history-none")).toBeInTheDocument();
  });

  it("shows a per-window empty state when only one window has data", () => {
    render(<MlbBvpHistoryPanel entry={makeEntry({ last5y: null })} batter="Juan Soto" pitcher="Aaron Nola" />);
    fireEvent.click(screen.getByRole("button", { name: "Last 5Y" }));
    expect(screen.getByText(/No trailing 5-year history/)).toBeInTheDocument();
  });

  it("never renders betting-claim or recommendation wording (the 'not used in Matchup Score' disclaimer is explicitly allowed)", () => {
    const { container } = render(<MlbBvpHistoryPanel entry={makeEntry()} batter="Juan Soto" pitcher="Aaron Nola" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\brecommend/i);
    expect(text).not.toMatch(/\bodds\b/i);
    expect(text).not.toMatch(/\bpick\b/i);
    expect(text).not.toMatch(/\bbet\b/i);
  });

  it("states explicitly that history is not used in scoring or ranking", () => {
    const { container } = render(<MlbBvpHistoryPanel entry={makeEntry()} batter="Juan Soto" pitcher="Aaron Nola" />);
    expect(container.textContent).toMatch(/not used in Matchup Score, HR Score, or any ranking/i);
  });
});

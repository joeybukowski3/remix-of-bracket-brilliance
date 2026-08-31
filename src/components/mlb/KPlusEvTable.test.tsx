import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import KPlusEvTable from "@/components/mlb/KPlusEvTable";
import { evaluateKPlusEv, type KPlusEvSource } from "@/lib/mlb/kPlusEvModel";

function source(overrides: Partial<KPlusEvSource> = {}): KPlusEvSource {
  return {
    pitcher: "Tarik Skubal",
    team: "DET",
    opponent: "CLE",
    pitcherHand: "L",
    isHome: true,
    starterConfirmed: true,
    season: { strikeouts: 200, outs: 540, pitches: 2800, starts: 26 }, // 180 IP
    last8: { strikeouts: 60, outs: 144, pitches: 850, starts: 8 },
    last4: { strikeouts: 30, outs: 72, pitches: 420, starts: 4 },
    home: { strikeouts: 100, outs: 270, starts: 13 },
    away: { strikeouts: 100, outs: 270, starts: 13 },
    opponentKRatio: 1.05,
    opponentKRatioSource: "LINEUP",
    opponentKRateVsHand: 0.24,
    leagueKRateVsHand: 0.228,
    kLine: 6.5,
    kOddsOverRaw: "-130",
    kOddsUnderRaw: "+105",
    kOddsBook: "fanduel",
    ...overrides,
  };
}

describe("KPlusEvTable", () => {
  it("renders desktop columns in the spec'd order and defaults to EV descending", () => {
    const high = evaluateKPlusEv(source({ pitcher: "High EV", kOddsOverRaw: "+400" }));
    const low = evaluateKPlusEv(source({ pitcher: "Low EV", kOddsOverRaw: "-100000" }));
    const { container } = render(<KPlusEvTable rows={[low, high]} compact={false} />);

    expect(container.querySelector('[data-k-plus-ev-table="desktop"]')).not.toBeNull();
    const headerLabels = ["Pitcher", "K Line", "Book Odds", "Season K/IP", "Current Rate Fair", "JKB Fair", "K Trend", "Proj IP", "Matchup", "JKB Proj K", "JKB Over %", "+EV", "Value"];
    for (const label of headerLabels) {
      expect(screen.getByText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeInTheDocument();
    }

    const names = screen.getAllByText(/High EV|Low EV/).map((node) => node.textContent);
    expect(names[0]).toContain("High EV");
  });

  it("wraps the desktop table in the shared accessible scroll region with a sticky dense header", () => {
    const row = evaluateKPlusEv(source());
    const { container } = render(<KPlusEvTable rows={[row]} compact={false} />);
    const region = screen.getByRole("region", { name: /strikeout \+ev valuations/i });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toMatch(/relative/);
    expect(region.className).toMatch(/overflow-x-auto/);
    expect(region.querySelector("table")).not.toBeNull();
    const thead = container.querySelector("thead");
    expect(thead?.className).toMatch(/sticky/);
    expect(thead?.className).toMatch(/top-0/);
    // Semantic pricing-group tint preserved.
    expect(screen.getByRole("button", { name: /^Book Odds/ }).closest("th")?.className).toContain("bg-amber-50");
  });

  it("expands a row to show all seven detail sections", () => {
    const row = evaluateKPlusEv(source());
    render(<KPlusEvTable rows={[row]} compact={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Tarik Skubal/i }));
    const details = document.querySelector('[data-k-plus-ev-details="Tarik Skubal"]');
    expect(details).not.toBeNull();
    const scoped = within(details as HTMLElement);
    expect(scoped.getByText("A. Season Baseline")).toBeInTheDocument();
    expect(scoped.getByText("B. Recent K Trend")).toBeInTheDocument();
    expect(scoped.getByText("C. Workload Projection")).toBeInTheDocument();
    expect(scoped.getByText("D. Home / Away")).toBeInTheDocument();
    expect(scoped.getByText("E. Matchup")).toBeInTheDocument();
    expect(scoped.getByText("F. JKB Projection")).toBeInTheDocument();
    expect(scoped.getByText("G. Market / Value")).toBeInTheDocument();
  });

  it("renders the compact mobile view with a Value badge and EV", () => {
    const row = evaluateKPlusEv(source());
    render(<KPlusEvTable rows={[row]} compact />);
    expect(document.querySelector('[data-k-plus-ev-table="mobile"]')).not.toBeNull();
    expect(document.querySelector(`[data-k-plus-ev-label="${row.label}"]`)).not.toBeNull();
  });

  it("shows UNAVAILABLE for ineligible pitchers and filters via the Value pills", () => {
    const ineligible = evaluateKPlusEv(source({ pitcher: "Rookie Call-Up", season: { strikeouts: 20, outs: 150, pitches: 400, starts: 6 } }));
    render(<KPlusEvTable rows={[ineligible]} compact={false} />);
    expect(document.querySelector('[data-k-plus-ev-label="UNAVAILABLE"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Strong +EV" }));
    expect(document.querySelector('[data-k-plus-ev-empty="true"]')).not.toBeNull();
  });

  it("preserves the widened Pitcher column and applies restrained semantic column tints on desktop", () => {
    const row = evaluateKPlusEv(source({ pitcher: "Framber Valdez" }));
    render(<KPlusEvTable rows={[row]} compact={false} />);

    const pitcherHeader = screen.getByRole("button", { name: /^Pitcher/ }).closest("th");
    expect(pitcherHeader?.className).toContain("w-44");

    // Pricing group (Book Odds / Current Rate Fair / JKB Fair) gets an amber tint.
    const bookOddsHeader = screen.getByRole("button", { name: /^Book Odds/ }).closest("th");
    expect(bookOddsHeader?.className).toContain("bg-amber-50");
    // Performance group (Season K/IP / K Trend) gets a sky tint.
    const seasonHeader = screen.getByRole("button", { name: /^Season K\/IP/ }).closest("th");
    expect(seasonHeader?.className).toContain("bg-sky-50");
    // Projection group (Proj IP / Matchup / JKB Proj K / JKB Over %) gets an emerald tint.
    const projIpHeader = screen.getByRole("button", { name: /^Proj IP/ }).closest("th");
    expect(projIpHeader?.className).toContain("bg-emerald-50");
  });

  it("mobile card surfaces Book/Current Fair/JKB Fair and JKB Proj K with the pricing/projection accent colors", () => {
    const row = evaluateKPlusEv(source({ pitcher: "Framber Valdez" }));
    render(<KPlusEvTable rows={[row]} compact />);

    const pricing = document.querySelector('[data-k-plus-ev-mobile-pricing="true"]');
    expect(pricing).not.toBeNull();
    expect(pricing?.className).toContain("bg-amber-50");

    const projK = document.querySelector('[data-k-plus-ev-mobile-projk="true"]');
    expect(projK).not.toBeNull();
    expect(projK?.className).toContain("bg-emerald-50");
  });
});

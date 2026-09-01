import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CompactMatchupMetricRow from "./CompactMatchupMetricRow";
import MatchupMobileStickyHeader from "./MatchupMobileStickyHeader";
import type { NflMatchup } from "@/lib/nfl/matchups";

const matchup = {
  away: { slug: "tampa-bay-buccaneers", abbr: "tb", teamName: "Tampa Bay Buccaneers" },
  home: { slug: "cincinnati-bengals", abbr: "cin", teamName: "Cincinnati Bengals" },
} as NflMatchup;

describe("mobile matchup comparison density", () => {
  it("keeps both values, ranks, metric, and existing winner authority in one row", () => {
    const { container } = render(
      <CompactMatchupMetricRow
        label="JKB Off Rating"
        sublabel="2025 Last 8"
        away={{ formatted: "50.8", rank: 19, accessibleName: matchup.away.teamName }}
        home={{ formatted: "52.0", rank: 17, accessibleName: matchup.home.teamName }}
        winner="home"
        advantageText="CIN advantage"
      />,
    );

    const row = container.querySelector("[data-compact-matchup-row]");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("50.8")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("19th")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("JKB Off Rating")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("2025 Last 8")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("52.0")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("17th")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("CIN advantage")).toHaveClass("sr-only");
    expect(row?.querySelector(".matchup-compact-row__side--home svg")).toBeTruthy();
    expect(row?.querySelector(".matchup-compact-row__side--away svg")).toBeNull();
  });

  it("keeps unavailable values honest and does not assert a winner", () => {
    const { container } = render(
      <CompactMatchupMetricRow
        label="First Downs / Play"
        away={{ formatted: "N/A", rank: null, accessibleName: matchup.away.teamName }}
        home={{ formatted: "N/A", rank: null, accessibleName: matchup.home.teamName }}
        winner="missing"
        advantageText="No data"
      />,
    );

    expect(screen.getAllByText("N/A")).toHaveLength(2);
    expect(screen.getByText("No data")).toHaveClass("sr-only");
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByText("Unranked")).toBeNull();
  });

  it("shows a compact, labelled away/home orientation bar", () => {
    render(<MatchupMobileStickyHeader matchup={matchup} activeTab="comparison" />);
    const bar = screen.getByLabelText("Matchup team orientation");
    expect(bar).toHaveClass("matchup-mobile-context");
    expect(within(bar).getByText("TB")).toBeInTheDocument();
    expect(within(bar).getByText("AWAY")).toBeInTheDocument();
    expect(within(bar).getByText("Team Comparison")).toBeInTheDocument();
    expect(within(bar).getByText("CIN")).toBeInTheDocument();
    expect(within(bar).getByText("HOME")).toBeInTheDocument();
  });
});

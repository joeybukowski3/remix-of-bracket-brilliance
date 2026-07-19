/**
 * MlbPitcherRegressionTable.test.tsx
 * Column order (Player sticky first, Regression Score first metric column)
 * and sticky-column implementation for mobile horizontal scrolling.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MlbPitcherRegressionTable from "./MlbPitcherRegressionTable";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";

const pitchers: PitcherRegressionData[] = [
  {
    pitcherId: 1,
    name: "Gerrit Cole",
    team: "NYY",
    era: 3.1,
    xfip: 3.6,
    xera: 3.5,
    siera: null,
    kbb: 22.4,
    strandRate: 78,
    hrfb: 9.2,
    babip: 0.29,
    regressionScore: 6.4,
    regressionTier: "strong_positive",
    summary: "Overperforming — regression likely.",
  },
  {
    pitcherId: 2,
    name: "Shane Bieber",
    team: "CLE",
    era: 2.5,
    xfip: 3.9,
    xera: 3.8,
    siera: null,
    kbb: 18.1,
    strandRate: 85,
    hrfb: 6.5,
    babip: 0.25,
    regressionScore: -5.1,
    regressionTier: "strong_negative",
    summary: "Underperforming — improvement likely.",
  },
];

describe("MlbPitcherRegressionTable — column order", () => {
  it("renders Player as the first column and Regression Score as the second (first metric) column", () => {
    render(<MlbPitcherRegressionTable pitchers={pitchers} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Pitcher", "Regr Score", "ERA", "xFIP", "xERA", "K-BB%", "LOB%", "HR/FB%", "BABIP"]);
  });

  it("keeps the remaining 7 columns in their original relative order after Regression Score", () => {
    render(<MlbPitcherRegressionTable pitchers={pitchers} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers.slice(2)).toEqual(["ERA", "xFIP", "xERA", "K-BB%", "LOB%", "HR/FB%", "BABIP"]);
  });
});

describe("MlbPitcherRegressionTable — sticky Player column", () => {
  it("marks the Player header cell as sticky with a left offset and border", () => {
    render(<MlbPitcherRegressionTable pitchers={pitchers} />);
    const playerHeader = screen.getAllByRole("columnheader")[0];
    expect(playerHeader.className).toMatch(/sticky/);
    expect(playerHeader.className).toMatch(/left-0/);
    expect(playerHeader.className).toMatch(/border-r/);
  });

  it("gives each row's Player cell a sticky position and an explicit opaque background", () => {
    render(<MlbPitcherRegressionTable pitchers={pitchers} />);
    const playerCell = screen.getByText("Gerrit Cole").closest("td")!;
    expect(playerCell.className).toMatch(/sticky/);
    expect(playerCell.className).toMatch(/left-0/);
    expect(playerCell.className).toMatch(/bg-white|bg-slate-50/);
  });

  it("uses border-separate on the table so sticky cells render borders correctly", () => {
    const { container } = render(<MlbPitcherRegressionTable pitchers={pitchers} />);
    const table = container.querySelector("table")!;
    expect(table.className).toMatch(/border-separate/);
  });
});

describe("MlbPitcherRegressionTable — data integrity", () => {
  it("does not change regression score values or row order (sorted by |score| descending)", () => {
    render(<MlbPitcherRegressionTable pitchers={pitchers} />);
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]).toHaveTextContent("Gerrit Cole");
    expect(rows[0]).toHaveTextContent("+6.4");
    expect(rows[1]).toHaveTextContent("Shane Bieber");
    expect(rows[1]).toHaveTextContent("-5.1");
  });

  it("footer still spans all 9 columns", () => {
    const { container } = render(<MlbPitcherRegressionTable pitchers={pitchers} />);
    const footerCell = container.querySelector("tfoot td")!;
    expect(footerCell).toHaveAttribute("colspan", "9");
  });
});

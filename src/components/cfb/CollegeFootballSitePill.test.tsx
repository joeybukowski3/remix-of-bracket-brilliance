import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getCfbSitePillClass, type CfbScheduleSite } from "@/lib/cfb/schedulePresentation";
import CollegeFootballSitePill from "./CollegeFootballSitePill";

describe("CollegeFootballSitePill", () => {
  it.each(["Home", "Away", "Neutral"] as const)("renders a distinct %s treatment", (site) => {
    render(<CollegeFootballSitePill site={site} />);
    expect(screen.getByText(site)).toHaveClass(...getCfbSitePillClass(site).split(" "));
  });

  it("uses three distinct presentation classes", () => {
    expect(new Set(["Home", "Away", "Neutral"].map((site) => getCfbSitePillClass(site as CfbScheduleSite))).size).toBe(3);
  });
});

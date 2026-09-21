import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RankHeatCell from "@/components/nfl/standings/RankHeatCell";
import { jkbHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";

afterEach(cleanup);

describe("RankHeatCell", () => {
  it("shows rank primary and rating secondary", () => {
    render(<RankHeatCell label="OVR" rank={4} rating={64.9} />);
    expect(screen.getByText("#4")).toBeInTheDocument();
    expect(screen.getByText("64.9")).toBeInTheDocument();
  });

  it.each([1, 3, 6, 10, 14, 18, 22, 27, 32])("uses the shared JKB Heat tone and colors for rank %i", (rank) => {
    const { container } = render(<RankHeatCell label="OFF" rank={rank} rating={50} />);
    const pill = container.firstElementChild as HTMLElement;
    const tone = weeklyRankHeatTone(rank, 32);
    expect(pill.getAttribute("data-heat-tone")).toBe(tone);
    expect(pill.style.backgroundColor).not.toBe("");
    expect(pill.style.color).not.toBe("");
    const expected = jkbHeatStyle(tone);
    const probe = document.createElement("span");
    probe.style.backgroundColor = expected.backgroundColor;
    expect(pill.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  it("renders an exposed title naming the unit and rank", () => {
    render(<RankHeatCell label="DEF" rank={16} rating={51.2} />);
    expect(screen.getByTitle("DEF rank 16 of 32 · rating 51.2")).toBeInTheDocument();
  });

  it("renders a plain dash, with no heat, when rank or rating is missing", () => {
    const { container, rerender } = render(<RankHeatCell label="OVR" rank={null} rating={50} />);
    expect(container.querySelector("[data-heat-tone]")).toBeNull();
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<RankHeatCell label="OVR" rank={5} rating={null} />);
    expect(container.querySelector("[data-heat-tone]")).toBeNull();
  });

  it("does not paint an out-of-league rank", () => {
    const { container } = render(<RankHeatCell label="OVR" rank={40} rating={50} />);
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.getAttribute("data-heat-tone")).toBe("missing");
    expect(pill.style.backgroundColor).toBe("");
  });
});

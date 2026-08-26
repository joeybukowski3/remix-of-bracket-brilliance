import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RosStatsGlossary from "@/components/fantasy/RosStatsGlossary";

describe("RosStatsGlossary Model Rk wording (Option D)", () => {
  it("defines MODEL RK and states the independent-authorities disclaimer", () => {
    render(<RosStatsGlossary />);
    fireEvent.click(screen.getByRole("button", { name: "Stats & Rankings Key" }));

    expect(screen.getByText("MODEL RK")).toBeTruthy();
    expect(
      screen.getByText(/JKB Overall Rank and Model Rank are independent authorities\. Disagreement between them is expected and can be informative\./),
    ).toBeTruthy();
    expect(
      screen.getByText(/does not include a validated opportunity\/usage adjustment, matchup\/FPA adjustment, or market adjustment/),
    ).toBeTruthy();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

describe("CollegeFootballTeamLogo", () => {
  it("renders image when logo is provided", () => {
    const { container } = render(
      <CollegeFootballTeamLogo name="Georgia" logo="https://example.com/uga.png" abbreviation="UGA" />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://example.com/uga.png");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("falls back safely when logo fails to load", () => {
    const { container } = render(
      <CollegeFootballTeamLogo name="Georgia" logo="https://example.com/broken.png" abbreviation="UGA" />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    fireEvent.error(img!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("UGA")).toBeInTheDocument();
  });

  it("uses initials fallback when logo is missing", () => {
    render(
      <CollegeFootballTeamLogo name="Georgia Bulldogs" abbreviation="UGA" primaryColor="#ba0c2f" />,
    );
    expect(screen.getByText("UGA")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CollegeFootballConferenceLogo from "./CollegeFootballConferenceLogo";

describe("CollegeFootballConferenceLogo", () => {
  it("renders an image with empty alt (decorative) when a logo URL is provided", () => {
    render(<CollegeFootballConferenceLogo logo="https://a.espncdn.com/i/teamlogos/ncaa_conf/500/sec.png" />);
    const img = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement | null;
    const image = img ?? (document.querySelector("img") as HTMLImageElement);
    expect(image).toBeTruthy();
    expect(image.getAttribute("alt")).toBe("");
    expect(image.src).toContain("sec.png");
  });

  it("renders nothing when logo is null", () => {
    const { container } = render(<CollegeFootballConferenceLogo logo={null} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing (never a broken image icon) after the image fails to load", () => {
    render(<CollegeFootballConferenceLogo logo="https://a.espncdn.com/i/teamlogos/ncaa_conf/500/broken.png" />);
    const image = document.querySelector("img") as HTMLImageElement;
    expect(image).toBeTruthy();
    fireEvent.error(image);
    expect(document.querySelector("img")).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuideSectionHeading } from "@/components/nfl/guide/GuideAtoms";

describe("GuideSectionHeading", () => {
  it("defaults to h2 so existing guide-wide callers keep their current level", () => {
    render(<GuideSectionHeading title="Where the league stands" />);
    const heading = screen.getByRole("heading", { name: "Where the league stands" });
    expect(heading.tagName).toBe("H2");
  });

  it("renders h3 when a nested chapter subsection opts in via as", () => {
    render(<GuideSectionHeading as="h3" title="Model Profile" />);
    const heading = screen.getByRole("heading", { name: "Model Profile" });
    expect(heading.tagName).toBe("H3");
  });

  it("preserves styling and the eyebrow/description regardless of heading level", () => {
    render(<GuideSectionHeading as="h3" eyebrow="Model profile" title="Power model comparison" description="Detail" />);
    const heading = screen.getByRole("heading", { name: "Power model comparison" });
    expect(heading.className).toContain("text-xl");
    expect(heading.className).toContain("font-black");
    expect(screen.getByText("Model profile")).toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
  });
});

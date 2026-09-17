import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAllowedByPositionTeamCell } from "./TeamCell";

describe("renderAllowedByPositionTeamCell", () => {
  it("visually hides the abbreviation on mobile while keeping the logo and an accessible group label", () => {
    render(<div>{renderAllowedByPositionTeamCell("buf")}</div>);

    const group = screen.getByRole("group", { name: "BUF" });
    expect(group).toBeInTheDocument();

    const abbreviation = screen.getByText("BUF");
    expect(abbreviation.className).toContain("hidden");
    expect(abbreviation.className).toContain("sm:inline");

    expect(screen.getByRole("img", { name: "BUF" })).toBeInTheDocument();
  });

  it("shows the abbreviation at desktop/tablet widths (sm: breakpoint) via the visible span", () => {
    render(<div>{renderAllowedByPositionTeamCell("dal")}</div>);
    const abbreviation = screen.getByText("DAL");
    // Present in the DOM and made visible at `sm:` and up -- only hidden below that breakpoint.
    expect(abbreviation.className).toBe("hidden sm:inline");
  });
});

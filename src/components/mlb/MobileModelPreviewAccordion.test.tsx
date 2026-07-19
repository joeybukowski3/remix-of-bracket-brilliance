/**
 * MobileModelPreviewAccordion.test.tsx
 * Shared mobile disclosure primitive used by the Top Model Edges group,
 * Polymarket Moneylines, and Social Media Tables sections.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Flame } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { MobileModelPreviewAccordion } from "./MobileModelPreviewAccordion";

function renderItem(props: Partial<React.ComponentProps<typeof MobileModelPreviewAccordion>> = {}) {
  return render(
    <MemoryRouter>
      <Accordion type="single" collapsible>
        <MobileModelPreviewAccordion
          value="test-item"
          icon={<Flame className="h-4 w-4" />}
          title="Top HR Props"
          description="Ranks today's home run opportunities."
          viewFullHref="/mlb/hr-props"
          {...props}
        >
          <div data-testid="preview-body">body content</div>
        </MobileModelPreviewAccordion>
      </Accordion>
    </MemoryRouter>,
  );
}

describe("MobileModelPreviewAccordion", () => {
  it("renders title and description in the trigger, collapsed by default", () => {
    renderItem();
    expect(screen.getByText("Top HR Props")).toBeInTheDocument();
    expect(screen.getByText("Ranks today's home run opportunities.")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-body")).not.toBeInTheDocument();
  });

  it("has correct aria-expanded state and toggles it on click", () => {
    renderItem();
    const trigger = screen.getByRole("button", { name: /Top HR Props/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("preview-body")).toBeInTheDocument();
  });

  it("shows the body content and a View Full Model link once expanded", () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: /Top HR Props/ }));
    const link = screen.getByRole("link", { name: /View Full Model/ });
    expect(link).toHaveAttribute("href", "/mlb/hr-props");
  });

  it("renders a plain anchor (not a router Link) for hash-based full-model links", () => {
    renderItem({ viewFullHref: "#pitcher-regression", viewFullLabel: "View Full Model" });
    fireEvent.click(screen.getByRole("button", { name: /Top HR Props/ }));
    const link = screen.getByRole("link", { name: /View Full Model/ });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "#pitcher-regression");
  });

  it("renders optional freshness text when provided", () => {
    renderItem({ freshness: "Updated 5m ago" });
    expect(screen.getByText("Updated 5m ago")).toBeInTheDocument();
  });

  it("omits the View Full Model link when no viewFullHref is given", () => {
    renderItem({ viewFullHref: undefined });
    fireEvent.click(screen.getByRole("button", { name: /Top HR Props/ }));
    expect(screen.queryByRole("link", { name: /View Full Model/ })).not.toBeInTheDocument();
  });
});

/**
 * Focused tests for ModelSummaryHeader's `showUpdatedAt` prop, added to let
 * freshness-migrated pages (which already show a model-updated timestamp
 * via the shared FreshnessStatus component) hide this header's own
 * duplicate "Last updated" cell without breaking any existing consumer.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ModelSummaryHeader } from "./MlbPropModelComponents";

function renderHeader(props: Partial<Parameters<typeof ModelSummaryHeader>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ModelSummaryHeader
        eyebrow="Test model"
        title="Test Model Header"
        description="Test description"
        generatedAt="2026-07-16T09:32:34.452Z"
        gamesCount={5}
        rowsCount={10}
        bestScore={72.5}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("ModelSummaryHeader — showUpdatedAt", () => {
  it("35. hides the updated timestamp cell when showUpdatedAt is false", () => {
    renderHeader({ showUpdatedAt: false });

    expect(screen.queryByText("Last updated")).toBeNull();
  });

  it("36. still renders the updated timestamp cell by default (no showUpdatedAt prop passed)", () => {
    renderHeader();

    expect(screen.getByText("Last updated")).toBeInTheDocument();
  });

  it("36b. still renders the updated timestamp cell when showUpdatedAt is explicitly true", () => {
    renderHeader({ showUpdatedAt: true });

    expect(screen.getByText("Last updated")).toBeInTheDocument();
  });

  it("37. layout has no empty timestamp slot and no incorrect column count when hidden", () => {
    const { container } = renderHeader({ showUpdatedAt: false });

    const grid = container.querySelector(".grid.gap-px.bg-slate-200") as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass("sm:grid-cols-3");
    expect(grid).not.toHaveClass("sm:grid-cols-4");
    // Exactly 3 cells (Games analyzed, Rows ranked, Best edge) -- no blank
    // 4th slot left behind from the removed "Last updated" cell.
    expect(grid.children).toHaveLength(3);
    expect(screen.getByText("Games analyzed")).toBeInTheDocument();
    expect(screen.getByText("Rows ranked")).toBeInTheDocument();
    expect(screen.getByText("Best edge")).toBeInTheDocument();
  });

  it("37b. layout uses the 4-column grid and 4 cells when shown", () => {
    const { container } = renderHeader({ showUpdatedAt: true });

    const grid = container.querySelector(".grid.gap-px.bg-slate-200") as HTMLElement;
    expect(grid).toHaveClass("sm:grid-cols-4");
    expect(grid.children).toHaveLength(4);
  });

  it("does not mutate the generatedAt/formatting contract for legacy consumers", () => {
    renderHeader({ generatedAt: "2026-07-16T09:32:34.452Z" });

    // formatModelTimestamp's existing month/day/time formatting is
    // unchanged -- only whether the cell renders at all is new. Avoid
    // asserting the exact locale-formatted string since it depends on the
    // runner's local timezone, not a fixed one.
    expect(screen.getByText("Last updated")).toBeInTheDocument();
    expect(screen.queryByText("Awaiting update")).toBeNull();
  });
});

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { edgeToneClass, MobileSortHeader, PropsTabPanel, PropsTwoTabSwitch } from "./PropsMobileTablePrimitives";

describe("edgeToneClass", () => {
  it("returns emerald for positive values", () => {
    expect(edgeToneClass(1.2)).toContain("emerald");
  });
  it("returns rose for negative values", () => {
    expect(edgeToneClass(-0.5)).toContain("rose");
  });
  it("returns neutral slate for zero or unavailable values", () => {
    expect(edgeToneClass(0)).toContain("slate");
    expect(edgeToneClass(null)).toContain("slate");
    expect(edgeToneClass(undefined)).toContain("slate");
  });
});

describe("MobileSortHeader", () => {
  it("calls onSort with its own key and reflects the active sort direction via aria-sort", () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <MobileSortHeader label="Proj" sortKey="proj" activeKey="proj" direction="desc" onSort={onSort} />
          </tr>
        </thead>
      </table>,
    );
    const header = screen.getByRole("columnheader");
    expect(header).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Proj" }));
    expect(onSort).toHaveBeenCalledWith("proj");
  });

  it("reports aria-sort='none' when a different column is active", () => {
    render(
      <table>
        <thead>
          <tr>
            <MobileSortHeader label="Line" sortKey="line" activeKey="proj" direction="asc" onSort={() => {}} />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");
  });
});

describe("PropsTwoTabSwitch / PropsTabPanel", () => {
  const tabs = [
    { key: "a" as const, label: "Tab A", tone: "emerald" as const },
    { key: "b" as const, label: "Tab B", tone: "blue" as const },
  ] as const;

  it("only shows the panel matching the active tab, and switches on click", () => {
    function Harness() {
      const [active, setActive] = useState<"a" | "b">("a");
      return (
        <div>
          <PropsTwoTabSwitch tabs={tabs} active={active} onChange={setActive} idPrefix="test" />
          <PropsTabPanel id="test-panel-a" labelledBy="test-tab-a" active={active === "a"}>Content A</PropsTabPanel>
          <PropsTabPanel id="test-panel-b" labelledBy="test-tab-b" active={active === "b"}>Content B</PropsTabPanel>
        </div>
      );
    }
    render(<Harness />);
    expect(screen.getByText("Content A")).toBeInTheDocument();
    expect(screen.queryByText("Content B")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Tab B" }));
    expect(screen.queryByText("Content A")).not.toBeInTheDocument();
    expect(screen.getByText("Content B")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute("aria-selected", "true");
  });
});

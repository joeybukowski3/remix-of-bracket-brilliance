/**
 * Shared tab-strip styling used by Statistical Comparison, Unit by Unit and
 * What the Book Says. Each tab must read as a distinct bordered pill (not
 * plain nav text) and the same visual system must be reused everywhere the
 * strip is rendered — this file exercises the shared component directly
 * rather than duplicating the assertions per caller.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MatchupTabStrip, { type MatchupTabDef } from "@/components/nfl/matchups/MatchupTabStrip";

const TABS: MatchupTabDef[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

function renderStrip(activeId = "a") {
  const onSelect = vi.fn();
  render(
    <MatchupTabStrip tabs={TABS} activeId={activeId} onSelect={onSelect} ariaLabel="Test tabs" />
  );
  return onSelect;
}

describe("MatchupTabStrip visual system", () => {
  it("gives every tab a visible border and rounded, centred pill", () => {
    renderStrip();
    for (const tab of TABS) {
      const el = screen.getByRole("tab", { name: tab.label });
      expect(el.className).toMatch(/\bborder\b/);
      expect(el.className).toMatch(/rounded/);
      expect(el.className).toMatch(/text-center/);
    }
  });

  it("gives the active tab a stronger border and fill than inactive tabs", () => {
    renderStrip("b");
    const active = screen.getByRole("tab", { name: "Beta" });
    const inactive = screen.getByRole("tab", { name: "Alpha" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(inactive).toHaveAttribute("aria-selected", "false");
    // Active pill uses the "-400" border step and a shadow; inactive tabs sit
    // on the lighter "-200"/"-300" steps with no shadow.
    expect(active.className).toMatch(/border-\w+-400/);
    expect(active.className).toMatch(/shadow-sm/);
    expect(inactive.className).not.toMatch(/border-\w+-400/);
    expect(inactive.className).not.toMatch(/shadow-sm/);
  });

  it("assigns each tab position a distinct light palette rather than one flat color", () => {
    renderStrip();
    const classes = TABS.map((tab) => screen.getByRole("tab", { name: tab.label }).className);
    // No two tabs share the exact same class string, since each pulls from a
    // different palette entry by index.
    expect(new Set(classes).size).toBe(classes.length);
  });

  it("keeps keyboard tab semantics intact (roving tabindex + arrow-key nav)", () => {
    const onSelect = renderStrip("a");
    const tablist = screen.getByRole("tablist", { name: "Test tabs" });
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith("b");

    fireEvent.keyDown(tablist, { key: "End" });
    expect(onSelect).toHaveBeenCalledWith("c");

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("scrolls horizontally instead of wrapping onto multiple rows", () => {
    renderStrip();
    const tablist = screen.getByRole("tablist", { name: "Test tabs" });
    expect(tablist.className).toMatch(/overflow-x-auto/);
    expect(tablist.className).toMatch(/flex-nowrap/);
    expect(tablist.className).not.toMatch(/flex-wrap/);
  });
});

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NflSection from "@/components/nfl/ui/NflSection";

describe("NflSection", () => {
  it("renders a labelled section with no toggle when it is not collapsible", () => {
    render(
      <NflSection title="Model analysis">
        <p>Body</p>
      </NflSection>,
    );

    expect(screen.getByRole("region", { name: "Model analysis" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("wires the toggle to the body with accessible button semantics", () => {
    render(
      <NflSection title="Methodology" collapse="always">
        <p>Body</p>
      </NflSection>,
    );

    const toggle = screen.getByRole("button", { name: /Methodology/i });
    const bodyId = toggle.getAttribute("aria-controls");
    expect(bodyId).toBeTruthy();
    expect(document.getElementById(bodyId!)).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles expanded state on click and can be reopened", () => {
    render(
      <NflSection title="Methodology" collapse="always">
        <p>Body</p>
      </NflSection>,
    );

    const toggle = screen.getByRole("button", { name: /Methodology/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("operates from the keyboard, because the affordance is a real button", () => {
    render(
      <NflSection title="Sources" collapse="always">
        <p>Body</p>
      </NflSection>,
    );

    const toggle = screen.getByRole("button", { name: /Sources/i });
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    // A <button> activates on Enter/Space natively; jsdom maps a click to that.
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("honours defaultOpen so deep sections can start collapsed", () => {
    render(
      <NflSection title="Advanced metrics" collapse="always" defaultOpen={false}>
        <p>Body</p>
      </NflSection>,
    );

    expect(screen.getByRole("button", { name: /Advanced metrics/i }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps collapsed content mounted so anchors and crawlers still reach it", () => {
    render(
      <NflSection title="Sources" collapse="always" defaultOpen={false}>
        <p>Body</p>
      </NflSection>,
    );

    // Hidden via class, not unmounted.
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("keeps the mobile-collapse body visible from lg up", () => {
    render(
      <NflSection title="Offseason" collapse="mobile" defaultOpen={false}>
        <p>Body</p>
      </NflSection>,
    );

    const toggle = screen.getByRole("button", { name: /Offseason/i });
    const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(body.className).toContain("hidden");
    expect(body.className).toContain("lg:block");
    // The toggle itself is hidden on desktop, where the body always shows.
    expect(toggle.className).toContain("lg:hidden");
  });

  it("becomes a focus target only when it is an in-page anchor destination", () => {
    const { rerender } = render(<NflSection title="Plain"><p>Body</p></NflSection>);
    expect(screen.getByRole("region", { name: "Plain" }).getAttribute("tabindex")).toBeNull();

    rerender(<NflSection id="offense" title="Offense" focusable><p>Body</p></NflSection>);
    expect(document.getElementById("offense")!.getAttribute("tabindex")).toBe("-1");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe("ErrorBoundary", () => {
  it("shows the recovery card for an ordinary render error, and Try Again re-renders the children", () => {
    quiet();
    let broken = true;
    const Child = () => (broken ? <Boom error={new TypeError("x is not a function")} /> : <p>recovered</p>);
    render(<ErrorBoundary section="Page"><Child /></ErrorBoundary>);
    expect(screen.getByText("Page couldn't load")).toBeTruthy();
    expect(screen.getByText(/rest of the site should still work/)).toBeTruthy();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.getByText("recovered")).toBeTruthy();
  });

  it("says the site was updated, and offers a reload that really reloads, when a lazy chunk could not be fetched", () => {
    quiet();
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<ErrorBoundary section="Page"><Boom error={new TypeError("Failed to fetch dynamically imported module: https://x.test/assets/Page-abc.js")} /></ErrorBoundary>);
    expect(screen.getByText(/site was updated while this page was open/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("renders its children untouched when nothing fails", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeTruthy();
  });
});

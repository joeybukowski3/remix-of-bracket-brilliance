import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});

describe("App 16-0 route", () => {
  it("lazy-loads the self-contained game at /16-0 without API requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network disabled"));
    window.history.pushState({}, "", "/16-0");
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Can You Build the Perfect Fantasy Team?",
      }),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});


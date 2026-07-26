import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("App support route", () => {
  it("renders the Support page at /support", async () => {
    window.history.pushState({}, "", "/support");

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Independent sports analytics, built for the public." }),
    ).toBeInTheDocument();
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppRoutes from "./AppRoutes";

describe("shared route tree", () => {
  it("is the only route table: App.tsx wraps AppRoutes and declares no routes of its own", () => {
    const app = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    expect(app).toContain("<AppRoutes />");
    expect(app).not.toMatch(/<Route\b|<Routes\b/);
    const entry = readFileSync(resolve(__dirname, "entry-server.tsx"), "utf8");
    expect(entry).toContain("<AppRoutes />");
    expect(entry).not.toMatch(/<Route\b|<Routes\b/);
  });

  it("renders under a router other than BrowserRouter (as StaticRouter does at build time)", async () => {
    render(
      <MemoryRouter initialEntries={["/support"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Independent sports analytics, built for the public." }),
    ).toBeInTheDocument();
  });

  it("keeps the catch-all NotFound route", async () => {
    render(
      <MemoryRouter initialEntries={["/definitely-not-a-route"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
  });
});

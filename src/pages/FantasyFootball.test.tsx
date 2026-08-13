import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import App from "@/App";
import FantasyFootball from "@/pages/FantasyFootball";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/usePageSeo")>("@/hooks/usePageSeo")),
  usePageSeo: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fantasy-football"]}>
      <Routes>
        <Route path="/fantasy-football" element={<FantasyFootball />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("/fantasy-football PAR board", () => {
  it("renders the 2026 PAR rankings and methodology", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "2026 Fantasy PAR Rankings" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "2026 PAR tier board" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "How this board is built" })).toBeTruthy();
    expect(screen.getByText(/Consensus position rank never assigns a tier/i)).toBeTruthy();
  });

  it("renders all 180 validated skill-position players by default", () => {
    renderPage();
    expect(screen.getAllByRole("heading", { level: 5 })).toHaveLength(180);
    expect(screen.getByRole("heading", { level: 5, name: "Josh Allen" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 5, name: "Jahmyr Gibbs" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 5, name: "Ja'Marr Chase" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 5, name: "Brock Bowers" })).toBeTruthy();
  }, 30000);

  it("provides exact position filters with the approved universe sizes", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Position" });
    expect(within(group).getByRole("button", { name: "All positions" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["QB 18", "RB 66", "WR 78", "TE 18"]) {
      expect(within(group).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("filters to one position without changing that position's tiers", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "QB 18" }));
    expect(screen.getAllByRole("heading", { level: 5 })).toHaveLength(18);
    expect(screen.getByRole("heading", { level: 3, name: "Quarterbacks" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Running backs" })).toBeNull();
    expect(screen.getByRole("heading", { level: 4, name: "Tier 1, PAR rank 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "Tier 6, PAR ranks 17 through 18" })).toBeTruthy();
  });

  it("searches player and team fields and reports a useful empty state", () => {
    renderPage();
    const search = screen.getByRole("searchbox", { name: "Search PAR rankings" });
    fireEvent.change(search, { target: { value: "gibbs" } });
    expect(screen.getAllByRole("heading", { level: 5 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 5, name: "Jahmyr Gibbs" })).toBeTruthy();

    fireEvent.change(search, { target: { value: "zzz-no-player" } });
    expect(screen.getByText(/No players match/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 5 })).toBeNull();
  });

  it("exposes mobile projection details without hiding the primary metrics", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search PAR rankings" }), {
      target: { value: "Josh Allen" },
    });
    expect(screen.getAllByText("+5.71").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23.27").length).toBeGreaterThan(0);
    expect(screen.getAllByText("17.57").length).toBeGreaterThan(0);
    expect(screen.getByText("Projection details")).toBeTruthy();
  });

  it("is reachable through the existing app route", async () => {
    window.history.pushState({}, "", "/fantasy-football");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "2026 Fantasy PAR Rankings" })).toBeTruthy();
  });
});

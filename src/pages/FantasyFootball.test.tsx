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
      <Routes><Route path="/fantasy-football" element={<FantasyFootball />} /></Routes>
    </MemoryRouter>,
  );
}

afterEach(() => window.history.pushState({}, "", "/"));

describe("/fantasy-football research board", () => {
  it("renders the full JKB board and PAR methodology", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "2026 Fantasy PAR Rankings" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Overall fantasy rankings" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "How this board is built" })).toBeTruthy();
    expect(screen.getByText(/Consensus position rank never assigns a tier/i)).toBeTruthy();
  });

  it("preserves the compact 250-player overall board", () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: /Show details for/i })).toHaveLength(250);
    expect(screen.queryByText("Tier 1")).toBeNull();
  }, 30000);

  it("labels filters with full JKB position-board sizes", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Position" });
    expect(within(group).getByRole("button", { name: "Overall 250" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["QB 31", "RB 85", "WR 100", "TE 34"]) {
      expect(within(group).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("shows approved tiers followed by the untiered outside pool", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "QB 31" }));
    expect(screen.getByRole("heading", { level: 3, name: "Quarterbacks" })).toBeTruthy();
    expect(screen.getByText("Tier 1")).toBeTruthy();
    expect(screen.getByText("Tier 6")).toBeTruthy();
    expect(screen.getByText("Outside Draft Pool")).toBeTruthy();
    expect(screen.getByText(/18 tier eligible/i)).toBeTruthy();
    expect(screen.getByText(/QB13 = 17.57 PPG/i)).toBeTruthy();
  }, 30000);

  it("searches players outside the PAR tier universe", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "RB 85" }));
    const search = screen.getByRole("searchbox", { name: "Search fantasy rankings" });
    fireEvent.change(search, { target: { value: "Devin Singletary" } });
    expect(screen.getByText("Devin Singletary")).toBeTruthy();
    expect(screen.getByText("Outside Draft Pool")).toBeTruthy();
    fireEvent.change(search, { target: { value: "zzz-no-player" } });
    expect(screen.getByText(/No players match/i)).toBeTruthy();
  }, 30000);

  it("renders position columns and omits empty WR and TE Vegas columns", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "RB 85" }));
    expect(screen.getByText("Touches Rk")).toBeTruthy();
    expect(screen.getByText("Red Zone Touches Rk")).toBeTruthy();
    expect(screen.getByText("Vegas Rk")).toBeTruthy();
    for (const week of ["W15", "W16", "W17"]) expect(screen.getByText(week)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "WR 100" }));
    expect(screen.getByText("Target % Rk")).toBeTruthy();
    expect(screen.queryByText("Vegas Rk")).toBeNull();
  }, 30000);

  it("renders logos, conditional cells, mobile modes, and expandable PAR details", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "QB 31" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search fantasy rankings" }), { target: { value: "Josh Allen" } });
    expect(screen.getByRole("img", { name: "BUF" })).toBeTruthy();
    expect(container.querySelector(".bg-emerald-50, .bg-rose-50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.getByRole("button", { name: "Model" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show details for Josh Allen" }));
    expect(screen.getByText("23.27")).toBeTruthy();
    expect(screen.getByText("17.57")).toBeTruthy();
  }, 30000);

  it("is reachable through the existing app route", async () => {
    window.history.pushState({}, "", "/fantasy-football");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "2026 Fantasy PAR Rankings" })).toBeTruthy();
  });
});

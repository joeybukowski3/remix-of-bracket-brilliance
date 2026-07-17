/**
 * Focused coverage for the sidebar-driven hash navigation into Social Media
 * Tables: "Social Media Tables" -> #social-tables (scroll only) and
 * "Moneyline Edges" -> #ml-edges-social (select the ML Edges tab, then
 * scroll). Uses React Router's reactive location.hash rather than a native
 * hashchange listener, since the sidebar navigates via <Link> (pushState),
 * which never fires a native hashchange event -- see the comment on the
 * effect in SocialMediaTablesSection.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { SocialMediaTablesSection } from "./MlbGameDetail";

vi.mock("@/hooks/useMlbPropsData", () => ({
  useMlbPropsData: () => ({
    batters: [],
    strikeoutRows: [],
    batterVsPitcherRows: [],
    strikeoutDetailRows: [],
    pitchers: [],
    games: [],
    loading: false,
  }),
}));

vi.mock("@/hooks/usePolymarketMlbMoneylines", () => ({
  usePolymarketMlbMoneylines: () => ({ data: null }),
}));

function renderAt(hash: string) {
  return render(
    <MemoryRouter initialEntries={[`/mlb${hash}`]}>
      <SocialMediaTablesSection games={[]} detailPreviews={{}} pitcherRegressionData={[]} mlbOdds={null} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear();
});

describe("SocialMediaTablesSection hash navigation", () => {
  it("defaults to the HR Props tab with no relevant hash present", async () => {
    renderAt("");
    await waitFor(() => expect(screen.getByText("Social Media Tables")).toBeInTheDocument());
    const hrTab = screen.getByRole("button", { name: /HR Props/ });
    expect(hrTab).toHaveStyle({ color: "#031635" });
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("#social-tables scrolls the section into view without changing the active tab", async () => {
    renderAt("#social-tables");
    await waitFor(() => expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled());
    const hrTab = screen.getByRole("button", { name: /HR Props/ });
    expect(hrTab).toHaveStyle({ color: "#031635" });
  });

  it("#ml-edges-social selects the ML Edges tab and scrolls the section into view", async () => {
    renderAt("#ml-edges-social");
    await waitFor(() => {
      const mlTab = screen.getByRole("button", { name: /ML Edges/ });
      expect(mlTab).toHaveStyle({ color: "#031635" });
    });
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("an unrelated hash neither scrolls nor changes the active tab", async () => {
    renderAt("#schedule");
    await waitFor(() => expect(screen.getByText("Social Media Tables")).toBeInTheDocument());
    const hrTab = screen.getByRole("button", { name: /HR Props/ });
    expect(hrTab).toHaveStyle({ color: "#031635" });
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  // Reproduces the actual reported bug: a sidebar click is a same-page
  // <Link> navigation (history.pushState), not a real browser hash change,
  // so it never fires a native `hashchange` event. Mounting already on
  // /mlb with no hash, then clicking a <Link to="/mlb#..."> the same way
  // the sidebar does, must still trigger the scroll/tab-select -- this is
  // exactly the case a `window.addEventListener("hashchange", ...)`-based
  // fix would silently fail.
  it("clicking a same-page <Link> to #ml-edges-social (the sidebar's own navigation mechanism) still selects the tab and scrolls", async () => {
    render(
      <MemoryRouter initialEntries={["/mlb"]}>
        <Link to="/mlb#ml-edges-social">Moneyline Edges</Link>
        <Routes>
          <Route
            path="/mlb"
            element={<SocialMediaTablesSection games={[]} detailPreviews={{}} pitcherRegressionData={[]} mlbOdds={null} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Social Media Tables")).toBeInTheDocument());
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "Moneyline Edges" }));

    await waitFor(() => {
      const mlTab = screen.getByRole("button", { name: /ML Edges/ });
      expect(mlTab).toHaveStyle({ color: "#031635" });
    });
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

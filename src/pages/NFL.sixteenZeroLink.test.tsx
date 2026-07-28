import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFL from "@/pages/NFL";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/hooks/useNflV03PublicPowerRatings", () => ({
  useNflV03PublicPowerRatings: () => ({ loading: false, error: null, data: null }),
}));

function renderNflLanding() {
  return render(
    <MemoryRouter>
      <NFL />
    </MemoryRouter>
  );
}

describe("NFL landing page 16-0 card", () => {
  it("links to /16-0 for internal, client-side navigation", () => {
    renderNflLanding();
    const link = screen.getByRole("link", { name: /start draft.*16-0 fantasy draft simulator/i });
    expect(link.getAttribute("href")).toBe("/16-0");
  });

  it("does not render a duplicate 16-0 card", () => {
    renderNflLanding();
    expect(screen.getAllByRole("link", { name: /16-0 fantasy draft simulator/i })).toHaveLength(1);
  });
});

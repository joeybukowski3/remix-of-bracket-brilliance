import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NFLFantasyPositionMatchupsRedirect from "./NFLFantasyPositionMatchupsRedirect";

describe("NFLFantasyPositionMatchupsRedirect", () => {
  it("redirects the old standalone route to the Matchup Comparison tab", () => {
    render(
      <MemoryRouter initialEntries={["/nfl/fantasy-position-matchups"]}>
        <Routes>
          <Route path="/nfl/fantasy-position-matchups" element={<NFLFantasyPositionMatchupsRedirect />} />
          <Route path="/nfl/fantasy-points-allowed" element={<div>Fantasy Points Allowed page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Fantasy Points Allowed page")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MatchupThemeToggle from "@/components/nfl/matchups/MatchupThemeToggle";
import { useMatchupTheme } from "@/components/nfl/matchups/matchupTheme";

function Harness() {
  const { theme, setTheme } = useMatchupTheme();
  return <MatchupThemeToggle theme={theme} onChange={setTheme} />;
}

afterEach(() => {
  window.localStorage.removeItem("jkb-nfl-matchup-theme");
  document.body.classList.remove("nfl-matchup-route");
  delete document.body.dataset.nflMatchupTheme;
});

describe("NFL matchup theme control", () => {
  it("switches themes and persists the selection", () => {
    window.localStorage.setItem("jkb-nfl-matchup-theme", "dark");
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Use light theme" }));

    expect(screen.getByRole("button", { name: "Use dark theme" })).toBeTruthy();
    expect(document.body.dataset.nflMatchupTheme).toBe("light");
    expect(window.localStorage.getItem("jkb-nfl-matchup-theme")).toBe("light");
  });
});

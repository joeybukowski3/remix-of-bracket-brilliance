import { Moon, Sun } from "lucide-react";
import type { MatchupTheme } from "@/components/nfl/matchups/matchupTheme";

export default function MatchupThemeToggle({
  theme,
  onChange,
}: {
  theme: MatchupTheme;
  onChange: (theme: MatchupTheme) => void;
}) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Use ${nextTheme} theme`}
      aria-pressed={theme === "light"}
      onClick={() => onChange(nextTheme)}
      className="matchup-theme-toggle"
    >
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

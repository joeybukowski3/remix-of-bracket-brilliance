import { useEffect, useState } from "react";

export type MatchupTheme = "dark" | "light";

export const MATCHUP_THEME_STORAGE_KEY = "jkb-nfl-matchup-theme";

function preferredTheme(): MatchupTheme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(MATCHUP_THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useMatchupTheme() {
  const [theme, setTheme] = useState<MatchupTheme>(preferredTheme);

  useEffect(() => {
    window.localStorage.setItem(MATCHUP_THEME_STORAGE_KEY, theme);
    document.body.classList.add("nfl-matchup-route");
    document.body.dataset.nflMatchupTheme = theme;
    return () => {
      document.body.classList.remove("nfl-matchup-route");
      delete document.body.dataset.nflMatchupTheme;
    };
  }, [theme]);

  return { theme, setTheme };
}

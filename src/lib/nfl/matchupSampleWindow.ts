/**
 * Sample-window selection for the NFL matchup analyzer.
 *
 * These are the two global controls that sit above the analyzer:
 *   - Data Window:     Season | Last 5
 *   - Historical Blend: include the tail of the 2025 season, ON/OFF
 *
 * The composition math below is pure and fully specified now so that the
 * Phase 2/3 ingestion pipelines have a single, tested definition of "which
 * games are in the sample" to aggregate against. Phase 1 ships the controls and
 * this logic only — no statistic is computed from it yet, and the UI never
 * displays a composition it cannot actually source.
 */

export type NflDataWindow = "season" | "last5";

export type NflMatchupSampleSettings = {
  window: NflDataWindow;
  /** When true the sample may draw on completed 2025 games. */
  includePriorSeason: boolean;
};

/** Season + blend ON, per the redesign spec. */
export const DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS: NflMatchupSampleSettings = {
  window: "season",
  includePriorSeason: true,
};

/** Size of the rolling blended sample used by the Season window. */
export const ROLLING_BLEND_GAME_COUNT = 8;
/** Size of the Last 5 window. */
export const LAST_N_GAME_COUNT = 5;

export type NflSampleComposition = {
  /** Completed current-season (2026) games contributing to the sample. */
  currentSeasonGames: number;
  /** Completed prior-season (2025) games contributing to the sample. */
  priorSeasonGames: number;
  /** Total games in the sample. */
  totalGames: number;
};

/**
 * Resolve how many current- and prior-season games make up a team's sample.
 *
 * Season + blend ON  — rolling eight-game window; each completed 2026 game
 *                      replaces one late-2025 game, so 2025 contributes nothing
 *                      from the eighth completed 2026 game onward.
 * Season + blend OFF — every completed 2026 game, uncapped.
 * Last 5 + blend ON  — five most recent completed games, allowed to cross the
 *                      2025/2026 boundary early in the season.
 * Last 5 + blend OFF — up to five completed 2026 games, fewer when the season
 *                      is young.
 *
 * `completedCurrentSeasonGames` below zero or non-finite is treated as zero
 * rather than throwing, so a partially-loaded schedule degrades to the
 * preseason baseline instead of blanking the page.
 */
export function resolveSampleComposition(
  completedCurrentSeasonGames: number,
  settings: NflMatchupSampleSettings
): NflSampleComposition {
  const completed =
    Number.isFinite(completedCurrentSeasonGames) && completedCurrentSeasonGames > 0
      ? Math.floor(completedCurrentSeasonGames)
      : 0;

  if (settings.window === "last5") {
    const currentSeasonGames = Math.min(completed, LAST_N_GAME_COUNT);
    const priorSeasonGames = settings.includePriorSeason
      ? LAST_N_GAME_COUNT - currentSeasonGames
      : 0;
    return {
      currentSeasonGames,
      priorSeasonGames,
      totalGames: currentSeasonGames + priorSeasonGames,
    };
  }

  if (!settings.includePriorSeason) {
    return { currentSeasonGames: completed, priorSeasonGames: 0, totalGames: completed };
  }

  const currentSeasonGames = Math.min(completed, ROLLING_BLEND_GAME_COUNT);
  const priorSeasonGames = ROLLING_BLEND_GAME_COUNT - currentSeasonGames;
  return {
    currentSeasonGames,
    priorSeasonGames,
    totalGames: ROLLING_BLEND_GAME_COUNT,
  };
}

/** Short label for the active Data Window control. */
export function dataWindowLabel(window: NflDataWindow): string {
  return window === "last5" ? "Last 5" : "Season";
}

/**
 * Plain-language description of the *rule* the current settings apply.
 *
 * This describes behaviour only — it never claims a game count the repository
 * cannot yet source. Once the Phase 2/3 pipelines land, callers can pair this
 * with `resolveSampleComposition` to show an actual "4 from 2026 + 4 from 2025"
 * breakdown.
 */
export function describeSampleRule(settings: NflMatchupSampleSettings): string {
  if (settings.window === "last5") {
    return settings.includePriorSeason
      ? "Five most recent completed games, allowed to cross the 2025/2026 boundary."
      : "Up to five most recent completed 2026 games. No 2025 games contribute.";
  }
  return settings.includePriorSeason
    ? "Rolling eight-game sample. Each completed 2026 game replaces one late-2025 game."
    : "Completed 2026 games only. No 2025 games contribute.";
}

/** Compact composition label, e.g. "4 from 2026 + 4 from 2025". */
export function describeSampleComposition(composition: NflSampleComposition): string {
  const { currentSeasonGames, priorSeasonGames } = composition;
  if (priorSeasonGames === 0) return `${currentSeasonGames} from 2026`;
  if (currentSeasonGames === 0) return `${priorSeasonGames} from 2025`;
  return `${currentSeasonGames} from 2026 + ${priorSeasonGames} from 2025`;
}

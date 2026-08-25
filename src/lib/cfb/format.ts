import type { CfbGame, CfbGameStatus, CfbJkbRatings } from "@/data/cfb/types";

/** Safe display helpers — never render NaN/undefined/null as fake zeros. */

export function formatNullableNumber(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function formatNullableInteger(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return String(Math.trunc(value));
}

export function formatRank(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `#${Math.trunc(value)}`;
}

export function formatRecord(
  wins: number,
  losses: number,
  ties = 0,
): string {
  if (ties > 0) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

export function formatMoneyline(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

export function formatSpread(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "PICK";
  return value > 0 ? `+${value}` : String(value);
}

/** Existing CFBD spread fields are stored from the home team's perspective. */
export function getTeamPerspectiveSpread(
  game: Pick<CfbGame, "homeTeamId" | "awayTeamId" | "odds">,
  teamId: string,
): number | null {
  const spread = game.odds.currentSpread ?? game.odds.openingSpread;
  if (spread == null || Number.isNaN(spread)) return null;
  if (teamId === game.homeTeamId) return spread;
  if (teamId === game.awayTeamId) return spread === 0 ? 0 : -spread;
  return null;
}

export function formatTotal(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

export function formatBooleanYesNo(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

/**
 * Rank heat styling: lower rank (closer to 1) = greener.
 * teamCount defaults to ~FBS size for normalization.
 */
export function rankHeatStyle(
  rank: number | null | undefined,
  teamCount = 138,
): { background: string; color: string } {
  if (rank == null || Number.isNaN(rank)) {
    return { background: "transparent", color: "#64748b" };
  }
  const t = (rank - 1) / Math.max(1, teamCount - 1);
  if (t <= 0.5) {
    const k = 1 - t * 2;
    return {
      background: `rgba(22,163,74,${0.10 + k * 0.28})`,
      color: k > 0.4 ? "#0f5132" : "#166534",
    };
  }
  const k = (t - 0.5) * 2;
  return {
    background: `rgba(220,38,38,${0.08 + k * 0.26})`,
    color: k > 0.4 ? "#7f1d1d" : "#991b1b",
  };
}

/**
 * Ranking display hierarchy: official CFP rank > official AP rank > JKB rank as
 * a clearly-marked fallback. Never fabricates a ranking — returns "none" when
 * nothing is available.
 *
 * Official polls render as a bare "#N"; the internal JKB power rank NEVER does,
 * so a reader can always tell an official ranking from a model output at a
 * glance. `label` carries the same distinction for assistive technology.
 */
export type CfbRankDisplay = {
  text: string;
  /** Accessible/title text, e.g. "AP rank 8", "CFP rank 6", "JKB power rank 14". */
  label: string;
  source: "cfp" | "ap" | "jkb" | "none";
  /** True for CFP/AP — i.e. an actual published poll, not a JKB model rank. */
  isOfficial: boolean;
};

function isUsableRank(value: number | null | undefined): value is number {
  return value != null && !Number.isNaN(value);
}

export function getCfbRankDisplay(
  ratings: Pick<CfbJkbRatings, "apRank" | "jkbRank"> & { cfpRank?: number | null },
): CfbRankDisplay {
  if (isUsableRank(ratings.cfpRank)) {
    const rank = Math.trunc(ratings.cfpRank);
    return { text: `#${rank}`, label: `CFP rank ${rank}`, source: "cfp", isOfficial: true };
  }
  if (isUsableRank(ratings.apRank)) {
    const rank = Math.trunc(ratings.apRank);
    return { text: `#${rank}`, label: `AP rank ${rank}`, source: "ap", isOfficial: true };
  }
  if (isUsableRank(ratings.jkbRank)) {
    const rank = Math.trunc(ratings.jkbRank);
    return { text: `JKB ${rank}`, label: `JKB power rank ${rank}`, source: "jkb", isOfficial: false };
  }
  return { text: "", label: "", source: "none", isOfficial: false };
}

/**
 * Market favorite is derived ONLY from the spread — never from JKB ratings.
 * Canonical convention: negative spread (home perspective) = home favorite.
 */
export type CfbFavoriteSide = "home" | "away" | "none";

export function getCfbMarketFavorite(
  game: Pick<CfbGame, "homeTeamId" | "awayTeamId" | "odds">,
): CfbFavoriteSide {
  const spread = game.odds.currentSpread ?? game.odds.openingSpread;
  if (spread == null || Number.isNaN(spread) || spread === 0) return "none";
  return spread < 0 ? "home" : "away";
}

/** Spread formatted relative to the favored team, e.g. "TCU -7.5". */
export function formatFavoriteSpread(
  game: Pick<CfbGame, "homeTeamId" | "awayTeamId" | "odds">,
  awayAbbreviation: string,
  homeAbbreviation: string,
): string {
  const spread = game.odds.currentSpread ?? game.odds.openingSpread;
  if (spread == null || Number.isNaN(spread)) return "—";
  if (spread === 0) return "PICK";
  const favorite = spread < 0 ? homeAbbreviation : awayAbbreviation;
  return `${favorite} -${Math.abs(spread)}`;
}

const GAME_STATUS_LABELS: Record<CfbGameStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "Live",
  final: "Final",
  postponed: "Postponed",
  canceled: "Canceled",
};

/** "City, ST" — falls back to just the city, or "" when no verified location exists. */
export function formatCfbVenueLocation(
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  if (!city) return "";
  return state ? `${city}, ${state}` : city;
}

export function formatCfbGameStatusLabel(status: CfbGameStatus): string {
  return GAME_STATUS_LABELS[status] ?? "Scheduled";
}

export function formatRankChange(
  previousRank: number | null | undefined,
  currentRank: number | null | undefined,
): { text: string; direction: "up" | "down" | "same" | "none" } {
  if (previousRank == null || currentRank == null) {
    return { text: "", direction: "none" };
  }
  const delta = previousRank - currentRank;
  if (delta > 0) return { text: `↑${delta}`, direction: "up" };
  if (delta < 0) return { text: `↓${Math.abs(delta)}`, direction: "down" };
  return { text: "—", direction: "same" };
}

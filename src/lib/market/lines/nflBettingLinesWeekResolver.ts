/**
 * WU9A — deterministic "current / upcoming NFL slate" resolver.
 *
 * The daily betting-lines automation must NOT hardcode `--week 1`. This module
 * reads the repo's canonical nflverse-derived schedule document
 * (`public/data/nfl/<season>/games.json`, shape `{ games: NflGameRecord[] }`)
 * and, given the current UTC instant, returns the nearest NFL
 * regular-season / postseason week that still contains at least one game whose
 * kickoff has not yet passed.
 *
 * Rules:
 *   - The JKB / nflverse schedule is authoritative. The Odds API is never
 *     consulted to define the week.
 *   - Only `kickoffUtc` / `dateUtc` from the canonical document is used — no
 *     machine-local timezone assumptions.
 *   - Preseason (`PRE`) games are ignored; only REG + postseason
 *     (`WC` / `DIV` / `CON` / `SB` / `POST`) count.
 *   - If no future REG/postseason game exists, the result is `no-slate` so the
 *     caller can exit cleanly without spending an API credit in the offseason.
 *   - A malformed document throws (fail fast — never call the provider for a
 *     phantom week).
 */

import type { NflGameRecord } from "../../nfl/standings";

/** Season-type family this resolver can schedule a refresh for. */
export type NflBettingLinesSeasonTypeFamily = "REG" | "POST";

/** nflverse `seasonType` tokens that this resolver will schedule a refresh for. */
const REGULAR_SEASON_TOKENS: ReadonlySet<string> = new Set(["REG"]);
const POSTSEASON_TOKENS: ReadonlySet<string> = new Set([
  "WC",
  "DIV",
  "CON",
  "SB",
  "POST",
]);

export type NflBettingLinesResolvedSlate = {
  status: "resolved";
  season: number;
  week: number;
  /** Season-type family to hand to `loadCanonicalNflSlate`. */
  seasonType: NflBettingLinesSeasonTypeFamily;
  /** Count of games in the resolved week whose kickoff is still in the future. */
  futureGamesInWeek: number;
  /** Total games in the resolved week (past + future). */
  totalGamesInWeek: number;
  /** Earliest future kickoff (ISO 8601) in the resolved week. */
  nextKickoffUtc: string;
};

export type NflBettingLinesNoSlate = {
  status: "no-slate";
  reason: string;
};

export type NflBettingLinesWeekResolution =
  | NflBettingLinesResolvedSlate
  | NflBettingLinesNoSlate;

export type ResolveNflBettingLinesSlateInput = {
  /**
   * One or more parsed `public/data/nfl/<season>/games.json` documents. Passing
   * both the current and previous season lets January playoff weeks resolve
   * even though they live in the previous season's file.
   */
  gamesDocuments: readonly unknown[];
  /** Current instant as an ISO 8601 string (UTC). */
  nowUtc: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function seasonTypeFamily(
  token: string,
): "REG" | "POST" | null {
  if (REGULAR_SEASON_TOKENS.has(token)) return "REG";
  if (POSTSEASON_TOKENS.has(token)) return "POST";
  return null;
}

function collectScheduledGames(
  gamesDocuments: readonly unknown[],
): NflGameRecord[] {
  if (!Array.isArray(gamesDocuments) || gamesDocuments.length === 0) {
    throw new Error(
      "resolveNflBettingLinesSlate requires at least one games.json document.",
    );
  }

  const games: NflGameRecord[] = [];
  for (const document of gamesDocuments) {
    if (!isRecord(document) || !Array.isArray(document.games)) {
      throw new Error(
        "Canonical NFL schedule document must be { games: NflGameRecord[] } " +
          "(the shape of public/data/nfl/<season>/games.json).",
      );
    }
    for (const raw of document.games as unknown[]) {
      if (!isRecord(raw)) {
        throw new Error("Canonical NFL schedule contains a non-object game entry.");
      }
      const { season, week, seasonType, dateUtc } = raw as Record<string, unknown>;
      if (typeof season !== "number" || !Number.isInteger(season)) {
        throw new Error(`Canonical NFL game has a non-integer season: ${String(season)}`);
      }
      if (typeof week !== "number" || !Number.isInteger(week)) {
        throw new Error(`Canonical NFL game has a non-integer week: ${String(week)}`);
      }
      if (typeof seasonType !== "string" || seasonType.length === 0) {
        throw new Error(`Canonical NFL game has an empty seasonType (season ${season} week ${week}).`);
      }
      if (dateUtc !== null && typeof dateUtc !== "string") {
        throw new Error(`Canonical NFL game has a non-string dateUtc (season ${season} week ${week}).`);
      }
      games.push(raw as unknown as NflGameRecord);
    }
  }
  return games;
}

/**
 * Resolve the nearest upcoming NFL REG / postseason week from the canonical
 * schedule. Deterministic: depends only on the documents and `nowUtc`.
 */
export function resolveNflBettingLinesSlate(
  input: ResolveNflBettingLinesSlateInput,
): NflBettingLinesWeekResolution {
  const nowMs = Date.parse(input.nowUtc);
  if (Number.isNaN(nowMs)) {
    throw new Error(`nowUtc must be an ISO 8601 timestamp; received ${input.nowUtc}`);
  }

  const games = collectScheduledGames(input.gamesDocuments);

  // Future REG / postseason games only.
  const futureGames = games.filter((game) => {
    const family = seasonTypeFamily(game.seasonType);
    if (family === null) return false;
    if (game.dateUtc === null) return false;
    const kickoffMs = Date.parse(game.dateUtc);
    if (Number.isNaN(kickoffMs)) return false;
    return kickoffMs > nowMs;
  });

  if (futureGames.length === 0) {
    return {
      status: "no-slate",
      reason:
        "No NFL regular-season or postseason game with a future kickoff exists " +
        "in the canonical schedule (offseason or schedule not yet published).",
    };
  }

  // Nearest upcoming week = smallest (season, week) among future games.
  const earliestSeason = Math.min(...futureGames.map((game) => game.season));
  const seasonFutureGames = futureGames.filter(
    (game) => game.season === earliestSeason,
  );
  const targetWeek = Math.min(...seasonFutureGames.map((game) => game.week));

  const weekGames = games.filter(
    (game) => game.season === earliestSeason && game.week === targetWeek,
  );
  const weekFutureGames = seasonFutureGames.filter(
    (game) => game.week === targetWeek,
  );

  const families = new Set(
    weekGames
      .map((game) => seasonTypeFamily(game.seasonType))
      .filter((family): family is "REG" | "POST" => family !== null),
  );
  // A single nflverse week never mixes REG and postseason; prefer REG if it
  // somehow does so the slate stays inside the regular-season family.
  const seasonType: "REG" | "POST" = families.has("REG") ? "REG" : "POST";

  const nextKickoffUtc = weekFutureGames
    .map((game) => game.dateUtc as string)
    .sort()[0];

  return {
    status: "resolved",
    season: earliestSeason,
    week: targetWeek,
    seasonType,
    futureGamesInWeek: weekFutureGames.length,
    totalGamesInWeek: weekGames.length,
    nextKickoffUtc,
  };
}

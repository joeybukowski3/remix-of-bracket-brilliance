/**
 * WU7C provider discovery via the SportsDataIO NFL **Pre-Game Odds by Week**
 * feed. This replaces the Scores `ScoresByWeek` feed as the operational
 * discovery source: the trial account is authorized for the betting subfeed but
 * not for Scores & Game Day Info.
 *
 * Verified against the SportsDataIO NFL v3 Odds OpenAPI
 * (api-evangelist/sportsdataio, `openapi/sportsdataio-nfl-v3-odds-api-openapi.yml`,
 * retrieved 2026-08-31):
 *
 *   GET /v3/nfl/odds/{format}/GameOddsByWeek/{season}/{week}
 *     summary: "Pre-Game Odds - by Week"
 *     -> 200: array of GameInfo
 *     securityScheme apiKeyHeader: { in: header, name: Ocp-Apim-Subscription-Key }
 *
 *   GameInfo (verified fields used here):
 *     ScoreId (int), Season (int), SeasonType (int 1=REG,2=PRE,3=POST),
 *     Week (int|null), Day (string|null, US Eastern), DateTime (string|null,
 *     US Eastern), AwayTeamId / HomeTeamId (int|null), AwayTeamName /
 *     HomeTeamName (string|null), GlobalAwayTeamId / GlobalHomeTeamId (int|null),
 *     PregameOdds (GameOdd[]), AlternateMarketPregameOdds (GameOdd[]),
 *     LiveOdds (GameOdd[]), GameId (int).
 *
 *   The response array carries ONE GameInfo per game; sportsbook variation is
 *   nested inside `PregameOdds`, so discovery deduplicates defensively by
 *   ScoreId rather than assuming one row per game.
 *
 * Real SportsDataIO GameInfo payloads additionally carry `AwayTeam` / `HomeTeam`
 * (abbreviation "Key") and `DateTimeUTC`, which the api-evangelist mirror omits.
 * Both are consumed opportunistically: team-abbreviation identity and the
 * provider's own UTC kickoff are used when present, with the verified
 * name/id/Eastern fields as the documented fallback. A GameInfo with neither a
 * team abbreviation nor resolvable identity is still emitted (with null team
 * keys) so the caller can report it rather than the decoder failing the week.
 *
 *   GameOdd (verified fields, exposed for a future line-history WU — NOT used by
 *   discovery): GameOddId (int), Sportsbook (string|null), SportsbookId
 *   (int|null), ScoreId (int), Created (string|null, US Eastern), Updated
 *   (string|null, US Eastern), Unlisted (string|null, US Eastern),
 *   HomeMoneyLine / AwayMoneyLine / DrawMoneyLine (int|null),
 *   HomePointSpread / AwayPointSpread (number|null),
 *   HomePointSpreadPayout / AwayPointSpreadPayout (int|null),
 *   OverUnder (number|null), OverPayout / UnderPayout (int|null),
 *   OddType (string|null), SportsbookUrl (string|null).
 *
 * No CFB route is wired here; the CFB odds-by-week route is unverified.
 */

import { z } from "zod";
import {
  SportsDataIoScheduleDecodeError,
  SEASON_TYPE_BY_ID,
  resolveProviderKickoffUtc,
  type SportsDataIoScheduleGame,
} from "./sportsDataIoSchedule";
import { resolveSportsDataIoNflTeamAbbr } from "./sportsDataIoNflTeamIdentity";

const gameOddSchema = z
  .object({
    GameOddId: z.number().int().nullable().optional(),
    Sportsbook: z.string().nullable().optional(),
    SportsbookId: z.number().int().nullable().optional(),
    ScoreId: z.number().int().nullable().optional(),
    ScoreID: z.number().int().nullable().optional(),
    OddType: z.string().nullable().optional(),
    SportsbookUrl: z.string().nullable().optional(),
    Created: z.string().nullable().optional(),
    Updated: z.string().nullable().optional(),
    Unlisted: z.string().nullable().optional(),
    HomeMoneyLine: z.number().nullable().optional(),
    AwayMoneyLine: z.number().nullable().optional(),
    DrawMoneyLine: z.number().nullable().optional(),
    HomePointSpread: z.number().nullable().optional(),
    AwayPointSpread: z.number().nullable().optional(),
    HomePointSpreadPayout: z.number().nullable().optional(),
    AwayPointSpreadPayout: z.number().nullable().optional(),
    OverUnder: z.number().nullable().optional(),
    OverPayout: z.number().nullable().optional(),
    UnderPayout: z.number().nullable().optional(),
  })
  .passthrough();

const gameInfoSchema = z
  .object({
    ScoreId: z.number().int().nullable().optional(),
    ScoreID: z.number().int().nullable().optional(),
    Season: z.number().int().nullable().optional(),
    SeasonType: z.number().int().nullable().optional(),
    Week: z.number().int().nullable().optional(),
    Day: z.string().nullable().optional(),
    DateTime: z.string().nullable().optional(),
    DateTimeUTC: z.string().nullable().optional(),
    AwayTeam: z.string().nullable().optional(),
    HomeTeam: z.string().nullable().optional(),
    AwayTeamName: z.string().nullable().optional(),
    HomeTeamName: z.string().nullable().optional(),
    AwayTeamId: z.number().int().nullable().optional(),
    HomeTeamId: z.number().int().nullable().optional(),
    AwayTeamID: z.number().int().nullable().optional(),
    HomeTeamID: z.number().int().nullable().optional(),
    GlobalAwayTeamId: z.number().int().nullable().optional(),
    GlobalHomeTeamId: z.number().int().nullable().optional(),
    PregameOdds: z.array(gameOddSchema).nullable().optional(),
    AlternateMarketPregameOdds: z.array(gameOddSchema).nullable().optional(),
    LiveOdds: z.array(gameOddSchema).nullable().optional(),
  })
  .passthrough();

type GameInfoRow = z.infer<typeof gameInfoSchema>;

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function idToNull(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

function toDiscoveryGame(row: GameInfoRow): SportsDataIoScheduleGame {
  const scoreId = row.ScoreId ?? row.ScoreID;
  const { kickoffUtc, kickoffSource } = resolveProviderKickoffUtc(row);
  const seasonTypeId = row.SeasonType ?? null;
  return {
    league: "nfl",
    providerGameId: String(scoreId),
    season: row.Season ?? 0,
    seasonType: seasonTypeId == null ? null : SEASON_TYPE_BY_ID[seasonTypeId] ?? null,
    week: row.Week ?? null,
    // `GameOddsByWeek` may carry the abbreviation "Key" (`AwayTeam`), or only
    // `AwayTeamName` — which the live feed populates with the SportsDataIO
    // abbreviation, not the full club name. Resolve either form deterministically
    // (no fuzzy matching); canonical alias folding happens in the consumer's
    // `normalizeNflTeamAbbr`. Falls back to the provider numeric id only when
    // neither team string resolves.
    awayTeamKey:
      resolveSportsDataIoNflTeamAbbr(row.AwayTeam) ??
      resolveSportsDataIoNflTeamAbbr(row.AwayTeamName),
    homeTeamKey:
      resolveSportsDataIoNflTeamAbbr(row.HomeTeam) ??
      resolveSportsDataIoNflTeamAbbr(row.HomeTeamName),
    awayTeamProviderId:
      idToNull(row.GlobalAwayTeamId) ?? idToNull(row.AwayTeamId ?? row.AwayTeamID),
    homeTeamProviderId:
      idToNull(row.GlobalHomeTeamId) ?? idToNull(row.HomeTeamId ?? row.HomeTeamID),
    kickoffUtc,
    kickoffSource,
  };
}

/**
 * Decode a raw SportsDataIO NFL `GameOddsByWeek` payload into provider game
 * identities, deduplicated by ScoreId. Throws
 * {@link SportsDataIoScheduleDecodeError} when the payload is not an array of
 * GameInfo objects or a row is missing its ScoreId — the collector fails closed
 * rather than guess an incomplete slate.
 *
 * Returns the SAME {@link SportsDataIoScheduleGame} shape the Scores decoder
 * produced, so `selectScheduleCandidates` and the rest of the collector are
 * unchanged.
 */
export function decodeSportsDataIoNflPreGameOddsDiscovery(
  payload: unknown,
): SportsDataIoScheduleGame[] {
  if (!Array.isArray(payload)) {
    throw new SportsDataIoScheduleDecodeError(
      "Expected a JSON array of NFL GameInfo objects from GameOddsByWeek.",
    );
  }

  const byScoreId = new Map<string, SportsDataIoScheduleGame>();
  payload.forEach((entry, index) => {
    const parsed = gameInfoSchema.safeParse(entry);
    if (!parsed.success) {
      throw new SportsDataIoScheduleDecodeError(
        `GameInfo row ${index} failed validation: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
          .join("; ")}.`,
      );
    }
    const row = parsed.data;
    if ((row.ScoreId ?? row.ScoreID) == null) {
      throw new SportsDataIoScheduleDecodeError(
        `GameInfo row ${index} is missing ScoreId.`,
      );
    }
    const game = toDiscoveryGame(row);
    // One GameInfo per game is expected; dedupe defensively and keep the first.
    if (!byScoreId.has(game.providerGameId)) {
      byScoreId.set(game.providerGameId, game);
    }
  });

  return [...byScoreId.values()];
}

/**
 * One sportsbook's pre-game full-game line for a provider game. Isolated raw
 * odds shape for a future line-history / current-market WU. Discovery does not
 * consume this; it is intentionally decoupled from any single sportsbook and
 * fabricates no consensus.
 */
export type SportsDataIoPreGameOddsLine = {
  providerGameId: string;
  gameOddId: string | null;
  sportsbook: string | null;
  sportsbookId: string | null;
  oddType: string | null;
  homePointSpread: number | null;
  awayPointSpread: number | null;
  homePointSpreadPayout: number | null;
  awayPointSpreadPayout: number | null;
  overUnder: number | null;
  overPayout: number | null;
  underPayout: number | null;
  homeMoneyLine: number | null;
  awayMoneyLine: number | null;
  drawMoneyLine: number | null;
  /** Provider timestamps, US Eastern, verbatim (not converted here). */
  createdEastern: string | null;
  updatedEastern: string | null;
  unlistedEastern: string | null;
};

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Extract every sportsbook's pre-game full-game line from a `GameOddsByWeek`
 * payload, one row per `PregameOdds` entry (alternate-market and live odds are
 * ignored). For a future WU; not part of discovery.
 */
export function decodeSportsDataIoNflPreGameOddsLines(
  payload: unknown,
): SportsDataIoPreGameOddsLine[] {
  if (!Array.isArray(payload)) {
    throw new SportsDataIoScheduleDecodeError(
      "Expected a JSON array of NFL GameInfo objects from GameOddsByWeek.",
    );
  }
  const lines: SportsDataIoPreGameOddsLine[] = [];
  for (const entry of payload) {
    const parsed = gameInfoSchema.safeParse(entry);
    if (!parsed.success) continue;
    const row = parsed.data;
    const scoreId = row.ScoreId ?? row.ScoreID;
    if (scoreId == null) continue;
    for (const odd of row.PregameOdds ?? []) {
      lines.push({
        providerGameId: String(scoreId),
        gameOddId: idToNull(odd.GameOddId),
        sportsbook: trimToNull(odd.Sportsbook),
        sportsbookId: idToNull(odd.SportsbookId),
        oddType: trimToNull(odd.OddType),
        homePointSpread: num(odd.HomePointSpread),
        awayPointSpread: num(odd.AwayPointSpread),
        homePointSpreadPayout: num(odd.HomePointSpreadPayout),
        awayPointSpreadPayout: num(odd.AwayPointSpreadPayout),
        overUnder: num(odd.OverUnder),
        overPayout: num(odd.OverPayout),
        underPayout: num(odd.UnderPayout),
        homeMoneyLine: num(odd.HomeMoneyLine),
        awayMoneyLine: num(odd.AwayMoneyLine),
        drawMoneyLine: num(odd.DrawMoneyLine),
        createdEastern: trimToNull(odd.Created),
        updatedEastern: trimToNull(odd.Updated),
        unlistedEastern: trimToNull(odd.Unlisted),
      });
    }
  }
  return lines;
}

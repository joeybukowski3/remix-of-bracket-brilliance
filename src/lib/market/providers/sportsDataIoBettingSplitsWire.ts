/**
 * WU6 live-wire decoder: verified SportsDataIO `GameBettingSplit` JSON ->
 * {@link SportsDataIoBettingSplitRowDto}[], the exact offline shape the WU2
 * normalizer ({@link normalizeSportsDataIoBettingSplits}) already consumes.
 *
 * This is a strict boundary translator, not a second normalizer. It:
 *   - validates the verified nested shape (GameBettingSplit -> BettingMarketSplits[]
 *     -> BettingSplits[]);
 *   - keeps Full Game markets only, skipping player props and non-full-game periods;
 *   - maps bet types Spread / Moneyline / Total Points and outcomes Home / Away /
 *     Over / Under;
 *   - emits `PercentageUnit: "percent"` (SportsDataIO splits are integer 0-100);
 *   - emits `Sportsbook: null`, `Line: null`, `Price: null` — this feed carries
 *     split percentages only, never a line or price, and must not fabricate one;
 *   - converts the Eastern `Created` / `LastSeen` / game `Date` timestamps to UTC
 *     via {@link easternLocalToUtcIso}, failing the affected row closed on a
 *     malformed timestamp.
 *
 * Verified against the SportsDataIO NFL v3 Odds OpenAPI (`GameBettingSplit`,
 * `BettingMarketSplit`, `BettingSplit` schemas, retrieved 2026-08-30):
 *   GameBettingSplit: ScoreId, Season, SeasonType, Week, Date, AwayTeam, HomeTeam,
 *     BettingMarketSplits[]
 *   BettingMarketSplit: BettingBetType ("Total Points"|"Moneyline"|"Spread"|...),
 *     BettingMarketType ("Player Prop"|"Game Prop"|...), BettingPeriodType
 *     ("Full Game"|"1st Period"|...), PlayerID, BettingSplits[]
 *   BettingSplit: BettingOutcomeType ("Home"|"Away"|"Under"|"Over"),
 *     BetPercentage (int|null), MoneyPercentage (int|null), Created (US Eastern),
 *     LastSeen (US Eastern)
 *
 * No CFB fixture or route was verifiable; a CFB payload is accepted structurally
 * (SportsDataIO documents one cross-sport betting model) but is untested here and
 * the collector does not yet request CFB splits.
 */

import { z } from "zod";
import {
  EasternTimeConversionError,
  easternLocalToUtcIso,
} from "../timezone/easternToUtc";
import type { BettingLeague } from "../bettingSplitsTypes";
import type { SportsDataIoBettingSplitRowDto } from "./sportsDataIoBettingSplits";

export class SportsDataIoWireDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportsDataIoWireDecodeError";
  }
}

export type SportsDataIoWireSkipCode =
  | "NOT_FULL_GAME"
  | "PLAYER_PROP"
  | "UNSUPPORTED_BET_TYPE"
  | "UNSUPPORTED_OUTCOME"
  | "MALFORMED_TIMESTAMP";

export type SportsDataIoWireSkip = {
  code: SportsDataIoWireSkipCode;
  message: string;
  betType: string | null;
  periodType: string | null;
  outcomeType: string | null;
};

export type SportsDataIoWireDecodeResult = {
  rows: SportsDataIoBettingSplitRowDto[];
  skipped: SportsDataIoWireSkip[];
};

const bettingSplitSchema = z
  .object({
    BettingOutcomeType: z.string().nullable().optional(),
    BetPercentage: z.number().nullable().optional(),
    MoneyPercentage: z.number().nullable().optional(),
    Created: z.string().nullable().optional(),
    LastSeen: z.string().nullable().optional(),
  })
  .passthrough();

const bettingMarketSplitSchema = z
  .object({
    BettingBetType: z.string().nullable().optional(),
    BettingMarketType: z.string().nullable().optional(),
    BettingPeriodType: z.string().nullable().optional(),
    PlayerID: z.number().nullable().optional(),
    PlayerName: z.string().nullable().optional(),
    BettingSplits: z.array(bettingSplitSchema).nullable().optional(),
  })
  .passthrough();

const gameBettingSplitSchema = z
  .object({
    ScoreId: z.number().int().nullable().optional(),
    ScoreID: z.number().int().nullable().optional(),
    Season: z.number().int().nullable().optional(),
    Week: z.number().int().nullable().optional(),
    Date: z.string().nullable().optional(),
    AwayTeam: z.string().nullable().optional(),
    HomeTeam: z.string().nullable().optional(),
    BettingMarketSplits: z.array(bettingMarketSplitSchema).nullable().optional(),
  })
  .passthrough();

const BET_TYPE_MAP: Readonly<Record<string, "Spread" | "Total" | "Moneyline">> = {
  spread: "Spread",
  pointspread: "Spread",
  moneyline: "Moneyline",
  totalpoints: "Total",
  total: "Total",
};

const OUTCOME_MAP: Readonly<Record<string, "Home" | "Away" | "Over" | "Under">> = {
  home: "Home",
  away: "Away",
  over: "Over",
  under: "Under",
};

function token(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function easternToUtcOrNull(value: string | null): string | null | undefined {
  // undefined => malformed (caller fails the row closed); null => genuinely absent.
  if (value === null) return null;
  try {
    return easternLocalToUtcIso(value);
  } catch (error) {
    if (error instanceof EasternTimeConversionError) return undefined;
    throw error;
  }
}

function isPlayerProp(market: z.infer<typeof bettingMarketSplitSchema>): boolean {
  if (market.PlayerID != null) return true;
  if (trimToNull(market.PlayerName) !== null) return true;
  return token(market.BettingMarketType) === "playerprop";
}

/**
 * @param league  Which JKB league this payload was requested for. Written onto
 *   every emitted row's `League` field so the WU2 normalizer can league-gate.
 */
export function decodeSportsDataIoBettingSplitsWire(
  payload: unknown,
  options: { league: BettingLeague },
): SportsDataIoWireDecodeResult {
  const parsed = gameBettingSplitSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SportsDataIoWireDecodeError(
      `GameBettingSplit payload failed validation: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
        .join("; ")}.`,
    );
  }
  const game = parsed.data;
  const scoreId = game.ScoreId ?? game.ScoreID ?? null;
  if (scoreId === null) {
    throw new SportsDataIoWireDecodeError(
      "GameBettingSplit payload is missing ScoreId / ScoreID.",
    );
  }

  const leagueLabel = options.league === "nfl" ? "NFL" : "NCAA Football";
  const kickoff = easternToUtcOrNull(trimToNull(game.Date));
  const kickoffUtc = kickoff === undefined ? null : kickoff;

  const rows: SportsDataIoBettingSplitRowDto[] = [];
  const skipped: SportsDataIoWireSkip[] = [];
  const markets = game.BettingMarketSplits ?? [];

  for (const market of markets) {
    const betType = trimToNull(market.BettingBetType);
    const periodType = trimToNull(market.BettingPeriodType);

    if (token(periodType) !== "fullgame") {
      skipped.push({
        code: "NOT_FULL_GAME",
        message: `Skipped non-full-game market period ${JSON.stringify(periodType)}.`,
        betType,
        periodType,
        outcomeType: null,
      });
      continue;
    }
    if (isPlayerProp(market)) {
      skipped.push({
        code: "PLAYER_PROP",
        message: "Skipped player-prop market.",
        betType,
        periodType,
        outcomeType: null,
      });
      continue;
    }

    const mappedMarket = BET_TYPE_MAP[token(betType)];
    if (!mappedMarket) {
      skipped.push({
        code: "UNSUPPORTED_BET_TYPE",
        message: `Skipped unsupported bet type ${JSON.stringify(betType)}.`,
        betType,
        periodType,
        outcomeType: null,
      });
      continue;
    }

    for (const split of market.BettingSplits ?? []) {
      const outcomeType = trimToNull(split.BettingOutcomeType);
      const mappedOutcome = OUTCOME_MAP[token(outcomeType)];
      if (!mappedOutcome) {
        skipped.push({
          code: "UNSUPPORTED_OUTCOME",
          message: `Skipped unsupported outcome ${JSON.stringify(outcomeType)}.`,
          betType,
          periodType,
          outcomeType,
        });
        continue;
      }

      const created = easternToUtcOrNull(trimToNull(split.Created));
      const lastSeen = easternToUtcOrNull(trimToNull(split.LastSeen));
      if (created === undefined || lastSeen === undefined) {
        skipped.push({
          code: "MALFORMED_TIMESTAMP",
          message:
            "Skipped split row: Created/LastSeen is not a valid US Eastern timestamp.",
          betType,
          periodType,
          outcomeType,
        });
        continue;
      }

      rows.push({
        League: leagueLabel,
        Season: game.Season ?? 0,
        Week: game.Week ?? null,
        GameId: String(scoreId),
        AwayTeamId: trimToNull(game.AwayTeam),
        AwayTeamName: null,
        HomeTeamId: trimToNull(game.HomeTeam),
        HomeTeamName: null,
        KickoffUtc: kickoffUtc,
        Sportsbook: null,
        MarketType: mappedMarket,
        OutcomeType: mappedOutcome,
        BetPercentage: split.BetPercentage ?? null,
        MoneyPercentage: split.MoneyPercentage ?? null,
        PercentageUnit: "percent",
        SpreadLineConvention: mappedMarket === "Spread" ? "team-relative" : undefined,
        Line: null,
        Price: null,
        Created: created,
        LastSeen: lastSeen,
      });
    }
  }

  return { rows, skipped };
}

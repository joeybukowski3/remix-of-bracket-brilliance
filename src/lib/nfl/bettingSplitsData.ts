import { z } from "zod";

export const NFL_DK_SPLITS_PATH = "/data/nfl/betting-splits/current.json";
export const NFL_DK_SPLITS_SCHEMA_VERSION = "nfl-dk-betting-splits-v1";

const timestamp = z.string().datetime({ offset: true });
const percent = z.number().int().min(0).max(100);
const side = z.object({
  side: z.enum(["away", "home", "over", "under"]),
  team: z.string().optional(),
  line: z.number().finite().nullable(),
  odds: z.number().int().refine((value) => Math.abs(value) >= 100 && Math.abs(value) <= 9999),
  handlePct: percent,
  betsPct: percent,
  capturedAt: timestamp,
}).strict();
const market = z.array(side).length(2);
const game = z.object({
  gameId: z.string().min(1),
  season: z.number().int(),
  seasonType: z.literal("REG"),
  week: z.number().int().positive(),
  kickoffUtc: timestamp,
  away: z.string().min(2),
  home: z.string().min(2),
  markets: z.object({ spread: market, moneyline: market, total: market }).strict(),
}).strict().superRefine((value, context) => {
  if (value.away === value.home) context.addIssue({ code: z.ZodIssueCode.custom, message: "Same away/home team" });
  for (const name of ["spread", "moneyline", "total"] as const) {
    const sides = value.markets[name];
    if (sides.length !== 2) continue;
    const expected = name === "total" ? ["over", "under"] : ["away", "home"];
    if (!expected.every((label) => sides.some((entry) => entry.side === label))) context.addIssue({ code: z.ZodIssueCode.custom, message: `Incomplete ${name}` });
    for (const entry of sides) {
      if (name === "moneyline" ? entry.line !== null : entry.line === null || (name === "total" && entry.line < 0)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid ${name} line` });
      if (name === "total" ? entry.team !== undefined : entry.team !== (entry.side === "away" ? value.away : value.home)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid ${name} team` });
    }
    for (const field of ["handlePct", "betsPct"] as const) {
      const sum = sides[0][field] + sides[1][field];
      if (sum < 99 || sum > 101) context.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid ${name} ${field} sum` });
    }
  }
});

export const nflDkBettingSplitsSchema = z.object({
  schemaVersion: z.literal(NFL_DK_SPLITS_SCHEMA_VERSION),
  _meta: z.object({
    generatedAt: timestamp,
    sourceCapturedAt: timestamp,
    captureEndAt: timestamp,
    season: z.number().int(),
    week: z.number().int().positive(),
    source: z.literal("DraftKings Network / DraftKings Sportsbook"),
    sourceUrls: z.object({ spread: z.string().url(), moneyline: z.string().url(), total: z.string().url() }).strict(),
    diagnostics: z.object({
      pagesFetched: z.number().int(), rowsSeen: z.number().int(), sidesSeen: z.number().int(),
      matchedGames: z.number().int(), unmatchedRows: z.number().int(), duplicateRows: z.number().int(),
      missingMarkets: z.number().int(), adjacentWeekRows: z.number().int(), malformedRows: z.number().int(),
      adjacentWeekGames: z.number().int().nonnegative(), selectedWeekGamesSeen: z.number().int().nonnegative(),
      canonicalWeekGames: z.number().int().nonnegative(), alreadyStartedGames: z.number().int().nonnegative(),
      eligiblePregameGames: z.number().int().nonnegative(), matchedEligibleGames: z.number().int().nonnegative(),
      missingEligibleGames: z.number().int().nonnegative(), missingEligibleGameIds: z.array(z.string().min(1)),
      issues: z.array(z.record(z.unknown())),
    }).strict(),
  }).strict(),
  games: z.array(game).min(1),
}).strict().superRefine((value, context) => {
  if (Date.parse(value._meta.sourceCapturedAt) > Date.parse(value._meta.captureEndAt) || Date.parse(value._meta.captureEndAt) > Date.parse(value._meta.generatedAt)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid capture interval" });
  const diagnostics = value._meta.diagnostics;
  if (diagnostics.canonicalWeekGames !== diagnostics.alreadyStartedGames + diagnostics.eligiblePregameGames
    || diagnostics.eligiblePregameGames !== diagnostics.matchedEligibleGames + diagnostics.missingEligibleGames
    || diagnostics.matchedEligibleGames !== value.games.length
    || diagnostics.missingEligibleGames !== diagnostics.missingEligibleGameIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid coverage diagnostics" });
  const ids = new Set<string>();
  for (const row of value.games) {
    if (ids.has(row.gameId)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate game ${row.gameId}` });
    ids.add(row.gameId);
    if (row.season !== value._meta.season || row.week !== value._meta.week) context.addIssue({ code: z.ZodIssueCode.custom, message: `Wrong slate ${row.gameId}` });
    if (Date.parse(row.kickoffUtc) <= Date.parse(value._meta.sourceCapturedAt)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Already-started game ${row.gameId}` });
  }
});

export type NflDkBettingSplitsArtifact = z.infer<typeof nflDkBettingSplitsSchema>;
export type NflDkBettingSplitsGame = NflDkBettingSplitsArtifact["games"][number];
export type NflDkBettingSplitsSide = NflDkBettingSplitsGame["markets"]["spread"][number];

/** Three daytime refreshes leave at most five scheduled hours between captures. */
export const NFL_DK_SPLITS_FRESH_MAX_MS = 6 * 60 * 60 * 1000;
export type NflDkSplitsFreshness = "fresh" | "stale" | "unavailable";
export type NflDkSplitsAvailability = {
  freshness: NflDkSplitsFreshness;
  reason: "invalid_artifact" | "future_timestamp" | "week_mismatch" | "age" | null;
  artifact: NflDkBettingSplitsArtifact | null;
  sourceCapturedAt: string | null;
  generatedAt: string | null;
  ageMs: number | null;
  source: string | null;
  season: number | null;
  week: number | null;
};

export function assessNflDkSplitsAvailability(raw: unknown, expected: { season: number; week: number }, nowMs = Date.now()): NflDkSplitsAvailability {
  const parsed = nflDkBettingSplitsSchema.safeParse(raw);
  const unavailable = (reason: NflDkSplitsAvailability["reason"]): NflDkSplitsAvailability => ({ freshness: "unavailable", reason, artifact: null, sourceCapturedAt: null, generatedAt: null, ageMs: null, source: null, season: null, week: null });
  if (!parsed.success || !Number.isFinite(nowMs)) return unavailable("invalid_artifact");
  const artifact = parsed.data;
  const { sourceCapturedAt, generatedAt, source, season, week } = artifact._meta;
  const rawAgeMs = nowMs - Date.parse(sourceCapturedAt);
  if (rawAgeMs < -5 * 60 * 1000 || Date.parse(generatedAt) > nowMs + 5 * 60 * 1000) return unavailable("future_timestamp");
  const ageMs = Math.max(0, rawAgeMs);
  const reason = season !== expected.season || week !== expected.week ? "week_mismatch"
    : ageMs > NFL_DK_SPLITS_FRESH_MAX_MS ? "age" : null;
  return { freshness: reason ? "stale" : "fresh", reason, artifact, sourceCapturedAt, generatedAt, ageMs, source, season, week };
}

export function moneyGap(side: Pick<NflDkBettingSplitsSide, "handlePct" | "betsPct">): number {
  return side.handlePct - side.betsPct;
}

export function publicGap(side: Pick<NflDkBettingSplitsSide, "handlePct" | "betsPct">): number {
  return side.betsPct - side.handlePct;
}

export function bettingSplitsForGame(artifact: NflDkBettingSplitsArtifact | null, gameId: string): NflDkBettingSplitsGame | null {
  return artifact?.games.find((row) => row.gameId === gameId) ?? null;
}

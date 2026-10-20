/**
 * Versioned, content-hashed records for the NBA research pipeline.
 *
 * Records are append-only facts. A pregame snapshot is what we saw before
 * tipoff and is never edited; results and evaluations are new revisions that
 * point back at the snapshot they judge. Parsing a record is full validation:
 * shape, cross-field rules and the content hash.
 */
import { z } from "zod";
import { sha256Json } from "../canonicalJson";
import { canonicalTeamCode } from "../canonical";
import { DATA_USES } from "../sources/types";

export const PIPELINE_SCHEMA = {
  snapshot: "nba-pregame-snapshot-v1",
  result: "nba-final-result-v1",
  evaluation: "nba-prop-evaluation-v1",
  attempt: "nba-capture-attempt-v1",
  run: "nba-job-run-v1",
  game: "nba-pipeline-game-v1",
  importBatch: "nba-line-import-batch-v1",
} as const;

export const MARKETS = ["pts", "reb", "ast"] as const;
export type Market = (typeof MARKETS)[number];
/** Provider market keys, for adapters. */
export const PROVIDER_MARKET_KEYS: Readonly<Record<Market, string>> = { pts: "player_points", reb: "player_rebounds", ast: "player_assists" };

export const ODDS_SOURCE_IDS = ["the-odds-api", "parlayapi", "manual-import", "synthetic-odds"] as const;
export type OddsSourceId = (typeof ODDS_SOURCE_IDS)[number];
export const CAPTURE_METHODS = ["api", "manual-import", "synthetic"] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

/**
 * Absolute bounds on how far from tipoff a stored pregame line may be, enforced
 * by the record itself so no path (job, manual import, SQL) can bypass them.
 * "in_window" is 120-240 minutes before tipoff, "late" is 45-120. A line
 * outside 45-240 minutes is not stored. (The job additionally waits until a
 * game is within its preferred 180 minutes; see captureWindow.ts.)
 */
export const CAPTURE_BOUNDS = Object.freeze({ earliestMinutes: 240, inWindowMinMinutes: 120, floorMinutes: 45 });
export const WINDOW_STATUSES = ["in_window", "late"] as const;
export const windowForMinutes = (minutesToTipoff: number): (typeof WINDOW_STATUSES)[number] => (minutesToTipoff >= CAPTURE_BOUNDS.inWindowMinMinutes ? "in_window" : "late");
export const PARTICIPATION = ["played", "dnp_confirmed", "inactive_confirmed", "unverified_absent"] as const;
export type Participation = (typeof PARTICIPATION)[number];
export const GAME_STATUSES = ["scheduled", "in_progress", "final", "suspended", "postponed", "cancelled"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];
export const SETTLEMENTS = ["over", "under", "push", "void", "pending"] as const;
export type Settlement = (typeof SETTLEMENTS)[number];

const MINUTE_MS = 60_000;
const isoUtc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, "expected an ISO UTC instant ending in Z").refine((s) => !Number.isNaN(Date.parse(s)), "invalid instant");
const sha = z.string().regex(/^[0-9a-f]{64}$/, "expected a sha256 hex digest");
const teamCode = z.string().refine((s) => canonicalTeamCode(s) === s, "not a canonical team code");
const gameKey = z.string().regex(/^\d{4}-\d{2}-\d{2}\|([A-Z]{3}@[A-Z]{3}|[A-Z]{3}-[A-Z]{3})$/, "not a canonical game key");
const americanPrice = z.number().int().refine((n) => n <= -100 || n >= 100, "American price must be at most -100 or at least +100");
const statLine = z.number().min(0).max(200).refine((n) => Number.isInteger(n * 2), "line must be a multiple of 0.5");
const market = z.enum(MARKETS);
const dataUse = z.enum(DATA_USES);

/** Pull the content hash and derived id out of a record so they can be recomputed. */
function contentHash(record: Record<string, unknown>, ...omit: string[]): string {
  const body = Object.fromEntries(Object.entries(record).filter(([k]) => !omit.includes(k)));
  return sha256Json(body);
}

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ (jr|sr|ii|iii|iv)$/, "");
}

export interface PlayerRef {
  canonicalPlayerId: string | null;
  sourcePlayerName: string;
  team: string | null;
}

/** Same player on a snapshot and on a result, whichever id space the source used. */
export const playerKeyOf = (p: PlayerRef): string => p.canonicalPlayerId ?? `name:${normalizePlayerName(p.sourcePlayerName)}|${p.team ?? "?"}`;

export const marketKeyOf = (gameKeyValue: string, playerKey: string, m: Market, sportsbook: string): string => `${gameKeyValue}|${playerKey}|${m}|${sportsbook}`;

const permissions = z.object({
  permittedUses: z.array(dataUse),
  licenseBasis: z.string().min(1),
  licenseReviewedOn: z.string().min(1),
  /** Manual imports: who attested these rights and what the data came from. */
  attestation: z
    .object({
      attestedBy: z.string().min(1),
      attestedOn: z.string().min(1),
      origin: z.string().min(1),
      /** Imported after tipoff: the capture time cannot be verified, so the line is never treated as authentic. */
      backfilled: z.boolean(),
    })
    .nullable(),
});

const playerRef = z.object({ canonicalPlayerId: z.string().min(1).nullable(), sourcePlayerName: z.string().min(1), sourcePlayerId: z.string().min(1).nullable(), team: teamCode.nullable() });

const gameRef = z.object({
  canonicalGameKey: gameKey,
  sourceEventId: z.string().min(1).nullable(),
  tipoffUtc: isoUtc,
  awayTeam: teamCode.nullable(),
  homeTeam: teamCode.nullable(),
  neutralSite: z.boolean(),
});

export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(PIPELINE_SCHEMA.snapshot),
    snapshotId: z.string(),
    marketKey: z.string().min(1),
    /** Hash of (marketKey, line, prices): equal fingerprints are an unchanged market. */
    fingerprint: sha,
    game: gameRef,
    player: playerRef,
    market,
    source: z.object({ sourceId: z.enum(ODDS_SOURCE_IDS), method: z.enum(CAPTURE_METHODS), sportsbook: z.string().min(1), sourceMarketKey: z.string().min(1), playerIdentityAmbiguous: z.boolean().optional(), rawProviderRef: z.object({ eventId: z.string().min(1), bookmakerKey: z.string().min(1), marketKey: z.string().min(1), overOutcomeIndex: z.number().int().min(0), underOutcomeIndex: z.number().int().min(0) }).optional() }),
    line: statLine,
    overPrice: americanPrice,
    underPrice: americanPrice,
    timing: z.object({
      sourceLastUpdateUtc: isoUtc.nullable(),
      capturedAtUtc: isoUtc,
      minutesToTipoff: z.number(),
      window: z.enum(WINDOW_STATUSES),
    }),
    /**
     * fresh/stale come from a provider update time, or (manual imports only) from the importer observing the line
     * at capture. A line whose age cannot be established is "unknown" and is never used as an authentic line.
     */
    freshness: z.object({
      status: z.enum(["fresh", "stale", "unknown"]),
      basis: z.enum(["provider_last_update", "observed_at_capture", "none"]),
      ageMinutes: z.number().min(0).nullable(),
      maxAgeMinutes: z.number().positive(),
    }),
    projection: z.object({
      value: z.number().min(0).nullable(),
      minutes: z.number().min(0).max(60).nullable(),
      modelVersion: z.string().min(1).nullable(),
      /** Latest information the projection used; may not be later than the capture. */
      inputCutoffUtc: isoUtc.nullable(),
      unavailableReason: z.string().min(1).nullable(),
    }),
    probabilities: z.object({ pOver: z.number().min(0).max(1), pUnder: z.number().min(0).max(1), evOver: z.number(), evUnder: z.number(), calibrationVersion: z.string().min(1) }).nullable(),
    permissions,
    provenance: z.object({ runId: z.string().min(1).nullable(), importBatchId: z.string().min(1).nullable(), creditsCharged: z.number().min(0).nullable() }),
    contentSha256: sha,
  })
  .superRefine((s, ctx) => {
    const bad = (path: string[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const tip = Date.parse(s.game.tipoffUtc);
    const captured = Date.parse(s.timing.capturedAtUtc);
    if (captured >= tip) bad(["timing", "capturedAtUtc"], "a pregame snapshot must be captured before tipoff");
    if (s.timing.minutesToTipoff < CAPTURE_BOUNDS.floorMinutes) bad(["timing", "minutesToTipoff"], `a line closer than ${CAPTURE_BOUNDS.floorMinutes} minutes to tipoff is never stored`);
    if (s.timing.minutesToTipoff > CAPTURE_BOUNDS.earliestMinutes) bad(["timing", "minutesToTipoff"], `a line more than ${CAPTURE_BOUNDS.earliestMinutes} minutes before tipoff is not a pregame capture`);
    if (s.timing.window !== windowForMinutes(s.timing.minutesToTipoff)) bad(["timing", "window"], "window does not match minutes to tipoff");
    if (Math.abs((tip - captured) / MINUTE_MS - s.timing.minutesToTipoff) > 0.01) bad(["timing", "minutesToTipoff"], "does not match tipoff minus capture time");
    if (s.timing.sourceLastUpdateUtc && Date.parse(s.timing.sourceLastUpdateUtc) > captured) bad(["timing", "sourceLastUpdateUtc"], "source update is after the capture");
    if ((s.source.method === "api") !== (s.source.sourceId === "the-odds-api" || s.source.sourceId === "parlayapi")) bad(["source", "method"], "method does not match the source");
    if (s.source.method === "manual-import" && (s.source.sourceId !== "manual-import" || !s.permissions.attestation)) bad(["permissions", "attestation"], "manual imports need an attestation");
    if (s.permissions.permittedUses.includes("raw-redistribution") && s.source.method !== "synthetic") bad(["permissions", "permittedUses"], "raw redistribution is never granted to captured lines");
    if (s.projection.inputCutoffUtc && Date.parse(s.projection.inputCutoffUtc) > captured) bad(["projection", "inputCutoffUtc"], "projection inputs postdate the capture");
    if (s.projection.value === null && !s.projection.unavailableReason) bad(["projection", "unavailableReason"], "a missing projection needs a reason");
    if (s.projection.value !== null && (s.projection.modelVersion === null || s.projection.inputCutoffUtc === null)) bad(["projection"], "a projection needs its model version and input cutoff");
    if (s.freshness.status === "stale" && s.freshness.ageMinutes === null) bad(["freshness"], "a stale line needs its age");
    if ((s.freshness.status === "unknown") !== (s.freshness.basis === "none")) bad(["freshness", "basis"], "unknown freshness exactly when there is no basis");
    if (s.freshness.basis === "provider_last_update" && s.timing.sourceLastUpdateUtc === null) bad(["freshness", "basis"], "a provider basis needs the provider update time");
    if (s.freshness.basis === "observed_at_capture" && s.source.method !== "manual-import") bad(["freshness", "basis"], "only a manual import may be fresh by observation");
    if (s.freshness.ageMinutes !== null && s.timing.sourceLastUpdateUtc && Math.abs((captured - Date.parse(s.timing.sourceLastUpdateUtc)) / MINUTE_MS - s.freshness.ageMinutes) > 0.01) bad(["freshness", "ageMinutes"], "does not match the source update time");
    if (s.probabilities && Math.abs(s.probabilities.pOver + s.probabilities.pUnder - 1) > 1e-6) bad(["probabilities"], "pOver + pUnder must be 1");
    const key = marketKeyOf(s.game.canonicalGameKey, playerKeyOf(s.player), s.market, s.source.sportsbook);
    if (s.marketKey !== key) bad(["marketKey"], "does not match game, player, market and sportsbook");
    if (s.fingerprint !== sha256Json({ marketKey: s.marketKey, line: s.line, overPrice: s.overPrice, underPrice: s.underPrice })) bad(["fingerprint"], "does not match the market");
    const hash = contentHash(s, "contentSha256", "snapshotId");
    if (s.contentSha256 !== hash) bad(["contentSha256"], "content hash mismatch");
    if (s.snapshotId !== `snap_${hash.slice(0, 32)}`) bad(["snapshotId"], "id does not match the content hash");
  });
export type NbaPregameSnapshot = z.infer<typeof snapshotSchema>;

const stats = z.object({ minutes: z.number().min(0).max(80), pts: z.number().int().min(0), reb: z.number().int().min(0), ast: z.number().int().min(0) });

export const resultSchema = z
  .object({
    schemaVersion: z.literal(PIPELINE_SCHEMA.result),
    resultId: z.string(),
    game: z.object({ canonicalGameKey: gameKey, tipoffUtc: isoUtc, status: z.enum(GAME_STATUSES), periods: z.number().int().min(4).max(12).nullable(), finalizedAtUtc: isoUtc.nullable() }),
    player: playerRef,
    /** played = a box-score line exists; absence from a box score is `unverified_absent`, never a DNP. */
    participation: z.enum(PARTICIPATION),
    stats: stats.nullable(),
    recordedAtUtc: isoUtc,
    revision: z.number().int().min(1),
    supersedesRevision: z.number().int().min(1).nullable(),
    correctionReason: z.string().min(1).nullable(),
    provider: z.object({ sourceId: z.string().min(1), method: z.enum(CAPTURE_METHODS) }),
    evidence: z.object({ sourceSnapshotId: z.string().min(1).nullable(), importBatchId: z.string().min(1).nullable(), rowRef: z.string().min(1).nullable() }),
    permissions,
    contentSha256: sha,
  })
  .superRefine((r, ctx) => {
    const bad = (path: string[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if ((r.participation === "played") !== (r.stats !== null)) bad(["stats"], "stats exist exactly when the player played");
    if (r.participation === "played" && r.stats !== null && r.stats.minutes <= 0) bad(["stats", "minutes"], "a zero-minute row is not a played line: classify it as a confirmed DNP or leave it unverified");
    if (r.participation === "played" && r.game.status !== "final") bad(["participation"], "a played line is only final when the game is final");
    if (r.game.status === "final" && r.game.finalizedAtUtc === null) bad(["game", "finalizedAtUtc"], "a final game needs its finalization time");
    if (r.game.status !== "final" && r.participation !== "unverified_absent" && r.participation !== "played") bad(["participation"], "confirmed non-participation needs a final game");
    if ((r.revision === 1) !== (r.supersedesRevision === null)) bad(["supersedesRevision"], "revision 1 supersedes nothing; later revisions supersede the previous one");
    if (r.supersedesRevision !== null && r.supersedesRevision !== r.revision - 1) bad(["supersedesRevision"], "must be the immediately preceding revision");
    if (r.revision > 1 && !r.correctionReason) bad(["correctionReason"], "a correction needs a reason");
    if (!r.evidence.sourceSnapshotId && !r.evidence.importBatchId) bad(["evidence"], "a result needs an evidence reference");
    const hash = contentHash(r, "contentSha256", "resultId", "recordedAtUtc");
    if (r.contentSha256 !== hash) bad(["contentSha256"], "content hash mismatch");
    if (r.resultId !== `res_${sha256Json({ k: `${r.game.canonicalGameKey}|${playerKeyOf(r.player)}`, revision: r.revision }).slice(0, 32)}`) bad(["resultId"], "id does not match game, player and revision");
  });
export type NbaFinalResult = z.infer<typeof resultSchema>;

export const evaluationSchema = z
  .object({
    schemaVersion: z.literal(PIPELINE_SCHEMA.evaluation),
    evaluationId: z.string(),
    /** Immutable link to the pregame snapshot judged, with the hash it had. */
    snapshotId: z.string().min(1),
    snapshotSha256: sha,
    revision: z.number().int().min(1),
    supersedesRevision: z.number().int().min(1).nullable(),
    resultId: z.string().nullable(),
    resultRevision: z.number().int().min(1).nullable(),
    /** Rights carried by the result record this evaluation used (empty when there was none). */
    resultPermittedUses: z.array(dataUse),
    market,
    line: statLine,
    settlement: z.enum(SETTLEMENTS),
    reason: z.string().min(1).nullable(),
    actual: z.number().min(0).nullable(),
    margin: z.number().nullable(),
    errors: z.object({ projection: z.number().nullable(), minutes: z.number().nullable() }),
    evaluatedAtUtc: isoUtc,
    contentSha256: sha,
  })
  .superRefine((e, ctx) => {
    const bad = (path: string[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const decided = e.settlement === "over" || e.settlement === "under" || e.settlement === "push";
    if (decided !== (e.actual !== null)) bad(["actual"], "an actual value exists exactly when the prop was decided");
    if (decided && e.margin !== e.actual! - e.line) bad(["margin"], "margin must be actual minus line");
    if (e.settlement === "over" && !(e.actual! > e.line)) bad(["settlement"], "over requires actual above the line");
    if (e.settlement === "under" && !(e.actual! < e.line)) bad(["settlement"], "under requires actual below the line");
    if (e.settlement === "push" && e.actual !== e.line) bad(["settlement"], "push requires actual equal to the line");
    if ((e.settlement === "void" || e.settlement === "pending") && !e.reason) bad(["reason"], "void and pending settlements need a reason");
    if ((e.revision === 1) !== (e.supersedesRevision === null)) bad(["supersedesRevision"], "revision 1 supersedes nothing");
    if (e.supersedesRevision !== null && e.supersedesRevision !== e.revision - 1) bad(["supersedesRevision"], "must be the immediately preceding revision");
    const hash = contentHash(e, "contentSha256", "evaluationId", "evaluatedAtUtc");
    if (e.contentSha256 !== hash) bad(["contentSha256"], "content hash mismatch");
    if (e.evaluationId !== `eval_${sha256Json({ s: e.snapshotId, r: e.revision }).slice(0, 32)}`) bad(["evaluationId"], "id does not match snapshot and revision");
  });
export type NbaPropEvaluation = z.infer<typeof evaluationSchema>;

export const ATTEMPT_OUTCOMES = [
  "captured",
  "deduplicated",
  "skipped_too_early",
  "missed_window",
  "no_market",
  "stale_only",
  "blocked",
  "budget_exhausted",
  "postponed",
  "error",
  "result_fetched",
  "result_unavailable",
  "result_error",
] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/** Audit row for every game a capture run considered, including the ones that produced no line. */
export const attemptSchema = z.object({
  schemaVersion: z.literal(PIPELINE_SCHEMA.attempt),
  attemptId: z.string().min(1),
  runId: z.string().min(1),
  canonicalGameKey: gameKey,
  outcome: z.enum(ATTEMPT_OUTCOMES),
  reason: z.string().nullable(),
  minutesToTipoff: z.number(),
  creditsCharged: z.number().min(0),
  linesStored: z.number().int().min(0),
  atUtc: isoUtc,
});
export type NbaCaptureAttempt = z.infer<typeof attemptSchema>;

export const runSchema = z.object({
  schemaVersion: z.literal(PIPELINE_SCHEMA.run),
  runId: z.string().min(1),
  job: z.enum(["pregame-capture", "postgame-settlement"]),
  startedAtUtc: isoUtc,
  finishedAtUtc: isoUtc,
  outcome: z.enum(["completed", "locked", "blocked", "failed"]),
  reason: z.string().nullable(),
  counts: z.record(z.string(), z.number()),
});
export type NbaJobRun = z.infer<typeof runSchema>;

/** Schedule cache row: not a research record, replaced as the schedule changes. */
export const gameSchema = z.object({
  schemaVersion: z.literal(PIPELINE_SCHEMA.game),
  canonicalGameKey: gameKey,
  sourceEventId: z.string().min(1).nullable(),
  tipoffUtc: isoUtc,
  awayTeam: teamCode.nullable(),
  homeTeam: teamCode.nullable(),
  neutralSite: z.boolean(),
  status: z.enum(GAME_STATUSES),
  observedAtUtc: isoUtc,
});
export type NbaPipelineGame = z.infer<typeof gameSchema>;

/**
 * What a result SAYS, for deciding whether a new record is a change. The
 * finalization timestamp is excluded (a source that omits it must not create a
 * revision on every look), as are evidence and recording time.
 */
export const resultSubstance = (r: Pick<NbaFinalResult, "game" | "participation" | "stats">): string =>
  sha256Json({ game: { canonicalGameKey: r.game.canonicalGameKey, tipoffUtc: r.game.tipoffUtc, status: r.game.status, periods: r.game.periods }, participation: r.participation, stats: r.stats });

export class PipelineValidationError extends Error {
  constructor(readonly kind: string, readonly issues: readonly string[]) {
    super(`Invalid ${kind}: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ""}`);
    this.name = "PipelineValidationError";
  }
}

function parseWith<T>(schema: z.ZodType<T>, kind: string, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new PipelineValidationError(kind, parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  return parsed.data;
}

export const parseSnapshot = (input: unknown): NbaPregameSnapshot => parseWith(snapshotSchema, "pregame snapshot", input);
export const parseResult = (input: unknown): NbaFinalResult => parseWith(resultSchema, "final result", input);
export const parseEvaluation = (input: unknown): NbaPropEvaluation => parseWith(evaluationSchema, "prop evaluation", input);
export const parseAttempt = (input: unknown): NbaCaptureAttempt => parseWith(attemptSchema, "capture attempt", input);
export const parseRun = (input: unknown): NbaJobRun => parseWith(runSchema, "job run", input);
export const parseGame = (input: unknown): NbaPipelineGame => parseWith(gameSchema, "pipeline game", input);

// ---- Builders: derive ids, keys and hashes, then validate. ----

export interface SnapshotInput {
  game: NbaPregameSnapshot["game"];
  player: NbaPregameSnapshot["player"];
  market: Market;
  source: NbaPregameSnapshot["source"];
  line: number;
  overPrice: number;
  underPrice: number;
  sourceLastUpdateUtc: string | null;
  capturedAtUtc: string;
  maxAgeMinutes: number;
  projection?: Partial<NbaPregameSnapshot["projection"]> | null;
  probabilities?: NbaPregameSnapshot["probabilities"];
  permissions: NbaPregameSnapshot["permissions"];
  provenance: NbaPregameSnapshot["provenance"];
}

function freshnessFor(ageMinutes: number | null, method: CaptureMethod, maxAgeMinutes: number): NbaPregameSnapshot["freshness"] {
  if (ageMinutes !== null) return { status: ageMinutes > maxAgeMinutes ? "stale" : "fresh", basis: "provider_last_update", ageMinutes, maxAgeMinutes };
  if (method === "manual-import") return { status: "fresh", basis: "observed_at_capture", ageMinutes: null, maxAgeMinutes };
  return { status: "unknown", basis: "none", ageMinutes: null, maxAgeMinutes };
}

export function buildSnapshot(input: SnapshotInput): NbaPregameSnapshot {
  const tip = Date.parse(input.game.tipoffUtc);
  const captured = Date.parse(input.capturedAtUtc);
  const ageMinutes = input.sourceLastUpdateUtc ? (captured - Date.parse(input.sourceLastUpdateUtc)) / MINUTE_MS : null;
  const key = marketKeyOf(input.game.canonicalGameKey, playerKeyOf(input.player), input.market, input.source.sportsbook);
  const projection = { value: null, minutes: null, modelVersion: null, inputCutoffUtc: null, unavailableReason: "no projection supplied", ...(input.projection ?? {}) };
  const body = {
    schemaVersion: PIPELINE_SCHEMA.snapshot,
    marketKey: key,
    fingerprint: sha256Json({ marketKey: key, line: input.line, overPrice: input.overPrice, underPrice: input.underPrice }),
    game: input.game,
    player: input.player,
    market: input.market,
    source: input.source,
    line: input.line,
    overPrice: input.overPrice,
    underPrice: input.underPrice,
    timing: { sourceLastUpdateUtc: input.sourceLastUpdateUtc, capturedAtUtc: input.capturedAtUtc, minutesToTipoff: (tip - captured) / MINUTE_MS, window: windowForMinutes((tip - captured) / MINUTE_MS) },
    freshness: freshnessFor(ageMinutes, input.source.method, input.maxAgeMinutes),
    projection,
    probabilities: input.probabilities ?? null,
    permissions: input.permissions,
    provenance: input.provenance,
  };
  const hash = sha256Json(body);
  return parseSnapshot({ ...body, snapshotId: `snap_${hash.slice(0, 32)}`, contentSha256: hash });
}

export interface ResultInput {
  game: NbaFinalResult["game"];
  player: NbaFinalResult["player"];
  participation: Participation;
  stats: NbaFinalResult["stats"];
  recordedAtUtc: string;
  revision: number;
  correctionReason: string | null;
  provider: NbaFinalResult["provider"];
  evidence: NbaFinalResult["evidence"];
  permissions: NbaFinalResult["permissions"];
}

export function buildResult(input: ResultInput): NbaFinalResult {
  const body = {
    schemaVersion: PIPELINE_SCHEMA.result,
    game: input.game,
    player: input.player,
    participation: input.participation,
    stats: input.stats,
    recordedAtUtc: input.recordedAtUtc,
    revision: input.revision,
    supersedesRevision: input.revision === 1 ? null : input.revision - 1,
    correctionReason: input.correctionReason,
    provider: input.provider,
    evidence: input.evidence,
    permissions: input.permissions,
  };
  const hash = contentHash(body, "recordedAtUtc");
  const resultId = `res_${sha256Json({ k: `${input.game.canonicalGameKey}|${playerKeyOf(input.player)}`, revision: input.revision }).slice(0, 32)}`;
  return parseResult({ ...body, resultId, contentSha256: hash });
}

export interface EvaluationInput {
  snapshot: NbaPregameSnapshot;
  revision: number;
  resultId: string | null;
  resultRevision: number | null;
  resultPermittedUses: NbaPropEvaluation["resultPermittedUses"];
  settlement: Settlement;
  reason: string | null;
  actual: number | null;
  errors: NbaPropEvaluation["errors"];
  evaluatedAtUtc: string;
}

export function buildEvaluation(input: EvaluationInput): NbaPropEvaluation {
  const body = {
    schemaVersion: PIPELINE_SCHEMA.evaluation,
    snapshotId: input.snapshot.snapshotId,
    snapshotSha256: input.snapshot.contentSha256,
    revision: input.revision,
    supersedesRevision: input.revision === 1 ? null : input.revision - 1,
    resultId: input.resultId,
    resultRevision: input.resultRevision,
    resultPermittedUses: input.resultPermittedUses,
    market: input.snapshot.market,
    line: input.snapshot.line,
    settlement: input.settlement,
    reason: input.reason,
    actual: input.actual,
    margin: input.actual === null ? null : input.actual - input.snapshot.line,
    errors: input.errors,
    evaluatedAtUtc: input.evaluatedAtUtc,
  };
  const hash = contentHash(body, "evaluatedAtUtc");
  const evaluationId = `eval_${sha256Json({ s: input.snapshot.snapshotId, r: input.revision }).slice(0, 32)}`;
  return parseEvaluation({ ...body, evaluationId, contentSha256: hash });
}

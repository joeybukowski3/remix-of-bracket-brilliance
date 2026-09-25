/**
 * NFL projected total -- SHADOW-ONLY calibration candidate (prospective validation).
 *
 *   shadowTotal = priorSeasonLeagueMean + K * (rawJkbTotal - priorSeasonLeagueMean),   K = 0.8 (frozen)
 *
 * `rawJkbTotal` is the unchanged production `jkb-nfl-total-ridge-v1.0.0` projected game total
 * (home + away expected points), taken from the SAME finalized production prediction rows that the
 * generator archives in the same run, so both numbers are frozen from identical pregame information.
 *
 * This module is a pure library plus a small append-only archive under
 * `data/nfl/shadow-predictions/nfl-total-calibration-k08/`. It:
 *   - never modifies a production prediction, artifact, archive partition or public output;
 *   - is never imported by anything under `src/` (guarded by tests) and nothing under `public/` is written;
 *   - takes no model input from the market: the market total available at generation time is recorded for
 *     later EVALUATION only;
 *   - determines the league mean ONLY from the completed immediately-prior season;
 *   - appends immutably (first observation wins); final totals are attached later as separate outcome events,
 *     never by rewriting a prediction row.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendArchiveEvents,
  canonicalJson,
  contentHash,
  type JsonValue,
  type PredictionSnapshotV1,
} from "./nfl-production-prediction-archive";
import { NFL_TOTAL_MODEL_NAME, NFL_TOTAL_MODEL_VERSION } from "../../src/lib/nfl/props/totals/totalsModelContract";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ------------------------------------------------------------------ frozen identity / constants
export const NFL_TOTAL_SHADOW_MODEL_NAME = "nfl-total-calibration-shadow" as const;
export const NFL_TOTAL_SHADOW_MODEL_VERSION = "jkb-nfl-total-calibration-shadow-k08-2026" as const;
/** Frozen for the 2026 season. There is deliberately NO parameter, CLI flag or environment variable that can change it. */
export const NFL_TOTAL_SHADOW_K = 0.8 as const;
export const NFL_TOTAL_SHADOW_SEASON = 2026 as const;
/** First week whose predictions count as PROSPECTIVE. Weeks 1-2 are retrospective reference only. */
export const NFL_TOTAL_SHADOW_FIRST_PROSPECTIVE_WEEK = 3 as const;
/** No comparative statement is made below this many graded prospective games. */
export const NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES = 100 as const;
export const NFL_TOTAL_SHADOW_ROW_SCHEMA = "jkb-nfl-total-shadow-v1" as const;
export const NFL_TOTAL_SHADOW_OUTCOME_SCHEMA = "jkb-nfl-total-shadow-outcome-v1" as const;
export const NFL_TOTAL_SHADOW_MANIFEST_SCHEMA = "jkb-nfl-total-shadow-manifest-v1" as const;
export const NFL_TOTAL_SHADOW_PIPELINE_VERSION = "nfl-total-calibration-shadow-v1" as const;
export const NFL_TOTAL_SHADOW_FORMULA = "shadowTotal = priorSeasonLeagueMean + 0.8 * (rawJkbTotal - priorSeasonLeagueMean)" as const;

export const DEFAULT_SHADOW_ROOT = join(ROOT, "data", "nfl", "shadow-predictions", "nfl-total-calibration-k08");
const DEFAULT_RESULTS_ROOT = join(ROOT, "public", "data", "nfl");
const DEFAULT_MARKET_HISTORY_ROOT = join(ROOT, "data", "market", "betting-lines", "history", "nfl");
/** Same sportsbook priority the production totals-performance view uses to pick one canonical book (never mixes books). */
export const SHADOW_SPORTSBOOK_PRIORITY = ["draftkings", "fanduel", "betmgm", "caesars"] as const;

export type ShadowCohort = "prospective" | "retrospective";

/** Pure formula. Two arguments only: k cannot be supplied from outside. */
export function computeShadowTotal(rawJkbTotal: number, priorSeasonLeagueMean: number): number {
  return priorSeasonLeagueMean + NFL_TOTAL_SHADOW_K * (rawJkbTotal - priorSeasonLeagueMean);
}

export function cohortFor(season: number, week: number): ShadowCohort {
  return season === NFL_TOTAL_SHADOW_SEASON && week >= NFL_TOTAL_SHADOW_FIRST_PROSPECTIVE_WEEK ? "prospective" : "retrospective";
}

// ------------------------------------------------------------------ prior-season league mean
export type LeagueMeanSource = {
  season: number;
  games_counted: number;
  regular_season_games_expected: number | null;
  sum_total_points: number;
  mean_total_points: number;
  source_path: string;
  source_sha256: string;
};

type ResultsFile = { results: { seasonType: string; final: boolean; homeScore: number | null; awayScore: number | null }[] };

/**
 * Mean regular-season game total (home + away points) of the COMPLETED immediately-prior season.
 * Uses only `public/data/nfl/<season-1>/results.json`; the target season's results are never read.
 * Fails closed if the prior season is incomplete (a REG game without a final score, or fewer finals than scheduled).
 */
export function loadPriorSeasonLeagueMean(targetSeason: number, resultsRoot: string = DEFAULT_RESULTS_ROOT): LeagueMeanSource {
  const season = targetSeason - 1;
  const path = join(resultsRoot, String(season), "results.json");
  if (!existsSync(path)) throw new Error(`Prior-season results missing for league mean: ${path}`);
  const text = readFileSync(path, "utf8");
  const results = (JSON.parse(text) as ResultsFile).results.filter((r) => r.seasonType === "REG");
  const finals = results.filter((r) => r.final === true && r.homeScore != null && r.awayScore != null);
  if (finals.length === 0) throw new Error(`Prior season ${season} has no completed regular-season games`);
  if (finals.length !== results.length) throw new Error(`Prior season ${season} is not complete: ${finals.length} final of ${results.length} regular-season results`);
  let expected: number | null = null;
  const gamesPath = join(resultsRoot, String(season), "games.json");
  if (existsSync(gamesPath)) {
    expected = (JSON.parse(readFileSync(gamesPath, "utf8")) as { games: { seasonType: string }[] }).games.filter((g) => g.seasonType === "REG").length;
    if (finals.length !== expected) throw new Error(`Prior season ${season} is incomplete: ${finals.length} final results vs ${expected} scheduled regular-season games`);
  }
  const sum = finals.reduce((t, r) => t + (r.homeScore as number) + (r.awayScore as number), 0);
  return {
    season,
    games_counted: finals.length,
    regular_season_games_expected: expected,
    sum_total_points: sum,
    mean_total_points: sum / finals.length,
    source_path: `public/data/nfl/${season}/results.json`,
    source_sha256: createHash("sha256").update(text).digest("hex"),
  };
}

// ------------------------------------------------------------------ market total AT GENERATION TIME (evaluation-only)
export type ShadowMarketTotal = {
  available: boolean;
  total: number | null;
  sportsbook: string | null;
  provider: string | null;
  observed_at: string | null;
  observation_id: string | null;
  content_hash: string | null;
  selection_rule: "latest_observation_at_or_before_generation_time";
  usage: "evaluation_only_never_a_model_input";
  books: { sportsbook: string; total: number; observed_at: string }[];
};

type RawLine = { id?: string; jkbGameId?: string; provider?: string; sportsbook: string; capturedAt: string; total: { line: number | null } | null; contentHash?: string | null };

function gameToken(gameId: string): string {
  return gameId.replace(/[^A-Za-z0-9_-]/g, "_");
}

function loadLines(historyRoot: string, season: number, gameId: string): RawLine[] {
  const path = join(historyRoot, String(season), `${gameToken(gameId)}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as RawLine);
}

/**
 * Latest observation per sportsbook captured at or before `cutoffIso` (and strictly before kickoff); the canonical
 * total is the highest-priority book present. The result is recorded for evaluation only and never feeds the shadow total.
 */
export function selectMarketTotal(rows: readonly RawLine[], cutoffIso: string, kickoffIso: string): ShadowMarketTotal {
  const cutoff = Date.parse(cutoffIso);
  const kickoff = Date.parse(kickoffIso);
  const latest = new Map<string, RawLine>();
  for (const row of rows) {
    const t = Date.parse(row.capturedAt);
    if (!Number.isFinite(t) || t > cutoff || t >= kickoff || row.total?.line == null) continue;
    const prev = latest.get(row.sportsbook);
    if (!prev || Date.parse(prev.capturedAt) < t) latest.set(row.sportsbook, row);
  }
  const books = [...latest.values()].sort((a, b) => a.sportsbook.localeCompare(b.sportsbook)).map((r) => ({ sportsbook: r.sportsbook, total: r.total!.line as number, observed_at: r.capturedAt }));
  let chosen: RawLine | null = null;
  for (const book of SHADOW_SPORTSBOOK_PRIORITY) if (latest.has(book)) { chosen = latest.get(book)!; break; }
  if (!chosen && books.length) chosen = latest.get(books[0].sportsbook)!;
  return {
    available: chosen !== null,
    total: chosen ? (chosen.total!.line as number) : null,
    sportsbook: chosen?.sportsbook ?? null,
    provider: chosen ? (chosen.provider ?? "the-odds-api") : null,
    observed_at: chosen?.capturedAt ?? null,
    observation_id: chosen?.id ?? null,
    content_hash: chosen?.contentHash ?? null,
    selection_rule: "latest_observation_at_or_before_generation_time",
    usage: "evaluation_only_never_a_model_input",
    books,
  };
}

export function loadMarketTotalAt(season: number, gameId: string, cutoffIso: string, kickoffIso: string, historyRoot: string = DEFAULT_MARKET_HISTORY_ROOT): ShadowMarketTotal {
  return selectMarketTotal(loadLines(historyRoot, season, gameId), cutoffIso, kickoffIso);
}

// ------------------------------------------------------------------ rows
export type ShadowRow = {
  schema_version: typeof NFL_TOTAL_SHADOW_ROW_SCHEMA;
  shadow_id: string;
  mode: "shadow";
  cohort: ShadowCohort;
  retrospective_reason: string | null;
  season: number;
  week: number;
  game_id: string;
  kickoff_utc: string;
  home_team: string;
  away_team: string;
  neutral_site: boolean;
  model_name: typeof NFL_TOTAL_SHADOW_MODEL_NAME;
  model_version: typeof NFL_TOTAL_SHADOW_MODEL_VERSION;
  base_model_name: string;
  base_model_version: string;
  k: typeof NFL_TOTAL_SHADOW_K;
  formula: typeof NFL_TOTAL_SHADOW_FORMULA;
  prior_season: number;
  prior_season_league_mean: number;
  league_mean_source: LeagueMeanSource;
  raw_jkb_total: number;
  shadow_total: number;
  production_prediction_ids: { home: string; away: string };
  production_fitted_model_hash: string | null;
  production_prediction_timestamp: string;
  /** Generation time = the production prediction timestamp of the run that produced (and froze) both numbers. */
  generated_at: string;
  /** Wall-clock time this shadow row was written (equals generated_at for live rows; later for a retrospective backfill). */
  created_at: string;
  run_id: string;
  pipeline_version: typeof NFL_TOTAL_SHADOW_PIPELINE_VERSION;
  code_revision: string | null;
  market_at_generation: ShadowMarketTotal;
  public_exposure: "none";
};

export type ShadowSlateGame = { gameId: string; season: number; week: number; kickoffUtc: string; neutralSite: boolean; homeAbbr: string; awayAbbr: string };

function stateOf(row: Omit<ShadowRow, "shadow_id" | "generated_at" | "created_at" | "run_id" | "code_revision" | "market_at_generation" | "league_mean_source"> & { league_mean_source?: LeagueMeanSource }): JsonValue {
  return {
    schema_version: row.schema_version, cohort: row.cohort, game_id: row.game_id, model_version: row.model_version, base_model_version: row.base_model_version,
    k: row.k, prior_season: row.prior_season, prior_season_league_mean: row.prior_season_league_mean,
    raw_jkb_total: row.raw_jkb_total, shadow_total: row.shadow_total, production_prediction_ids: row.production_prediction_ids,
    production_fitted_model_hash: row.production_fitted_model_hash,
  } as JsonValue;
}

export function validateShadowRow(row: ShadowRow): void {
  const need = (cond: boolean, msg: string) => { if (!cond) throw new Error(`Invalid shadow row ${row?.game_id ?? "?"}: ${msg}`); };
  need(row.schema_version === NFL_TOTAL_SHADOW_ROW_SCHEMA, "schema_version");
  need(row.mode === "shadow", "mode must be 'shadow'");
  need(row.model_name === NFL_TOTAL_SHADOW_MODEL_NAME && row.model_version === NFL_TOTAL_SHADOW_MODEL_VERSION, "model identity");
  need(row.base_model_name === NFL_TOTAL_MODEL_NAME && row.base_model_version === NFL_TOTAL_MODEL_VERSION, "base model must be the unchanged production total model");
  need(row.k === 0.8, "k must be exactly 0.8");
  need(row.formula === NFL_TOTAL_SHADOW_FORMULA, "formula");
  need(row.season === NFL_TOTAL_SHADOW_SEASON, "shadow covers the 2026 season only");
  need(row.prior_season === row.season - 1, "league mean must come from the immediately-prior season");
  need(row.league_mean_source?.season === row.prior_season, "league_mean_source season");
  need(Number.isFinite(row.raw_jkb_total) && Number.isFinite(row.shadow_total) && Number.isFinite(row.prior_season_league_mean), "finite totals");
  need(row.shadow_total === computeShadowTotal(row.raw_jkb_total, row.prior_season_league_mean), "shadow_total must equal the frozen formula exactly");
  need(row.cohort === cohortFor(row.season, row.week), "cohort must follow the week rule (prospective from Week 3)");
  need(Date.parse(row.generated_at) < Date.parse(row.kickoff_utc), "generated_at must be strictly before kickoff");
  need(row.public_exposure === "none", "public_exposure");
  need(row.market_at_generation?.usage === "evaluation_only_never_a_model_input", "market usage label");
  if (row.market_at_generation.observed_at) need(Date.parse(row.market_at_generation.observed_at) <= Date.parse(row.generated_at), "market observation must not postdate generation");
}

export type BuildShadowRowsOptions = {
  season: number;
  generatedAt: string;
  createdAt: string;
  runId: string;
  codeRevision: string | null;
  productionRecords: readonly PredictionSnapshotV1[];
  slate: readonly ShadowSlateGame[];
  leagueMean: LeagueMeanSource;
  marketHistoryRoot?: string;
  /** Retrospective backfill only: per-game production timestamp overrides generatedAt for the information cutoff. */
  retrospectiveReason?: string | null;
};

/** Pure: builds one shadow row per game from the finalized production rows. Never mutates its inputs. */
export function buildShadowRows(options: BuildShadowRowsOptions): ShadowRow[] {
  const byGame = new Map<string, { home?: PredictionSnapshotV1; away?: PredictionSnapshotV1 }>();
  for (const r of options.productionRecords) {
    if (r.prediction_type !== "team_total" || r.model_version !== NFL_TOTAL_MODEL_VERSION || r.model_name !== NFL_TOTAL_MODEL_NAME) throw new Error(`Shadow input must be unchanged production ${NFL_TOTAL_MODEL_VERSION} team_total rows (got ${r.model_name}/${r.model_version}/${r.prediction_type})`);
    const e = byGame.get(r.game_id) ?? {};
    e[r.home_away] = r; byGame.set(r.game_id, e);
  }
  const rows: ShadowRow[] = [];
  for (const game of options.slate) {
    const pair = byGame.get(game.gameId);
    if (!pair?.home || !pair.away) continue; // fail closed: never shadow a game whose production total was not archived
    if (pair.home.projection.type !== "team_total" || pair.away.projection.type !== "team_total") continue;
    if (pair.home.status !== "projected" || pair.away.status !== "projected") continue;
    const raw = pair.home.projection.projected_team_points + pair.away.projection.projected_team_points;
    const embedded = (pair.home.feature_snapshot.values.prediction as { projected_game_total?: number } | undefined)?.projected_game_total;
    if (typeof embedded === "number" && embedded !== raw) throw new Error(`Production total mismatch for ${game.gameId}: sum ${raw} vs archived ${embedded}`);
    const generatedAt = options.generatedAt;
    const base = {
      schema_version: NFL_TOTAL_SHADOW_ROW_SCHEMA, mode: "shadow" as const, cohort: cohortFor(game.season, game.week),
      retrospective_reason: cohortFor(game.season, game.week) === "retrospective" ? (options.retrospectiveReason ?? "week_before_first_prospective_week") : null,
      season: game.season, week: game.week, game_id: game.gameId, kickoff_utc: game.kickoffUtc, home_team: game.homeAbbr, away_team: game.awayAbbr, neutral_site: game.neutralSite,
      model_name: NFL_TOTAL_SHADOW_MODEL_NAME, model_version: NFL_TOTAL_SHADOW_MODEL_VERSION, base_model_name: NFL_TOTAL_MODEL_NAME, base_model_version: NFL_TOTAL_MODEL_VERSION,
      k: NFL_TOTAL_SHADOW_K, formula: NFL_TOTAL_SHADOW_FORMULA, prior_season: options.leagueMean.season, prior_season_league_mean: options.leagueMean.mean_total_points,
      raw_jkb_total: raw, shadow_total: computeShadowTotal(raw, options.leagueMean.mean_total_points),
      production_prediction_ids: { home: pair.home.prediction_id, away: pair.away.prediction_id },
      production_fitted_model_hash: pair.home.feature_snapshot.fitted_model_hash,
      production_prediction_timestamp: pair.home.prediction_timestamp,
      pipeline_version: NFL_TOTAL_SHADOW_PIPELINE_VERSION, public_exposure: "none" as const,
    };
    const row: ShadowRow = {
      ...base, shadow_id: `shadow_${contentHash(stateOf(base as never))}`, generated_at: generatedAt, created_at: options.createdAt, run_id: options.runId, code_revision: options.codeRevision,
      league_mean_source: options.leagueMean,
      market_at_generation: loadMarketTotalAt(game.season, game.gameId, generatedAt, game.kickoffUtc, options.marketHistoryRoot),
    };
    validateShadowRow(row);
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------------ archive layout (separate from every production root)
export function shadowPredictionPath(root: string, season: number, week: number, cohort: ShadowCohort): string {
  return join(root, String(season), String(week).padStart(2, "0"), cohort === "prospective" ? "predictions.jsonl" : "retrospective.jsonl");
}
export function shadowOutcomePath(root: string, season: number, week: number): string {
  return join(root, String(season), String(week).padStart(2, "0"), "outcomes.jsonl");
}
export function shadowManifestPath(root: string): string { return join(root, "manifest.json"); }

export type ShadowManifest = {
  schema_version: typeof NFL_TOTAL_SHADOW_MANIFEST_SCHEMA;
  model_name: string; model_version: string; base_model_version: string;
  k: number; formula: string; prior_season_mean_rule: string;
  shadow_season: number; first_prospective_week: number; review_min_games: number; public_exposure: "none";
  activated_at: string; code_revision: string | null;
};

function frozenConfig(): Omit<ShadowManifest, "activated_at" | "code_revision"> {
  return {
    schema_version: NFL_TOTAL_SHADOW_MANIFEST_SCHEMA, model_name: NFL_TOTAL_SHADOW_MODEL_NAME, model_version: NFL_TOTAL_SHADOW_MODEL_VERSION, base_model_version: NFL_TOTAL_MODEL_VERSION,
    k: NFL_TOTAL_SHADOW_K, formula: NFL_TOTAL_SHADOW_FORMULA,
    prior_season_mean_rule: "mean regular-season game total (home+away) of the completed immediately-prior season; never any current-season data",
    shadow_season: NFL_TOTAL_SHADOW_SEASON, first_prospective_week: NFL_TOTAL_SHADOW_FIRST_PROSPECTIVE_WEEK, review_min_games: NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES, public_exposure: "none",
  };
}

/** Creates the activation manifest on first use; afterwards verifies the frozen config is byte-identical (k etc. can never drift). */
export function ensureShadowManifest(root: string, activatedAt: string, codeRevision: string | null, dryRun = false): ShadowManifest {
  const path = shadowManifestPath(root);
  const cfg = frozenConfig();
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, "utf8")) as ShadowManifest;
    const { activated_at: _a, code_revision: _c, ...rest } = existing;
    if (canonicalJson(rest as unknown as JsonValue) !== canonicalJson(cfg as unknown as JsonValue)) throw new Error("Shadow manifest config differs from the frozen k=0.8 configuration -- refusing to write (frozen for the season).");
    return existing;
  }
  const manifest: ShadowManifest = { ...cfg, activated_at: activatedAt, code_revision: codeRevision };
  if (!dryRun) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${canonicalJson(manifest as unknown as JsonValue)}\n`, "utf8"); }
  return manifest;
}

export function readShadowRows(root: string, season: number, cohort?: ShadowCohort): ShadowRow[] {
  const dir = join(root, String(season));
  if (!existsSync(dir)) return [];
  const rows: ShadowRow[] = [];
  for (let week = 1; week <= 22; week++) {
    for (const c of ["prospective", "retrospective"] as const) {
      if (cohort && cohort !== c) continue;
      const p = shadowPredictionPath(root, season, week, c);
      if (existsSync(p)) rows.push(...readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as ShadowRow));
    }
  }
  return rows;
}

/** Append-only write (first observation wins; an identical re-run is a duplicate; a colliding id with different state throws). */
export function archiveShadowRows(root: string, rows: readonly ShadowRow[], dryRun = false): { appended: number; duplicates: number; files: string[] } {
  rows.forEach(validateShadowRow);
  const grouped = new Map<string, ShadowRow[]>();
  for (const r of rows) { const p = shadowPredictionPath(root, r.season, r.week, r.cohort); grouped.set(p, [...(grouped.get(p) ?? []), r]); }
  let appended = 0; let duplicates = 0; const files: string[] = [];
  for (const [path, incoming] of grouped) {
    const w = appendArchiveEvents<ShadowRow>({ path, records: incoming, id: (r) => r.shadow_id, state: (r) => stateOf(r as never), validate: validateShadowRow, dryRun });
    appended += w.appended; duplicates += w.duplicates; if (w.appended) files.push(path);
  }
  return { appended, duplicates, files };
}

// ------------------------------------------------------------------ outcomes (final totals attached as separate immutable events)
export type ShadowOutcome = {
  schema_version: typeof NFL_TOTAL_SHADOW_OUTCOME_SCHEMA;
  outcome_id: string; season: number; week: number; game_id: string;
  home_score: number; away_score: number; final_total: number;
  graded_at: string; source: string;
};

export function gradeShadowOutcomes(options: { root: string; season: number; now: string; resultsRoot?: string; dryRun?: boolean }): { appended: number; duplicates: number; graded: number } {
  const resultsPath = join(options.resultsRoot ?? DEFAULT_RESULTS_ROOT, String(options.season), "results.json");
  if (!existsSync(resultsPath)) return { appended: 0, duplicates: 0, graded: 0 };
  const results = new Map<string, { homeScore: number; awayScore: number; week: number }>();
  for (const r of (JSON.parse(readFileSync(resultsPath, "utf8")) as { results: { gameId: string; week: number; seasonType: string; final: boolean; homeScore: number | null; awayScore: number | null }[] }).results) {
    if (r.seasonType === "REG" && r.final && r.homeScore != null && r.awayScore != null) results.set(r.gameId, { homeScore: r.homeScore, awayScore: r.awayScore, week: r.week });
  }
  const gameIds = new Map<string, number>();
  for (const row of readShadowRows(options.root, options.season)) gameIds.set(row.game_id, row.week);
  const byPath = new Map<string, ShadowOutcome[]>();
  for (const [gameId, week] of gameIds) {
    const res = results.get(gameId); if (!res) continue;
    const state = { game_id: gameId, home_score: res.homeScore, away_score: res.awayScore } as JsonValue;
    const o: ShadowOutcome = { schema_version: NFL_TOTAL_SHADOW_OUTCOME_SCHEMA, outcome_id: `out_${contentHash(state)}`, season: options.season, week, game_id: gameId, home_score: res.homeScore, away_score: res.awayScore, final_total: res.homeScore + res.awayScore, graded_at: options.now, source: `public/data/nfl/${options.season}/results.json` };
    const p = shadowOutcomePath(options.root, options.season, week); byPath.set(p, [...(byPath.get(p) ?? []), o]);
  }
  let appended = 0; let duplicates = 0; let graded = 0;
  for (const [path, records] of byPath) {
    const w = appendArchiveEvents<ShadowOutcome>({ path, records, id: (o) => o.outcome_id, state: (o) => ({ game_id: o.game_id, home_score: o.home_score, away_score: o.away_score } as JsonValue), validate: (o) => { if (o.final_total !== o.home_score + o.away_score) throw new Error("outcome total mismatch"); }, dryRun: options.dryRun });
    appended += w.appended; duplicates += w.duplicates; graded += records.length;
  }
  return { appended, duplicates, graded };
}

export function readShadowOutcomes(root: string, season: number): ShadowOutcome[] {
  const out: ShadowOutcome[] = [];
  for (let week = 1; week <= 22; week++) { const p = shadowOutcomePath(root, season, week); if (existsSync(p)) out.push(...readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as ShadowOutcome)); }
  return out;
}

// ------------------------------------------------------------------ generator hook
export type RunShadowOptions = {
  season: number; week: number; generatedAt: string; createdAt: string; runId: string; codeRevision: string | null;
  productionRecords: readonly PredictionSnapshotV1[]; slate: readonly ShadowSlateGame[];
  shadowRoot?: string; resultsRoot?: string; marketHistoryRoot?: string; dryRun: boolean;
};

export type RunShadowResult = { skipped: string | null; rows: ShadowRow[]; appended: number; duplicates: number; leagueMean: LeagueMeanSource | null };

/** Called by the production generator with the SAME finalized production rows it archives. Writes only under the shadow root. */
export function runNflTotalShadow(options: RunShadowOptions): RunShadowResult {
  if (options.season !== NFL_TOTAL_SHADOW_SEASON) return { skipped: `shadow covers ${NFL_TOTAL_SHADOW_SEASON} only`, rows: [], appended: 0, duplicates: 0, leagueMean: null };
  const root = options.shadowRoot ?? DEFAULT_SHADOW_ROOT;
  const leagueMean = loadPriorSeasonLeagueMean(options.season, options.resultsRoot);
  const rows = buildShadowRows({ season: options.season, generatedAt: options.generatedAt, createdAt: options.createdAt, runId: options.runId, codeRevision: options.codeRevision, productionRecords: options.productionRecords, slate: options.slate, leagueMean, marketHistoryRoot: options.marketHistoryRoot });
  let appended = 0; let duplicates = 0;
  if (!options.dryRun && rows.length) {
    ensureShadowManifest(root, options.generatedAt, options.codeRevision);
    const w = archiveShadowRows(root, rows); appended = w.appended; duplicates = w.duplicates;
    gradeShadowOutcomes({ root, season: options.season, now: options.createdAt, resultsRoot: options.resultsRoot });
  }
  return { skipped: null, rows, appended, duplicates, leagueMean };
}

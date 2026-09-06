/**
 * Coaching Rating v1 — machine-readable research metadata for the future
 * JKB Data Analysis page. Emits data/nfl/coaching/coaching-analysis-metadata.json.
 *
 * This does NOT build the Data Analysis page; it only serializes a stable,
 * citeable record of the study (question, findings, negative findings, signal
 * classifications, fitted weights, OOS validation, limitations, artifact paths).
 *
 * Usage: node scripts/generate-nfl-coaching-analysis-metadata.mjs [--dry-run]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { COACHING_STUDY_META } from "./lib/nfl-coach-rating-build.mjs";
import { COACHING_RATING_V1, COACHING_RATING_VERSION } from "./lib/nfl-coach-rating.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COACHING_DIR = join(ROOT, "data", "nfl", "coaching");
const OUT = join(COACHING_DIR, "coaching-analysis-metadata.json");

const RESEARCH_JSON = join(COACHING_DIR, "coaching-ratings-research.json");

function loadResearchSummary() {
  try {
    const j = JSON.parse(readFileSync(RESEARCH_JSON, "utf-8"));
    return {
      data_seasons: j.dataset?.seasons ?? "1999-2025",
      sample_size: j.dataset?.n ?? j.sample_size ?? 731,
      oos_validation: j.validation ?? j.oos ?? null,
    };
  } catch {
    return { data_seasons: "1999-2025", sample_size: 731, oos_validation: null };
  }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const research = loadResearchSummary();

  const payload = {
    schemaVersion: "nfl-coaching-analysis-metadata-v1",
    generatedAt: new Date().toISOString(),
    study_id: COACHING_STUDY_META.version,
    title: COACHING_STUDY_META.title,
    rating_version: COACHING_RATING_VERSION,
    data_seasons: research.data_seasons,
    sample_size: research.sample_size,
    research_question:
      "Which head-coach signals persist and carry forward-predictive value for team performance, and how should they be combined into a single rating?",
    methodology: COACHING_STUDY_META.methodology,
    key_findings: COACHING_STUDY_META.key_findings,
    negative_findings: [
      "Every ATS window (career / recent / favorite / underdog / division / after-bye) had forward r ≈ 0 — coach ATS skill did not persist.",
      "Adding experience / tenure / playoff games as a fitted additive term reduced out-of-sample r and flipped sign across folds.",
    ],
    signal_classifications: COACHING_STUDY_META.signal_classifications,
    final_model_decision: COACHING_STUDY_META.model_decision,
    fitted_weights: {
      intercept: COACHING_RATING_V1.weights.intercept,
      w_win_over_expectation: COACHING_RATING_V1.weights.w_win_over_expectation,
      w_career_win_pct: COACHING_RATING_V1.weights.w_career_win_pct,
      shrinkage: COACHING_RATING_V1.shrinkage,
      reliability: COACHING_RATING_V1.reliability,
      even_threshold: COACHING_RATING_V1.even_threshold,
      raw_score_population: COACHING_RATING_V1.raw_score_population,
      transform: COACHING_RATING_V1.transform,
    },
    oos_validation:
      research.oos_validation ??
      "rolling-origin (train season<T, test season==T), 2009–2025: out-of-sample r ≈ 0.15 same-season / ≈ 0.22 next-season, sign-consistent every fold.",
    limitations: COACHING_STUDY_META.limitations,
    model_input_use: "NONE — analysis context only. Not an input to Sides/Totals model math.",
    artifact_paths: {
      current_ratings: "public/data/nfl/coaching-ratings.json",
      historical_snapshots: "data/nfl/coaching/rating-snapshots/<season>/<week>.json",
      coach_history: "data/nfl/coaching/coach-history.json",
      coach_game_context: "data/nfl/coaching/coach-game-context/<season>.jsonl",
      coach_effective_overrides: "data/nfl/coaching/coach-effective-overrides.json",
      research: "data/nfl/coaching/coaching-ratings-research.json",
    },
    integration: {
      phase: "C",
      usage: "ANALYSIS CONTEXT ONLY — joined per game into Sides/Totals performance rows and the NFL matchup detail. Never an input to Sides/Totals projection math; ATS never weighted.",
      snapshot_selection:
        "Historical games (season < current-ratings season) use the point-in-time rating-snapshots/<season>/<week>.json; current/upcoming games use a leak-checked adapter over public/data/nfl/coaching-ratings.json. A historical game never falls back to current ratings.",
      current_season_coach_changes:
        "coach-effective-overrides.json applies an identity-only override from its effective (season, week) forward for an in-season firing/interim not yet in games.csv; earlier weeks are never rewritten and canonical history wins once games.csv confirms.",
    },
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log("[nfl:coaching-analysis-metadata] dry-run: not written");
    return;
  }
  mkdirSync(COACHING_DIR, { recursive: true });
  writeFileSync(OUT, toNflJsonFileString(payload));
  console.log(`[nfl:coaching-analysis-metadata] wrote ${OUT}`);
}

main();

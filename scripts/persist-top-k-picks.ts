/**
 * persist-top-k-picks.ts
 *
 * Pregame snapshot for the "Top K Props Performance" tracker section.
 * Persists the EXACT pitchers shown to users under "Best K Prop Bets" on
 * /mlb/strikeout-props (src/pages/MlbStrikeoutProps.tsx's
 * `KBestBetsSection`, built from `buildKPropBestBets(strikeoutDetailRows, 3)`
 * -- up to 3 Over picks + 3 Under picks).
 *
 * Run as a TypeScript script via `tsx` (matching the existing
 * scripts/generate-social-card-live.ts pattern) so it can import the SAME
 * selection functions the live page uses directly -- no ported/mirrored
 * logic, zero drift risk, and this script does not define or alter the
 * selection rule in any way:
 *   - buildPitcherStrikeoutRows (src/lib/mlb/mlbSocialSelection.ts) builds
 *     the exact `strikeoutDetailRows` the page renders from.
 *   - buildKPropBestBets (src/lib/mlb/kPropBestBets.ts) is the exact
 *     Best K Prop Bets selection rule (edge >= 0.4 Ks, valid market, etc).
 *
 * Idempotent: keyed by date+pitcherId+gameId+side (mlb-top-k-tracking.mjs),
 * never overwrites an already-graded record.
 *
 * Usage: tsx scripts/persist-top-k-picks.ts [--dry-run]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildPitcherStrikeoutRows } from "@/lib/mlb/mlbSocialSelection";
import { buildKPropBestBets } from "@/lib/mlb/kPropBestBets";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";
// @ts-expect-error -- plain .mjs helper module, no type declarations
import { loadJsonSafe, mergeTopKRecords, TOP_K_TRACKING_MODEL_VERSION, writeJson } from "./lib/mlb-top-k-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const PERFORMANCE_PATH = path.join(DATA_DIR, "top-k-performance.json");

const DRY_RUN = process.argv.includes("--dry-run");

interface RawPayload {
  date: string;
  batters: HrDashboardBatter[];
  games: HrDashboardGame[];
  pitchers: HrDashboardPitcher[];
}

function main() {
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawPayload;
  const strikeoutDetailRows = buildPitcherStrikeoutRows(raw.batters ?? [], raw.games ?? [], raw.pitchers ?? []);
  const { overs, unders } = buildKPropBestBets(strikeoutDetailRows, 3);

  const rowIndex = new Map(strikeoutDetailRows.map((row) => [`${row.pitcher}|${row.team}|${row.opponent}`, row]));

  const records: Record<string, unknown>[] = [];
  const buildRecords = (picks: typeof overs, side: "over" | "under") => {
    picks.forEach((pick, i) => {
      const row = rowIndex.get(`${pick.pitcher}|${pick.team}|${pick.opponent}`);
      if (!row) {
        console.warn(`[top-k-persist] Could not find strikeoutDetailRows entry for ${pick.pitcher} (${pick.team} vs ${pick.opponent}) -- skipping.`);
        return;
      }
      records.push({
        trackingModelVersion: TOP_K_TRACKING_MODEL_VERSION,
        date: raw.date,
        persistedAt: new Date().toISOString(),
        pitcherId: row.pitcherId,
        pitcherName: row.pitcher,
        team: row.team,
        opponent: row.opponent,
        gameId: row.gameId,
        gameKey: row.gameKey,
        side,
        slot: i + 1,
        line: pick.line,
        odds: pick.odds,
        oddsBook: pick.book,
        projectedKs: pick.projectedKs,
        projectionEdge: pick.projectionEdge,
        kScore: pick.matchupScore,
        valueScore: pick.valueScore,
        projectedIP: row.projectedIP ?? null,
        workloadConfidenceGrade: row.workloadConfidenceGrade ?? null,
        modelVersion: row.v2ModelVersion ?? row.projectionSource ?? null,
        resultStatus: "pending",
        actualStrikeOuts: null,
        actualInningsPitched: null,
        battersFaced: null,
        result: null,
        gradedAt: null,
      });
    });
  };

  buildRecords(overs, "over");
  buildRecords(unders, "under");

  console.log(`[top-k-persist] date=${raw.date} overs=${overs.length} unders=${unders.length} matchedRecords=${records.length}`);

  if (records.length === 0) {
    console.log("[top-k-persist] No Top K Props identified today -- nothing to persist.");
    return;
  }

  const existing = loadJsonSafe(PERFORMANCE_PATH, { records: [] });
  const beforeCount = existing.records?.length ?? 0;
  const merged = mergeTopKRecords(existing, records);
  const afterCount = merged.records.length;
  console.log(`[top-k-persist] records before=${beforeCount} after=${afterCount} (new=${afterCount - beforeCount})`);

  if (DRY_RUN) {
    console.log("[top-k-persist] Dry run -- not writing file.");
    return;
  }

  writeJson(PERFORMANCE_PATH, {
    generatedAt: new Date().toISOString(),
    trackingModelVersion: TOP_K_TRACKING_MODEL_VERSION,
    trackingStartDate: existing.trackingStartDate ?? raw.date,
    records: merged.records,
  });
  console.log(`[top-k-persist] Wrote ${PERFORMANCE_PATH}`);
}

main();

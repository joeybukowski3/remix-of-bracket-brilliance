import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import { fitMultiOls, predictMultiOls, rSquared } from "../phase7/regressionUtils";
import type { CfbResearchMarketLine } from "../types";
import { mae } from "../phase7/statsUtils";
import type { Phase8Prediction } from "./types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function loadSeasonMarketLines(season: number): CfbResearchMarketLine[] {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "market-lines.json"), "utf8")) as CfbResearchMarketLine[];
}

type JoinedRow = { modelMargin: number; marketMargin: number; actualMargin: number };

/**
 * Section 21 — downstream-only market comparison, run AFTER independent
 * model selection (Section 22: market never used to pick structural
 * hyperparameters). One market row per game: "consensus" provider if
 * present, else the alphabetically-first provider (same deterministic
 * convention as Phase 6/7).
 */
export function buildMarketGapDiagnostic(predictions: readonly Phase8Prediction[], seasons: readonly number[]) {
  const linesBySeason = new Map<number, CfbResearchMarketLine[]>();
  for (const season of seasons) linesBySeason.set(season, loadSeasonMarketLines(season));

  const rows: JoinedRow[] = [];
  for (const p of predictions) {
    if (p.projectedMargin === null || p.actualMargin === null) continue;
    const lines = (linesBySeason.get(p.season) ?? []).filter((l) => l.gameId === p.gameId);
    if (lines.length === 0) continue;
    const consensus = lines.find((l) => l.provider.toLowerCase() === "consensus");
    const chosen = consensus ?? [...lines].sort((a, b) => a.provider.localeCompare(b.provider))[0];
    const marketMargin = chosen.spreadLatestObserved === null ? null : -chosen.spreadLatestObserved;
    if (marketMargin === null) continue;
    rows.push({ modelMargin: p.projectedMargin, marketMargin, actualMargin: p.actualMargin });
  }

  const modelMae = mae(rows.map((r) => r.modelMargin - r.actualMargin));
  const marketMae = mae(rows.map((r) => r.marketMargin - r.actualMargin));

  const marketOnly = fitMultiOls(rows.map((r) => ({ features: [r.marketMargin], y: r.actualMargin })), ["market"]);
  const marketOnlyR2 = rSquared(rows.map((r) => r.actualMargin), rows.map((r) => predictMultiOls(marketOnly, [r.marketMargin])));
  const combined = fitMultiOls(rows.map((r) => ({ features: [r.marketMargin, r.modelMargin], y: r.actualMargin })), ["market", "model"]);
  const combinedR2 = rSquared(rows.map((r) => r.actualMargin), rows.map((r) => predictMultiOls(combined, [r.marketMargin, r.modelMargin])));

  return {
    n: rows.length,
    modelMae,
    marketMae,
    modelMinusMarketMae: modelMae !== null && marketMae !== null ? modelMae - marketMae : null,
    marketOnlyR2,
    combinedR2,
    incrementalR2ConditionalOnMarket: combinedR2 - marketOnlyR2,
  };
}

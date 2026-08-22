import { MISS_ERROR_THRESHOLD_POINTS } from "./config";
import type { MissCategory } from "./types";

/**
 * Section 3 — deterministic MODEL_x_MARKET_y classification. "Good" means
 * |margin error| < MISS_ERROR_THRESHOLD_POINTS (a documented research bin,
 * not a tuned threshold — see config.ts). When market error is unavailable
 * (no market line for this game), the market side is treated as GOOD only
 * if it is in fact unavailable is impossible to say — callers must not call
 * this without a market error; see missDataset.ts which only classifies
 * rows that have a market margin.
 */
export function classifyMiss(modelMarginError: number, marketMarginError: number): MissCategory {
  const modelGood = modelMarginError < MISS_ERROR_THRESHOLD_POINTS;
  const marketGood = marketMarginError < MISS_ERROR_THRESHOLD_POINTS;
  if (modelGood && marketGood) return "MODEL_GOOD_MARKET_GOOD";
  if (modelGood && !marketGood) return "MODEL_GOOD_MARKET_BAD";
  if (!modelGood && marketGood) return "MODEL_BAD_MARKET_GOOD";
  return "MODEL_BAD_MARKET_BAD";
}

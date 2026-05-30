/**
 * PITCHER REGRESSION DATA — Update daily
 * Stats from: fangraphs.com or baseball-reference.com
 * 
 * xFIP, SIERA, LOB%, HR/FB%, BABIP updated each day before games
 * Regression score is auto-calculated (-10 to +10)
 * 
 * Naming MUST match the pitcher's fullName from the MLB schedule API
 * (e.g., "Spencer Arrighetti", not "S. Arrighetti")
 */

import { buildRegressionData } from "@/lib/mlb/mlbPitcherRegression";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";

export const PITCHER_REGRESSION_DATA: PitcherRegressionData[] = [

  // ── GAME 1 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Grant Holmes", team: "ATL",
    era: 4.18, xfip: 3.92, siera: 3.95, kbb: 15.2, strandRate: 82.1, hrfb: 11.2, babip: 0.298 }),
  buildRegressionData({ pitcherId: null, name: "Chris Paddack", team: "CIN",
    era: 4.32, xfip: 4.15, siera: 4.08, kbb: 12.8, strandRate: 74.3, hrfb: 9.8, babip: 0.305 }),

  // ── GAME 2 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Lucas Giolito", team: "SD",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),
  buildRegressionData({ pitcherId: null, name: "Paxton Schultz", team: "WSH",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),

  // ── GAME 3 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Taj Bradley", team: "MIN",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),
  buildRegressionData({ pitcherId: null, name: "Jared Jones", team: "PIT",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),

  // ── GAME 4 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Carlos Rodón", team: "NYY",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),
  buildRegressionData({ pitcherId: null, name: "Luis Severino", team: "ATH",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),

  // ── GAME 5 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Zac Gallen", team: "AZ",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),
  buildRegressionData({ pitcherId: null, name: "George Kirby", team: "SEA",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),

  // ── GAME 6 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Zack Wheeler", team: "PHI",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),
  buildRegressionData({ pitcherId: null, name: "Trevor Rogers", team: "BAL",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),

  // ── GAME 7 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Coleman Crow", team: "MIL",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),
  buildRegressionData({ pitcherId: null, name: "Kai-Wei Teng", team: "HOU",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),

  // ── GAME 8 ─────────────────────────────────────────────
  buildRegressionData({ pitcherId: null, name: "Logan Webb", team: "SFG",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),
  buildRegressionData({ pitcherId: null, name: "Michael Lorenzen", team: "COL",
    era: null, xfip: null, siera: null, kbb: null, strandRate: null, hrfb: null, babip: null }),

  // ── REFERENCE: Notable regression outliers (update with real data) ────────
  buildRegressionData({ pitcherId: null, name: "Spencer Arrighetti", team: "HOU",
    era: 1.34, xfip: 4.92, siera: 4.71, kbb: 8.6, strandRate: 89.0, hrfb: 3.9, babip: 0.210 }),

  // Add more as the daily slate expands — use exact fullName from MLB API
];

/**
 * Filter to only show pitchers with at least ERA data
 * Nulls are included as placeholders to preserve daily structure
 */
export const REGRESSION_DATA_WITH_STATS = PITCHER_REGRESSION_DATA.filter(p => p.era !== null);

/**
 * PITCHER REGRESSION DATA FOR TODAY
 * 
 * Update this file daily with the starters and their advanced stats.
 * Get xFIP, SIERA, LOB%, HR/FB%, BABIP from baseball-reference.com or fangraphs.com
 * 
 * The regression score will be calculated automatically (-10 to +10)
 */

import { buildRegressionData } from "@/lib/mlb/mlbPitcherRegression";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";

export const PITCHER_REGRESSION_DATA: PitcherRegressionData[] = [
  // EXAMPLE: Update name, team, ERA, xFIP, SIERA, K-BB%, LOB%, HR/FB%, BABIP
  buildRegressionData({
    pitcherId: 1, // Use MLB player ID if available
    name: "Grant Holmes",
    team: "ATL",
    era: 4.18,
    xfip: 3.92,
    siera: 3.95,
    kbb: 15.2,
    strandRate: 82.1,
    hrfb: 11.2,
    babip: 0.298,
  }),
  buildRegressionData({
    pitcherId: 2,
    name: "Chris Paddack",
    team: "CIN",
    era: 4.32,
    xfip: 4.15,
    siera: 4.08,
    kbb: 12.8,
    strandRate: 74.3,
    hrfb: 9.8,
    babip: 0.305,
  }),
  buildRegressionData({
    pitcherId: 3,
    name: "Spencer Arrighetti",
    team: "HOU",
    era: 1.34,
    xfip: 4.92,
    siera: 4.71,
    kbb: 8.6,
    strandRate: 89.0,
    hrfb: 3.9,
    babip: 0.210,
  }),
  // Add more pitchers here for the day
];

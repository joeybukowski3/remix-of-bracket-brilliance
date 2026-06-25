/**
 * nflWarrenSharpAdvanced2026.ts
 *
 * Source: Warren Sharp 2026 Football Preview
 *   Offensive Efficiency Ranks  — page 46
 *   Rushing Efficiency          — page 45
 *   Stable QB Metrics           — pages 42–43
 *   Health by Unit              — chapter page 3 per team (attributed to FTN AGL)
 *
 * All metrics are 2025 season data presented as context for 2026 projections.
 * These are SEPARATE from the Joe Knows Ball model, VSiN data, and Vegas markets.
 *
 * Rank conventions:
 *   Offensive Efficiency ranks: 1 = best (highest efficiency or most favorable)
 *   Rushing Efficiency ranks:   1 = best
 *   QB Metrics ranks:           1 = best (highest EPA/att in that situation)
 *   Health by Unit ranks:       1 = healthiest (fewest Adjusted Games Lost per FTN)
 */

// ── Shared primitives ─────────────────────────────────────────────────────────

export interface WsMetricValue {
  /** Raw metric value (EPA, success rate already divided by 100, etc.) */
  value: number;
  /** NFL rank for this metric (1 = best unless noted) */
  rank: number;
}

// ── 1. Team Offensive Efficiency Ranks (page 46) ─────────────────────────────

export interface WsOffensiveEfficiencyRanks {
  /** Early Down Success % rank */
  earlyDownSuccessRank: number;
  /** 1st-half early-down pass rate rank */
  firstHalfEDPassRateRank: number;
  /** Early-down Q1-3 pass EPA rank */
  edQ13PassEpaRank: number;
  /** Early-down Q1-3 rush EPA rank */
  edQ13RushEpaRank: number;
  /** Early-down red-zone pass EPA rank */
  edRzPassEpaRank: number;
  /** Early-down red-zone rush EPA rank */
  edRzRushEpaRank: number;
  /** 3rd-down EPA in field-goal range rank */
  thirdDownEpaFgRangeRank: number;
  /** Down Set Conversion % rank */
  downSetConvRank: number;
  /** Explosive Play % rank */
  explosivePlayRank: number;
  /** 3rd-down conversion % rank */
  thirdDownConvRank: number;
  /** 4th-down conversion % rank */
  fourthDownConvRank: number;
  /** Offensive pace rank */
  paceRank: number;
  sourcePage: 46;
}

// ── 2. Team Rushing Efficiency (page 45) ─────────────────────────────────────

export interface WsRushingEfficiency {
  /** EPA per rush attempt */
  epaPerPlay: WsMetricValue;
  /** Overall rushing success rate */
  successRate: WsMetricValue;
  /** Early-down rushing success rate */
  earlyDownSuccess: WsMetricValue;
  /** Non-QB scramble success rate */
  nonQbScrambleSuccess: WsMetricValue;
  /** Yards per carry */
  ypc: WsMetricValue;
  /** Yards before contact per rush */
  ydsBfContact: WsMetricValue;
  /** Yards after contact per rush */
  ydsAfContact: WsMetricValue;
  /** EPA per rush between the tackles */
  epaAttBetweenTackles: WsMetricValue;
  /** EPA per rush outside the tackles */
  epaAttOutsideTackles: WsMetricValue;
  sourcePage: 45;
}

// ── 4. Stable and Less-Stable QB Metrics (pages 42–43) ───────────────────────

export interface WsQbStableMetrics {
  /** EPA/att with no pass-rush pressure */
  noPressure?: WsMetricValue;
  /** EPA/att while in the pocket */
  inPocket?: WsMetricValue;
  /** EPA/att with no play action on early downs */
  noPlayActionEarlyDowns?: WsMetricValue;
  /** EPA/att on 1st down, quarters 1-2-3 */
  firstDown123Q?: WsMetricValue;
  /** EPA/att on "layup" throws (short, high-percentage) */
  layupThrows?: WsMetricValue;
  /** EPA/att on throws < 2.5 seconds to release */
  lt2p5SecAtt?: WsMetricValue;
  /** EPA/att outside the red zone */
  outsideRedZone?: WsMetricValue;
}

export interface WsQbLessStableMetrics {
  /** EPA/att under pressure */
  underPressure?: WsMetricValue;
  /** EPA/att outside the pocket */
  outsidePocket?: WsMetricValue;
  /** EPA/att on play-action */
  playAction?: WsMetricValue;
  /** EPA/att when being blitzed */
  beingBlitzed?: WsMetricValue;
  /** EPA/att on 3rd and 4th down */
  thirdAndFourthDown?: WsMetricValue;
  /** EPA/att in the 4th quarter */
  fourthQuarter?: WsMetricValue;
  /** EPA/att on throws > 2.5 seconds to release */
  over2p5SecAtt?: WsMetricValue;
  /** EPA/att inside the red zone */
  insideRedZone?: WsMetricValue;
}

export interface WsQbMetrics {
  playerName: string;
  /** More predictive year-over-year metrics */
  stable: WsQbStableMetrics;
  /** Less stable but contextually relevant metrics */
  lessStable: WsQbLessStableMetrics;
  sourcePage: 42 | 43;
}

// ── 6. Health by Unit (chapter page 3, sourced from FTN AGL) ─────────────────

export interface WsHealthByUnit {
  /** Overall team health rank 2025 (#1 = healthiest — fewest AGL) */
  overall2025Rk: number;
  /** Overall team health rank 2024 */
  overall2024Rk: number;
  /** Change vs prior year rank (#1 = biggest improvement) */
  vsLastYrRk: number;
  /** Offense unit health rank */
  offenseRk: number;
  /** Defense unit health rank */
  defenseRk: number;
  /** QB health rank */
  qbRk: number;
  /** RB health rank */
  rbRk: number;
  /** WR health rank */
  wrRk: number;
  /** TE health rank */
  teRk: number;
  /** Offensive line health rank */
  olineRk: number;
  /** Defensive line health rank */
  dlineRk: number;
  /** Linebacker health rank */
  lbRk: number;
  /** Defensive back health rank */
  dbRk: number;
  /** Chapter page 3 where this appears */
  sourcePage: number;
  /** Attribution: data is based on FTN Adjusted Games Lost */
  dataSource: "FTN Adjusted Games Lost";
}

// ── Combined advanced profile ─────────────────────────────────────────────────

export interface WsTeamAdvancedMetrics2026 {
  team: string;
  abbr: string;
  offensiveEfficiency: WsOffensiveEfficiencyRanks;
  rushingEfficiency: WsRushingEfficiency;
  healthByUnit: WsHealthByUnit;
  /** The 2026 projected starting QB for this team (used to look up QB metrics) */
  projectedQb2026: string;
}

// ── 2026 projected starting QBs by team ──────────────────────────────────────
// Used to match team pages to the correct QB row in the metrics table.
// Note: metrics are based on 2025 performance regardless of current team.

const QB_BY_TEAM: Record<string, string> = {
  ari: "Gardner Minshew",   // new — not in 2025 table
  atl: "Tua Tagovailoa",    // 2025 with MIA; now ATL
  bal: "Lamar Jackson",
  buf: "Josh Allen",
  car: "Bryce Young",
  chi: "Caleb Williams",
  cin: "Joe Burrow",
  cle: "Dillon Gabriel",    // new — not in 2025 table
  dal: "Dak Prescott",
  den: "Bo Nix",
  det: "Jared Goff",
  gb:  "Jordan Love",
  hou: "C.J. Stroud",
  ind: "Daniel Jones",
  jax: "Trevor Lawrence",
  kc:  "Patrick Mahomes",
  lv:  "Fernando Mendoza",  // new — not in 2025 table
  lac: "Justin Herbert",
  lar: "Matthew Stafford",
  mia: "Malik Willis",      // minimal 2025 sample
  min: "Kyler Murray",      // 2025 with ARI; now MIN
  ne:  "Drake Maye",
  no:  "Tyler Shough",
  nyg: "Jaxson Dart",
  nyj: "Geno Smith",        // 2025 with LV; now NYJ
  phi: "Jalen Hurts",
  pit: "Aaron Rodgers",
  sf:  "Brock Purdy",
  sea: "Sam Darnold",
  tb:  "Baker Mayfield",
  ten: "Cam Ward",
  wsh: "Jayden Daniels",
};

// ── QB metrics data ───────────────────────────────────────────────────────────

const QB_METRICS: Record<string, WsQbMetrics> = {
  "Drake Maye": {
    playerName: "Drake Maye",
    stable: { noPressure:{value:0.49,rank:2}, inPocket:{value:0.33,rank:1}, noPlayActionEarlyDowns:{value:0.15,rank:4}, firstDown123Q:{value:0.35,rank:2}, layupThrows:{value:0.26,rank:2}, lt2p5SecAtt:{value:0.32,rank:3}, outsideRedZone:{value:0.29,rank:1} },
    lessStable: { underPressure:{value:-0.16,rank:3}, outsidePocket:{value:-0.05,rank:10}, playAction:{value:0.29,rank:7}, beingBlitzed:{value:0.29,rank:4}, thirdAndFourthDown:{value:0.36,rank:3}, fourthQuarter:{value:0.07,rank:21}, over2p5SecAtt:{value:0.21,rank:1}, insideRedZone:{value:0.07,rank:20} },
    sourcePage: 42,
  },
  "Jordan Love": {
    playerName: "Jordan Love",
    stable: { noPressure:{value:0.56,rank:1}, inPocket:{value:0.26,rank:2}, noPlayActionEarlyDowns:{value:0.14,rank:7}, firstDown123Q:{value:0.18,rank:11}, layupThrows:{value:0.31,rank:1}, lt2p5SecAtt:{value:0.33,rank:2}, outsideRedZone:{value:0.20,rank:4} },
    lessStable: { underPressure:{value:-0.37,rank:21}, outsidePocket:{value:-0.10,rank:12}, playAction:{value:0.26,rank:9}, beingBlitzed:{value:0.31,rank:2}, thirdAndFourthDown:{value:0.33,rank:4}, fourthQuarter:{value:0.18,rank:7}, over2p5SecAtt:{value:0.09,rank:5}, insideRedZone:{value:0.17,rank:11} },
    sourcePage: 42,
  },
  "Matthew Stafford": {
    playerName: "Matthew Stafford",
    stable: { noPressure:{value:0.41,rank:3}, inPocket:{value:0.23,rank:3}, noPlayActionEarlyDowns:{value:0.20,rank:1}, firstDown123Q:{value:0.30,rank:3}, layupThrows:{value:0.21,rank:5}, lt2p5SecAtt:{value:0.25,rank:7}, outsideRedZone:{value:0.23,rank:2} },
    lessStable: { underPressure:{value:-0.26,rank:9}, outsidePocket:{value:0.11,rank:5}, playAction:{value:0.30,rank:4}, beingBlitzed:{value:0.35,rank:1}, thirdAndFourthDown:{value:0.10,rank:9}, fourthQuarter:{value:0.30,rank:2}, over2p5SecAtt:{value:0.17,rank:3}, insideRedZone:{value:0.09,rank:19} },
    sourcePage: 42,
  },
  "Jared Goff": {
    playerName: "Jared Goff",
    stable: { noPressure:{value:0.41,rank:3}, inPocket:{value:0.23,rank:3}, noPlayActionEarlyDowns:{value:0.15,rank:4}, firstDown123Q:{value:0.29,rank:4}, layupThrows:{value:0.25,rank:3}, lt2p5SecAtt:{value:0.29,rank:4}, outsideRedZone:{value:0.17,rank:5} },
    lessStable: { underPressure:{value:-0.25,rank:8}, outsidePocket:{value:-0.20,rank:21}, playAction:{value:0.30,rank:4}, beingBlitzed:{value:0.22,rank:8}, thirdAndFourthDown:{value:0.16,rank:6}, fourthQuarter:{value:0.11,rank:18}, over2p5SecAtt:{value:0.02,rank:13}, insideRedZone:{value:0.19,rank:9} },
    sourcePage: 42,
  },
  "Brock Purdy": {
    playerName: "Brock Purdy",
    stable: { noPressure:{value:0.39,rank:5}, inPocket:{value:0.21,rank:6}, noPlayActionEarlyDowns:{value:0.11,rank:13}, firstDown123Q:{value:-0.13,rank:41}, layupThrows:{value:0.19,rank:6}, lt2p5SecAtt:{value:0.44,rank:1}, outsideRedZone:{value:0.12,rank:8} },
    lessStable: { underPressure:{value:-0.23,rank:5}, outsidePocket:{value:0.03,rank:9}, playAction:{value:-0.10,rank:31}, beingBlitzed:{value:0.04,rank:24}, thirdAndFourthDown:{value:0.51,rank:1}, fourthQuarter:{value:0.22,rank:5}, over2p5SecAtt:{value:0.00,rank:14}, insideRedZone:{value:0.39,rank:3} },
    sourcePage: 42,
  },
  "Dak Prescott": {
    playerName: "Dak Prescott",
    stable: { noPressure:{value:0.31,rank:9}, inPocket:{value:0.23,rank:3}, noPlayActionEarlyDowns:{value:0.05,rank:20}, firstDown123Q:{value:0.19,rank:10}, layupThrows:{value:0.03,rank:22}, lt2p5SecAtt:{value:0.26,rank:5}, outsideRedZone:{value:0.21,rank:3} },
    lessStable: { underPressure:{value:-0.14,rank:1}, outsidePocket:{value:-0.27,rank:28}, playAction:{value:0.30,rank:4}, beingBlitzed:{value:0.16,rank:11}, thirdAndFourthDown:{value:0.16,rank:6}, fourthQuarter:{value:0.06,rank:25}, over2p5SecAtt:{value:0.07,rank:7}, insideRedZone:{value:-0.11,rank:34} },
    sourcePage: 42,
  },
  "Josh Allen": {
    playerName: "Josh Allen",
    stable: { noPressure:{value:0.34,rank:7}, inPocket:{value:0.18,rank:7}, noPlayActionEarlyDowns:{value:0.06,rank:18}, firstDown123Q:{value:-0.03,rank:30}, layupThrows:{value:0.04,rank:21}, lt2p5SecAtt:{value:0.19,rank:9}, outsideRedZone:{value:0.11,rank:10} },
    lessStable: { underPressure:{value:-0.27,rank:10}, outsidePocket:{value:-0.15,rank:15}, playAction:{value:0.17,rank:12}, beingBlitzed:{value:0.09,rank:15}, thirdAndFourthDown:{value:0.10,rank:9}, fourthQuarter:{value:0.28,rank:3}, over2p5SecAtt:{value:0.05,rank:9}, insideRedZone:{value:0.11,rank:18} },
    sourcePage: 42,
  },
  "Patrick Mahomes": {
    playerName: "Patrick Mahomes",
    stable: { noPressure:{value:0.24,rank:21}, inPocket:{value:0.07,rank:16}, noPlayActionEarlyDowns:{value:0.10,rank:14}, firstDown123Q:{value:0.29,rank:4}, layupThrows:{value:0.11,rank:11}, lt2p5SecAtt:{value:0.13,rank:15}, outsideRedZone:{value:0.13,rank:6} },
    lessStable: { underPressure:{value:-0.15,rank:2}, outsidePocket:{value:0.11,rank:5}, playAction:{value:0.09,rank:18}, beingBlitzed:{value:-0.07,rank:31}, thirdAndFourthDown:{value:0.06,rank:11}, fourthQuarter:{value:0.17,rank:11}, over2p5SecAtt:{value:0.03,rank:11}, insideRedZone:{value:-0.13,rank:36} },
    sourcePage: 42,
  },
  "Lamar Jackson": {
    playerName: "Lamar Jackson",
    stable: { noPressure:{value:0.31,rank:9}, inPocket:{value:0.05,rank:21}, noPlayActionEarlyDowns:{value:-0.03,rank:32}, firstDown123Q:{value:0.25,rank:6}, layupThrows:{value:0.04,rank:21}, lt2p5SecAtt:{value:0.11,rank:21}, outsideRedZone:{value:0.08,rank:12} },
    lessStable: { underPressure:{value:-0.42,rank:30}, outsidePocket:{value:-0.22,rank:25}, playAction:{value:0.50,rank:1}, beingBlitzed:{value:0.30,rank:3}, thirdAndFourthDown:{value:-0.32,rank:37}, fourthQuarter:{value:0.24,rank:4}, over2p5SecAtt:{value:-0.12,rank:25}, insideRedZone:{value:-0.53,rank:43} },
    sourcePage: 42,
  },
  "Joe Burrow": {
    playerName: "Joe Burrow",
    stable: { noPressure:{value:0.19,rank:28}, inPocket:{value:0.07,rank:16}, noPlayActionEarlyDowns:{value:-0.04,rank:33}, firstDown123Q:{value:-0.10,rank:38}, layupThrows:{value:-0.13,rank:39}, lt2p5SecAtt:{value:0.08,rank:25}, outsideRedZone:{value:0.12,rank:8} },
    lessStable: { underPressure:{value:-0.24,rank:6}, outsidePocket:{value:0.12,rank:4}, playAction:{value:-0.18,rank:37}, beingBlitzed:{value:0.27,rank:5}, thirdAndFourthDown:{value:0.46,rank:2}, fourthQuarter:{value:0.01,rank:33}, over2p5SecAtt:{value:0.07,rank:7}, insideRedZone:{value:-0.15,rank:37} },
    sourcePage: 42,
  },
  "C.J. Stroud": {
    playerName: "C.J. Stroud",
    stable: { noPressure:{value:0.28,rank:12}, inPocket:{value:0.15,rank:8}, noPlayActionEarlyDowns:{value:-0.02,rank:29}, firstDown123Q:{value:0.13,rank:15}, layupThrows:{value:0.05,rank:19}, lt2p5SecAtt:{value:0.15,rank:12}, outsideRedZone:{value:0.08,rank:12} },
    lessStable: { underPressure:{value:-0.31,rank:13}, outsidePocket:{value:0.06,rank:7}, playAction:{value:0.17,rank:12}, beingBlitzed:{value:-0.08,rank:28}, thirdAndFourthDown:{value:0.05,rank:12}, fourthQuarter:{value:0.03,rank:31}, over2p5SecAtt:{value:-0.06,rank:21}, insideRedZone:{value:-0.08,rank:28} },
    sourcePage: 42,
  },
  "Sam Darnold": {
    playerName: "Sam Darnold",
    stable: { noPressure:{value:0.23,rank:24}, inPocket:{value:0.03,rank:26}, noPlayActionEarlyDowns:{value:0.06,rank:18}, firstDown123Q:{value:-0.04,rank:32}, layupThrows:{value:-0.03,rank:32}, lt2p5SecAtt:{value:-0.03,rank:32}, outsideRedZone:{value:0.00,rank:22} },
    lessStable: { underPressure:{value:-0.38,rank:24}, outsidePocket:{value:-0.17,rank:18}, playAction:{value:0.02,rank:24}, beingBlitzed:{value:-0.21,rank:35}, thirdAndFourthDown:{value:-0.28,rank:32}, fourthQuarter:{value:0.18,rank:7}, over2p5SecAtt:{value:-0.08,rank:23}, insideRedZone:{value:0.06,rank:21} },
    sourcePage: 42,
  },
  "Jalen Hurts": {
    playerName: "Jalen Hurts",
    stable: { noPressure:{value:0.25,rank:17}, inPocket:{value:0.06,rank:19}, noPlayActionEarlyDowns:{value:-0.01,rank:28}, firstDown123Q:{value:0.10,rank:18}, layupThrows:{value:0.00,rank:26}, lt2p5SecAtt:{value:0.11,rank:21}, outsideRedZone:{value:-0.02,rank:26} },
    lessStable: { underPressure:{value:-0.41,rank:27}, outsidePocket:{value:-0.17,rank:18}, playAction:{value:0.05,rank:21}, beingBlitzed:{value:0.04,rank:24}, thirdAndFourthDown:{value:0.03,rank:13}, fourthQuarter:{value:0.04,rank:30}, over2p5SecAtt:{value:-0.09,rank:24}, insideRedZone:{value:0.22,rank:6} },
    sourcePage: 42,
  },
  "Justin Herbert": {
    playerName: "Justin Herbert",
    stable: { noPressure:{value:0.26,rank:15}, inPocket:{value:0.02,rank:29}, noPlayActionEarlyDowns:{value:-0.04,rank:33}, firstDown123Q:{value:-0.12,rank:40}, layupThrows:{value:-0.04,rank:30}, lt2p5SecAtt:{value:0.00,rank:30}, outsideRedZone:{value:0.00,rank:22} },
    lessStable: { underPressure:{value:-0.33,rank:17}, outsidePocket:{value:-0.15,rank:15}, playAction:{value:0.16,rank:15}, beingBlitzed:{value:-0.04,rank:33}, thirdAndFourthDown:{value:-0.19,rank:30}, fourthQuarter:{value:0.05,rank:28}, over2p5SecAtt:{value:0.00,rank:12}, insideRedZone:{value:0.00,rank:22} },
    sourcePage: 42,
  },
  "Kyler Murray": {
    playerName: "Kyler Murray",
    stable: { noPressure:{value:0.25,rank:17}, inPocket:{value:0.09,rank:14}, noPlayActionEarlyDowns:{value:0.12,rank:11}, firstDown123Q:{value:-0.05,rank:33}, layupThrows:{value:0.13,rank:8}, lt2p5SecAtt:{value:0.16,rank:11}, outsideRedZone:{value:-0.01,rank:24} },
    lessStable: { underPressure:{value:-0.41,rank:27}, outsidePocket:{value:-0.28,rank:30}, playAction:{value:-0.12,rank:34}, beingBlitzed:{value:0.14,rank:12}, thirdAndFourthDown:{value:-0.14,rank:26}, fourthQuarter:{value:-0.02,rank:35}, over2p5SecAtt:{value:-0.21,rank:35}, insideRedZone:{value:0.12,rank:17} },
    sourcePage: 42,
  },
  "Baker Mayfield": {
    playerName: "Baker Mayfield",
    stable: { noPressure:{value:0.24,rank:21}, inPocket:{value:0.04,rank:23}, noPlayActionEarlyDowns:{value:0.04,rank:22}, firstDown123Q:{value:0.13,rank:15}, layupThrows:{value:0.07,rank:14}, lt2p5SecAtt:{value:0.03,rank:29}, outsideRedZone:{value:-0.04,rank:29} },
    lessStable: { underPressure:{value:-0.35,rank:18}, outsidePocket:{value:-0.20,rank:21}, playAction:{value:0.24,rank:10}, beingBlitzed:{value:-0.17,rank:34}, thirdAndFourthDown:{value:-0.22,rank:27}, fourthQuarter:{value:-0.10,rank:38}, over2p5SecAtt:{value:-0.05,rank:20}, insideRedZone:{value:0.20,rank:7} },
    sourcePage: 42,
  },
  "Daniel Jones": {
    playerName: "Daniel Jones",
    stable: { noPressure:{value:0.31,rank:9}, inPocket:{value:0.15,rank:8}, noPlayActionEarlyDowns:{value:0.16,rank:2}, firstDown123Q:{value:0.18,rank:11}, layupThrows:{value:0.45,rank:3}, lt2p5SecAtt:{value:0.12,rank:16}, outsideRedZone:{value:0.64,rank:11} },
    lessStable: { underPressure:{value:-0.17,rank:4}, outsidePocket:{value:0.06,rank:7}, playAction:{value:0.14,rank:16}, beingBlitzed:{value:0.06,rank:18}, thirdAndFourthDown:{value:0.17,rank:5}, fourthQuarter:{value:0.03,rank:31}, over2p5SecAtt:{value:0.16,rank:4}, insideRedZone:{value:0.18,rank:10} },
    sourcePage: 42,
  },
  "Trevor Lawrence": {
    playerName: "Trevor Lawrence",
    stable: { noPressure:{value:0.26,rank:15}, inPocket:{value:0.07,rank:16}, noPlayActionEarlyDowns:{value:0.04,rank:22}, firstDown123Q:{value:0.08,rank:20}, layupThrows:{value:0.05,rank:19}, lt2p5SecAtt:{value:0.12,rank:16}, outsideRedZone:{value:0.06,rank:15} },
    lessStable: { underPressure:{value:-0.37,rank:21}, outsidePocket:{value:-0.22,rank:25}, playAction:{value:0.11,rank:17}, beingBlitzed:{value:0.17,rank:10}, over2p5SecAtt:{value:-0.08,rank:20}, insideRedZone:{value:-0.18,rank:39} },
    sourcePage: 42,
  },
  "Caleb Williams": {
    playerName: "Caleb Williams",
    stable: { noPressure:{value:0.25,rank:17}, inPocket:{value:0.13,rank:11}, noPlayActionEarlyDowns:{value:0.02,rank:26}, firstDown123Q:{value:0.20,rank:9}, layupThrows:{value:0.06,rank:16}, lt2p5SecAtt:{value:0.26,rank:5}, outsideRedZone:{value:0.06,rank:15} },
    lessStable: { underPressure:{value:-0.31,rank:13}, outsidePocket:{value:-0.26,rank:27}, playAction:{value:0.09,rank:18}, beingBlitzed:{value:0.21,rank:9}, thirdAndFourthDown:{value:-0.04,rank:16}, fourthQuarter:{value:0.15,rank:12}, over2p5SecAtt:{value:-0.12,rank:25}, insideRedZone:{value:-0.10,rank:32} },
    sourcePage: 42,
  },
  "Bo Nix": {
    playerName: "Bo Nix",
    stable: { noPressure:{value:0.28,rank:12}, inPocket:{value:0.15,rank:8}, noPlayActionEarlyDowns:{value:0.09,rank:18}, firstDown123Q:{value:0.05,rank:23}, layupThrows:{value:0.09,rank:13}, lt2p5SecAtt:{value:0.19,rank:9}, outsideRedZone:{value:0.06,rank:15} },
    lessStable: { underPressure:{value:-0.32,rank:16}, outsidePocket:{value:-0.10,rank:12}, playAction:{value:0.09,rank:18}, beingBlitzed:{value:0.23,rank:7}, thirdAndFourthDown:{value:0.11,rank:8}, fourthQuarter:{value:0.12,rank:16}, over2p5SecAtt:{value:-0.02,rank:15}, insideRedZone:{value:0.17,rank:11} },
    sourcePage: 42,
  },
  "Tua Tagovailoa": {
    playerName: "Tua Tagovailoa",
    stable: { noPressure:{value:0.16,rank:33}, inPocket:{value:0.01,rank:30}, noPlayActionEarlyDowns:{value:0.04,rank:22}, firstDown123Q:{value:0.06,rank:21}, layupThrows:{value:-0.06,rank:33}, lt2p5SecAtt:{value:0.11,rank:21}, outsideRedZone:{value:-0.07,rank:33} },
    lessStable: { underPressure:{value:-0.43,rank:31}, outsidePocket:{value:-0.10,rank:12}, playAction:{value:-0.02,rank:26}, beingBlitzed:{value:0.02,rank:28}, thirdAndFourthDown:{value:-0.13,rank:22}, fourthQuarter:{value:0.19,rank:6}, over2p5SecAtt:{value:-0.18,rank:31}, insideRedZone:{value:0.34,rank:4} },
    sourcePage: 42,
  },
  "Bryce Young": {
    playerName: "Bryce Young",
    stable: { noPressure:{value:0.22,rank:25}, inPocket:{value:0.03,rank:26}, noPlayActionEarlyDowns:{value:0.13,rank:9}, firstDown123Q:{value:-0.16,rank:42}, layupThrows:{value:-0.10,rank:38}, lt2p5SecAtt:{value:0.15,rank:12}, outsideRedZone:{value:-0.02,rank:26} },
    lessStable: { underPressure:{value:-0.50,rank:35}, outsidePocket:{value:-0.17,rank:18}, playAction:{value:-0.43,rank:44}, beingBlitzed:{value:0.04,rank:24}, thirdAndFourthDown:{value:-0.05,rank:18}, fourthQuarter:{value:0.05,rank:28}, over2p5SecAtt:{value:-0.20,rank:33}, insideRedZone:{value:0.13,rank:16} },
    sourcePage: 42,
  },
  "Jayden Daniels": {
    playerName: "Jayden Daniels",
    stable: { noPressure:{value:0.37,rank:6}, inPocket:{value:0.12,rank:12}, noPlayActionEarlyDowns:{value:0.12,rank:11}, firstDown123Q:{value:0.35,rank:7}, layupThrows:{value:0.22,rank:15}, lt2p5SecAtt:{value:0.12,rank:16}, outsideRedZone:{value:0.25,rank:26} },
    lessStable: { underPressure:{value:-0.24,rank:6}, outsidePocket:{value:-0.12,rank:12}, playAction:{value:0.22,rank:24}, beingBlitzed:{value:-0.32,rank:39}, thirdAndFourthDown:{value:-0.32,rank:37}, fourthQuarter:{value:0.18,rank:7}, over2p5SecAtt:{value:-0.08,rank:23}, insideRedZone:{value:-0.23,rank:41} },
    sourcePage: 42,
  },
  "Aaron Rodgers": {
    playerName: "Aaron Rodgers",
    stable: { noPressure:{value:0.21,rank:26}, inPocket:{value:0.04,rank:23}, noPlayActionEarlyDowns:{value:0.06,rank:18}, firstDown123Q:{value:0.01,rank:27}, layupThrows:{value:0.06,rank:16}, lt2p5SecAtt:{value:-0.04,rank:33}, outsideRedZone:{value:-0.01,rank:24} },
    lessStable: { underPressure:{value:-0.49,rank:33}, outsidePocket:{value:-0.45,rank:38}, playAction:{value:-0.28,rank:42}, beingBlitzed:{value:0.05,rank:19}, thirdAndFourthDown:{value:-0.04,rank:16}, fourthQuarter:{value:-0.01,rank:34}, over2p5SecAtt:{value:-0.04,rank:18}, insideRedZone:{value:-0.23,rank:41} },
    sourcePage: 42,
  },
  "Geno Smith": {
    playerName: "Geno Smith",
    stable: { noPressure:{value:0.23,rank:24}, inPocket:{value:-0.11,rank:36}, noPlayActionEarlyDowns:{value:-0.19,rank:42}, firstDown123Q:{value:-0.04,rank:32}, layupThrows:{value:-0.01,rank:25}, lt2p5SecAtt:{value:-0.03,rank:32}, outsideRedZone:{value:0.11,rank:35} },
    lessStable: { underPressure:{value:-0.66,rank:42}, outsidePocket:{value:-0.21,rank:24}, playAction:{value:-0.04,rank:28}, beingBlitzed:{value:-0.03,rank:30}, thirdAndFourthDown:{value:-0.13,rank:22}, fourthQuarter:{value:0.15,rank:12}, over2p5SecAtt:{value:-0.22,rank:37}, insideRedZone:{value:0.00,rank:23} },
    sourcePage: 42,
  },
  "Tyler Shough": {
    playerName: "Tyler Shough",
    stable: { noPressure:{value:0.33,rank:8}, inPocket:{value:0.04,rank:23}, noPlayActionEarlyDowns:{value:0.03,rank:25}, firstDown123Q:{value:0.18,rank:11}, layupThrows:{value:0.12,rank:9}, lt2p5SecAtt:{value:0.12,rank:16}, outsideRedZone:{value:0.08,rank:12} },
    lessStable: { underPressure:{value:-0.30,rank:12}, outsidePocket:{value:-0.60,rank:42}, playAction:{value:-0.16,rank:35}, beingBlitzed:{value:0.05,rank:19}, thirdAndFourthDown:{value:-0.38,rank:42}, fourthQuarter:{value:-0.20,rank:42}, over2p5SecAtt:{value:-0.30,rank:39}, insideRedZone:{value:-0.10,rank:32} },
    sourcePage: 42,
  },
  "Jaxson Dart": {
    playerName: "Jaxson Dart",
    stable: { noPressure:{value:0.21,rank:26}, inPocket:{value:0.04,rank:23}, noPlayActionEarlyDowns:{value:0.06,rank:18}, firstDown123Q:{value:0.01,rank:27}, layupThrows:{value:0.06,rank:16}, lt2p5SecAtt:{value:-0.04,rank:33}, outsideRedZone:{value:-0.01,rank:24} },
    lessStable: { underPressure:{value:-0.37,rank:21}, outsidePocket:{value:-0.33,rank:34}, playAction:{value:-0.28,rank:42}, beingBlitzed:{value:0.05,rank:19}, thirdAndFourthDown:{value:-0.04,rank:16}, outsidePocket:{value:-0.33,rank:34}, over2p5SecAtt:{value:-0.04,rank:18}, insideRedZone:{value:-0.23,rank:41} },
    sourcePage: 42,
  },
  "Cam Ward": {
    playerName: "Cam Ward",
    stable: { noPressure:{value:0.11,rank:36}, inPocket:{value:-0.13,rank:39}, noPlayActionEarlyDowns:{value:-0.08,rank:37}, firstDown123Q:{value:-0.08,rank:35}, layupThrows:{value:0.03,rank:22}, lt2p5SecAtt:{value:-0.13,rank:40}, outsideRedZone:{value:-0.21,rank:40} },
    lessStable: { underPressure:{value:-0.62,rank:40}, outsidePocket:{value:-0.31,rank:33}, playAction:{value:-0.16,rank:35}, beingBlitzed:{value:-0.42,rank:42}, thirdAndFourthDown:{value:-0.32,rank:37}, fourthQuarter:{value:-0.12,rank:39}, over2p5SecAtt:{value:-0.21,rank:35}, insideRedZone:{value:0.15,rank:14} },
    sourcePage: 43,
  },
  "Dillon Gabriel": {
    playerName: "Dillon Gabriel",
    stable: { noPressure:{value:-0.01,rank:43}, inPocket:{value:-0.23,rank:44}, noPlayActionEarlyDowns:{value:-0.13,rank:41}, firstDown123Q:{value:-0.39,rank:44}, layupThrows:{value:-0.17,rank:41}, lt2p5SecAtt:{value:-0.13,rank:40}, outsideRedZone:{value:-0.15,rank:37} },
    lessStable: { underPressure:{value:-0.49,rank:33}, outsidePocket:{value:-0.20,rank:21}, playAction:{value:-0.10,rank:31}, beingBlitzed:{value:-0.24,rank:37}, thirdAndFourthDown:{value:-0.47,rank:43}, fourthQuarter:{value:-0.09,rank:37}, over2p5SecAtt:{value:-0.37,rank:43}, insideRedZone:{value:-0.22,rank:40} },
    sourcePage: 43,
  },
  "Michael Penix Jr.": {
    playerName: "Michael Penix Jr.",
    stable: { noPressure:{value:0.18,rank:29}, inPocket:{value:-0.41,rank:37}, noPlayActionEarlyDowns:{value:-0.04,rank:33}, firstDown123Q:{value:-0.08,rank:35}, layupThrows:{value:0.05,rank:19}, lt2p5SecAtt:{value:0.12,rank:16}, outsideRedZone:{value:0.16,rank:16} },
    lessStable: { underPressure:{value:-0.35,rank:18}, outsidePocket:{value:-0.41,rank:37}, playAction:{value:-0.04,rank:28}, beingBlitzed:{value:-0.28,rank:35}, thirdAndFourthDown:{value:-0.04,rank:28}, fourthQuarter:{value:0.20,rank:20}, over2p5SecAtt:{value:-0.17,rank:28}, insideRedZone:{value:-0.14,rank:40} },
    sourcePage: 42,
  },
};

// ── Team data ─────────────────────────────────────────────────────────────────

const OFFENSIVE_EFFICIENCY: Record<string, WsOffensiveEfficiencyRanks> = {
  ari:{earlyDownSuccessRank:4,firstHalfEDPassRateRank:8,edQ13PassEpaRank:5,edQ13RushEpaRank:8,edRzPassEpaRank:15,edRzRushEpaRank:3,thirdDownEpaFgRangeRank:20,downSetConvRank:10,explosivePlayRank:7,thirdDownConvRank:8,fourthDownConvRank:28,paceRank:15,sourcePage:46},
  atl:{earlyDownSuccessRank:5,firstHalfEDPassRateRank:27,edQ13PassEpaRank:12,edQ13RushEpaRank:3,edRzPassEpaRank:16,edRzRushEpaRank:13,thirdDownEpaFgRangeRank:26,downSetConvRank:8,explosivePlayRank:5,thirdDownConvRank:17,fourthDownConvRank:6,paceRank:26,sourcePage:46},
  bal:{earlyDownSuccessRank:6,firstHalfEDPassRateRank:24,edQ13PassEpaRank:1,edQ13RushEpaRank:4,edRzPassEpaRank:1,edRzRushEpaRank:5,thirdDownEpaFgRangeRank:2,downSetConvRank:2,explosivePlayRank:1,thirdDownConvRank:3,fourthDownConvRank:20,paceRank:6,sourcePage:46},
  buf:{earlyDownSuccessRank:13,firstHalfEDPassRateRank:11,edQ13PassEpaRank:6,edQ13RushEpaRank:1,edRzPassEpaRank:22,edRzRushEpaRank:2,thirdDownEpaFgRangeRank:4,downSetConvRank:3,explosivePlayRank:11,thirdDownConvRank:7,fourthDownConvRank:2,paceRank:9,sourcePage:46},
  car:{earlyDownSuccessRank:23,firstHalfEDPassRateRank:14,edQ13PassEpaRank:17,edQ13RushEpaRank:11,edRzPassEpaRank:23,edRzRushEpaRank:8,thirdDownEpaFgRangeRank:17,downSetConvRank:27,explosivePlayRank:23,thirdDownConvRank:26,fourthDownConvRank:26,paceRank:24,sourcePage:46},
  chi:{earlyDownSuccessRank:25,firstHalfEDPassRateRank:22,edQ13PassEpaRank:27,edQ13RushEpaRank:17,edRzPassEpaRank:20,edRzRushEpaRank:12,thirdDownEpaFgRangeRank:29,downSetConvRank:25,explosivePlayRank:28,thirdDownConvRank:31,fourthDownConvRank:13,paceRank:23,sourcePage:46},
  cin:{earlyDownSuccessRank:2,firstHalfEDPassRateRank:1,edQ13PassEpaRank:9,edQ13RushEpaRank:20,edRzPassEpaRank:13,edRzRushEpaRank:27,thirdDownEpaFgRangeRank:18,downSetConvRank:7,explosivePlayRank:20,thirdDownConvRank:5,fourthDownConvRank:21,paceRank:14,sourcePage:46},
  cle:{earlyDownSuccessRank:31,firstHalfEDPassRateRank:10,edQ13PassEpaRank:32,edQ13RushEpaRank:21,edRzPassEpaRank:31,edRzRushEpaRank:24,thirdDownEpaFgRangeRank:22,downSetConvRank:32,explosivePlayRank:31,thirdDownConvRank:32,fourthDownConvRank:17,paceRank:30,sourcePage:46},
  dal:{earlyDownSuccessRank:24,firstHalfEDPassRateRank:6,edQ13PassEpaRank:23,edQ13RushEpaRank:25,edRzPassEpaRank:27,edRzRushEpaRank:31,thirdDownEpaFgRangeRank:32,downSetConvRank:24,explosivePlayRank:27,thirdDownConvRank:23,fourthDownConvRank:32,paceRank:32,sourcePage:46},
  den:{earlyDownSuccessRank:18,firstHalfEDPassRateRank:3,edQ13PassEpaRank:21,edQ13RushEpaRank:22,edRzPassEpaRank:4,edRzRushEpaRank:25,thirdDownEpaFgRangeRank:14,downSetConvRank:19,explosivePlayRank:15,thirdDownConvRank:13,fourthDownConvRank:5,paceRank:19,sourcePage:46},
  det:{earlyDownSuccessRank:1,firstHalfEDPassRateRank:30,edQ13PassEpaRank:2,edQ13RushEpaRank:2,edRzPassEpaRank:14,edRzRushEpaRank:9,thirdDownEpaFgRangeRank:5,downSetConvRank:1,explosivePlayRank:2,thirdDownConvRank:4,fourthDownConvRank:7,paceRank:12,sourcePage:46},
  gb:{earlyDownSuccessRank:11,firstHalfEDPassRateRank:32,edQ13PassEpaRank:10,edQ13RushEpaRank:6,edRzPassEpaRank:6,edRzRushEpaRank:18,thirdDownEpaFgRangeRank:7,downSetConvRank:11,explosivePlayRank:3,thirdDownConvRank:15,fourthDownConvRank:23,paceRank:3,sourcePage:46},
  hou:{earlyDownSuccessRank:32,firstHalfEDPassRateRank:9,edQ13PassEpaRank:26,edQ13RushEpaRank:24,edRzPassEpaRank:28,edRzRushEpaRank:28,thirdDownEpaFgRangeRank:19,downSetConvRank:29,explosivePlayRank:10,thirdDownConvRank:20,fourthDownConvRank:11,paceRank:8,sourcePage:46},
  ind:{earlyDownSuccessRank:29,firstHalfEDPassRateRank:31,edQ13PassEpaRank:30,edQ13RushEpaRank:7,edRzPassEpaRank:21,edRzRushEpaRank:23,thirdDownEpaFgRangeRank:11,downSetConvRank:22,explosivePlayRank:9,thirdDownConvRank:18,fourthDownConvRank:12,paceRank:31,sourcePage:46},
  jax:{earlyDownSuccessRank:19,firstHalfEDPassRateRank:12,edQ13PassEpaRank:18,edQ13RushEpaRank:23,edRzPassEpaRank:19,edRzRushEpaRank:17,thirdDownEpaFgRangeRank:6,downSetConvRank:23,explosivePlayRank:19,thirdDownConvRank:22,fourthDownConvRank:19,paceRank:28,sourcePage:46},
  kc:{earlyDownSuccessRank:14,firstHalfEDPassRateRank:2,edQ13PassEpaRank:25,edQ13RushEpaRank:13,edRzPassEpaRank:24,edRzRushEpaRank:7,thirdDownEpaFgRangeRank:3,downSetConvRank:8,explosivePlayRank:32,thirdDownConvRank:2,fourthDownConvRank:3,paceRank:17,sourcePage:46},
  lv:{earlyDownSuccessRank:28,firstHalfEDPassRateRank:20,edQ13PassEpaRank:28,edQ13RushEpaRank:32,edRzPassEpaRank:32,edRzRushEpaRank:10,thirdDownEpaFgRangeRank:24,downSetConvRank:31,explosivePlayRank:30,thirdDownConvRank:30,fourthDownConvRank:15,paceRank:27,sourcePage:46},
  lac:{earlyDownSuccessRank:21,firstHalfEDPassRateRank:7,edQ13PassEpaRank:7,edQ13RushEpaRank:28,edRzPassEpaRank:25,edRzRushEpaRank:14,thirdDownEpaFgRangeRank:8,downSetConvRank:15,explosivePlayRank:14,thirdDownConvRank:11,fourthDownConvRank:10,paceRank:1,sourcePage:46},
  lar:{earlyDownSuccessRank:3,firstHalfEDPassRateRank:21,edQ13PassEpaRank:4,edQ13RushEpaRank:16,edRzPassEpaRank:18,edRzRushEpaRank:15,thirdDownEpaFgRangeRank:13,downSetConvRank:14,explosivePlayRank:16,thirdDownConvRank:24,fourthDownConvRank:7,paceRank:21,sourcePage:46},
  mia:{earlyDownSuccessRank:10,firstHalfEDPassRateRank:19,edQ13PassEpaRank:14,edQ13RushEpaRank:29,edRzPassEpaRank:11,edRzRushEpaRank:30,thirdDownEpaFgRangeRank:25,downSetConvRank:17,explosivePlayRank:21,thirdDownConvRank:25,fourthDownConvRank:25,paceRank:7,sourcePage:46},
  min:{earlyDownSuccessRank:12,firstHalfEDPassRateRank:13,edQ13PassEpaRank:15,edQ13RushEpaRank:10,edRzPassEpaRank:10,edRzRushEpaRank:32,thirdDownEpaFgRangeRank:31,downSetConvRank:13,explosivePlayRank:6,thirdDownConvRank:12,fourthDownConvRank:27,paceRank:11,sourcePage:46},
  ne:{earlyDownSuccessRank:17,firstHalfEDPassRateRank:18,edQ13PassEpaRank:19,edQ13RushEpaRank:31,edRzPassEpaRank:29,edRzRushEpaRank:26,thirdDownEpaFgRangeRank:9,downSetConvRank:26,explosivePlayRank:26,thirdDownConvRank:29,fourthDownConvRank:14,paceRank:16,sourcePage:46},
  no:{earlyDownSuccessRank:22,firstHalfEDPassRateRank:25,edQ13PassEpaRank:20,edQ13RushEpaRank:12,edRzPassEpaRank:5,edRzRushEpaRank:4,thirdDownEpaFgRangeRank:30,downSetConvRank:20,explosivePlayRank:17,thirdDownConvRank:28,fourthDownConvRank:16,paceRank:29,sourcePage:46},
  nyg:{earlyDownSuccessRank:30,firstHalfEDPassRateRank:29,edQ13PassEpaRank:31,edQ13RushEpaRank:30,edRzPassEpaRank:30,edRzRushEpaRank:16,thirdDownEpaFgRangeRank:16,downSetConvRank:28,explosivePlayRank:29,thirdDownConvRank:27,fourthDownConvRank:18,paceRank:20,sourcePage:46},
  nyj:{earlyDownSuccessRank:20,firstHalfEDPassRateRank:16,edQ13PassEpaRank:22,edQ13RushEpaRank:27,edRzPassEpaRank:12,edRzRushEpaRank:19,thirdDownEpaFgRangeRank:23,downSetConvRank:16,explosivePlayRank:22,thirdDownConvRank:14,fourthDownConvRank:29,paceRank:13,sourcePage:46},
  phi:{earlyDownSuccessRank:16,firstHalfEDPassRateRank:26,edQ13PassEpaRank:11,edQ13RushEpaRank:5,edRzPassEpaRank:26,edRzRushEpaRank:6,thirdDownEpaFgRangeRank:10,downSetConvRank:6,explosivePlayRank:13,thirdDownConvRank:10,fourthDownConvRank:4,paceRank:10,sourcePage:46},
  pit:{earlyDownSuccessRank:27,firstHalfEDPassRateRank:23,edQ13PassEpaRank:24,edQ13RushEpaRank:18,edRzPassEpaRank:17,edRzRushEpaRank:29,thirdDownEpaFgRangeRank:15,downSetConvRank:21,explosivePlayRank:25,thirdDownConvRank:15,fourthDownConvRank:31,paceRank:18,sourcePage:46},
  sf:{earlyDownSuccessRank:9,firstHalfEDPassRateRank:15,edQ13PassEpaRank:3,edQ13RushEpaRank:15,edRzPassEpaRank:7,edRzRushEpaRank:20,thirdDownEpaFgRangeRank:12,downSetConvRank:12,explosivePlayRank:8,thirdDownConvRank:9,fourthDownConvRank:23,paceRank:4,sourcePage:46},
  sea:{earlyDownSuccessRank:15,firstHalfEDPassRateRank:4,edQ13PassEpaRank:13,edQ13RushEpaRank:19,edRzPassEpaRank:8,edRzRushEpaRank:22,thirdDownEpaFgRangeRank:27,downSetConvRank:18,explosivePlayRank:12,thirdDownConvRank:21,fourthDownConvRank:21,paceRank:22,sourcePage:46},
  tb:{earlyDownSuccessRank:7,firstHalfEDPassRateRank:5,edQ13PassEpaRank:8,edQ13RushEpaRank:9,edRzPassEpaRank:3,edRzRushEpaRank:1,thirdDownEpaFgRangeRank:1,downSetConvRank:4,explosivePlayRank:4,thirdDownConvRank:1,fourthDownConvRank:9,paceRank:5,sourcePage:46},
  ten:{earlyDownSuccessRank:26,firstHalfEDPassRateRank:28,edQ13PassEpaRank:29,edQ13RushEpaRank:26,edRzPassEpaRank:9,edRzRushEpaRank:21,thirdDownEpaFgRangeRank:28,downSetConvRank:30,explosivePlayRank:24,thirdDownConvRank:19,fourthDownConvRank:30,paceRank:2,sourcePage:46},
  wsh:{earlyDownSuccessRank:8,firstHalfEDPassRateRank:17,edQ13PassEpaRank:16,edQ13RushEpaRank:14,edRzPassEpaRank:2,edRzRushEpaRank:11,thirdDownEpaFgRangeRank:21,downSetConvRank:5,explosivePlayRank:18,thirdDownConvRank:6,fourthDownConvRank:1,paceRank:25,sourcePage:46},
};

const RUSHING_EFFICIENCY: Record<string, WsRushingEfficiency> = {
  ari:{epaPerPlay:{value:0.05,rank:9},successRate:{value:0.456,rank:5},earlyDownSuccess:{value:0.455,rank:3},nonQbScrambleSuccess:{value:0.444,rank:5},ypc:{value:5.3,rank:2},ydsBfContact:{value:1.87,rank:4},ydsAfContact:{value:3.43,rank:2},epaAttBetweenTackles:{value:0.07,rank:2},epaAttOutsideTackles:{value:0.06,rank:6},sourcePage:45},
  atl:{epaPerPlay:{value:0.04,rank:12},successRate:{value:0.445,rank:9},earlyDownSuccess:{value:0.442,rank:6},nonQbScrambleSuccess:{value:0.477,rank:1},ypc:{value:4.5,rank:12},ydsBfContact:{value:1.40,rank:17},ydsAfContact:{value:3.08,rank:10},epaAttBetweenTackles:{value:0.01,rank:4},epaAttOutsideTackles:{value:0.01,rank:10},sourcePage:45},
  bal:{epaPerPlay:{value:0.16,rank:1},successRate:{value:0.466,rank:2},earlyDownSuccess:{value:0.457,rank:2},nonQbScrambleSuccess:{value:0.446,rank:4},ypc:{value:5.8,rank:1},ydsBfContact:{value:2.41,rank:1},ydsAfContact:{value:3.34,rank:4},epaAttBetweenTackles:{value:0.02,rank:3},epaAttOutsideTackles:{value:0.08,rank:4},sourcePage:45},
  buf:{epaPerPlay:{value:0.15,rank:2},successRate:{value:0.440,rank:10},earlyDownSuccess:{value:0.423,rank:12},nonQbScrambleSuccess:{value:0.440,rank:6},ypc:{value:4.5,rank:11},ydsBfContact:{value:1.52,rank:11},ydsAfContact:{value:3.02,rank:12},epaAttBetweenTackles:{value:0.00,rank:6},epaAttOutsideTackles:{value:0.10,rank:2},sourcePage:45},
  car:{epaPerPlay:{value:-0.04,rank:20},successRate:{value:0.387,rank:22},earlyDownSuccess:{value:0.383,rank:21},nonQbScrambleSuccess:{value:0.402,rank:12},ypc:{value:4.6,rank:10},ydsBfContact:{value:1.46,rank:15},ydsAfContact:{value:3.12,rank:7},epaAttBetweenTackles:{value:-0.02,rank:9},epaAttOutsideTackles:{value:0.03,rank:9},sourcePage:45},
  chi:{epaPerPlay:{value:-0.09,rank:26},successRate:{value:0.386,rank:24},earlyDownSuccess:{value:0.378,rank:24},nonQbScrambleSuccess:{value:0.369,rank:22},ypc:{value:4.0,rank:27},ydsBfContact:{value:1.51,rank:12},ydsAfContact:{value:2.51,rank:30},epaAttBetweenTackles:{value:-0.08,rank:16},epaAttOutsideTackles:{value:-0.06,rank:20},sourcePage:45},
  cin:{epaPerPlay:{value:0.09,rank:6},successRate:{value:0.453,rank:6},earlyDownSuccess:{value:0.441,rank:7},nonQbScrambleSuccess:{value:0.369,rank:23},ypc:{value:4.1,rank:20},ydsBfContact:{value:1.45,rank:16},ydsAfContact:{value:2.69,rank:26},epaAttBetweenTackles:{value:-0.09,rank:20},epaAttOutsideTackles:{value:-0.03,rank:16},sourcePage:45},
  cle:{epaPerPlay:{value:-0.19,rank:32},successRate:{value:0.356,rank:32},earlyDownSuccess:{value:0.354,rank:31},nonQbScrambleSuccess:{value:0.358,rank:28},ypc:{value:4.1,rank:23},ydsBfContact:{value:1.33,rank:22},ydsAfContact:{value:2.78,rank:21},epaAttBetweenTackles:{value:-0.10,rank:24},epaAttOutsideTackles:{value:-0.07,rank:23},sourcePage:45},
  dal:{epaPerPlay:{value:-0.09,rank:27},successRate:{value:0.380,rank:28},earlyDownSuccess:{value:0.377,rank:25},nonQbScrambleSuccess:{value:0.395,rank:14},ypc:{value:4.0,rank:30},ydsBfContact:{value:1.08,rank:31},ydsAfContact:{value:2.90,rank:18},epaAttBetweenTackles:{value:-0.11,rank:28},epaAttOutsideTackles:{value:-0.12,rank:30},sourcePage:45},
  den:{epaPerPlay:{value:-0.01,rank:16},successRate:{value:0.407,rank:17},earlyDownSuccess:{value:0.390,rank:17},nonQbScrambleSuccess:{value:0.393,rank:15},ypc:{value:4.1,rank:21},ydsBfContact:{value:1.62,rank:8},ydsAfContact:{value:2.51,rank:29},epaAttBetweenTackles:{value:-0.10,rank:23},epaAttOutsideTackles:{value:-0.02,rank:15},sourcePage:45},
  det:{epaPerPlay:{value:0.15,rank:3},successRate:{value:0.479,rank:1},earlyDownSuccess:{value:0.464,rank:1},nonQbScrambleSuccess:{value:0.446,rank:3},ypc:{value:4.7,rank:9},ydsBfContact:{value:1.66,rank:7},ydsAfContact:{value:3.00,rank:15},epaAttBetweenTackles:{value:0.09,rank:1},epaAttOutsideTackles:{value:0.05,rank:7},sourcePage:45},
  gb:{epaPerPlay:{value:0.06,rank:8},successRate:{value:0.428,rank:12},earlyDownSuccess:{value:0.427,rank:10},nonQbScrambleSuccess:{value:0.409,rank:10},ypc:{value:4.7,rank:6},ydsBfContact:{value:1.37,rank:20},ydsAfContact:{value:3.38,rank:3},epaAttBetweenTackles:{value:-0.04,rank:10},epaAttOutsideTackles:{value:0.01,rank:12},sourcePage:45},
  hou:{epaPerPlay:{value:-0.07,rank:25},successRate:{value:0.365,rank:31},earlyDownSuccess:{value:0.347,rank:32},nonQbScrambleSuccess:{value:0.315,rank:32},ypc:{value:4.4,rank:15},ydsBfContact:{value:1.30,rank:23},ydsAfContact:{value:3.09,rank:9},epaAttBetweenTackles:{value:-0.12,rank:30},epaAttOutsideTackles:{value:-0.10,rank:28},sourcePage:45},
  ind:{epaPerPlay:{value:-0.04,rank:21},successRate:{value:0.383,rank:25},earlyDownSuccess:{value:0.370,rank:28},nonQbScrambleSuccess:{value:0.377,rank:19},ypc:{value:4.7,rank:8},ydsBfContact:{value:1.96,rank:3},ydsAfContact:{value:2.72,rank:23},epaAttBetweenTackles:{value:-0.05,rank:12},epaAttOutsideTackles:{value:-0.03,rank:18},sourcePage:45},
  jax:{epaPerPlay:{value:-0.03,rank:17},successRate:{value:0.394,rank:21},earlyDownSuccess:{value:0.385,rank:20},nonQbScrambleSuccess:{value:0.388,rank:18},ypc:{value:4.2,rank:19},ydsBfContact:{value:1.15,rank:29},ydsAfContact:{value:3.02,rank:11},epaAttBetweenTackles:{value:-0.06,rank:13},epaAttOutsideTackles:{value:-0.01,rank:14},sourcePage:45},
  kc:{epaPerPlay:{value:0.05,rank:10},successRate:{value:0.451,rank:7},earlyDownSuccess:{value:0.424,rank:11},nonQbScrambleSuccess:{value:0.405,rank:11},ypc:{value:4.0,rank:29},ydsBfContact:{value:1.56,rank:10},ydsAfContact:{value:2.42,rank:32},epaAttBetweenTackles:{value:-0.07,rank:15},epaAttOutsideTackles:{value:0.03,rank:8},sourcePage:45},
  lv:{epaPerPlay:{value:-0.12,rank:31},successRate:{value:0.378,rank:29},earlyDownSuccess:{value:0.371,rank:27},nonQbScrambleSuccess:{value:0.318,rank:31},ypc:{value:3.6,rank:32},ydsBfContact:{value:1.08,rank:32},ydsAfContact:{value:2.49,rank:31},epaAttBetweenTackles:{value:-0.34,rank:32},epaAttOutsideTackles:{value:-0.24,rank:32},sourcePage:45},
  lac:{epaPerPlay:{value:0.03,rank:14},successRate:{value:0.395,rank:20},earlyDownSuccess:{value:0.378,rank:23},nonQbScrambleSuccess:{value:0.366,rank:24},ypc:{value:4.1,rank:24},ydsBfContact:{value:1.39,rank:18},ydsAfContact:{value:2.67,rank:27},epaAttBetweenTackles:{value:-0.10,rank:22},epaAttOutsideTackles:{value:-0.04,rank:19},sourcePage:45},
  lar:{epaPerPlay:{value:0.04,rank:13},successRate:{value:0.448,rank:8},earlyDownSuccess:{value:0.448,rank:4},nonQbScrambleSuccess:{value:0.440,rank:7},ypc:{value:3.9,rank:31},ydsBfContact:{value:1.39,rank:19},ydsAfContact:{value:2.53,rank:28},epaAttBetweenTackles:{value:-0.06,rank:14},epaAttOutsideTackles:{value:-0.03,rank:17},sourcePage:45},
  mia:{epaPerPlay:{value:-0.05,rank:23},successRate:{value:0.418,rank:16},earlyDownSuccess:{value:0.422,rank:13},nonQbScrambleSuccess:{value:0.360,rank:27},ypc:{value:4.0,rank:28},ydsBfContact:{value:1.20,rank:26},ydsAfContact:{value:2.81,rank:20},epaAttBetweenTackles:{value:-0.11,rank:25},epaAttOutsideTackles:{value:-0.17,rank:31},sourcePage:45},
  min:{epaPerPlay:{value:0.01,rank:15},successRate:{value:0.424,rank:13},earlyDownSuccess:{value:0.420,rank:15},nonQbScrambleSuccess:{value:0.388,rank:17},ypc:{value:4.1,rank:26},ydsBfContact:{value:1.35,rank:21},ydsAfContact:{value:2.71,rank:25},epaAttBetweenTackles:{value:-0.11,rank:27},epaAttOutsideTackles:{value:-0.06,rank:21},sourcePage:45},
  ne:{epaPerPlay:{value:-0.10,rank:28},successRate:{value:0.395,rank:19},earlyDownSuccess:{value:0.389,rank:18},nonQbScrambleSuccess:{value:0.346,rank:30},ypc:{value:4.4,rank:13},ydsBfContact:{value:1.19,rank:27},ydsAfContact:{value:3.23,rank:6},epaAttBetweenTackles:{value:-0.23,rank:31},epaAttOutsideTackles:{value:-0.08,rank:25},sourcePage:45},
  no:{epaPerPlay:{value:-0.05,rank:22},successRate:{value:0.387,rank:23},earlyDownSuccess:{value:0.382,rank:22},nonQbScrambleSuccess:{value:0.401,rank:13},ypc:{value:4.4,rank:14},ydsBfContact:{value:1.46,rank:14},ydsAfContact:{value:2.94,rank:17},epaAttBetweenTackles:{value:-0.09,rank:19},epaAttOutsideTackles:{value:0.01,rank:11},sourcePage:45},
  nyg:{epaPerPlay:{value:-0.11,rank:29},successRate:{value:0.368,rank:30},earlyDownSuccess:{value:0.354,rank:30},nonQbScrambleSuccess:{value:0.348,rank:29},ypc:{value:4.2,rank:18},ydsBfContact:{value:1.49,rank:13},ydsAfContact:{value:2.71,rank:24},epaAttBetweenTackles:{value:-0.09,rank:18},epaAttOutsideTackles:{value:-0.06,rank:22},sourcePage:45},
  nyj:{epaPerPlay:{value:-0.03,rank:18},successRate:{value:0.401,rank:18},earlyDownSuccess:{value:0.387,rank:19},nonQbScrambleSuccess:{value:0.371,rank:21},ypc:{value:4.3,rank:16},ydsBfContact:{value:1.18,rank:28},ydsAfContact:{value:3.12,rank:8},epaAttBetweenTackles:{value:-0.11,rank:26},epaAttOutsideTackles:{value:-0.09,rank:26},sourcePage:45},
  phi:{epaPerPlay:{value:0.08,rank:7},successRate:{value:0.422,rank:14},earlyDownSuccess:{value:0.397,rank:16},nonQbScrambleSuccess:{value:0.415,rank:9},ypc:{value:4.9,rank:5},ydsBfContact:{value:2.16,rank:2},ydsAfContact:{value:2.74,rank:22},epaAttBetweenTackles:{value:0.00,rank:5},epaAttOutsideTackles:{value:0.10,rank:3},sourcePage:45},
  pit:{epaPerPlay:{value:-0.06,rank:24},successRate:{value:0.381,rank:26},earlyDownSuccess:{value:0.366,rank:29},nonQbScrambleSuccess:{value:0.364,rank:25},ypc:{value:4.1,rank:25},ydsBfContact:{value:1.23,rank:25},ydsAfContact:{value:2.84,rank:19},epaAttBetweenTackles:{value:-0.12,rank:29},epaAttOutsideTackles:{value:-0.10,rank:27},sourcePage:45},
  sf:{epaPerPlay:{value:0.04,rank:11},successRate:{value:0.440,rank:11},earlyDownSuccess:{value:0.434,rank:9},nonQbScrambleSuccess:{value:0.388,rank:16},ypc:{value:4.7,rank:7},ydsBfContact:{value:1.73,rank:5},ydsAfContact:{value:3.00,rank:14},epaAttBetweenTackles:{value:-0.08,rank:17},epaAttOutsideTackles:{value:-0.01,rank:13},sourcePage:45},
  sea:{epaPerPlay:{value:-0.04,rank:19},successRate:{value:0.421,rank:15},earlyDownSuccess:{value:0.421,rank:14},nonQbScrambleSuccess:{value:0.361,rank:26},ypc:{value:4.2,rank:17},ydsBfContact:{value:1.30,rank:24},ydsAfContact:{value:2.95,rank:16},epaAttBetweenTackles:{value:-0.05,rank:11},epaAttOutsideTackles:{value:-0.08,rank:24},sourcePage:45},
  tb:{epaPerPlay:{value:0.11,rank:4},successRate:{value:0.462,rank:3},earlyDownSuccess:{value:0.445,rank:5},nonQbScrambleSuccess:{value:0.423,rank:8},ypc:{value:5.3,rank:3},ydsBfContact:{value:1.58,rank:9},ydsAfContact:{value:3.67,rank:1},epaAttBetweenTackles:{value:-0.02,rank:8},epaAttOutsideTackles:{value:0.07,rank:5},sourcePage:45},
  ten:{epaPerPlay:{value:-0.12,rank:30},successRate:{value:0.381,rank:27},earlyDownSuccess:{value:0.373,rank:26},nonQbScrambleSuccess:{value:0.373,rank:20},ypc:{value:4.1,rank:22},ydsBfContact:{value:1.11,rank:30},ydsAfContact:{value:3.01,rank:13},epaAttBetweenTackles:{value:-0.10,rank:21},epaAttOutsideTackles:{value:-0.11,rank:29},sourcePage:45},
  wsh:{epaPerPlay:{value:0.11,rank:5},successRate:{value:0.457,rank:4},earlyDownSuccess:{value:0.438,rank:8},nonQbScrambleSuccess:{value:0.451,rank:2},ypc:{value:5.0,rank:4},ydsBfContact:{value:1.67,rank:6},ydsAfContact:{value:3.31,rank:5},epaAttBetweenTackles:{value:-0.00,rank:7},epaAttOutsideTackles:{value:0.13,rank:1},sourcePage:45},
};

const HEALTH_BY_UNIT: Record<string, WsHealthByUnit> = {
  ari:{overall2025Rk:32,overall2024Rk:26,vsLastYrRk:31,offenseRk:32,defenseRk:31,qbRk:30,rbRk:32,wrRk:27,teRk:30,olineRk:28,dlineRk:24,lbRk:24,dbRk:32,sourcePage:77,dataSource:"FTN Adjusted Games Lost"},
  atl:{overall2025Rk:20,overall2024Rk:4,vsLastYrRk:29,offenseRk:12,defenseRk:25,qbRk:26,rbRk:1,wrRk:17,teRk:2,olineRk:19,dlineRk:21,lbRk:29,dbRk:14,sourcePage:94,dataSource:"FTN Adjusted Games Lost"},
  bal:{overall2025Rk:18,overall2024Rk:1,vsLastYrRk:30,offenseRk:4,defenseRk:30,qbRk:23,rbRk:23,wrRk:9,teRk:10,olineRk:1,dlineRk:31,lbRk:19,dbRk:16,sourcePage:110,dataSource:"FTN Adjusted Games Lost"},
  buf:{overall2025Rk:13,overall2024Rk:8,vsLastYrRk:22,offenseRk:1,defenseRk:29,qbRk:11,rbRk:6,wrRk:10,teRk:14,olineRk:2,dlineRk:26,lbRk:21,dbRk:29,sourcePage:127,dataSource:"FTN Adjusted Games Lost"},
  car:{overall2025Rk:21,overall2024Rk:30,vsLastYrRk:9,offenseRk:26,defenseRk:14,qbRk:17,rbRk:18,wrRk:20,teRk:13,olineRk:31,dlineRk:28,lbRk:22,dbRk:1,sourcePage:145,dataSource:"FTN Adjusted Games Lost"},
  chi:{overall2025Rk:17,overall2024Rk:3,vsLastYrRk:27,offenseRk:8,defenseRk:26,qbRk:1,rbRk:20,wrRk:13,teRk:8,olineRk:12,dlineRk:14,lbRk:27,dbRk:25,sourcePage:162,dataSource:"FTN Adjusted Games Lost"},
  cin:{overall2025Rk:16,overall2024Rk:15,vsLastYrRk:16,offenseRk:20,defenseRk:10,qbRk:29,rbRk:1,wrRk:8,teRk:29,olineRk:25,dlineRk:23,lbRk:7,dbRk:8,sourcePage:181,dataSource:"FTN Adjusted Games Lost"},
  cle:{overall2025Rk:26,overall2024Rk:27,vsLastYrRk:15,offenseRk:24,defenseRk:21,qbRk:32,rbRk:16,wrRk:15,teRk:19,olineRk:27,dlineRk:12,lbRk:28,dbRk:21,sourcePage:197,dataSource:"FTN Adjusted Games Lost"},
  dal:{overall2025Rk:14,overall2024Rk:19,vsLastYrRk:11,offenseRk:9,defenseRk:22,qbRk:1,rbRk:15,wrRk:11,teRk:1,olineRk:18,dlineRk:3,lbRk:30,dbRk:24,sourcePage:214,dataSource:"FTN Adjusted Games Lost"},
  den:{overall2025Rk:8,overall2024Rk:6,vsLastYrRk:21,offenseRk:18,defenseRk:3,qbRk:1,rbRk:25,wrRk:14,teRk:24,olineRk:20,dlineRk:6,lbRk:23,dbRk:5,sourcePage:231,dataSource:"FTN Adjusted Games Lost"},
  det:{overall2025Rk:31,overall2024Rk:25,vsLastYrRk:26,offenseRk:15,defenseRk:32,qbRk:1,rbRk:10,wrRk:6,teRk:32,olineRk:16,dlineRk:32,lbRk:7,dbRk:31,sourcePage:248,dataSource:"FTN Adjusted Games Lost"},
  gb:{overall2025Rk:15,overall2024Rk:7,vsLastYrRk:25,offenseRk:21,defenseRk:6,qbRk:18,rbRk:22,wrRk:26,teRk:25,olineRk:14,dlineRk:25,lbRk:5,dbRk:7,sourcePage:264,dataSource:"FTN Adjusted Games Lost"},
  hou:{overall2025Rk:25,overall2024Rk:21,vsLastYrRk:20,offenseRk:28,defenseRk:15,qbRk:22,rbRk:31,wrRk:29,teRk:31,olineRk:3,dlineRk:7,lbRk:3,dbRk:27,sourcePage:280,dataSource:"FTN Adjusted Games Lost"},
  ind:{overall2025Rk:12,overall2024Rk:22,vsLastYrRk:7,offenseRk:7,defenseRk:19,qbRk:28,rbRk:1,wrRk:12,teRk:3,olineRk:4,dlineRk:19,lbRk:25,dbRk:15,sourcePage:297,dataSource:"FTN Adjusted Games Lost"},
  jax:{overall2025Rk:7,overall2024Rk:9,vsLastYrRk:14,offenseRk:11,defenseRk:7,qbRk:1,rbRk:1,wrRk:24,teRk:22,olineRk:5,dlineRk:4,lbRk:10,dbRk:20,sourcePage:315,dataSource:"FTN Adjusted Games Lost"},
  kc:{overall2025Rk:4,overall2024Rk:14,vsLastYrRk:10,offenseRk:16,defenseRk:1,qbRk:24,rbRk:21,wrRk:18,teRk:5,olineRk:21,dlineRk:1,lbRk:14,dbRk:4,sourcePage:333,dataSource:"FTN Adjusted Games Lost"},
  lv:{overall2025Rk:5,overall2024Rk:31,vsLastYrRk:1,offenseRk:13,defenseRk:2,qbRk:19,rbRk:1,wrRk:2,teRk:23,olineRk:26,dlineRk:5,lbRk:1,dbRk:11,sourcePage:349,dataSource:"FTN Adjusted Games Lost"},
  lac:{overall2025Rk:27,overall2024Rk:10,vsLastYrRk:28,offenseRk:25,defenseRk:23,qbRk:11,rbRk:26,wrRk:4,teRk:11,olineRk:30,dlineRk:18,lbRk:31,dbRk:12,sourcePage:365,dataSource:"FTN Adjusted Games Lost"},
  lar:{overall2025Rk:10,overall2024Rk:23,vsLastYrRk:4,offenseRk:14,defenseRk:9,qbRk:1,rbRk:10,wrRk:21,teRk:26,olineRk:15,dlineRk:1,lbRk:7,dbRk:22,sourcePage:382,dataSource:"FTN Adjusted Games Lost"},
  mia:{overall2025Rk:29,overall2024Rk:28,vsLastYrRk:17,offenseRk:31,defenseRk:20,qbRk:11,rbRk:13,wrRk:23,teRk:28,olineRk:32,dlineRk:8,lbRk:12,dbRk:30,sourcePage:400,dataSource:"FTN Adjusted Games Lost"},
  min:{overall2025Rk:9,overall2024Rk:11,vsLastYrRk:13,offenseRk:17,defenseRk:4,qbRk:27,rbRk:24,wrRk:1,teRk:15,olineRk:24,dlineRk:15,lbRk:15,dbRk:6,sourcePage:417,dataSource:"FTN Adjusted Games Lost"},
  ne:{overall2025Rk:1,overall2024Rk:24,vsLastYrRk:2,offenseRk:6,defenseRk:5,qbRk:1,rbRk:19,wrRk:16,teRk:5,olineRk:10,dlineRk:17,lbRk:17,dbRk:3,sourcePage:434,dataSource:"FTN Adjusted Games Lost"},
  no:{overall2025Rk:19,overall2024Rk:29,vsLastYrRk:3,offenseRk:23,defenseRk:12,qbRk:11,rbRk:29,wrRk:19,teRk:27,olineRk:22,dlineRk:10,lbRk:2,dbRk:17,sourcePage:451,dataSource:"FTN Adjusted Games Lost"},
  nyg:{overall2025Rk:23,overall2024Rk:13,vsLastYrRk:24,offenseRk:19,defenseRk:24,qbRk:19,rbRk:28,wrRk:25,teRk:12,olineRk:9,dlineRk:22,lbRk:31,dbRk:13,sourcePage:468,dataSource:"FTN Adjusted Games Lost"},
  nyj:{overall2025Rk:22,overall2024Rk:20,vsLastYrRk:18,offenseRk:22,defenseRk:18,qbRk:21,rbRk:16,wrRk:28,teRk:17,olineRk:17,dlineRk:9,lbRk:15,dbRk:28,sourcePage:486,dataSource:"FTN Adjusted Games Lost"},
  phi:{overall2025Rk:2,overall2024Rk:2,vsLastYrRk:19,offenseRk:5,defenseRk:11,qbRk:1,rbRk:6,wrRk:4,teRk:15,olineRk:11,dlineRk:13,lbRk:20,dbRk:10,sourcePage:502,dataSource:"FTN Adjusted Games Lost"},
  pit:{overall2025Rk:6,overall2024Rk:18,vsLastYrRk:8,offenseRk:2,defenseRk:17,qbRk:15,rbRk:6,wrRk:7,teRk:7,olineRk:8,dlineRk:20,lbRk:18,dbRk:18,sourcePage:520,dataSource:"FTN Adjusted Games Lost"},
  sf:{overall2025Rk:28,overall2024Rk:32,vsLastYrRk:5,offenseRk:27,defenseRk:28,qbRk:25,rbRk:12,wrRk:31,teRk:20,olineRk:22,dlineRk:30,lbRk:26,dbRk:9,sourcePage:537,dataSource:"FTN Adjusted Games Lost"},
  sea:{overall2025Rk:3,overall2024Rk:16,vsLastYrRk:6,offenseRk:3,defenseRk:13,qbRk:1,rbRk:14,wrRk:3,teRk:18,olineRk:5,dlineRk:11,lbRk:13,dbRk:18,sourcePage:554,dataSource:"FTN Adjusted Games Lost"},
  tb:{overall2025Rk:24,overall2024Rk:17,vsLastYrRk:23,offenseRk:29,defenseRk:8,qbRk:16,rbRk:27,wrRk:32,teRk:4,olineRk:29,dlineRk:27,lbRk:11,dbRk:2,sourcePage:571,dataSource:"FTN Adjusted Games Lost"},
  ten:{overall2025Rk:11,overall2024Rk:12,vsLastYrRk:12,offenseRk:10,defenseRk:16,qbRk:1,rbRk:6,wrRk:22,teRk:8,olineRk:7,dlineRk:16,lbRk:5,dbRk:23,sourcePage:588,dataSource:"FTN Adjusted Games Lost"},
  wsh:{overall2025Rk:30,overall2024Rk:5,vsLastYrRk:32,offenseRk:30,defenseRk:27,qbRk:31,rbRk:30,wrRk:30,teRk:21,olineRk:13,dlineRk:29,lbRk:4,dbRk:25,sourcePage:605,dataSource:"FTN Adjusted Games Lost"},
};

// ── Exports ───────────────────────────────────────────────────────────────────

export const WS_OFFENSIVE_EFFICIENCY: Record<string, WsOffensiveEfficiencyRanks> = OFFENSIVE_EFFICIENCY;
export const WS_RUSHING_EFFICIENCY: Record<string, WsRushingEfficiency> = RUSHING_EFFICIENCY;
export const WS_QB_METRICS: Record<string, WsQbMetrics> = QB_METRICS;
export const WS_HEALTH_BY_UNIT: Record<string, WsHealthByUnit> = HEALTH_BY_UNIT;
export const WS_PROJECTED_QB_2026: Record<string, string> = QB_BY_TEAM;

export function getWsOffensiveEfficiency(abbr: string): WsOffensiveEfficiencyRanks | null {
  return WS_OFFENSIVE_EFFICIENCY[abbr.toLowerCase()] ?? null;
}
export function getWsRushingEfficiency(abbr: string): WsRushingEfficiency | null {
  return WS_RUSHING_EFFICIENCY[abbr.toLowerCase()] ?? null;
}
export function getWsQbMetrics(playerName: string): WsQbMetrics | null {
  return WS_QB_METRICS[playerName] ?? null;
}
export function getWsHealthByUnit(abbr: string): WsHealthByUnit | null {
  return WS_HEALTH_BY_UNIT[abbr.toLowerCase()] ?? null;
}

/** Get QB metrics for the projected 2026 starter of a given team */
export function getWsQbMetricsForTeam(abbr: string): WsQbMetrics | null {
  const qbName = WS_PROJECTED_QB_2026[abbr.toLowerCase()];
  if (!qbName) return null;
  return WS_QB_METRICS[qbName] ?? null;
}

export const WS_ADVANCED_SOURCE_PAGES = {
  offensiveEfficiency: 46,
  rushingEfficiency: 45,
  stableQbMetrics: 42,
  lessStableQbMetrics: 43,
  healthByUnit: "chapter page 3 per team",
} as const;

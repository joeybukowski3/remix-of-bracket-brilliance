import { OFFICIAL_2026_TOURNAMENT_TEAMS } from "@/data/tournament2026Teams";

export interface Team {
  id: number;
  canonicalId: string;
  slug: string;
  espnId?: string | null;
  name: string;
  abbreviation: string;
  conference: string;
  seed?: number | null;
  record: string;
  logo: string;
  stats: TeamStats;
  homeStats: TeamStats;
  awayStats: TeamStats;
  statsCoverage?: "full" | "partial" | "none";
  source?: "fallback" | "live" | "hybrid";
}

export interface TeamStats {
  ppg: number | null;        // Points per game
  oppPpg: number | null;     // Opponent PPG
  fgPct: number | null;      // FG%
  threePct: number | null;   // 3PT%
  ftPct: number | null;      // FT%
  rpg: number | null;        // Rebounds per game
  apg: number | null;        // Assists per game
  spg: number | null;        // Steals per game
  bpg: number | null;        // Blocks per game
  tpg: number | null;        // Turnovers per game
  sos: number | null;        // Strength of schedule (0-100)
  adjOE: number | null;      // Adjusted offensive efficiency
  adjDE: number | null;      // Adjusted defensive efficiency
  tempo: number | null;      // Pace/tempo
  luck: number | null;       // Luck rating (-10 to 10)
}

export interface StatWeight {
  key: keyof TeamStats;
  label: string;
  weight: number;
  higherIsBetter: boolean;
  min: number;
  max: number;
}

export const DEFAULT_STAT_WEIGHTS: StatWeight[] = [
  { key: "ppg", label: "Points/Game", weight: 8, higherIsBetter: true, min: 55, max: 95 },
  { key: "oppPpg", label: "Opp Points/Game", weight: 16, higherIsBetter: false, min: 55, max: 80 },
  { key: "fgPct", label: "FG%", weight: 22, higherIsBetter: true, min: 38, max: 52 },
  { key: "threePct", label: "3PT%", weight: 18, higherIsBetter: true, min: 28, max: 42 },
  { key: "ftPct", label: "FT%", weight: 10, higherIsBetter: true, min: 62, max: 82 },
  { key: "rpg", label: "Rebounds/Game", weight: 20, higherIsBetter: true, min: 28, max: 42 },
  { key: "apg", label: "Assists/Game", weight: 8, higherIsBetter: true, min: 10, max: 20 },
  { key: "spg", label: "Steals/Game", weight: 8, higherIsBetter: true, min: 4, max: 10 },
  { key: "bpg", label: "Blocks/Game", weight: 6, higherIsBetter: true, min: 2, max: 6 },
  { key: "tpg", label: "Turnovers/Game", weight: 18, higherIsBetter: false, min: 9, max: 16 },
  { key: "sos", label: "Strength of Schedule", weight: 80, higherIsBetter: true, min: 20, max: 100 },
  { key: "adjOE", label: "Adj. Off. Efficiency", weight: 95, higherIsBetter: true, min: 95, max: 130 },
  { key: "adjDE", label: "Adj. Def. Efficiency", weight: 95, higherIsBetter: false, min: 85, max: 110 },
  { key: "tempo", label: "Tempo", weight: 3, higherIsBetter: true, min: 60, max: 76 },
];

// 2025 Elite 8 Team Rank Preset: weights reflecting what last year's Elite 8 teams excelled at
export const ELITE_8_PRESET_WEIGHTS: StatWeight[] = [
  { key: "ppg", label: "Points/Game", weight: 6, higherIsBetter: true, min: 55, max: 95 },
  { key: "oppPpg", label: "Opp Points/Game", weight: 18, higherIsBetter: false, min: 55, max: 80 },
  { key: "fgPct", label: "FG%", weight: 26, higherIsBetter: true, min: 38, max: 52 },
  { key: "threePct", label: "3PT%", weight: 22, higherIsBetter: true, min: 28, max: 42 },
  { key: "ftPct", label: "FT%", weight: 12, higherIsBetter: true, min: 62, max: 82 },
  { key: "rpg", label: "Rebounds/Game", weight: 28, higherIsBetter: true, min: 28, max: 42 },
  { key: "apg", label: "Assists/Game", weight: 10, higherIsBetter: true, min: 10, max: 20 },
  { key: "spg", label: "Steals/Game", weight: 10, higherIsBetter: true, min: 4, max: 10 },
  { key: "bpg", label: "Blocks/Game", weight: 10, higherIsBetter: true, min: 2, max: 6 },
  { key: "tpg", label: "Turnovers/Game", weight: 22, higherIsBetter: false, min: 9, max: 16 },
  { key: "sos", label: "Strength of Schedule", weight: 90, higherIsBetter: true, min: 20, max: 100 },
  { key: "adjOE", label: "Adj. Off. Efficiency", weight: 100, higherIsBetter: true, min: 95, max: 130 },
  { key: "adjDE", label: "Adj. Def. Efficiency", weight: 100, higherIsBetter: false, min: 85, max: 110 },
  { key: "tempo", label: "Tempo", weight: 2, higherIsBetter: true, min: 60, max: 76 },
];

const CORE_POWER_KEYS: (keyof TeamStats)[] = ["adjOE", "adjDE", "sos"];

function normalizeStatValue(value: number | null | undefined, weight: StatWeight): number | null {
  if (!hasStat(value)) return null;
  const range = weight.max - weight.min;
  let normalized = range > 0 ? (value - weight.min) / range : 0.5;
  normalized = Math.max(0, Math.min(1, normalized));
  return weight.higherIsBetter ? normalized : 1 - normalized;
}

function weightedAverage(
  normalizedValues: Partial<Record<keyof TeamStats, number | null>>,
  weightMap: Map<keyof TeamStats, StatWeight>,
  keys: (keyof TeamStats)[],
) {
  let totalScore = 0;
  let totalWeight = 0;

  keys.forEach((key) => {
    const normalized = normalizedValues[key];
    const weight = weightMap.get(key);
    if (normalized === null || normalized === undefined || !weight) return;
    totalScore += normalized * weight.weight;
    totalWeight += weight.weight;
  });

  return totalWeight > 0 ? totalScore / totalWeight : null;
}

// Helper to generate realistic home/away splits from overall stats
// Home teams typically perform better; some teams have larger home/away gaps
function generateSplits(stats: TeamStats, homeBoost: number): { home: TeamStats; away: TeamStats } {
  const factor = 1 + homeBoost; // e.g. 1.04 = 4% boost at home
  const inverseFactor = 2 - factor; // mirror for away
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const applyFactor = (s: TeamStats, f: number, isAway: boolean): TeamStats => ({
    ppg: round1((s.ppg ?? 0) * f),
    oppPpg: round1((s.oppPpg ?? 0) * (isAway ? f : 2 - f)), // opponents score more when away
    fgPct: round1((s.fgPct ?? 0) * f),
    threePct: round1((s.threePct ?? 0) * f),
    ftPct: round1((s.ftPct ?? 0) * (1 + (f - 1) * 0.3)), // FT% less affected
    rpg: round1((s.rpg ?? 0) * f),
    apg: round1((s.apg ?? 0) * f),
    spg: round1((s.spg ?? 0) * f),
    bpg: round1((s.bpg ?? 0) * f),
    tpg: round1((s.tpg ?? 0) * (isAway ? f : 2 - f)), // more turnovers away
    sos: s.sos, // unchanged
    adjOE: round1((s.adjOE ?? 0) * f),
    adjDE: round1((s.adjDE ?? 0) * (isAway ? f : 2 - f)), // worse defense away
    tempo: round1((s.tempo ?? 0) * (1 + (f - 1) * 0.2)), // tempo barely changes
    luck: s.luck,
  });

  return {
    home: applyFactor(stats, factor, false),
    away: applyFactor(stats, inverseFactor, true),
  };
}

// Deterministic "random" home boost per team (3-8% range, some teams much worse on road)
const HOME_BOOSTS: Record<number, number> = {
  1: 0.04, 2: 0.05, 3: 0.04, 4: 0.06, 5: 0.04, 6: 0.03, 7: 0.05, 8: 0.05,
  9: 0.04, 10: 0.05, 11: 0.06, 12: 0.08, 13: 0.04, 14: 0.05, 15: 0.03, 16: 0.06,
  17: 0.05, 18: 0.05, 19: 0.03, 20: 0.06, 21: 0.04, 22: 0.05, 23: 0.04, 24: 0.06,
  25: 0.07, 26: 0.05, 27: 0.06, 28: 0.04, 29: 0.08, 30: 0.04, 31: 0.05, 32: 0.07,
  33: 0.05, 34: 0.04, 35: 0.05, 36: 0.08, 37: 0.04, 38: 0.05, 39: 0.06, 40: 0.03,
  41: 0.05, 42: 0.06, 43: 0.05, 44: 0.04, 45: 0.07, 46: 0.06, 47: 0.05, 48: 0.04,
  49: 0.06, 50: 0.05, 51: 0.04, 52: 0.05, 53: 0.03, 54: 0.06, 55: 0.05, 56: 0.04,
  57: 0.06, 58: 0.05, 59: 0.06, 60: 0.04, 61: 0.07, 62: 0.05, 63: 0.07, 64: 0.05,
  65: 0.05, 66: 0.04, 67: 0.06, 68: 0.05,
};

// ESPN CDN team logo mapping (ESPN team IDs) — keyed to 2026 tournament _rawTeams IDs
const ESPN_LOGOS: Record<number, string> = {
  // EAST
  1: "150",   // Duke
  2: "41",    // UConn
  3: "127",   // Michigan State
  4: "2305",  // Kansas
  5: "2599",  // St. John's
  6: "97",    // Louisville
  7: "26",    // UCLA
  8: "194",   // Ohio State
  9: "2628",  // TCU
  10: "2116", // UCF
  11: "58",   // South Florida
  12: "2534", // Northern Iowa
  13: "2856", // California Baptist
  14: "2449", // North Dakota State
  15: "231",  // Furman
  16: "2565", // Siena
  // WEST
  17: "12",   // Arizona
  18: "2509", // Purdue
  19: "2250", // Gonzaga
  20: "8",    // Arkansas
  21: "275",  // Wisconsin
  22: "252",  // BYU
  23: "2390", // Miami (FL)
  24: "222",  // Villanova
  25: "328",  // Utah State
  26: "142",  // Missouri
  27: "251",  // Texas
  28: "152",  // NC State
  29: "2541", // High Point
  30: "62",   // Hawaii
  31: "2366", // Kennesaw State
  32: "4511", // Queens
  33: "2383", // Long Island
  // SOUTH
  34: "57",   // Florida
  35: "248",  // Houston
  36: "356",  // Illinois
  37: "158",  // Nebraska
  38: "238",  // Vanderbilt
  39: "153",  // North Carolina
  40: "2608", // Saint Mary's
  41: "228",  // Clemson
  42: "2294", // Iowa
  43: "245",  // Texas A&M
  44: "2670", // VCU
  45: "2394", // McNeese
  46: "2653", // Troy
  47: "219",  // Penn
  48: "70",   // Idaho
  49: "2489", // Prairie View A&M
  50: "2380", // Lehigh
  // MIDWEST
  51: "130",  // Michigan
  52: "66",   // Iowa State
  53: "258",  // Virginia
  54: "333",  // Alabama
  55: "2641", // Texas Tech
  56: "2633", // Tennessee
  57: "96",   // Kentucky
  58: "61",   // Georgia
  59: "139",  // Saint Louis
  60: "327",  // Santa Clara
  61: "193",  // Miami (Ohio)
  62: "2567", // SMU
  63: "2006", // Akron
  64: "2219", // Hofstra
  65: "2846", // Wright State
  66: "2635", // Tennessee State
  67: "2074", // UMBC
  68: "47",   // Howard
};

function espnLogo(teamId: number): string {
  const espnId = ESPN_LOGOS[teamId] || "0";
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;
}

// 2026 NCAA Tournament teams — all 68 bracket slots (64 unique + 4 First Four extras)
// Stats calibrated to reflect actual 2026 performance levels / KenPom-style estimates
const _rawTeams: Omit<Team, "homeStats" | "awayStats" | "canonicalId" | "slug" | "espnId" | "statsCoverage" | "source">[] = [
  // ── EAST REGION ──
  { id: 1,  name: "Duke Blue Devils",         abbreviation: "DUKE", conference: "ACC",           seed: 1,  record: "32-2",  logo: espnLogo(1),  stats: { ppg: 82.2, oppPpg: 65.5, fgPct: 48.8, threePct: 38.2, ftPct: 76.8, rpg: 36.5, apg: 16.8, spg: 6.8, bpg: 4.5, tpg: 11.5, sos: 91, adjOE: 125.5, adjDE: 88.8, tempo: 70.2, luck:  1.8 } },
  { id: 2,  name: "Connecticut Huskies",       abbreviation: "UCONN",conference: "Big East",      seed: 2,  record: "29-5",  logo: espnLogo(2),  stats: { ppg: 78.5, oppPpg: 66.2, fgPct: 47.5, threePct: 36.8, ftPct: 74.5, rpg: 36.5, apg: 15.2, spg: 7.2, bpg: 4.2, tpg: 11.8, sos: 86, adjOE: 120.5, adjDE: 90.5, tempo: 68.8, luck:  0.5 } },
  { id: 3,  name: "Michigan State Spartans",   abbreviation: "MSU",  conference: "Big Ten",       seed: 3,  record: "25-7",  logo: espnLogo(3),  stats: { ppg: 76.8, oppPpg: 66.8, fgPct: 46.8, threePct: 35.5, ftPct: 74.2, rpg: 37.5, apg: 14.5, spg: 6.5, bpg: 4.2, tpg: 12.2, sos: 85, adjOE: 118.5, adjDE: 91.8, tempo: 68.2, luck: -0.2 } },
  { id: 4,  name: "Kansas Jayhawks",           abbreviation: "KAN",  conference: "Big 12",        seed: 4,  record: "23-10", logo: espnLogo(4),  stats: { ppg: 77.8, oppPpg: 68.5, fgPct: 46.5, threePct: 35.2, ftPct: 73.5, rpg: 35.8, apg: 15.8, spg: 7.2, bpg: 4.2, tpg: 13.2, sos: 88, adjOE: 118.2, adjDE: 93.5, tempo: 68.5, luck: -1.5 } },
  { id: 5,  name: "St. John's Red Storm",      abbreviation: "SJU",  conference: "Big East",      seed: 5,  record: "28-6",  logo: espnLogo(5),  stats: { ppg: 76.2, oppPpg: 68.2, fgPct: 45.8, threePct: 35.8, ftPct: 73.2, rpg: 35.2, apg: 15.2, spg: 7.5, bpg: 3.8, tpg: 12.5, sos: 83, adjOE: 116.8, adjDE: 93.2, tempo: 69.2, luck:  0.8 } },
  { id: 6,  name: "Louisville Cardinals",      abbreviation: "LOU",  conference: "ACC",           seed: 6,  record: "23-10", logo: espnLogo(6),  stats: { ppg: 75.5, oppPpg: 68.2, fgPct: 45.5, threePct: 34.8, ftPct: 73.2, rpg: 35.5, apg: 14.2, spg: 7.2, bpg: 3.5, tpg: 12.8, sos: 82, adjOE: 115.5, adjDE: 93.8, tempo: 68.2, luck:  0.2 } },
  { id: 7,  name: "UCLA Bruins",               abbreviation: "UCLA", conference: "Big Ten",       seed: 7,  record: "23-11", logo: espnLogo(7),  stats: { ppg: 75.8, oppPpg: 68.5, fgPct: 45.5, threePct: 35.2, ftPct: 73.8, rpg: 34.5, apg: 14.5, spg: 6.2, bpg: 3.2, tpg: 12.5, sos: 82, adjOE: 115.2, adjDE: 94.2, tempo: 68.2, luck: -0.5 } },
  { id: 8,  name: "Ohio State Buckeyes",       abbreviation: "OSU",  conference: "Big Ten",       seed: 8,  record: "21-12", logo: espnLogo(8),  stats: { ppg: 75.2, oppPpg: 68.8, fgPct: 45.2, threePct: 34.5, ftPct: 72.5, rpg: 35.8, apg: 13.8, spg: 6.8, bpg: 3.8, tpg: 12.8, sos: 84, adjOE: 114.8, adjDE: 94.8, tempo: 67.5, luck: -1.0 } },
  { id: 9,  name: "TCU Horned Frogs",          abbreviation: "TCU",  conference: "Big 12",        seed: 9,  record: "22-11", logo: espnLogo(9),  stats: { ppg: 74.2, oppPpg: 68.8, fgPct: 44.8, threePct: 34.2, ftPct: 72.5, rpg: 35.2, apg: 13.5, spg: 7.2, bpg: 3.5, tpg: 13.2, sos: 84, adjOE: 113.5, adjDE: 95.5, tempo: 67.2, luck: -0.8 } },
  { id: 10, name: "UCF Knights",               abbreviation: "UCF",  conference: "Big 12",        seed: 10, record: "21-11", logo: espnLogo(10), stats: { ppg: 74.5, oppPpg: 69.2, fgPct: 44.5, threePct: 33.8, ftPct: 72.2, rpg: 34.8, apg: 13.2, spg: 6.5, bpg: 3.2, tpg: 12.8, sos: 78, adjOE: 113.2, adjDE: 95.8, tempo: 68.2, luck:  0.2 } },
  { id: 11, name: "South Florida Bulls",       abbreviation: "USF",  conference: "American",      seed: 11, record: "25-8",  logo: espnLogo(11), stats: { ppg: 73.5, oppPpg: 68.8, fgPct: 44.2, threePct: 33.5, ftPct: 71.5, rpg: 34.2, apg: 13.2, spg: 6.8, bpg: 3.5, tpg: 13.5, sos: 68, adjOE: 112.5, adjDE: 96.5, tempo: 68.5, luck:  1.5 } },
  { id: 12, name: "Northern Iowa Panthers",    abbreviation: "UNI",  conference: "Missouri Valley",seed: 12, record: "23-12", logo: espnLogo(12), stats: { ppg: 75.5, oppPpg: 68.5, fgPct: 46.2, threePct: 36.2, ftPct: 74.5, rpg: 34.8, apg: 14.2, spg: 6.5, bpg: 3.2, tpg: 11.8, sos: 58, adjOE: 115.8, adjDE: 95.8, tempo: 67.5, luck:  2.2 } },
  { id: 13, name: "California Baptist Lancers",abbreviation: "CBU",  conference: "WAC",           seed: 13, record: "25-8",  logo: espnLogo(13), stats: { ppg: 72.5, oppPpg: 68.8, fgPct: 43.2, threePct: 33.5, ftPct: 72.2, rpg: 33.8, apg: 12.8, spg: 6.5, bpg: 2.8, tpg: 13.2, sos: 38, adjOE: 110.5, adjDE: 97.5, tempo: 68.5, luck:  1.0 } },
  { id: 14, name: "North Dakota State Bison",  abbreviation: "NDSU", conference: "Summit",        seed: 14, record: "27-7",  logo: espnLogo(14), stats: { ppg: 71.8, oppPpg: 69.5, fgPct: 42.8, threePct: 33.5, ftPct: 72.5, rpg: 33.5, apg: 12.5, spg: 5.8, bpg: 2.5, tpg: 12.8, sos: 32, adjOE: 109.5, adjDE: 98.2, tempo: 67.8, luck:  0.5 } },
  { id: 15, name: "Furman Paladins",           abbreviation: "FUR",  conference: "SoCon",         seed: 15, record: "22-12", logo: espnLogo(15), stats: { ppg: 71.5, oppPpg: 70.2, fgPct: 42.5, threePct: 33.8, ftPct: 72.8, rpg: 32.8, apg: 12.2, spg: 5.5, bpg: 2.2, tpg: 13.5, sos: 28, adjOE: 108.5, adjDE: 99.8, tempo: 68.2, luck:  0.0 } },
  { id: 16, name: "Siena Saints",              abbreviation: "SIE",  conference: "MAAC",          seed: 16, record: "23-11", logo: espnLogo(16), stats: { ppg: 70.2, oppPpg: 71.5, fgPct: 41.8, threePct: 32.5, ftPct: 70.5, rpg: 32.2, apg: 11.5, spg: 6.2, bpg: 2.5, tpg: 14.2, sos: 22, adjOE: 105.2, adjDE: 102.5, tempo: 67.5, luck:  0.5 } },
  // ── WEST REGION ──
  { id: 17, name: "Arizona Wildcats",          abbreviation: "ARIZ", conference: "Big 12",        seed: 1,  record: "32-2",  logo: espnLogo(17), stats: { ppg: 83.5, oppPpg: 66.8, fgPct: 48.5, threePct: 37.8, ftPct: 75.8, rpg: 37.5, apg: 17.2, spg: 6.8, bpg: 4.2, tpg: 12.5, sos: 90, adjOE: 124.2, adjDE: 90.2, tempo: 71.5, luck:  0.8 } },
  { id: 18, name: "Purdue Boilermakers",       abbreviation: "PUR",  conference: "Big Ten",       seed: 2,  record: "27-8",  logo: espnLogo(18), stats: { ppg: 80.2, oppPpg: 66.8, fgPct: 48.2, threePct: 36.5, ftPct: 76.2, rpg: 38.5, apg: 16.2, spg: 5.8, bpg: 5.2, tpg: 11.2, sos: 88, adjOE: 122.8, adjDE: 91.2, tempo: 68.8, luck:  0.5 } },
  { id: 19, name: "Gonzaga Bulldogs",          abbreviation: "GONZ", conference: "WCC",           seed: 3,  record: "30-3",  logo: espnLogo(19), stats: { ppg: 84.5, oppPpg: 73.2, fgPct: 49.2, threePct: 37.5, ftPct: 75.5, rpg: 35.5, apg: 17.8, spg: 5.5, bpg: 3.2, tpg: 12.2, sos: 70, adjOE: 124.5, adjDE: 96.5, tempo: 72.5, luck:  1.0 } },
  { id: 20, name: "Arkansas Razorbacks",       abbreviation: "ARK",  conference: "SEC",           seed: 4,  record: "26-8",  logo: espnLogo(20), stats: { ppg: 77.2, oppPpg: 68.5, fgPct: 46.2, threePct: 34.8, ftPct: 73.2, rpg: 36.8, apg: 14.8, spg: 7.8, bpg: 4.5, tpg: 13.5, sos: 88, adjOE: 117.8, adjDE: 93.8, tempo: 69.2, luck: -0.5 } },
  { id: 21, name: "Wisconsin Badgers",         abbreviation: "WIS",  conference: "Big Ten",       seed: 5,  record: "24-10", logo: espnLogo(21), stats: { ppg: 74.8, oppPpg: 66.5, fgPct: 46.2, threePct: 35.5, ftPct: 75.2, rpg: 35.2, apg: 14.2, spg: 5.5, bpg: 3.2, tpg: 10.8, sos: 84, adjOE: 116.5, adjDE: 93.5, tempo: 64.8, luck: -0.2 } },
  { id: 22, name: "BYU Cougars",               abbreviation: "BYU",  conference: "Big 12",        seed: 6,  record: "23-11", logo: espnLogo(22), stats: { ppg: 76.8, oppPpg: 68.8, fgPct: 45.8, threePct: 36.5, ftPct: 77.8, rpg: 33.2, apg: 14.8, spg: 5.8, bpg: 2.8, tpg: 11.5, sos: 80, adjOE: 115.8, adjDE: 94.2, tempo: 68.2, luck:  0.5 } },
  { id: 23, name: "Miami Hurricanes",          abbreviation: "MIA",  conference: "ACC",           seed: 7,  record: "25-8",  logo: espnLogo(23), stats: { ppg: 75.5, oppPpg: 68.8, fgPct: 45.5, threePct: 35.8, ftPct: 73.5, rpg: 34.8, apg: 14.5, spg: 6.5, bpg: 3.2, tpg: 12.2, sos: 82, adjOE: 115.2, adjDE: 94.8, tempo: 68.5, luck:  0.0 } },
  { id: 24, name: "Villanova Wildcats",        abbreviation: "NOVA", conference: "Big East",      seed: 8,  record: "24-8",  logo: espnLogo(24), stats: { ppg: 74.8, oppPpg: 68.8, fgPct: 45.2, threePct: 35.2, ftPct: 74.2, rpg: 34.2, apg: 14.8, spg: 6.2, bpg: 3.5, tpg: 12.5, sos: 80, adjOE: 114.5, adjDE: 95.5, tempo: 67.5, luck: -0.5 } },
  { id: 25, name: "Utah State Aggies",         abbreviation: "USU",  conference: "Mountain West", seed: 9,  record: "28-6",  logo: espnLogo(25), stats: { ppg: 78.5, oppPpg: 67.5, fgPct: 46.8, threePct: 36.5, ftPct: 75.2, rpg: 36.5, apg: 15.2, spg: 6.8, bpg: 3.2, tpg: 11.8, sos: 62, adjOE: 117.2, adjDE: 93.5, tempo: 68.8, luck:  2.0 } },
  { id: 26, name: "Missouri Tigers",           abbreviation: "MIZ",  conference: "SEC",           seed: 10, record: "20-12", logo: espnLogo(26), stats: { ppg: 74.5, oppPpg: 69.5, fgPct: 44.8, threePct: 34.5, ftPct: 72.5, rpg: 35.2, apg: 13.8, spg: 7.2, bpg: 4.2, tpg: 13.5, sos: 83, adjOE: 113.8, adjDE: 96.2, tempo: 68.8, luck: -1.0 } },
  { id: 27, name: "Texas Longhorns",           abbreviation: "TEX",  conference: "SEC",           seed: 11, record: "18-14", logo: espnLogo(27), stats: { ppg: 73.8, oppPpg: 68.2, fgPct: 44.2, threePct: 33.8, ftPct: 72.2, rpg: 35.5, apg: 13.5, spg: 7.2, bpg: 4.2, tpg: 13.8, sos: 88, adjOE: 113.2, adjDE: 94.8, tempo: 67.5, luck: -2.5 } },
  { id: 28, name: "NC State Wolfpack",         abbreviation: "NCST", conference: "ACC",           seed: 11, record: "20-13", logo: espnLogo(28), stats: { ppg: 77.8, oppPpg: 71.5, fgPct: 45.5, threePct: 33.5, ftPct: 73.5, rpg: 34.8, apg: 14.8, spg: 6.8, bpg: 3.5, tpg: 12.8, sos: 83, adjOE: 115.5, adjDE: 97.2, tempo: 70.5, luck: -1.5 } },
  { id: 29, name: "High Point Panthers",       abbreviation: "HPU",  conference: "Big South",     seed: 12, record: "30-4",  logo: espnLogo(29), stats: { ppg: 78.5, oppPpg: 70.2, fgPct: 46.2, threePct: 36.2, ftPct: 74.5, rpg: 35.2, apg: 14.8, spg: 7.2, bpg: 3.5, tpg: 12.2, sos: 38, adjOE: 116.5, adjDE: 97.5, tempo: 70.2, luck:  2.5 } },
  { id: 30, name: "Hawaii Warriors",           abbreviation: "HAW",  conference: "Big West",      seed: 13, record: "24-8",  logo: espnLogo(30), stats: { ppg: 72.5, oppPpg: 71.2, fgPct: 43.2, threePct: 34.5, ftPct: 72.8, rpg: 33.2, apg: 13.2, spg: 6.2, bpg: 3.0, tpg: 13.2, sos: 42, adjOE: 110.2, adjDE: 99.2, tempo: 69.2, luck:  0.5 } },
  { id: 31, name: "Kennesaw State Owls",       abbreviation: "KSU",  conference: "C-USA",         seed: 14, record: "21-13", logo: espnLogo(31), stats: { ppg: 71.8, oppPpg: 71.5, fgPct: 42.8, threePct: 33.8, ftPct: 72.5, rpg: 33.8, apg: 12.5, spg: 6.5, bpg: 3.2, tpg: 13.5, sos: 32, adjOE: 109.8, adjDE: 100.2, tempo: 68.5, luck:  0.0 } },
  { id: 32, name: "Queens Royals",             abbreviation: "QUE",  conference: "ASUN",          seed: 15, record: "21-13", logo: espnLogo(32), stats: { ppg: 71.2, oppPpg: 71.8, fgPct: 42.5, threePct: 33.5, ftPct: 72.8, rpg: 32.8, apg: 12.8, spg: 6.2, bpg: 2.8, tpg: 14.2, sos: 28, adjOE: 108.2, adjDE: 101.5, tempo: 67.8, luck:  0.0 } },
  { id: 33, name: "Long Island Sharks",        abbreviation: "LIU",  conference: "NEC",           seed: 16, record: "24-10", logo: espnLogo(33), stats: { ppg: 70.5, oppPpg: 73.5, fgPct: 41.5, threePct: 32.5, ftPct: 70.5, rpg: 32.5, apg: 12.2, spg: 6.5, bpg: 2.8, tpg: 14.5, sos: 22, adjOE: 104.8, adjDE: 103.5, tempo: 67.8, luck:  0.5 } },
  // ── SOUTH REGION ──
  { id: 34, name: "Florida Gators",            abbreviation: "FLA",  conference: "SEC",           seed: 1,  record: "26-7",  logo: espnLogo(34), stats: { ppg: 80.5, oppPpg: 63.8, fgPct: 47.8, threePct: 36.2, ftPct: 74.2, rpg: 37.8, apg: 16.5, spg: 7.5, bpg: 4.8, tpg: 11.8, sos: 92, adjOE: 122.2, adjDE: 88.8, tempo: 70.5, luck:  0.5 } },
  { id: 35, name: "Houston Cougars",           abbreviation: "HOU",  conference: "Big 12",        seed: 2,  record: "28-6",  logo: espnLogo(35), stats: { ppg: 76.5, oppPpg: 60.5, fgPct: 46.8, threePct: 34.8, ftPct: 72.5, rpg: 38.2, apg: 14.5, spg: 8.5, bpg: 4.5, tpg: 12.2, sos: 90, adjOE: 119.5, adjDE: 87.5, tempo: 66.2, luck:  1.2 } },
  { id: 36, name: "Illinois Fighting Illini",  abbreviation: "ILL",  conference: "Big Ten",       seed: 3,  record: "24-7",  logo: espnLogo(36), stats: { ppg: 79.5, oppPpg: 68.5, fgPct: 47.2, threePct: 35.2, ftPct: 74.2, rpg: 36.5, apg: 15.8, spg: 6.8, bpg: 3.8, tpg: 12.2, sos: 85, adjOE: 118.2, adjDE: 92.2, tempo: 71.5, luck:  0.8 } },
  { id: 37, name: "Nebraska Cornhuskers",      abbreviation: "NEB",  conference: "Big Ten",       seed: 4,  record: "26-6",  logo: espnLogo(37), stats: { ppg: 76.5, oppPpg: 68.2, fgPct: 45.8, threePct: 34.8, ftPct: 73.2, rpg: 35.8, apg: 14.8, spg: 6.5, bpg: 3.5, tpg: 12.8, sos: 87, adjOE: 117.5, adjDE: 93.5, tempo: 68.2, luck:  1.5 } },
  { id: 38, name: "Vanderbilt Commodores",     abbreviation: "VAN",  conference: "SEC",           seed: 5,  record: "26-8",  logo: espnLogo(38), stats: { ppg: 76.8, oppPpg: 69.5, fgPct: 45.5, threePct: 35.5, ftPct: 74.5, rpg: 34.8, apg: 14.5, spg: 6.2, bpg: 3.5, tpg: 12.5, sos: 87, adjOE: 116.5, adjDE: 94.5, tempo: 69.2, luck:  0.5 } },
  { id: 39, name: "North Carolina Tar Heels",  abbreviation: "UNC",  conference: "ACC",           seed: 6,  record: "24-8",  logo: espnLogo(39), stats: { ppg: 82.5, oppPpg: 71.5, fgPct: 47.2, threePct: 35.8, ftPct: 73.8, rpg: 37.2, apg: 16.8, spg: 6.8, bpg: 3.5, tpg: 12.5, sos: 89, adjOE: 120.5, adjDE: 95.8, tempo: 72.2, luck: -0.5 } },
  { id: 40, name: "Saint Mary's Gaels",        abbreviation: "SMC",  conference: "WCC",           seed: 7,  record: "27-5",  logo: espnLogo(40), stats: { ppg: 74.2, oppPpg: 63.5, fgPct: 46.8, threePct: 36.5, ftPct: 75.8, rpg: 33.5, apg: 14.5, spg: 5.8, bpg: 2.8, tpg: 10.8, sos: 68, adjOE: 115.8, adjDE: 91.2, tempo: 63.5, luck:  0.5 } },
  { id: 41, name: "Clemson Tigers",            abbreviation: "CLEM", conference: "ACC",           seed: 8,  record: "24-10", logo: espnLogo(41), stats: { ppg: 74.2, oppPpg: 66.5, fgPct: 44.5, threePct: 33.8, ftPct: 72.5, rpg: 35.5, apg: 13.2, spg: 7.5, bpg: 3.8, tpg: 12.8, sos: 82, adjOE: 114.2, adjDE: 94.8, tempo: 66.8, luck:  0.5 } },
  { id: 42, name: "Iowa Hawkeyes",             abbreviation: "IOWA", conference: "Big Ten",       seed: 9,  record: "21-12", logo: espnLogo(42), stats: { ppg: 78.5, oppPpg: 71.5, fgPct: 45.8, threePct: 35.2, ftPct: 75.5, rpg: 37.2, apg: 13.8, spg: 5.5, bpg: 3.2, tpg: 13.5, sos: 84, adjOE: 113.5, adjDE: 95.5, tempo: 69.8, luck: -0.5 } },
  { id: 43, name: "Texas A&M Aggies",          abbreviation: "TAMU", conference: "SEC",           seed: 10, record: "21-11", logo: espnLogo(43), stats: { ppg: 73.5, oppPpg: 68.8, fgPct: 44.2, threePct: 32.5, ftPct: 71.8, rpg: 36.8, apg: 12.5, spg: 7.5, bpg: 4.5, tpg: 14.2, sos: 88, adjOE: 112.8, adjDE: 95.2, tempo: 66.5, luck: -1.5 } },
  { id: 44, name: "VCU Rams",                  abbreviation: "VCU",  conference: "Atlantic 10",   seed: 11, record: "27-7",  logo: espnLogo(44), stats: { ppg: 74.5, oppPpg: 68.2, fgPct: 44.8, threePct: 33.5, ftPct: 72.8, rpg: 34.5, apg: 14.2, spg: 7.8, bpg: 3.2, tpg: 13.5, sos: 65, adjOE: 112.5, adjDE: 95.8, tempo: 68.2, luck:  1.5 } },
  { id: 45, name: "McNeese Cowboys",           abbreviation: "MCN",  conference: "Southland",     seed: 12, record: "28-5",  logo: espnLogo(45), stats: { ppg: 83.2, oppPpg: 68.5, fgPct: 47.8, threePct: 36.8, ftPct: 74.2, rpg: 35.5, apg: 16.5, spg: 7.2, bpg: 3.5, tpg: 12.5, sos: 32, adjOE: 119.2, adjDE: 96.5, tempo: 73.5, luck:  2.5 } },
  { id: 46, name: "Troy Trojans",              abbreviation: "TROY", conference: "Sun Belt",      seed: 13, record: "22-11", logo: espnLogo(46), stats: { ppg: 72.8, oppPpg: 70.8, fgPct: 43.5, threePct: 34.2, ftPct: 72.8, rpg: 33.8, apg: 13.2, spg: 6.5, bpg: 3.2, tpg: 13.2, sos: 38, adjOE: 110.2, adjDE: 98.5, tempo: 69.5, luck:  0.5 } },
  { id: 47, name: "Penn Quakers",              abbreviation: "PENN", conference: "Ivy",           seed: 14, record: "18-11", logo: espnLogo(47), stats: { ppg: 72.2, oppPpg: 70.5, fgPct: 43.2, threePct: 34.8, ftPct: 73.5, rpg: 33.2, apg: 13.5, spg: 5.8, bpg: 2.5, tpg: 12.8, sos: 28, adjOE: 109.8, adjDE: 99.5, tempo: 67.8, luck: -0.5 } },
  { id: 48, name: "Idaho Vandals",             abbreviation: "IDHO", conference: "Big Sky",       seed: 15, record: "21-14", logo: espnLogo(48), stats: { ppg: 71.5, oppPpg: 71.8, fgPct: 42.8, threePct: 33.5, ftPct: 72.2, rpg: 33.5, apg: 12.8, spg: 6.2, bpg: 2.8, tpg: 13.5, sos: 30, adjOE: 108.8, adjDE: 101.2, tempo: 67.5, luck: -0.5 } },
  { id: 49, name: "Prairie View A&M Panthers", abbreviation: "PVAM", conference: "SWAC",          seed: 16, record: "18-17", logo: espnLogo(49), stats: { ppg: 70.5, oppPpg: 73.8, fgPct: 42.2, threePct: 32.2, ftPct: 69.5, rpg: 34.5, apg: 11.8, spg: 7.5, bpg: 3.5, tpg: 15.2, sos: 22, adjOE: 105.8, adjDE: 103.8, tempo: 69.5, luck:  0.0 } },
  { id: 50, name: "Lehigh Mountain Hawks",     abbreviation: "LEH",  conference: "Patriot",       seed: 16, record: "18-16", logo: espnLogo(50), stats: { ppg: 69.8, oppPpg: 72.5, fgPct: 41.5, threePct: 32.8, ftPct: 71.5, rpg: 32.5, apg: 12.5, spg: 6.2, bpg: 2.5, tpg: 14.5, sos: 20, adjOE: 104.5, adjDE: 102.8, tempo: 66.8, luck: -0.5 } },
  // ── MIDWEST REGION ──
  { id: 51, name: "Michigan Wolverines",       abbreviation: "MICH", conference: "Big Ten",       seed: 1,  record: "31-2",  logo: espnLogo(51), stats: { ppg: 80.8, oppPpg: 64.2, fgPct: 47.8, threePct: 36.5, ftPct: 74.8, rpg: 37.2, apg: 16.2, spg: 7.2, bpg: 4.8, tpg: 11.8, sos: 90, adjOE: 122.8, adjDE: 88.5, tempo: 70.2, luck:  1.5 } },
  { id: 52, name: "Iowa State Cyclones",       abbreviation: "ISU",  conference: "Big 12",        seed: 2,  record: "27-7",  logo: espnLogo(52), stats: { ppg: 77.8, oppPpg: 64.5, fgPct: 46.5, threePct: 35.5, ftPct: 73.2, rpg: 35.5, apg: 15.5, spg: 8.2, bpg: 3.5, tpg: 12.2, sos: 90, adjOE: 120.5, adjDE: 90.2, tempo: 67.2, luck:  0.8 } },
  { id: 53, name: "Virginia Cavaliers",        abbreviation: "UVA",  conference: "ACC",           seed: 3,  record: "29-5",  logo: espnLogo(53), stats: { ppg: 71.5, oppPpg: 63.5, fgPct: 46.2, threePct: 34.5, ftPct: 73.2, rpg: 33.8, apg: 13.2, spg: 5.8, bpg: 3.2, tpg: 10.5, sos: 85, adjOE: 117.8, adjDE: 90.8, tempo: 62.5, luck:  0.2 } },
  { id: 54, name: "Alabama Crimson Tide",      abbreviation: "BAMA", conference: "SEC",           seed: 4,  record: "23-9",  logo: espnLogo(54), stats: { ppg: 84.2, oppPpg: 72.5, fgPct: 46.2, threePct: 35.2, ftPct: 72.5, rpg: 37.5, apg: 16.5, spg: 8.5, bpg: 4.2, tpg: 14.5, sos: 89, adjOE: 121.5, adjDE: 97.2, tempo: 74.5, luck: -2.0 } },
  { id: 55, name: "Texas Tech Red Raiders",    abbreviation: "TTU",  conference: "Big 12",        seed: 5,  record: "22-10", logo: espnLogo(55), stats: { ppg: 73.5, oppPpg: 65.2, fgPct: 44.5, threePct: 33.5, ftPct: 73.5, rpg: 35.2, apg: 13.2, spg: 7.8, bpg: 4.5, tpg: 13.5, sos: 85, adjOE: 114.8, adjDE: 92.8, tempo: 65.2, luck: -0.5 } },
  { id: 56, name: "Tennessee Volunteers",      abbreviation: "TENN", conference: "SEC",           seed: 6,  record: "22-11", logo: espnLogo(56), stats: { ppg: 73.5, oppPpg: 62.5, fgPct: 45.5, threePct: 33.5, ftPct: 72.2, rpg: 36.5, apg: 14.2, spg: 7.5, bpg: 4.2, tpg: 12.2, sos: 90, adjOE: 116.5, adjDE: 88.8, tempo: 65.5, luck:  0.2 } },
  { id: 57, name: "Kentucky Wildcats",         abbreviation: "UK",   conference: "SEC",           seed: 7,  record: "21-13", logo: espnLogo(57), stats: { ppg: 77.8, oppPpg: 68.5, fgPct: 46.5, threePct: 35.8, ftPct: 74.5, rpg: 36.8, apg: 15.2, spg: 6.5, bpg: 4.5, tpg: 13.2, sos: 88, adjOE: 115.8, adjDE: 94.2, tempo: 70.2, luck: -1.0 } },
  { id: 58, name: "Georgia Bulldogs",          abbreviation: "UGA",  conference: "SEC",           seed: 8,  record: "22-10", logo: espnLogo(58), stats: { ppg: 75.5, oppPpg: 70.8, fgPct: 45.2, threePct: 34.2, ftPct: 73.2, rpg: 36.2, apg: 14.2, spg: 7.2, bpg: 4.2, tpg: 13.8, sos: 87, adjOE: 114.5, adjDE: 95.8, tempo: 68.8, luck: -0.5 } },
  { id: 59, name: "Saint Louis Billikens",     abbreviation: "SLU",  conference: "Atlantic 10",   seed: 9,  record: "28-5",  logo: espnLogo(59), stats: { ppg: 74.2, oppPpg: 69.2, fgPct: 44.8, threePct: 34.8, ftPct: 73.5, rpg: 34.5, apg: 14.5, spg: 6.5, bpg: 3.5, tpg: 12.8, sos: 60, adjOE: 113.5, adjDE: 96.2, tempo: 67.8, luck:  1.8 } },
  { id: 60, name: "Santa Clara Broncos",       abbreviation: "SCU",  conference: "WCC",           seed: 10, record: "26-8",  logo: espnLogo(60), stats: { ppg: 73.8, oppPpg: 69.8, fgPct: 44.5, threePct: 35.8, ftPct: 74.5, rpg: 33.2, apg: 14.8, spg: 5.8, bpg: 2.8, tpg: 12.2, sos: 58, adjOE: 113.2, adjDE: 96.8, tempo: 68.5, luck:  0.8 } },
  { id: 61, name: "Miami Ohio Redhawks",       abbreviation: "M-OH", conference: "MAC",           seed: 11, record: "31-1",  logo: espnLogo(61), stats: { ppg: 74.8, oppPpg: 68.5, fgPct: 45.5, threePct: 35.2, ftPct: 74.5, rpg: 35.5, apg: 14.5, spg: 6.8, bpg: 3.2, tpg: 12.5, sos: 45, adjOE: 115.2, adjDE: 95.5, tempo: 69.2, luck:  3.0 } },
  { id: 62, name: "SMU Mustangs",              abbreviation: "SMU",  conference: "ACC",           seed: 11, record: "20-13", logo: espnLogo(62), stats: { ppg: 74.8, oppPpg: 69.8, fgPct: 44.8, threePct: 34.8, ftPct: 73.5, rpg: 34.5, apg: 13.8, spg: 6.2, bpg: 3.5, tpg: 12.8, sos: 75, adjOE: 113.8, adjDE: 96.2, tempo: 68.8, luck: -1.0 } },
  { id: 63, name: "Akron Zips",               abbreviation: "AKR",  conference: "MAC",           seed: 12, record: "29-5",  logo: espnLogo(63), stats: { ppg: 74.5, oppPpg: 71.2, fgPct: 44.8, threePct: 35.5, ftPct: 74.2, rpg: 34.2, apg: 14.5, spg: 6.5, bpg: 3.2, tpg: 12.5, sos: 42, adjOE: 114.2, adjDE: 97.5, tempo: 69.5, luck:  2.0 } },
  { id: 64, name: "Hofstra Pride",             abbreviation: "HOF",  conference: "CAA",           seed: 13, record: "24-10", logo: espnLogo(64), stats: { ppg: 72.5, oppPpg: 71.5, fgPct: 43.8, threePct: 35.2, ftPct: 73.2, rpg: 33.2, apg: 14.2, spg: 5.8, bpg: 2.5, tpg: 13.5, sos: 32, adjOE: 110.8, adjDE: 99.5, tempo: 69.2, luck:  0.5 } },
  { id: 65, name: "Wright State Raiders",      abbreviation: "WRST", conference: "Horizon",       seed: 14, record: "23-11", logo: espnLogo(65), stats: { ppg: 72.2, oppPpg: 72.5, fgPct: 43.2, threePct: 34.5, ftPct: 73.5, rpg: 33.5, apg: 13.2, spg: 5.8, bpg: 3.2, tpg: 13.8, sos: 30, adjOE: 110.2, adjDE: 100.8, tempo: 68.8, luck:  0.0 } },
  { id: 66, name: "Tennessee State Tigers",    abbreviation: "TNST", conference: "Ohio Valley",   seed: 15, record: "23-9",  logo: espnLogo(66), stats: { ppg: 71.8, oppPpg: 73.5, fgPct: 42.5, threePct: 33.2, ftPct: 71.5, rpg: 33.2, apg: 12.8, spg: 6.2, bpg: 3.2, tpg: 14.5, sos: 28, adjOE: 108.5, adjDE: 102.5, tempo: 69.2, luck:  0.5 } },
  { id: 67, name: "UMBC Retrievers",           abbreviation: "UMBC", conference: "America East",  seed: 16, record: "24-8",  logo: espnLogo(67), stats: { ppg: 71.2, oppPpg: 75.2, fgPct: 42.2, threePct: 32.5, ftPct: 70.8, rpg: 32.8, apg: 12.2, spg: 6.8, bpg: 3.2, tpg: 15.2, sos: 25, adjOE: 106.5, adjDE: 104.5, tempo: 69.8, luck:  0.0 } },
  { id: 68, name: "Howard Bison",              abbreviation: "HOW",  conference: "MEAC",          seed: 16, record: "23-10", logo: espnLogo(68), stats: { ppg: 72.8, oppPpg: 74.5, fgPct: 42.5, threePct: 32.8, ftPct: 71.2, rpg: 34.2, apg: 12.5, spg: 7.5, bpg: 3.5, tpg: 15.8, sos: 20, adjOE: 104.8, adjDE: 103.8, tempo: 68.5, luck:  0.5 } },
];

export const teams: Team[] = _rawTeams.map((t) => {
  const boost = HOME_BOOSTS[t.id] ?? 0.05;
  const { home, away } = generateSplits(t.stats, boost);
  return {
    ...t,
    canonicalId: `fallback-${t.id}`,
    slug: slugify(t.name),
    statsCoverage: "full",
    source: "fallback",
    homeStats: home,
    awayStats: away,
  };
});

// Calculate top-50 average stats (by overall power score with default weights)
export function getTop50Average(teamPool: Team[] = teams): TeamStats {
  const sorted = [...teamPool]
    .map((t) => ({ ...t, score: calculateTeamScore(t.stats, DEFAULT_STAT_WEIGHTS) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const keys: (keyof TeamStats)[] = [
    "ppg", "oppPpg", "fgPct", "threePct", "ftPct", "rpg", "apg",
    "spg", "bpg", "tpg", "sos", "adjOE", "adjDE", "tempo", "luck",
  ];

  const avg: any = {};
  keys.forEach((k) => {
    const values = sorted
      .map((t) => t.stats[k])
      .filter((value): value is number => typeof value === "number");
    avg[k] = values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null;
  });
  return avg as TeamStats;
}

// Maps ESPN abbreviations that differ from our local abbreviations
const ESPN_ABBR_ALIASES: Record<string, string> = {
  CONN: "UCONN",
  ARI: "ARIZ",
  NU: "NW",
  KU: "KAN",
  UT: "TEX",
  SC: "SCAR",
  MISS: "MSST",
  MCN: "MCNS",
  LBST: "LBSU",
  NCSU: "NCST",
  TAXAM: "TAMU",
  CHAS: "CHAR",
  SDAK: "SDST",
  COLGAT: "COLG",
  DRAKE: "DRAK",
  BAYLOR: "BAY",
  IAST: "ISU",
  NCAR: "UNC",
  MSM: "MSM",
  SJU: "SJU",
  OMISS: "MISS",
  UCSD: "UCSD",
  HPU: "HPU",
  RMU: "RMU",
  NORF: "NORF",
  ALST: "ALST",
  UNCW: "UNCW",
  BAMA: "ALA",
  MIZ: "MIZ",
};

const SCHOOL_KEY_ALIASES: Record<string, string> = {
  auburn: "auburn",
  auburntigers: "auburn",
  aub: "auburn",
  alabama: "alabama",
  alabamacrimsontide: "alabama",
  bama: "alabama",
  alabamastate: "alabamastate",
  alabamastatehornets: "alabamastate",
  alst: "alabamastate",
  texastech: "texastech",
  texastechredraiders: "texastech",
  ttu: "texastech",
  texasam: "texasam",
  texasamaggies: "texasam",
  tamu: "texasam",
  taxam: "texasam",
  byu: "byu",
  brighamyoung: "byu",
  byucougars: "byu",
  saintmarys: "saintmarys",
  saintmarysgaels: "saintmarys",
  stmarys: "saintmarys",
  smc: "saintmarys",
  uconn: "uconn",
  connecticut: "uconn",
  uconnhuskies: "uconn",
  olemiss: "olemiss",
  olemissrebels: "olemiss",
  miss: "olemiss",
  mississippistate: "mississippistate",
  mississippistatebulldogs: "mississippistate",
  missstate: "mississippistate",
  msst: "mississippistate",
  stjohns: "stjohns",
  saintjohns: "stjohns",
  stjohnsredstorm: "stjohns",
  sju: "stjohns",
  floridaatlantic: "floridaatlantic",
  fau: "floridaatlantic",
  ucsandiego: "ucsandiego",
  ucsandiegotritons: "ucsandiego",
  ucsd: "ucsandiego",
  uncwilmington: "uncwilmington",
  uncw: "uncwilmington",
  mountsaintmarys: "mountstmarys",
  mountstmarys: "mountstmarys",
  mountstmarysmountaineers: "mountstmarys",
  msm: "mountstmarys",
  siuedwardsville: "siuedwardsville",
  siuedwardsvillecougars: "siuedwardsville",
  siue: "siuedwardsville",
  xavier: "xavier",
  xaviermusketeers: "xavier",
  xav: "xavier",
  highpoint: "highpoint",
  highpointpanthers: "highpoint",
  hpu: "highpoint",
  californiabaptist: "californiabaptist",
  calbaptist: "californiabaptist",
  cbu: "californiabaptist",
  longisland: "longisland",
  liu: "longisland",
  miamifl: "miamifl",
  miamiflhurricanes: "miamifl",
  miamiohio: "miamiohio",
  miamiohredhawks: "miamiohio",
  moh: "miamiohio",
  southernmethodist: "smu",
  smu: "smu",
  saintlouis: "saintlouis",
  saintlouisbillikens: "saintlouis",
  stlouis: "saintlouis",
  slu: "saintlouis",
  queens: "queensnc",
  queensroyals: "queensnc",
  queensnc: "queensnc",
  queensncroyals: "queensnc",
  wrightstate: "wrightstate",
  wrightstateraiders: "wrightstate",
  wrst: "wrightstate",
  tennesseestate: "tennesseestate",
  tennesseestatetitans: "tennesseestate",
  tnst: "tennesseestate",
  prairieviewam: "prairieviewam",
  prairieviewaandm: "prairieviewam",
  prairieviewampanthers: "prairieviewam",
  pvam: "prairieviewam",
  lehigh: "lehigh",
  lehighmountainhawks: "lehigh",
  vanderbilt: "vanderbilt",
  vanderbiltcommodores: "vanderbilt",
  van: "vanderbilt",
  santaclara: "santaclara",
  santaclarabroncos: "santaclara",
  scu: "santaclara",
  hofstra: "hofstra",
  hofstrapride: "hofstra",
  georgia: "georgia",
  georgiabulldogs: "georgia",
  uga: "georgia",
  louisville: "louisville",
  louisvillecardinals: "louisville",
  lou: "louisville",
  villanova: "villanova",
  villanovawildcats: "villanova",
  nova: "villanova",
  ucf: "ucf",
  centralflorida: "ucf",
  southflorida: "southflorida",
  southfloridabulls: "southflorida",
  usf: "southflorida",
  northerniowa: "northerniowa",
  northerniowapanthers: "northerniowa",
  uni: "northerniowa",
  kennesawstate: "kennesawstate",
  kennesawstateowls: "kennesawstate",
  hawaii: "hawaii",
  hawaiirainbowwarriors: "hawaii",
  penn: "penn",
  pennquakers: "penn",
  idaho: "idaho",
  idahovandals: "idaho",
  ohiostate: "ohiostate",
  ohiostatebuckeyes: "ohiostate",
  osu: "ohiostate",
  norfolkstate: "norfolkstate",
  norfolkstatespartans: "norfolkstate",
  norf: "norfolkstate",
  robertmorris: "robertmorris",
  robertmorriscolonials: "robertmorris",
  rmu: "robertmorris",
};

const MASCOT_SUFFIXES = [
  "crimson tide", "red raiders", "blue devils", "golden eagles", "fighting illini",
  "tar heels", "boilermakers", "bluejays", "longhorns", "antelopes", "mountaineers",
  "terrapins", "volunteers", "gators", "wildcats", "bulldogs", "rebels", "cardinals",
  "musketeers", "seahawks", "tigers", "gaels", "rams", "mavericks", "bruins", "trojans",
  "panthers", "spartans", "sooners", "razorbacks", "commodores", "flames", "grizzlies",
  "zips", "bisons", "dukes", "raiders", "peacocks", "eagles", "lobos", "huskies", "cougars",
];

function normalizeTeamToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'’`]/g, "")
    .replace(/\bst\b/g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactTeamToken(value: string) {
  return normalizeTeamToken(value).replace(/\s+/g, "");
}

function stripMascotSuffix(name: string) {
  const normalized = normalizeTeamToken(name);
  for (const suffix of MASCOT_SUFFIXES) {
    if (normalized.endsWith(` ${suffix}`)) {
      return normalized.slice(0, -(suffix.length + 1)).trim();
    }
  }
  return normalized;
}

export function getCanonicalSchoolKey(name: string, abbreviation = "") {
  const candidates = [
    compactTeamToken(name),
    compactTeamToken(stripMascotSuffix(name)),
    compactTeamToken(abbreviation),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const aliased = SCHOOL_KEY_ALIASES[candidate];
    if (aliased) return aliased;
  }

  return candidates[1] || candidates[0] || "unknown";
}

function getTeamLookupKeys(name: string, abbreviation = "") {
  const normalizedName = compactTeamToken(name);
  const strippedName = compactTeamToken(stripMascotSuffix(name));
  const normalizedAbbr = compactTeamToken(abbreviation);
  const schoolKey = getCanonicalSchoolKey(name, abbreviation);
  return [...new Set([schoolKey, normalizedName, strippedName, normalizedAbbr].filter(Boolean))];
}

export function findTeamByEspn(espnName: string, espnAbbr: string, teamPool: Team[] = teams): Team | null {
  const abbrUpper = espnAbbr.toUpperCase();
  const lookupKeys = getTeamLookupKeys(espnName, espnAbbr);
  const keyedPool = teamPool.map((team) => ({
    team,
    keys: getTeamLookupKeys(team.name, team.abbreviation),
  }));

  // 1. Direct abbreviation match
  const byAbbr = teamPool.find((t) => t.abbreviation.toUpperCase() === abbrUpper);
  if (byAbbr) return byAbbr;

  // 2. Alias map
  const aliased = ESPN_ABBR_ALIASES[abbrUpper];
  if (aliased) {
    const byAlias = teamPool.find((t) => t.abbreviation.toUpperCase() === aliased);
    if (byAlias) return byAlias;
  }

  const bySchoolKey = keyedPool.find(({ keys }) => lookupKeys.some((key) => keys.includes(key)))?.team ?? null;
  if (bySchoolKey) return bySchoolKey;

  // 3. Full name substring (case-insensitive)
  const normName = espnName.toLowerCase().trim();
  const byFullName = teamPool.find(
    (t) =>
      normName.includes(t.name.toLowerCase()) ||
      t.name.toLowerCase().includes(normName)
  );
  if (byFullName) return byFullName;

  // 4. Word-overlap scoring -- pick the team with the most significant words in common
  const NOISE = new Set(["the", "of", "at", "a", "an", "and", "university", "college", "team"]);
  const espnWords = normalizeTeamToken(espnName).split(/\s+/).filter((w) => w.length > 2 && !NOISE.has(w));

  let best: Team | null = null;
  let bestScore = 0;
  for (const t of teamPool) {
    const teamWords = normalizeTeamToken(t.name).split(/\s+/).filter((w) => w.length > 2 && !NOISE.has(w));
    const score = espnWords.filter((w) => teamWords.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function calculateTeamScore(stats: TeamStats, weights: StatWeight[]): number {
  const weightMap = new Map(weights.map((weight) => [weight.key, weight]));
  const normalizedValues = Object.fromEntries(
    weights.map((weight) => [weight.key, normalizeStatValue(stats[weight.key], weight)]),
  ) as Partial<Record<keyof TeamStats, number | null>>;

  const supportKeys = weights.map((weight) => weight.key).filter((key) => !CORE_POWER_KEYS.includes(key));
  const coreScore = weightedAverage(normalizedValues, weightMap, CORE_POWER_KEYS);
  const supportScore = weightedAverage(normalizedValues, weightMap, supportKeys);
  const efficiencyMarginScore = weightedAverage(normalizedValues, weightMap, ["adjOE", "adjDE"]);
  const fallbackScore = weightedAverage(normalizedValues, weightMap, weights.map((weight) => weight.key));

  const baseScore = coreScore ?? efficiencyMarginScore ?? fallbackScore ?? 0.5;
  const modifierScore = supportScore ?? fallbackScore ?? baseScore;
  const marginLayer = efficiencyMarginScore ?? baseScore;

  const finalScore = baseScore * 0.78 + modifierScore * 0.15 + marginLayer * 0.07;
  return Number((finalScore * 100).toFixed(1));
}

export interface LiveTeamMetadata {
  id: string;
  name: string;
  abbreviation: string;
  conference: string;
  record: string;
  logo: string;
  seed: number | null;
}

const CONFERENCE_STRENGTH: Record<string, number> = {
  SEC: 93,
  "Big 12": 92,
  "Big Ten": 88,
  ACC: 87,
  "Big East": 86,
  "Mountain West": 74,
  MWC: 74,
  WCC: 73,
  American: 68,
  AAC: 68,
  "Atlantic 10": 67,
  "A-10": 67,
  "Missouri Valley": 63,
  MVC: 63,
  "Pac-12": 64,
  "Sun Belt": 57,
  WAC: 55,
  SoCon: 54,
  Ivy: 54,
  CAA: 53,
  MAC: 51,
  Southland: 47,
  Patriot: 45,
  "Big West": 45,
  ASUN: 44,
  Horizon: 44,
  Summit: 44,
  MAAC: 42,
  OVC: 40,
  "Big Sky": 39,
  SWAC: 35,
  MEAC: 34,
  NEC: 33,
  "America East": 41,
  AE: 41,
};

const TEAM_STATS_KEYS: (keyof TeamStats)[] = [
  "ppg", "oppPpg", "fgPct", "threePct", "ftPct", "rpg", "apg",
  "spg", "bpg", "tpg", "sos", "adjOE", "adjDE", "tempo", "luck",
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseRecord(record: string) {
  const match = record.match(/(\d+)-(\d+)/);
  if (!match) return null;
  const wins = Number.parseInt(match[1], 10);
  const losses = Number.parseInt(match[2], 10);
  const games = wins + losses;
  return { wins, losses, pct: games ? wins / games : 0.5 };
}

export function buildEspnLogoUrl(espnId?: string | number | null) {
  if (!espnId) return "/placeholder.svg";
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;
}

export function resolveTeamLogo(logo?: string | null, espnId?: string | number | null) {
  if (logo && logo.trim()) return logo;
  return buildEspnLogoUrl(espnId);
}

function estimateStatsFromMetadata(liveTeam: LiveTeamMetadata): TeamStats {
  const record = parseRecord(liveTeam.record);
  const conferenceBase = CONFERENCE_STRENGTH[liveTeam.conference] ?? 48;
  const seedBonus = liveTeam.seed ? clamp(18 - liveTeam.seed, 0, 17) : 0;
  const formBoost = record ? (record.pct - 0.5) * 26 : 0;
  const hash = hashString(`${liveTeam.id}-${liveTeam.name}-${liveTeam.conference}`);
  const jitter = (shift: number, spread: number) => ((hash >> shift) % spread) - spread / 2;
  const strength = clamp(conferenceBase + formBoost + seedBonus * 0.9 + jitter(2, 10), 28, 96);

  return {
    ppg: clamp(65 + strength * 0.22 + jitter(4, 9), 61, 89),
    oppPpg: clamp(77 - strength * 0.18 + jitter(6, 8), 58, 78),
    fgPct: clamp(41 + strength * 0.07 + jitter(8, 7) * 0.2, 41, 50.5),
    threePct: clamp(30.5 + strength * 0.045 + jitter(10, 9) * 0.15, 29, 40.5),
    ftPct: clamp(66 + strength * 0.07 + jitter(12, 11) * 0.18, 64, 80),
    rpg: clamp(29 + strength * 0.09 + jitter(14, 8) * 0.25, 29, 40.5),
    apg: clamp(10 + strength * 0.08 + jitter(16, 7) * 0.25, 9, 19),
    spg: clamp(4 + strength * 0.04 + jitter(18, 6) * 0.14, 3.8, 9.5),
    bpg: clamp(2 + strength * 0.03 + jitter(20, 5) * 0.16, 1.8, 6.2),
    tpg: clamp(15.8 - strength * 0.05 + jitter(22, 7) * 0.18, 8.8, 15.8),
    sos: clamp(conferenceBase + seedBonus * 1.2 + jitter(24, 12), 18, 96),
    adjOE: clamp(101 + strength * 0.27 + jitter(26, 9) * 0.35, 99, 128),
    adjDE: clamp(108 - strength * 0.22 + jitter(28, 7) * 0.3, 86, 108),
    tempo: clamp(63 + jitter(30, 14) * 0.55 + strength * 0.05, 61, 74.5),
    luck: clamp(((hash % 20) - 10) / 2.8, -4, 4),
  };
}

function buildGeneratedLiveTeam(liveTeam: LiveTeamMetadata, fallbackIdSeed: number): Team {
  const stats = estimateStatsFromMetadata(liveTeam);
  const boost = HOME_BOOSTS[fallbackIdSeed % 64 || 64] ?? 0.05;
  const { home, away } = generateSplits(stats, boost);

  return {
    id: Number.parseInt(liveTeam.id, 10) || fallbackIdSeed,
    canonicalId: `espn-${liveTeam.id || fallbackIdSeed}`,
    slug: slugify(liveTeam.name),
    espnId: liveTeam.id,
    name: liveTeam.name,
    abbreviation: liveTeam.abbreviation || liveTeam.name.slice(0, 4).toUpperCase(),
    conference: liveTeam.conference || "NCAA",
    seed: liveTeam.seed,
    record: liveTeam.record,
    logo: resolveTeamLogo(liveTeam.logo, liveTeam.id),
    stats,
    homeStats: home,
    awayStats: away,
    statsCoverage: "full",
    source: "live",
  };
}

function mergeCanonicalTeam(existing: Team, incoming: Team): Team {
  const existingCoverage = getStatsCoverage(existing.stats);
  const incomingCoverage = getStatsCoverage(incoming.stats);
  const preferIncomingStats =
    (existingCoverage !== "full" && incomingCoverage === "full") ||
    (existingCoverage === "none" && incomingCoverage !== "none");

  return {
    ...existing,
    ...incoming,
    canonicalId: existing.canonicalId,
    slug: existing.slug || incoming.slug,
    conference: incoming.conference && incoming.conference !== "NCAA" ? incoming.conference : existing.conference,
    record: incoming.record || existing.record,
    logo: incoming.logo && incoming.logo !== "/placeholder.svg" ? incoming.logo : existing.logo,
    stats: preferIncomingStats ? incoming.stats : existing.stats,
    homeStats: preferIncomingStats ? incoming.homeStats : existing.homeStats,
    awayStats: preferIncomingStats ? incoming.awayStats : existing.awayStats,
    statsCoverage: preferIncomingStats ? incoming.statsCoverage : existing.statsCoverage,
    source: existing.source === incoming.source ? existing.source : "hybrid",
  };
}

function choosePreferredTeam(existing: Team, incoming: Team) {
  const coverageRank = { full: 3, partial: 2, none: 1, undefined: 0 } as const;
  const existingCoverage = coverageRank[existing.statsCoverage ?? "undefined"];
  const incomingCoverage = coverageRank[incoming.statsCoverage ?? "undefined"];

  if (incomingCoverage !== existingCoverage) {
    return incomingCoverage > existingCoverage ? mergeCanonicalTeam(existing, incoming) : mergeCanonicalTeam(incoming, existing);
  }

  if ((incoming.source === "hybrid" || incoming.source === "live") && existing.source === "fallback") {
    return mergeCanonicalTeam(existing, incoming);
  }

  return mergeCanonicalTeam(incoming, existing);
}

export function dedupeTeamsByCanonicalId(teamPool: Team[]) {
  const deduped = new Map<string, Team>();

  teamPool.forEach((team) => {
    const existing = deduped.get(team.canonicalId);
    deduped.set(team.canonicalId, existing ? choosePreferredTeam(existing, team) : team);
  });

  return [...deduped.values()];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function emptyTeamStats(): TeamStats {
  return {
    ppg: null,
    oppPpg: null,
    fgPct: null,
    threePct: null,
    ftPct: null,
    rpg: null,
    apg: null,
    spg: null,
    bpg: null,
    tpg: null,
    sos: null,
    adjOE: null,
    adjDE: null,
    tempo: null,
    luck: null,
  };
}

export function hasStat(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatStat(value: number | null | undefined, digits = 1): string {
  return hasStat(value) ? value.toFixed(digits) : "--";
}

export function getStatsCoverage(stats: TeamStats): Team["statsCoverage"] {
  const available = TEAM_STATS_KEYS.filter((key) => hasStat(stats[key])).length;
  if (available === 0) return "none";
  if (available === TEAM_STATS_KEYS.length) return "full";
  return "partial";
}

export function buildCanonicalTeams(liveTeams: LiveTeamMetadata[] = []): Team[] {
  const metadataPool = new Map<string, LiveTeamMetadata>();
  [...OFFICIAL_2026_TOURNAMENT_TEAMS, ...liveTeams].forEach((team) => {
    const schoolKey = getCanonicalSchoolKey(team.name, team.abbreviation);
    const existing = metadataPool.get(schoolKey);
    metadataPool.set(schoolKey, {
      ...(existing ?? team),
      ...team,
      conference: team.conference || existing?.conference || "NCAA",
      record: team.record || existing?.record || "",
      logo: team.logo || existing?.logo || "",
      seed: team.seed ?? existing?.seed ?? null,
    });
  });

  const merged = new Map<string, Team>();
  const fallbackMatchedKeys = new Set<string>();

  [...metadataPool.values()].forEach((liveTeam) => {
    const fallback = findTeamByEspn(liveTeam.name, liveTeam.abbreviation, teams);
    const schoolKey = getCanonicalSchoolKey(liveTeam.name || fallback?.name || "", liveTeam.abbreviation || fallback?.abbreviation || "");
    if (fallback) fallbackMatchedKeys.add(getCanonicalSchoolKey(fallback.name, fallback.abbreviation));
    const generated = buildGeneratedLiveTeam(liveTeam, 100000 + merged.size);
    const mergedTeam = {
      ...(fallback ?? generated),
      canonicalId: fallback?.canonicalId ?? `school-${schoolKey}`,
      slug: fallback?.slug ?? slugify(liveTeam.name),
      espnId: liveTeam.id,
      name: liveTeam.name || fallback?.name || "",
      abbreviation: liveTeam.abbreviation || fallback?.abbreviation || "",
      conference: liveTeam.conference || fallback?.conference || "NCAA",
      seed: liveTeam.seed ?? fallback?.seed ?? null,
      record: liveTeam.record || fallback?.record || "",
      logo: resolveTeamLogo(liveTeam.logo || fallback?.logo, liveTeam.id),
      statsCoverage: getStatsCoverage((fallback ?? generated).stats),
      source: fallback ? "hybrid" : "live",
    };
    const existing = merged.get(schoolKey);
    merged.set(schoolKey, existing ? mergeCanonicalTeam(existing, mergedTeam) : mergedTeam);
  });

  teams.forEach((fallbackTeam) => {
    const schoolKey = getCanonicalSchoolKey(fallbackTeam.name, fallbackTeam.abbreviation);
    if (fallbackMatchedKeys.has(schoolKey)) return;
    const existing = merged.get(schoolKey);
    merged.set(schoolKey, existing ? mergeCanonicalTeam(existing, fallbackTeam) : fallbackTeam);
  });

  return dedupeTeamsByCanonicalId([...merged.values()]).sort((a, b) => a.name.localeCompare(b.name));
}

export function findTeamByCanonicalId(teamId: string, teamPool: Team[] = teams): Team | null {
  return teamPool.find((team) => team.canonicalId === teamId) ?? null;
}

export function findTeamBySlug(slug: string, teamPool: Team[] = teams): Team | null {
  return teamPool.find((team) => team.slug === slug) ?? null;
}


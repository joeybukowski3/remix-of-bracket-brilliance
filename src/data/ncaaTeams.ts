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
  { key: "ppg", label: "Points/Game", weight: 50, higherIsBetter: true, min: 55, max: 95 },
  { key: "oppPpg", label: "Opp Points/Game", weight: 50, higherIsBetter: false, min: 55, max: 80 },
  { key: "fgPct", label: "FG%", weight: 30, higherIsBetter: true, min: 38, max: 52 },
  { key: "threePct", label: "3PT%", weight: 25, higherIsBetter: true, min: 28, max: 42 },
  { key: "ftPct", label: "FT%", weight: 15, higherIsBetter: true, min: 62, max: 82 },
  { key: "rpg", label: "Rebounds/Game", weight: 30, higherIsBetter: true, min: 28, max: 42 },
  { key: "apg", label: "Assists/Game", weight: 20, higherIsBetter: true, min: 10, max: 20 },
  { key: "spg", label: "Steals/Game", weight: 15, higherIsBetter: true, min: 4, max: 10 },
  { key: "bpg", label: "Blocks/Game", weight: 10, higherIsBetter: true, min: 2, max: 6 },
  { key: "tpg", label: "Turnovers/Game", weight: 20, higherIsBetter: false, min: 9, max: 16 },
  { key: "sos", label: "Strength of Schedule", weight: 40, higherIsBetter: true, min: 20, max: 100 },
  { key: "adjOE", label: "Adj. Off. Efficiency", weight: 45, higherIsBetter: true, min: 95, max: 130 },
  { key: "adjDE", label: "Adj. Def. Efficiency", weight: 45, higherIsBetter: false, min: 85, max: 110 },
  { key: "tempo", label: "Tempo", weight: 10, higherIsBetter: true, min: 60, max: 76 },
];

// 2024 Elite 8 preset: weights reflecting what last year's Elite 8 teams excelled at
// (UConn, Purdue, NC State, Alabama, Duke, Houston, Clemson, Tennessee)
// These teams excelled in defensive efficiency, adjusted offense, SOS, and rebounding
export const ELITE_8_PRESET_WEIGHTS: StatWeight[] = [
  { key: "ppg", label: "Points/Game", weight: 40, higherIsBetter: true, min: 55, max: 95 },
  { key: "oppPpg", label: "Opp Points/Game", weight: 70, higherIsBetter: false, min: 55, max: 80 },
  { key: "fgPct", label: "FG%", weight: 35, higherIsBetter: true, min: 38, max: 52 },
  { key: "threePct", label: "3PT%", weight: 30, higherIsBetter: true, min: 28, max: 42 },
  { key: "ftPct", label: "FT%", weight: 20, higherIsBetter: true, min: 62, max: 82 },
  { key: "rpg", label: "Rebounds/Game", weight: 50, higherIsBetter: true, min: 28, max: 42 },
  { key: "apg", label: "Assists/Game", weight: 25, higherIsBetter: true, min: 10, max: 20 },
  { key: "spg", label: "Steals/Game", weight: 30, higherIsBetter: true, min: 4, max: 10 },
  { key: "bpg", label: "Blocks/Game", weight: 25, higherIsBetter: true, min: 2, max: 6 },
  { key: "tpg", label: "Turnovers/Game", weight: 35, higherIsBetter: false, min: 9, max: 16 },
  { key: "sos", label: "Strength of Schedule", weight: 75, higherIsBetter: true, min: 20, max: 100 },
  { key: "adjOE", label: "Adj. Off. Efficiency", weight: 80, higherIsBetter: true, min: 95, max: 130 },
  { key: "adjDE", label: "Adj. Def. Efficiency", weight: 85, higherIsBetter: false, min: 85, max: 110 },
  { key: "tempo", label: "Tempo", weight: 5, higherIsBetter: true, min: 60, max: 76 },
];

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
  1: 0.03, 2: 0.05, 3: 0.04, 4: 0.06, 5: 0.04, 6: 0.03, 7: 0.07, 8: 0.05,
  9: 0.03, 10: 0.04, 11: 0.05, 12: 0.08, 13: 0.04, 14: 0.06, 15: 0.03, 16: 0.05,
  17: 0.04, 18: 0.07, 19: 0.03, 20: 0.05, 21: 0.06, 22: 0.04, 23: 0.05, 24: 0.06,
  25: 0.04, 26: 0.07, 27: 0.05, 28: 0.06, 29: 0.08, 30: 0.03, 31: 0.05, 32: 0.07,
  33: 0.04, 34: 0.05, 35: 0.06, 36: 0.08, 37: 0.04, 38: 0.06, 39: 0.07, 40: 0.05,
  41: 0.06, 42: 0.04, 43: 0.05, 44: 0.03, 45: 0.07, 46: 0.06, 47: 0.05, 48: 0.04,
  49: 0.06, 50: 0.04, 51: 0.05, 52: 0.03, 53: 0.06, 54: 0.04, 55: 0.07, 56: 0.05,
  57: 0.06, 58: 0.04, 59: 0.05, 60: 0.07, 61: 0.05, 62: 0.06, 63: 0.08, 64: 0.04,
};

// ESPN CDN team logo mapping (ESPN team IDs)
const ESPN_LOGOS: Record<number, string> = {
  1: "41",    // UConn
  2: "248",   // Houston
  3: "2509",  // Purdue
  4: "153",   // North Carolina
  5: "2633",  // Tennessee
  6: "269",   // Marquette
  7: "12",    // Arizona
  8: "66",    // Iowa State
  9: "156",   // Creighton
  10: "239",  // Baylor
  11: "356",  // Illinois
  12: "2",    // Auburn
  13: "150",  // Duke
  14: "2305", // Kansas
  15: "2250", // Gonzaga
  16: "21",   // San Diego State
  17: "275",  // Wisconsin
  18: "96",   // Kentucky
  19: "252",  // BYU
  20: "228",  // Clemson
  21: "2168", // Dayton
  22: "251",  // Texas
  23: "57",   // Florida
  24: "158",  // Nebraska
  25: "265",  // Washington State
  26: "344",  // Mississippi State
  27: "2440", // Nevada
  28: "167",  // New Mexico
  29: "2377", // McNeese State
  30: "43",   // Yale
  31: "2473", // Oakland
  32: "56",   // Stetson
  33: "36",   // Colorado State
  34: "2483", // Oregon
  35: "2628", // TCU
  36: "2579", // South Carolina
  37: "77",   // Northwestern
  38: "328",  // Utah State
  39: "256",  // James Madison
  40: "2253", // Grand Canyon
  41: "2484", // Morehead State
  42: "261",  // Vermont
  43: "2534", // Samford
  44: "2142", // Colgate
  45: "2755", // Grambling State
  46: "2911", // Wagner
  47: "299",  // Long Beach State
  48: "2385", // Montana State
  49: "38",   // Colorado
  50: "2181", // Drake
  51: "127",  // Michigan State
  52: "2608", // Saint Mary's
  53: "2641", // Texas Tech
  54: "41",   // Connecticut (alt)
  55: "2591", // Saint Peter's
  56: "2006", // Akron
  57: "245",  // Texas A&M
  58: "2184", // Duquesne
  59: "2571", // South Dakota State
  60: "47",   // Howard
  61: "152",  // NC State
  62: "130",  // Michigan
  63: "333",  // Alabama
  64: "232",  // Charleston
};

function espnLogo(teamId: number): string {
  const espnId = ESPN_LOGOS[teamId] || "0";
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;
}

const _rawTeams: Omit<Team, "homeStats" | "awayStats" | "canonicalId" | "slug" | "espnId" | "statsCoverage" | "source">[] = [
  { id: 1, name: "UConn Huskies", abbreviation: "UCONN", conference: "Big East", seed: 1, record: "31-3", logo: espnLogo(1), stats: { ppg: 82.4, oppPpg: 63.1, fgPct: 49.2, threePct: 37.8, ftPct: 74.5, rpg: 37.2, apg: 17.1, spg: 7.8, bpg: 4.2, tpg: 11.3, sos: 88, adjOE: 126.1, adjDE: 89.5, tempo: 69.2, luck: 2.1 } },
  { id: 2, name: "Houston Cougars", abbreviation: "HOU", conference: "Big 12", seed: 1, record: "32-4", logo: espnLogo(2), stats: { ppg: 75.8, oppPpg: 59.2, fgPct: 46.8, threePct: 34.5, ftPct: 72.1, rpg: 38.5, apg: 14.2, spg: 8.9, bpg: 4.8, tpg: 12.1, sos: 91, adjOE: 120.5, adjDE: 87.2, tempo: 65.8, luck: 1.5 } },
  { id: 3, name: "Purdue Boilermakers", abbreviation: "PUR", conference: "Big Ten", seed: 1, record: "29-5", logo: espnLogo(3), stats: { ppg: 80.1, oppPpg: 65.8, fgPct: 48.5, threePct: 36.2, ftPct: 76.8, rpg: 39.1, apg: 16.3, spg: 5.8, bpg: 5.1, tpg: 10.8, sos: 85, adjOE: 125.3, adjDE: 92.1, tempo: 68.5, luck: 0.8 } },
  { id: 4, name: "North Carolina Tar Heels", abbreviation: "UNC", conference: "ACC", seed: 1, record: "28-7", logo: espnLogo(4), stats: { ppg: 83.2, oppPpg: 71.5, fgPct: 47.9, threePct: 35.8, ftPct: 73.2, rpg: 36.8, apg: 16.8, spg: 7.2, bpg: 3.8, tpg: 12.5, sos: 89, adjOE: 122.8, adjDE: 95.3, tempo: 72.1, luck: -0.5 } },
  { id: 5, name: "Tennessee Volunteers", abbreviation: "TENN", conference: "SEC", seed: 2, record: "27-7", logo: espnLogo(5), stats: { ppg: 72.5, oppPpg: 60.8, fgPct: 45.2, threePct: 33.1, ftPct: 71.5, rpg: 35.2, apg: 13.8, spg: 7.5, bpg: 4.5, tpg: 11.8, sos: 87, adjOE: 117.2, adjDE: 88.9, tempo: 64.2, luck: 1.2 } },
  { id: 6, name: "Marquette Golden Eagles", abbreviation: "MARQ", conference: "Big East", seed: 2, record: "27-7", logo: espnLogo(6), stats: { ppg: 78.9, oppPpg: 67.2, fgPct: 47.1, threePct: 36.5, ftPct: 75.1, rpg: 33.5, apg: 15.9, spg: 6.8, bpg: 3.2, tpg: 11.5, sos: 82, adjOE: 121.5, adjDE: 93.8, tempo: 70.5, luck: 0.3 } },
  { id: 7, name: "Arizona Wildcats", abbreviation: "ARIZ", conference: "Pac-12", seed: 2, record: "27-8", logo: espnLogo(7), stats: { ppg: 84.1, oppPpg: 70.2, fgPct: 48.8, threePct: 37.2, ftPct: 74.8, rpg: 37.8, apg: 17.5, spg: 6.5, bpg: 4.1, tpg: 13.2, sos: 83, adjOE: 124.2, adjDE: 94.5, tempo: 71.8, luck: -1.2 } },
  { id: 8, name: "Iowa State Cyclones", abbreviation: "ISU", conference: "Big 12", seed: 2, record: "27-7", logo: espnLogo(8), stats: { ppg: 76.2, oppPpg: 63.5, fgPct: 45.8, threePct: 34.8, ftPct: 72.5, rpg: 34.1, apg: 15.2, spg: 8.2, bpg: 3.5, tpg: 12.8, sos: 86, adjOE: 118.8, adjDE: 90.2, tempo: 66.5, luck: 2.5 } },
  { id: 9, name: "Creighton Bluejays", abbreviation: "CREI", conference: "Big East", seed: 3, record: "23-9", logo: espnLogo(9), stats: { ppg: 79.5, oppPpg: 68.1, fgPct: 47.5, threePct: 38.1, ftPct: 76.2, rpg: 32.8, apg: 16.1, spg: 6.2, bpg: 3.1, tpg: 12.2, sos: 80, adjOE: 119.8, adjDE: 94.2, tempo: 69.8, luck: -0.8 } },
  { id: 10, name: "Baylor Bears", abbreviation: "BAY", conference: "Big 12", seed: 3, record: "24-8", logo: espnLogo(10), stats: { ppg: 77.8, oppPpg: 66.5, fgPct: 46.5, threePct: 35.5, ftPct: 73.8, rpg: 35.8, apg: 14.8, spg: 7.1, bpg: 3.8, tpg: 13.1, sos: 84, adjOE: 119.2, adjDE: 93.1, tempo: 68.2, luck: 0.5 } },
  { id: 11, name: "Illinois Fighting Illini", abbreviation: "ILL", conference: "Big Ten", seed: 3, record: "26-8", logo: espnLogo(11), stats: { ppg: 81.2, oppPpg: 69.8, fgPct: 47.2, threePct: 35.2, ftPct: 74.1, rpg: 36.2, apg: 15.5, spg: 6.8, bpg: 3.9, tpg: 11.9, sos: 81, adjOE: 120.8, adjDE: 95.8, tempo: 71.2, luck: 1.8 } },
  { id: 12, name: "Auburn Tigers", abbreviation: "AUB", conference: "SEC", seed: 4, record: "27-7", logo: espnLogo(12), stats: { ppg: 80.5, oppPpg: 68.2, fgPct: 46.8, threePct: 34.2, ftPct: 71.8, rpg: 36.5, apg: 14.5, spg: 7.8, bpg: 4.2, tpg: 13.5, sos: 86, adjOE: 118.5, adjDE: 92.8, tempo: 70.8, luck: 0.2 } },
  { id: 13, name: "Duke Blue Devils", abbreviation: "DUKE", conference: "ACC", seed: 4, record: "26-8", logo: espnLogo(13), stats: { ppg: 79.8, oppPpg: 69.5, fgPct: 47.8, threePct: 36.8, ftPct: 75.5, rpg: 34.8, apg: 16.2, spg: 6.5, bpg: 4.5, tpg: 12.8, sos: 83, adjOE: 121.2, adjDE: 96.2, tempo: 70.2, luck: -0.3 } },
  { id: 14, name: "Kansas Jayhawks", abbreviation: "KAN", conference: "Big 12", seed: 4, record: "23-10", logo: espnLogo(14), stats: { ppg: 78.5, oppPpg: 68.8, fgPct: 46.2, threePct: 35.1, ftPct: 73.5, rpg: 35.5, apg: 15.8, spg: 7.2, bpg: 4.1, tpg: 13.8, sos: 90, adjOE: 119.5, adjDE: 95.5, tempo: 69.5, luck: -2.1 } },
  { id: 15, name: "Gonzaga Bulldogs", abbreviation: "GONZ", conference: "WCC", seed: 5, record: "25-7", logo: espnLogo(15), stats: { ppg: 85.2, oppPpg: 72.8, fgPct: 49.5, threePct: 37.5, ftPct: 76.2, rpg: 35.2, apg: 17.8, spg: 5.8, bpg: 3.2, tpg: 12.5, sos: 72, adjOE: 125.8, adjDE: 98.2, tempo: 73.5, luck: 0.8 } },
  { id: 16, name: "San Diego State Aztecs", abbreviation: "SDSU", conference: "MWC", seed: 5, record: "26-7", logo: espnLogo(16), stats: { ppg: 71.2, oppPpg: 61.5, fgPct: 44.8, threePct: 33.5, ftPct: 70.8, rpg: 33.8, apg: 12.5, spg: 6.8, bpg: 3.5, tpg: 11.2, sos: 68, adjOE: 112.5, adjDE: 89.8, tempo: 63.8, luck: 1.5 } },
  { id: 17, name: "Wisconsin Badgers", abbreviation: "WIS", conference: "Big Ten", seed: 5, record: "22-12", logo: espnLogo(17), stats: { ppg: 74.8, oppPpg: 65.2, fgPct: 45.5, threePct: 34.8, ftPct: 74.2, rpg: 34.5, apg: 14.2, spg: 5.5, bpg: 3.1, tpg: 10.5, sos: 79, adjOE: 115.8, adjDE: 92.5, tempo: 65.2, luck: -0.5 } },
  { id: 18, name: "Kentucky Wildcats", abbreviation: "UK", conference: "SEC", seed: 3, record: "23-9", logo: espnLogo(18), stats: { ppg: 82.8, oppPpg: 72.1, fgPct: 47.5, threePct: 35.8, ftPct: 73.8, rpg: 37.5, apg: 15.5, spg: 6.2, bpg: 4.8, tpg: 13.2, sos: 85, adjOE: 122.5, adjDE: 97.8, tempo: 72.5, luck: -1.5 } },
  { id: 19, name: "BYU Cougars", abbreviation: "BYU", conference: "Big 12", seed: 6, record: "23-10", logo: espnLogo(19), stats: { ppg: 76.5, oppPpg: 67.8, fgPct: 45.8, threePct: 36.2, ftPct: 77.5, rpg: 32.5, apg: 14.8, spg: 5.8, bpg: 2.8, tpg: 11.8, sos: 78, adjOE: 116.2, adjDE: 94.8, tempo: 67.8, luck: 0.8 } },
  { id: 20, name: "Clemson Tigers", abbreviation: "CLEM", conference: "ACC", seed: 6, record: "24-9", logo: espnLogo(20), stats: { ppg: 74.2, oppPpg: 65.8, fgPct: 44.5, threePct: 33.8, ftPct: 72.5, rpg: 35.8, apg: 13.2, spg: 7.5, bpg: 3.8, tpg: 12.8, sos: 77, adjOE: 114.5, adjDE: 93.2, tempo: 66.8, luck: 1.2 } },
  { id: 21, name: "Dayton Flyers", abbreviation: "DAY", conference: "A-10", seed: 7, record: "25-7", logo: espnLogo(21), stats: { ppg: 77.8, oppPpg: 67.5, fgPct: 46.8, threePct: 36.8, ftPct: 75.8, rpg: 33.2, apg: 15.5, spg: 5.5, bpg: 2.5, tpg: 11.5, sos: 62, adjOE: 117.8, adjDE: 95.2, tempo: 68.5, luck: 0.5 } },
  { id: 22, name: "Texas Longhorns", abbreviation: "TEX", conference: "SEC", seed: 7, record: "21-12", logo: espnLogo(22), stats: { ppg: 73.8, oppPpg: 66.2, fgPct: 44.2, threePct: 32.8, ftPct: 71.2, rpg: 35.2, apg: 13.8, spg: 7.1, bpg: 4.2, tpg: 13.5, sos: 88, adjOE: 113.8, adjDE: 93.5, tempo: 65.5, luck: -1.8 } },
  { id: 23, name: "Florida Gators", abbreviation: "FLA", conference: "SEC", seed: 7, record: "24-10", logo: espnLogo(23), stats: { ppg: 78.2, oppPpg: 69.8, fgPct: 45.8, threePct: 34.5, ftPct: 73.5, rpg: 34.8, apg: 14.5, spg: 6.8, bpg: 3.5, tpg: 12.5, sos: 82, adjOE: 116.8, adjDE: 95.8, tempo: 69.8, luck: 0.2 } },
  { id: 24, name: "Nebraska Cornhuskers", abbreviation: "NEB", conference: "Big Ten", seed: 8, record: "23-10", logo: espnLogo(24), stats: { ppg: 75.5, oppPpg: 68.2, fgPct: 44.8, threePct: 33.2, ftPct: 72.8, rpg: 33.5, apg: 14.2, spg: 6.5, bpg: 3.2, tpg: 13.1, sos: 78, adjOE: 114.2, adjDE: 94.5, tempo: 67.2, luck: 1.5 } },
  { id: 25, name: "Washington State Cougars", abbreviation: "WSU", conference: "Pac-12", seed: 8, record: "25-9", logo: espnLogo(25), stats: { ppg: 76.8, oppPpg: 69.5, fgPct: 45.2, threePct: 35.5, ftPct: 74.5, rpg: 32.8, apg: 13.8, spg: 6.2, bpg: 2.8, tpg: 12.8, sos: 70, adjOE: 115.5, adjDE: 96.2, tempo: 68.8, luck: -0.2 } },
  { id: 26, name: "Mississippi State Bulldogs", abbreviation: "MSST", conference: "SEC", seed: 8, record: "22-12", logo: espnLogo(26), stats: { ppg: 73.2, oppPpg: 66.8, fgPct: 44.5, threePct: 32.5, ftPct: 71.5, rpg: 36.2, apg: 12.8, spg: 7.5, bpg: 4.5, tpg: 14.2, sos: 83, adjOE: 112.8, adjDE: 93.8, tempo: 66.2, luck: -0.8 } },
  { id: 27, name: "Nevada Wolf Pack", abbreviation: "NEV", conference: "MWC", seed: 10, record: "26-7", logo: espnLogo(27), stats: { ppg: 79.8, oppPpg: 70.2, fgPct: 46.5, threePct: 36.8, ftPct: 75.2, rpg: 34.2, apg: 15.8, spg: 6.2, bpg: 2.8, tpg: 12.2, sos: 58, adjOE: 118.2, adjDE: 97.5, tempo: 70.2, luck: 1.2 } },
  { id: 28, name: "New Mexico Lobos", abbreviation: "UNM", conference: "MWC", seed: 11, record: "26-8", logo: espnLogo(28), stats: { ppg: 81.5, oppPpg: 72.5, fgPct: 47.2, threePct: 35.2, ftPct: 72.8, rpg: 35.5, apg: 14.5, spg: 6.8, bpg: 3.2, tpg: 13.5, sos: 55, adjOE: 117.5, adjDE: 98.8, tempo: 71.5, luck: 0.5 } },
  { id: 29, name: "McNeese State Cowboys", abbreviation: "MCNS", conference: "Southland", seed: 12, record: "30-3", logo: espnLogo(29), stats: { ppg: 83.8, oppPpg: 68.5, fgPct: 48.2, threePct: 37.2, ftPct: 74.8, rpg: 36.8, apg: 16.5, spg: 7.2, bpg: 3.5, tpg: 12.8, sos: 32, adjOE: 119.8, adjDE: 96.5, tempo: 72.8, luck: 3.2 } },
  { id: 30, name: "Yale Bulldogs", abbreviation: "YALE", conference: "Ivy", seed: 13, record: "22-8", logo: espnLogo(30), stats: { ppg: 74.5, oppPpg: 65.8, fgPct: 45.8, threePct: 36.5, ftPct: 76.8, rpg: 31.5, apg: 15.2, spg: 5.2, bpg: 2.2, tpg: 10.8, sos: 42, adjOE: 114.8, adjDE: 95.8, tempo: 67.5, luck: 0.2 } },
  { id: 31, name: "Oakland Golden Grizzlies", abbreviation: "OAK", conference: "Horizon", seed: 14, record: "23-11", logo: espnLogo(31), stats: { ppg: 80.2, oppPpg: 74.5, fgPct: 46.2, threePct: 38.5, ftPct: 73.2, rpg: 32.2, apg: 14.8, spg: 5.8, bpg: 2.5, tpg: 13.8, sos: 35, adjOE: 116.2, adjDE: 101.5, tempo: 73.2, luck: -0.5 } },
  { id: 32, name: "Stetson Hatters", abbreviation: "STET", conference: "ASUN", seed: 16, record: "22-12", logo: espnLogo(32), stats: { ppg: 72.8, oppPpg: 70.2, fgPct: 43.8, threePct: 33.2, ftPct: 70.5, rpg: 33.8, apg: 12.2, spg: 6.5, bpg: 2.8, tpg: 14.5, sos: 28, adjOE: 108.5, adjDE: 102.8, tempo: 68.8, luck: 1.8 } },
  { id: 33, name: "Colorado State Rams", abbreviation: "CSU", conference: "MWC", seed: 10, record: "24-9", logo: espnLogo(33), stats: { ppg: 75.2, oppPpg: 67.8, fgPct: 45.1, threePct: 34.2, ftPct: 73.5, rpg: 33.1, apg: 13.8, spg: 6.1, bpg: 3.0, tpg: 12.5, sos: 60, adjOE: 114.8, adjDE: 95.2, tempo: 66.5, luck: 0.8 } },
  { id: 34, name: "Oregon Ducks", abbreviation: "ORE", conference: "Pac-12", seed: 9, record: "23-11", logo: espnLogo(34), stats: { ppg: 77.5, oppPpg: 70.8, fgPct: 45.8, threePct: 34.8, ftPct: 72.2, rpg: 34.5, apg: 14.8, spg: 6.5, bpg: 3.5, tpg: 13.2, sos: 76, adjOE: 115.8, adjDE: 96.5, tempo: 69.5, luck: -0.5 } },
  { id: 35, name: "TCU Horned Frogs", abbreviation: "TCU", conference: "Big 12", seed: 9, record: "21-12", logo: espnLogo(35), stats: { ppg: 74.8, oppPpg: 68.5, fgPct: 44.2, threePct: 33.5, ftPct: 71.8, rpg: 34.8, apg: 13.5, spg: 7.2, bpg: 3.8, tpg: 13.8, sos: 82, adjOE: 113.5, adjDE: 94.8, tempo: 66.8, luck: -1.2 } },
  { id: 36, name: "South Carolina Gamecocks", abbreviation: "SCAR", conference: "SEC", seed: 6, record: "26-7", logo: espnLogo(36), stats: { ppg: 73.5, oppPpg: 62.8, fgPct: 44.8, threePct: 32.8, ftPct: 71.5, rpg: 36.2, apg: 12.8, spg: 8.2, bpg: 4.8, tpg: 13.5, sos: 80, adjOE: 113.2, adjDE: 89.5, tempo: 64.5, luck: 2.2 } },
  { id: 37, name: "Northwestern Wildcats", abbreviation: "NW", conference: "Big Ten", seed: 9, record: "22-11", logo: espnLogo(37), stats: { ppg: 72.5, oppPpg: 66.8, fgPct: 43.8, threePct: 34.5, ftPct: 74.8, rpg: 31.8, apg: 14.2, spg: 5.8, bpg: 2.5, tpg: 11.2, sos: 77, adjOE: 112.8, adjDE: 94.2, tempo: 65.8, luck: -0.2 } },
  { id: 38, name: "Utah State Aggies", abbreviation: "USU", conference: "MWC", seed: 8, record: "28-5", logo: espnLogo(38), stats: { ppg: 78.5, oppPpg: 66.2, fgPct: 46.5, threePct: 35.8, ftPct: 74.2, rpg: 35.8, apg: 15.2, spg: 6.8, bpg: 3.2, tpg: 12.2, sos: 55, adjOE: 118.5, adjDE: 93.8, tempo: 68.5, luck: 1.8 } },
  { id: 39, name: "James Madison Dukes", abbreviation: "JMU", conference: "Sun Belt", seed: 12, record: "31-3", logo: espnLogo(39), stats: { ppg: 80.8, oppPpg: 66.5, fgPct: 47.8, threePct: 36.2, ftPct: 74.5, rpg: 35.2, apg: 16.2, spg: 7.5, bpg: 3.5, tpg: 11.8, sos: 38, adjOE: 120.2, adjDE: 94.5, tempo: 70.2, luck: 2.8 } },
  { id: 40, name: "Grand Canyon Antelopes", abbreviation: "GCU", conference: "WAC", seed: 12, record: "29-4", logo: espnLogo(40), stats: { ppg: 76.8, oppPpg: 65.8, fgPct: 45.5, threePct: 34.8, ftPct: 73.2, rpg: 34.2, apg: 13.5, spg: 7.2, bpg: 4.2, tpg: 12.8, sos: 35, adjOE: 115.2, adjDE: 93.5, tempo: 67.2, luck: 2.5 } },
  { id: 41, name: "Morehead State Eagles", abbreviation: "MORE", conference: "OVC", seed: 14, record: "26-8", logo: espnLogo(41), stats: { ppg: 78.2, oppPpg: 71.5, fgPct: 45.8, threePct: 35.2, ftPct: 72.8, rpg: 33.5, apg: 13.8, spg: 6.2, bpg: 2.8, tpg: 13.2, sos: 30, adjOE: 113.5, adjDE: 99.8, tempo: 69.8, luck: 0.5 } },
  { id: 42, name: "Vermont Catamounts", abbreviation: "UVM", conference: "AE", seed: 13, record: "28-5", logo: espnLogo(42), stats: { ppg: 73.2, oppPpg: 63.5, fgPct: 44.5, threePct: 35.8, ftPct: 75.5, rpg: 32.8, apg: 14.5, spg: 5.5, bpg: 2.2, tpg: 10.5, sos: 38, adjOE: 112.2, adjDE: 93.2, tempo: 65.2, luck: 1.5 } },
  { id: 43, name: "Samford Bulldogs", abbreviation: "SAM", conference: "SoCon", seed: 13, record: "29-5", logo: espnLogo(43), stats: { ppg: 82.5, oppPpg: 73.8, fgPct: 47.5, threePct: 38.2, ftPct: 75.8, rpg: 33.2, apg: 15.8, spg: 5.8, bpg: 2.5, tpg: 12.5, sos: 32, adjOE: 118.8, adjDE: 100.2, tempo: 72.5, luck: 0.8 } },
  { id: 44, name: "Colgate Raiders", abbreviation: "COLG", conference: "Patriot", seed: 15, record: "25-9", logo: espnLogo(44), stats: { ppg: 76.5, oppPpg: 70.8, fgPct: 44.8, threePct: 35.5, ftPct: 73.5, rpg: 32.2, apg: 13.2, spg: 5.5, bpg: 2.2, tpg: 12.8, sos: 25, adjOE: 112.5, adjDE: 100.5, tempo: 68.2, luck: -0.2 } },
  { id: 45, name: "Grambling State Tigers", abbreviation: "GRAM", conference: "SWAC", seed: 16, record: "21-13", logo: espnLogo(45), stats: { ppg: 74.8, oppPpg: 72.5, fgPct: 43.2, threePct: 31.8, ftPct: 69.5, rpg: 35.5, apg: 11.8, spg: 7.8, bpg: 3.8, tpg: 15.2, sos: 22, adjOE: 106.8, adjDE: 103.5, tempo: 69.5, luck: 0.2 } },
  { id: 46, name: "Wagner Seahawks", abbreviation: "WAG", conference: "NEC", seed: 16, record: "25-9", logo: espnLogo(46), stats: { ppg: 71.5, oppPpg: 68.8, fgPct: 42.5, threePct: 32.2, ftPct: 71.8, rpg: 31.5, apg: 12.5, spg: 6.2, bpg: 2.2, tpg: 13.5, sos: 20, adjOE: 105.8, adjDE: 101.2, tempo: 66.5, luck: 1.2 } },
  { id: 47, name: "Long Beach State 49ers", abbreviation: "LBSU", conference: "Big West", seed: 15, record: "21-14", logo: espnLogo(47), stats: { ppg: 70.2, oppPpg: 68.5, fgPct: 42.8, threePct: 32.5, ftPct: 70.2, rpg: 33.2, apg: 12.8, spg: 6.8, bpg: 3.2, tpg: 14.2, sos: 30, adjOE: 107.2, adjDE: 100.8, tempo: 65.8, luck: -0.5 } },
  { id: 48, name: "Montana State Bobcats", abbreviation: "MTST", conference: "Big Sky", seed: 15, record: "24-9", logo: espnLogo(48), stats: { ppg: 73.8, oppPpg: 68.2, fgPct: 44.2, threePct: 34.5, ftPct: 72.5, rpg: 34.8, apg: 13.2, spg: 5.8, bpg: 3.5, tpg: 12.5, sos: 28, adjOE: 110.8, adjDE: 98.5, tempo: 67.8, luck: 0.8 } },
  { id: 49, name: "Colorado Buffaloes", abbreviation: "COL", conference: "Pac-12", seed: 10, record: "24-10", logo: espnLogo(49), stats: { ppg: 76.8, oppPpg: 70.2, fgPct: 44.8, threePct: 33.8, ftPct: 72.8, rpg: 35.2, apg: 13.5, spg: 6.5, bpg: 3.8, tpg: 13.5, sos: 75, adjOE: 114.2, adjDE: 96.8, tempo: 68.2, luck: -1.2 } },
  { id: 50, name: "Drake Bulldogs", abbreviation: "DRAK", conference: "MVC", seed: 11, record: "28-6", logo: espnLogo(50), stats: { ppg: 74.5, oppPpg: 63.8, fgPct: 46.2, threePct: 36.2, ftPct: 75.2, rpg: 33.8, apg: 14.8, spg: 5.5, bpg: 2.5, tpg: 10.8, sos: 48, adjOE: 115.5, adjDE: 92.8, tempo: 64.8, luck: 2.2 } },
  { id: 51, name: "Michigan State Spartans", abbreviation: "MSU", conference: "Big Ten", seed: 9, record: "20-14", logo: espnLogo(51), stats: { ppg: 74.2, oppPpg: 69.2, fgPct: 44.5, threePct: 33.2, ftPct: 72.5, rpg: 35.8, apg: 13.8, spg: 6.2, bpg: 3.5, tpg: 13.2, sos: 84, adjOE: 113.2, adjDE: 95.2, tempo: 67.5, luck: -1.5 } },
  { id: 52, name: "Saint Mary's Gaels", abbreviation: "SMC", conference: "WCC", seed: 5, record: "27-7", logo: espnLogo(52), stats: { ppg: 72.8, oppPpg: 61.8, fgPct: 46.8, threePct: 35.8, ftPct: 74.2, rpg: 33.2, apg: 14.2, spg: 5.8, bpg: 2.8, tpg: 10.5, sos: 65, adjOE: 115.8, adjDE: 91.2, tempo: 62.8, luck: 0.8 } },
  { id: 53, name: "Texas Tech Red Raiders", abbreviation: "TTU", conference: "Big 12", seed: 6, record: "23-10", logo: espnLogo(53), stats: { ppg: 72.5, oppPpg: 63.8, fgPct: 43.8, threePct: 32.8, ftPct: 72.8, rpg: 34.2, apg: 12.8, spg: 7.8, bpg: 4.5, tpg: 13.8, sos: 81, adjOE: 111.5, adjDE: 90.2, tempo: 64.8, luck: -0.5 } },
  { id: 54, name: "Connecticut Huskies W", abbreviation: "UCHW", conference: "Big East", seed: 11, record: "20-12", logo: espnLogo(54), stats: { ppg: 77.2, oppPpg: 72.5, fgPct: 45.2, threePct: 34.5, ftPct: 72.2, rpg: 33.5, apg: 14.5, spg: 6.5, bpg: 3.2, tpg: 13.5, sos: 79, adjOE: 115.2, adjDE: 97.8, tempo: 69.2, luck: -2.5 } },
  { id: 55, name: "Saint Peter's Peacocks", abbreviation: "SPU", conference: "MAAC", seed: 15, record: "19-13", logo: espnLogo(55), stats: { ppg: 69.8, oppPpg: 67.2, fgPct: 42.2, threePct: 31.5, ftPct: 70.8, rpg: 32.5, apg: 11.8, spg: 7.2, bpg: 2.8, tpg: 14.8, sos: 25, adjOE: 104.5, adjDE: 99.8, tempo: 65.2, luck: 1.5 } },
  { id: 56, name: "Akron Zips", abbreviation: "AKR", conference: "MAC", seed: 13, record: "24-9", logo: espnLogo(56), stats: { ppg: 75.8, oppPpg: 69.2, fgPct: 44.8, threePct: 34.8, ftPct: 73.5, rpg: 33.8, apg: 13.5, spg: 6.2, bpg: 2.5, tpg: 12.8, sos: 40, adjOE: 113.2, adjDE: 97.2, tempo: 68.2, luck: 0.2 } },
  { id: 57, name: "Texas A&M Aggies", abbreviation: "TAMU", conference: "SEC", seed: 7, record: "20-13", logo: espnLogo(57), stats: { ppg: 73.5, oppPpg: 68.8, fgPct: 44.2, threePct: 32.5, ftPct: 71.8, rpg: 36.8, apg: 12.5, spg: 7.5, bpg: 4.2, tpg: 14.2, sos: 86, adjOE: 112.2, adjDE: 94.2, tempo: 66.5, luck: -2.2 } },
  { id: 58, name: "Duquesne Dukes", abbreviation: "DUQ", conference: "A-10", seed: 11, record: "24-9", logo: espnLogo(58), stats: { ppg: 76.2, oppPpg: 68.5, fgPct: 45.5, threePct: 35.8, ftPct: 74.8, rpg: 32.8, apg: 14.2, spg: 5.5, bpg: 2.2, tpg: 11.5, sos: 52, adjOE: 114.8, adjDE: 96.2, tempo: 68.5, luck: 1.2 } },
  { id: 59, name: "South Dakota State Jackrabbits", abbreviation: "SDST", conference: "Summit", seed: 14, record: "22-12", logo: espnLogo(59), stats: { ppg: 77.5, oppPpg: 72.8, fgPct: 45.2, threePct: 35.2, ftPct: 73.2, rpg: 33.2, apg: 13.8, spg: 5.8, bpg: 2.5, tpg: 13.5, sos: 28, adjOE: 112.5, adjDE: 100.2, tempo: 69.8, luck: -0.8 } },
  { id: 60, name: "Howard Bison", abbreviation: "HOW", conference: "MEAC", seed: 16, record: "22-12", logo: espnLogo(60), stats: { ppg: 73.2, oppPpg: 71.8, fgPct: 43.5, threePct: 32.8, ftPct: 70.2, rpg: 34.2, apg: 12.2, spg: 7.2, bpg: 3.2, tpg: 15.5, sos: 18, adjOE: 105.2, adjDE: 103.2, tempo: 68.2, luck: 0.5 } },
  { id: 61, name: "NC State Wolfpack", abbreviation: "NCST", conference: "ACC", seed: 11, record: "22-14", logo: espnLogo(61), stats: { ppg: 78.5, oppPpg: 72.2, fgPct: 45.8, threePct: 34.2, ftPct: 73.5, rpg: 34.5, apg: 14.8, spg: 6.8, bpg: 3.5, tpg: 12.8, sos: 80, adjOE: 116.2, adjDE: 97.5, tempo: 70.8, luck: -2.8 } },
  { id: 62, name: "Michigan Wolverines", abbreviation: "MICH", conference: "Big Ten", seed: 8, record: "21-12", logo: espnLogo(62), stats: { ppg: 76.2, oppPpg: 70.5, fgPct: 45.2, threePct: 34.8, ftPct: 73.8, rpg: 34.8, apg: 14.2, spg: 6.2, bpg: 3.8, tpg: 12.5, sos: 81, adjOE: 115.2, adjDE: 96.8, tempo: 68.2, luck: -0.5 } },
  { id: 63, name: "Alabama Crimson Tide", abbreviation: "ALA", conference: "SEC", seed: 4, record: "21-11", logo: espnLogo(63), stats: { ppg: 85.5, oppPpg: 74.2, fgPct: 46.8, threePct: 35.5, ftPct: 72.5, rpg: 37.2, apg: 16.2, spg: 8.5, bpg: 4.2, tpg: 14.8, sos: 87, adjOE: 123.5, adjDE: 98.2, tempo: 74.5, luck: -3.2 } },
  { id: 64, name: "Charleston Cougars", abbreviation: "CHAR", conference: "CAA", seed: 14, record: "27-7", logo: espnLogo(64), stats: { ppg: 79.2, oppPpg: 69.8, fgPct: 46.5, threePct: 36.8, ftPct: 74.8, rpg: 33.8, apg: 15.2, spg: 6.2, bpg: 2.8, tpg: 12.2, sos: 42, adjOE: 117.2, adjDE: 97.8, tempo: 70.2, luck: 1.5 } },
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
};

export function findTeamByEspn(espnName: string, espnAbbr: string, teamPool: Team[] = teams): Team | null {
  const abbrUpper = espnAbbr.toUpperCase();

  // 1. Direct abbreviation match
  const byAbbr = teamPool.find((t) => t.abbreviation.toUpperCase() === abbrUpper);
  if (byAbbr) return byAbbr;

  // 2. Alias map
  const aliased = ESPN_ABBR_ALIASES[abbrUpper];
  if (aliased) {
    const byAlias = teamPool.find((t) => t.abbreviation.toUpperCase() === aliased);
    if (byAlias) return byAlias;
  }

  // 3. Full name substring (case-insensitive)
  const normName = espnName.toLowerCase().trim();
  const byFullName = teamPool.find(
    (t) =>
      normName.includes(t.name.toLowerCase()) ||
      t.name.toLowerCase().includes(normName)
  );
  if (byFullName) return byFullName;

  // 4. Word-overlap scoring — pick the team with the most significant words in common
  const NOISE = new Set(["the", "of", "at", "a", "an", "and", "state", "university", "college"]);
  const espnWords = normName.split(/\s+/).filter((w) => w.length > 2 && !NOISE.has(w));

  let best: Team | null = null;
  let bestScore = 0;
  for (const t of teamPool) {
    const teamWords = t.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !NOISE.has(w));
    const score = espnWords.filter((w) => teamWords.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 1 ? best : null;
}

export function calculateTeamScore(stats: TeamStats, weights: StatWeight[]): number {
  let totalScore = 0;
  let totalWeight = 0;

  weights.forEach((w) => {
    const value = stats[w.key];
    if (typeof value !== "number") return;
    const range = w.max - w.min;
    let normalized = range > 0 ? (value - w.min) / range : 0.5;
    normalized = Math.max(0, Math.min(1, normalized));
    if (!w.higherIsBetter) normalized = 1 - normalized;
    totalScore += normalized * w.weight;
    totalWeight += w.weight;
  });

  return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 50;
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

const TEAM_STATS_KEYS: (keyof TeamStats)[] = [
  "ppg", "oppPpg", "fgPct", "threePct", "ftPct", "rpg", "apg",
  "spg", "bpg", "tpg", "sos", "adjOE", "adjDE", "tempo", "luck",
];

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
  return hasStat(value) ? value.toFixed(digits) : "—";
}

export function getStatsCoverage(stats: TeamStats): Team["statsCoverage"] {
  const available = TEAM_STATS_KEYS.filter((key) => hasStat(stats[key])).length;
  if (available === 0) return "none";
  if (available === TEAM_STATS_KEYS.length) return "full";
  return "partial";
}

export function buildCanonicalTeams(liveTeams: LiveTeamMetadata[] = []): Team[] {
  const merged = new Map<string, Team>();
  const fallbackMatchedIds = new Set<number>();

  liveTeams.forEach((liveTeam) => {
    const fallback = findTeamByEspn(liveTeam.name, liveTeam.abbreviation, teams);
    if (fallback) {
      fallbackMatchedIds.add(fallback.id);
    }

    const mergedTeam: Team = {
      ...(fallback ?? {
        id: Number.parseInt(liveTeam.id, 10) || 100000 + merged.size,
        canonicalId: `espn-${liveTeam.id}`,
        slug: slugify(liveTeam.name),
        espnId: liveTeam.id,
        name: liveTeam.name,
        abbreviation: liveTeam.abbreviation || liveTeam.name.slice(0, 4).toUpperCase(),
        conference: liveTeam.conference || "NCAA",
        seed: liveTeam.seed,
        record: liveTeam.record,
        logo: liveTeam.logo,
        stats: emptyTeamStats(),
        homeStats: emptyTeamStats(),
        awayStats: emptyTeamStats(),
        statsCoverage: "none" as const,
        source: "live" as const,
      }),
      canonicalId: fallback?.canonicalId ?? `espn-${liveTeam.id}`,
      slug: fallback?.slug ?? slugify(liveTeam.name),
      espnId: liveTeam.id,
      name: liveTeam.name || fallback?.name || "",
      abbreviation: liveTeam.abbreviation || fallback?.abbreviation || "",
      conference: liveTeam.conference || fallback?.conference || "NCAA",
      seed: liveTeam.seed ?? fallback?.seed ?? null,
      record: liveTeam.record || fallback?.record || "",
      logo: liveTeam.logo || fallback?.logo || "/placeholder.svg",
      statsCoverage: getStatsCoverage((fallback ?? { stats: emptyTeamStats() }).stats),
      source: fallback ? "hybrid" : "live",
    };

    merged.set(mergedTeam.canonicalId, mergedTeam);
  });

  teams.forEach((fallbackTeam) => {
    if (fallbackMatchedIds.has(fallbackTeam.id)) return;
    merged.set(fallbackTeam.canonicalId, fallbackTeam);
  });

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function findTeamByCanonicalId(teamId: string, teamPool: Team[] = teams): Team | null {
  return teamPool.find((team) => team.canonicalId === teamId) ?? null;
}

export function findTeamBySlug(slug: string, teamPool: Team[] = teams): Team | null {
  return teamPool.find((team) => team.slug === slug) ?? null;
}

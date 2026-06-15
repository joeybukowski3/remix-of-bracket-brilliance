// 2026 NFL Preseason data — based on 2025 actual season performance.
// As the 2026 season progresses, swap these values with live data:
//   - power[].record2025 -> current 2026 W-L (and rename usage if desired)
//   - divisions[].record -> actual 2026 W-L
//   - power[] EPA/percentile fields -> updated weekly model output
// Structure is intentionally flat for easy programmatic replacement.

export interface NflPowerTeam {
  rank: number; team: string; abbr: string; color: string;
  ovrPct: number; ovrRank: number;
  offPct: number; offRank: number;
  defPct: number; defRank: number;
  ovrPctile: number; offPctile: number; defPctile: number;
  record2025: string; winTotal: number | null;
}

export interface NflDivisionTeam {
  team: string; abbr: string; color: string; record: string;
  pwrRank: number | null; offRank: number | null; defRank: number | null;
  ou: number | null; sos: number | null;
}

export function nflLogoUrl(abbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
}

export const NFL_POWER_RATINGS: NflPowerTeam[] = [
  { rank: 1, team: "Seattle Seahawks", abbr: "sea", color: "#002244",
    ovrPct: 7.69, ovrRank: 1, offPct: 5.96, offRank: 6, defPct: 9.42, defRank: 2,
    ovrPctile: 87.3, offPctile: 80.3, defPctile: 94.3, record2025: "14-3", winTotal: 11.5 },
  { rank: 2, team: "LA Rams", abbr: "lar", color: "#003594",
    ovrPct: 6.12, ovrRank: 2, offPct: 8.81, offRank: 2, defPct: 3.44, defRank: 10,
    ovrPctile: 81.0, offPctile: 90.8, defPctile: 71.2, record2025: "12-5", winTotal: 11.5 },
  { rank: 3, team: "Denver Broncos", abbr: "den", color: "#fb4f14",
    ovrPct: 5.28, ovrRank: 3, offPct: 1.06, offRank: 14, defPct: 9.51, defRank: 1,
    ovrPctile: 75.9, offPctile: 59.1, defPctile: 92.7, record2025: "14-3", winTotal: 9.5 },
  { rank: 4, team: "New England Patriots", abbr: "ne", color: "#002244",
    ovrPct: 5.26, ovrRank: 4, offPct: 6.77, offRank: 4, defPct: 3.75, defRank: 9,
    ovrPctile: 73.1, offPctile: 82.9, defPctile: 63.2, record2025: "14-3", winTotal: 10.5 },
  { rank: 5, team: "Buffalo Bills", abbr: "buf", color: "#00338d",
    ovrPct: 4.44, ovrRank: 5, offPct: 9.71, offRank: 1, defPct: -0.82, defRank: 18,
    ovrPctile: 70.5, offPctile: 93.8, defPctile: 47.2, record2025: "12-5", winTotal: 10.5 },
  { rank: 6, team: "Green Bay Packers", abbr: "gb", color: "#203731",
    ovrPct: 3.83, ovrRank: 6, offPct: 7.28, offRank: 3, defPct: 0.38, defRank: 15,
    ovrPctile: 66.4, offPctile: 83.1, defPctile: 49.6, record2025: "9-7", winTotal: 10.5 },
  { rank: 7, team: "Houston Texans", abbr: "hou", color: "#03202f",
    ovrPct: 2.96, ovrRank: 7, offPct: -3.36, offRank: 25, defPct: 9.27, defRank: 3,
    ovrPctile: 57.6, offPctile: 23.8, defPctile: 91.5, record2025: "12-5", winTotal: 9.5 },
  { rank: 8, team: "Jacksonville Jaguars", abbr: "jax", color: "#006778",
    ovrPct: 2.82, ovrRank: 8, offPct: 1.81, offRank: 12, defPct: 3.83, defRank: 8,
    ovrPctile: 66.4, offPctile: 64.1, defPctile: 68.6, record2025: "13-4", winTotal: 8.5 },
  { rank: 9, team: "Detroit Lions", abbr: "det", color: "#0076b6",
    ovrPct: 2.43, ovrRank: 9, offPct: 4.06, offRank: 10, defPct: 0.81, defRank: 13,
    ovrPctile: 59.5, offPctile: 64.2, defPctile: 54.8, record2025: "9-8", winTotal: 10.5 },
  { rank: 10, team: "LA Chargers", abbr: "lac", color: "#0080c6",
    ovrPct: 1.66, ovrRank: 10, offPct: -1.81, offRank: 23, defPct: 5.13, defRank: 7,
    ovrPctile: 53.4, offPctile: 33.0, defPctile: 73.8, record2025: "11-6", winTotal: 9.5 },
  { rank: 11, team: "Indianapolis Colts", abbr: "ind", color: "#002c5f",
    ovrPct: 1.59, ovrRank: 11, offPct: 5.49, offRank: 9, defPct: -2.31, defRank: 21,
    ovrPctile: 54.2, offPctile: 72.9, defPctile: 35.4, record2025: "8-9", winTotal: 7.5 },
  { rank: 12, team: "Baltimore Ravens", abbr: "bal", color: "#241773",
    ovrPct: 1.58, ovrRank: 12, offPct: 3.79, offRank: 11, defPct: -0.64, defRank: 16,
    ovrPctile: 57.8, offPctile: 68.7, defPctile: 47.0, record2025: "8-9", winTotal: 11.5 },
  { rank: 13, team: "Philadelphia Eagles", abbr: "phi", color: "#004c54",
    ovrPct: 0.9, ovrRank: 13, offPct: -1.46, offRank: 21, defPct: 3.26, defRank: 11,
    ovrPctile: 53.2, offPctile: 42.5, defPctile: 64.0, record2025: "11-6", winTotal: 10.5 },
  { rank: 14, team: "San Francisco 49ers", abbr: "sf", color: "#aa0000",
    ovrPct: 0.89, ovrRank: 14, offPct: 5.79, offRank: 8, defPct: -4.02, defRank: 22,
    ovrPctile: 50.6, offPctile: 74.0, defPctile: 27.1, record2025: "12-5", winTotal: 10.5 },
  { rank: 15, team: "Minnesota Vikings", abbr: "min", color: "#4f2683",
    ovrPct: 0.64, ovrRank: 15, offPct: -6.81, offRank: 28, defPct: 8.09, defRank: 5,
    ovrPctile: 56.8, offPctile: 22.8, defPctile: 90.9, record2025: "9-8", winTotal: 8.5 },
  { rank: 16, team: "New Orleans Saints", abbr: "no", color: "#d3bc8d",
    ovrPct: 0.57, ovrRank: 16, offPct: -4.72, offRank: 27, defPct: 5.86, defRank: 6,
    ovrPctile: 47.8, offPctile: 21.2, defPctile: 74.5, record2025: "6-11", winTotal: 7.5 },
  { rank: 17, team: "Chicago Bears", abbr: "chi", color: "#0b162a",
    ovrPct: 0.55, ovrRank: 17, offPct: 5.92, offRank: 7, defPct: -4.82, defRank: 27,
    ovrPctile: 51.6, offPctile: 79.6, defPctile: 23.5, record2025: "11-6", winTotal: 9.5 },
  { rank: 18, team: "Kansas City Chiefs", abbr: "kc", color: "#e31837",
    ovrPct: 0.54, ovrRank: 18, offPct: 0.12, offRank: 16, defPct: 0.97, defRank: 12,
    ovrPctile: 57.8, offPctile: 55.6, defPctile: 59.9, record2025: "6-11", winTotal: 10.5 },
  { rank: 19, team: "Atlanta Falcons", abbr: "atl", color: "#a71930",
    ovrPct: -0.45, ovrRank: 19, offPct: -1.58, offRank: 22, defPct: 0.68, defRank: 14,
    ovrPctile: 51.2, offPctile: 44.2, defPctile: 58.3, record2025: "8-9", winTotal: 6.5 },
  { rank: 20, team: "Pittsburgh Steelers", abbr: "pit", color: "#ffb612",
    ovrPct: -0.78, ovrRank: 20, offPct: -0.07, offRank: 18, defPct: -1.5, defRank: 19,
    ovrPctile: 51.2, offPctile: 53.1, defPctile: 49.4, record2025: "10-7", winTotal: 8.5 },
  { rank: 21, team: "Tampa Bay Buccaneers", abbr: "tb", color: "#d50a0a",
    ovrPct: -1.26, ovrRank: 21, offPct: -0.84, offRank: 20, defPct: -1.68, defRank: 20,
    ovrPctile: 43.5, offPctile: 42.9, defPctile: 44.1, record2025: "8-9", winTotal: 8.5 },
  { rank: 22, team: "Dallas Cowboys", abbr: "dal", color: "#041e42",
    ovrPct: -2.05, ovrRank: 22, offPct: 6.36, offRank: 5, defPct: -10.46, defRank: 32,
    ovrPctile: 49.0, offPctile: 80.8, defPctile: 17.3, record2025: "7-9", winTotal: 9.5 },
  { rank: 23, team: "NY Giants", abbr: "nyg", color: "#0b2265",
    ovrPct: -2.24, ovrRank: 23, offPct: 0.04, offRank: 17, defPct: -4.52, defRank: 25,
    ovrPctile: 40.8, offPctile: 47.4, defPctile: 34.1, record2025: "4-13", winTotal: 7.5 },
  { rank: 24, team: "Cleveland Browns", abbr: "cle", color: "#311d00",
    ovrPct: -2.63, ovrRank: 24, offPct: -13.4, offRank: 32, defPct: 8.14, defRank: 4,
    ovrPctile: 49.9, offPctile: 9.9, defPctile: 89.9, record2025: "5-12", winTotal: 6.5 },
  { rank: 25, team: "Arizona Cardinals", abbr: "ari", color: "#97233f",
    ovrPct: -3.02, ovrRank: 25, offPct: -0.53, offRank: 19, defPct: -5.52, defRank: 29,
    ovrPctile: 35.2, offPctile: 45.1, defPctile: 25.2, record2025: "3-14", winTotal: 4.5 },
  { rank: 26, team: "Washington Commanders", abbr: "wsh", color: "#5a1414",
    ovrPct: -3.26, ovrRank: 26, offPct: 1.03, offRank: 15, defPct: -7.54, defRank: 30,
    ovrPctile: 39.0, offPctile: 56.6, defPctile: 21.5, record2025: "5-12", winTotal: 7.5 },
  { rank: 27, team: "Miami Dolphins", abbr: "mia", color: "#008e97",
    ovrPct: -3.86, ovrRank: 27, offPct: -2.24, offRank: 24, defPct: -5.49, defRank: 28,
    ovrPctile: 28.5, offPctile: 34.5, defPctile: 22.5, record2025: "7-10", winTotal: 4.5 },
  { rank: 28, team: "Cincinnati Bengals", abbr: "cin", color: "#fb4f14",
    ovrPct: -3.87, ovrRank: 28, offPct: 1.45, offRank: 13, defPct: -9.19, defRank: 31,
    ovrPctile: 33.9, offPctile: 56.4, defPctile: 11.4, record2025: "6-11", winTotal: 9.5 },
  { rank: 29, team: "Carolina Panthers", abbr: "car", color: "#0085ca",
    ovrPct: -3.92, ovrRank: 29, offPct: -3.79, offRank: 26, defPct: -4.05, defRank: 23,
    ovrPctile: 30.8, offPctile: 27.1, defPctile: 34.4, record2025: "8-9", winTotal: 7.5 },
  { rank: 30, team: "Las Vegas Raiders", abbr: "lv", color: "#000000",
    ovrPct: -6.66, ovrRank: 30, offPct: -12.59, offRank: 31, defPct: -0.72, defRank: 17,
    ovrPctile: 30.8, offPctile: 12.5, defPctile: 49.0, record2025: "3-14", winTotal: 5.5 },
  { rank: 31, team: "NY Jets", abbr: "nyj", color: "#125740",
    ovrPct: -7.43, ovrRank: 31, offPct: -10.13, offRank: 29, defPct: -4.72, defRank: 26,
    ovrPctile: 21.6, offPctile: 14.0, defPctile: 29.1, record2025: "3-14", winTotal: 5.5 },
  { rank: 32, team: "Tennessee Titans", abbr: "ten", color: "#0c2340",
    ovrPct: -8.24, ovrRank: 32, offPct: -12.11, offRank: 30, defPct: -4.37, defRank: 24,
    ovrPctile: 23.9, offPctile: 13.3, defPctile: 34.5, record2025: "3-14", winTotal: 6.5 },
];

export const NFL_DIVISIONS: Record<string, NflDivisionTeam[]> = {
  "AFC East": [
    { team: "New England Patriots", abbr: "ne", color: "#002244", record: "14-3",
      pwrRank: 4, offRank: 4, defRank: 9, ou: 10.5, sos: 32 },
    { team: "Buffalo Bills", abbr: "buf", color: "#00338d", record: "12-5",
      pwrRank: 5, offRank: 1, defRank: 18, ou: 10.5, sos: 29 },
    { team: "Miami Dolphins", abbr: "mia", color: "#008e97", record: "7-10",
      pwrRank: 27, offRank: 24, defRank: 28, ou: 4.5, sos: 26 },
    { team: "NY Jets", abbr: "nyj", color: "#125740", record: "3-14",
      pwrRank: 31, offRank: 29, defRank: 26, ou: 5.5, sos: 24 },
  ],
  "NFC East": [
    { team: "Philadelphia Eagles", abbr: "phi", color: "#004c54", record: "11-6",
      pwrRank: 13, offRank: 21, defRank: 11, ou: 10.5, sos: 25 },
    { team: "Dallas Cowboys", abbr: "dal", color: "#041e42", record: "7-9",
      pwrRank: 22, offRank: 5, defRank: 32, ou: 9.5, sos: 30 },
    { team: "Washington Commanders", abbr: "wsh", color: "#5a1414", record: "5-12",
      pwrRank: 26, offRank: 15, defRank: 30, ou: 7.5, sos: 18 },
    { team: "NY Giants", abbr: "nyg", color: "#0b2265", record: "4-13",
      pwrRank: 23, offRank: 17, defRank: 25, ou: 7.5, sos: 16 },
  ],
  "AFC North": [
    { team: "Pittsburgh Steelers", abbr: "pit", color: "#ffb612", record: "10-7",
      pwrRank: 20, offRank: 18, defRank: 19, ou: 8.5, sos: 19 },
    { team: "Baltimore Ravens", abbr: "bal", color: "#241773", record: "8-9",
      pwrRank: 12, offRank: 11, defRank: 16, ou: 11.5, sos: 14 },
    { team: "Cincinnati Bengals", abbr: "cin", color: "#fb4f14", record: "6-11",
      pwrRank: 28, offRank: 13, defRank: 31, ou: 9.5, sos: 15 },
    { team: "Cleveland Browns", abbr: "cle", color: "#311d00", record: "5-12",
      pwrRank: 24, offRank: 32, defRank: 4, ou: 6.5, sos: 22 },
  ],
  "NFC North": [
    { team: "Chicago Bears", abbr: "chi", color: "#0b162a", record: "11-6",
      pwrRank: 17, offRank: 7, defRank: 27, ou: 9.5, sos: 28 },
    { team: "Green Bay Packers", abbr: "gb", color: "#203731", record: "9-7",
      pwrRank: 6, offRank: 3, defRank: 15, ou: 10.5, sos: 27 },
    { team: "Detroit Lions", abbr: "det", color: "#0076b6", record: "9-8",
      pwrRank: 9, offRank: 10, defRank: 13, ou: 10.5, sos: 21 },
    { team: "Minnesota Vikings", abbr: "min", color: "#4f2683", record: "9-8",
      pwrRank: 15, offRank: 28, defRank: 5, ou: 8.5, sos: 17 },
  ],
  "AFC South": [
    { team: "Jacksonville Jaguars", abbr: "jax", color: "#006778", record: "13-4",
      pwrRank: 8, offRank: 12, defRank: 8, ou: 8.5, sos: 8 },
    { team: "Houston Texans", abbr: "hou", color: "#03202f", record: "12-5",
      pwrRank: 7, offRank: 25, defRank: 3, ou: 9.5, sos: 7 },
    { team: "Indianapolis Colts", abbr: "ind", color: "#002c5f", record: "8-9",
      pwrRank: 11, offRank: 9, defRank: 21, ou: 7.5, sos: 3 },
    { team: "Tennessee Titans", abbr: "ten", color: "#0c2340", record: "3-14",
      pwrRank: 32, offRank: 30, defRank: 24, ou: 6.5, sos: 2 },
  ],
  "NFC South": [
    { team: "Atlanta Falcons", abbr: "atl", color: "#a71930", record: "8-9",
      pwrRank: 19, offRank: 22, defRank: 14, ou: 6.5, sos: 13 },
    { team: "Tampa Bay Buccaneers", abbr: "tb", color: "#d50a0a", record: "8-9",
      pwrRank: 21, offRank: 20, defRank: 20, ou: 8.5, sos: 10 },
    { team: "Carolina Panthers", abbr: "car", color: "#0085ca", record: "8-9",
      pwrRank: 29, offRank: 26, defRank: 23, ou: 7.5, sos: 9 },
    { team: "New Orleans Saints", abbr: "no", color: "#d3bc8d", record: "6-11",
      pwrRank: 16, offRank: 27, defRank: 6, ou: 7.5, sos: 23 },
  ],
  "AFC West": [
    { team: "Denver Broncos", abbr: "den", color: "#fb4f14", record: "14-3",
      pwrRank: 3, offRank: 14, defRank: 1, ou: 9.5, sos: 31 },
    { team: "LA Chargers", abbr: "lac", color: "#0080c6", record: "11-6",
      pwrRank: 10, offRank: 23, defRank: 7, ou: 9.5, sos: 20 },
    { team: "Kansas City Chiefs", abbr: "kc", color: "#e31837", record: "6-11",
      pwrRank: 18, offRank: 16, defRank: 12, ou: 10.5, sos: 12 },
    { team: "Las Vegas Raiders", abbr: "lv", color: "#000000", record: "3-14",
      pwrRank: 30, offRank: 31, defRank: 17, ou: 5.5, sos: 11 },
  ],
  "NFC West": [
    { team: "Seattle Seahawks", abbr: "sea", color: "#002244", record: "14-3",
      pwrRank: 1, offRank: 6, defRank: 2, ou: null, sos: 5 },
    { team: "LA Rams", abbr: "lar", color: "#003594", record: "12-5",
      pwrRank: 2, offRank: 2, defRank: 10, ou: 11.5, sos: 6 },
    { team: "San Francisco 49ers", abbr: "sf", color: "#aa0000", record: "12-5",
      pwrRank: 14, offRank: 8, defRank: 22, ou: 10.5, sos: 4 },
    { team: "Arizona Cardinals", abbr: "ari", color: "#97233f", record: "3-14",
      pwrRank: 25, offRank: 19, defRank: 29, ou: 4.5, sos: 1 },
  ],
};

// Division display order (AFC then NFC, N/S/E/W grouping for the grid)
export const NFL_DIVISION_ORDER: string[] = [
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
];

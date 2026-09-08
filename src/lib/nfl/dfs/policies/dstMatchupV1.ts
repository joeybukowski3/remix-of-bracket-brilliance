export const DST_MATCHUP_V1 = {
  version: "nfl-dfs-dst-matchup-v1",
  minimumCoverage: 0.6,
  minimumComponents: 2,
  maxWeeklyAgeHours: 48,
  maxCurrentTrenchAgeHours: 192,
  components: {
    opponentPoints: { label: "Opponent implied / JKB points", weight: 0.35, higherBetter: false },
    opponentOffense: { label: "Opponent JKB OFF rating", weight: 0.25, higherBetter: false },
    trenches: { label: "Defensive pass-rush matchup", weight: 0.2, higherBetter: true },
    historicalPpg: { label: "DST historical fantasy PPG", weight: 0.2, higherBetter: true },
  },
} as const;
